import { describe, expect, it, vi } from "vitest";

// Cliente falso: guarda o handler de estado para simular a queda da conexão.
const fake = vi.hoisted(() => ({ state: null as null | ((s: string) => void), connects: 0, profile: "", calls: [] as [string, Record<string, unknown>][] }));
vi.mock("@/lib/gatewayClient", () => ({
  GatewayClient: class {
    connectionState = "idle";
    connect = async () => {
      fake.connects++;
      await new Promise((r) => setTimeout(r, 10));
      this.connectionState = "open";
    };
    request = async (method: string, params: Record<string, unknown> = {}) => {
      if (this.connectionState !== "open") throw new Error("gateway not connected");
      fake.calls.push([method, params]);
      return method === "session.resume" ? { session_id: "live1" } : method === "session.list" ? { sessions: [] } : method === "session.create" ? { session_id: "live2", stored_session_id: "s2" } : method === "commands.catalog" ? { pairs: [], skills: {} } : {};
    };
    on = () => () => {};
    onRequest = () => () => {};
    onState = (h: (s: string) => void) => {
      fake.state = h;
      return () => {};
    };
  },
}));
vi.mock("@/lib/api", () => ({ api: {}, getManagementProfile: () => fake.profile }));

const { gatewayChat } = await import("./gateway");

describe("conexão", () => {
  it("chamadas simultâneas esperam a mesma conexão", async () => {
    await expect(Promise.all([gatewayChat.sessions(), gatewayChat.sessions()])).resolves.toEqual([[], []]);
    expect(fake.connects).toBe(1);
  });
});

describe("perfil", () => {
  it("criar, listar, retomar e o catálogo de comandos levam o perfil do seletor", async () => {
    fake.profile = "aibiz";
    fake.calls.length = 0;
    await gatewayChat.sessions();
    await gatewayChat.create();
    await gatewayChat.slashCommands();
    const by = (m: string) => fake.calls.find(([x]) => x === m)![1];
    expect(by("session.list").profile).toBe("aibiz");
    expect(by("session.create").profile).toBe("aibiz");
    expect(by("commands.catalog").profile).toBe("aibiz");
  });

  it("sem perfil escolhido não manda o campo; trocar de perfil esquece os ids vivos", async () => {
    const { resetChatProfile } = await import("./gateway");
    fake.profile = "";
    fake.calls.length = 0;
    await gatewayChat.sessions();
    expect(fake.calls[0][1].profile).toBeUndefined();

    // s2 ficou "vivo" no perfil anterior; depois de trocar, interromper não aponta mais para a sessão antiga.
    await gatewayChat.create();
    resetChatProfile();
    fake.calls.length = 0;
    await gatewayChat.interrupt("s2");
    expect(fake.calls).toEqual([]);
  });
});

describe("send", () => {
  it("conexão caiu no meio do turno → erro e a promessa termina", async () => {
    const events: { type: string }[] = [];
    const turn = gatewayChat.send("s1", "oi", (e) => events.push(e));
    await vi.waitFor(() => expect(fake.state).not.toBeNull());
    fake.state!("closed");
    await turn;
    expect(events).toEqual([expect.objectContaining({ type: "error", message: expect.stringMatching(/conexão/) })]);
  });
});

describe("formatação", async () => {
  const { ptPreview, toolOutput } = await import("./gateway");
  const { sourceLabel, plural } = await import("./sources");

  it("prévia do passo em português", () => {
    expect(ptPreview("echo um + 2 commands")).toBe("echo um + 2 comandos");
    expect(ptPreview("ls + 1 command")).toBe("ls + 1 comando");
  });

  it("saída de terminal legível; JSON qualquer formatado", () => {
    expect(toolOutput(JSON.stringify({ output: "um\ndois", exit_code: 0, error: null }))).toBe("um\ndois");
    expect(toolOutput('{"output": "", "exit_code": 2, "error": "falhou"}')).toBe("erro: falhou\ncódigo de saída 2");
    expect(toolOutput("texto puro")).toBe("texto puro");
  });

  it("origem e plural para humanos", () => {
    expect([sourceLabel("tui"), sourceLabel("cli"), sourceLabel("web"), sourceLabel("api_server")]).toEqual(["Terminal", "Terminal", "Web", "API"]);
    expect([plural(1, "mensagem", "mensagens"), plural(4, "mensagem", "mensagens")]).toEqual(["1 mensagem", "4 mensagens"]);
  });
});

describe("transcrição (recarregar /chat/<id>)", async () => {
  const { fromTranscript, withInflightError, turnStat, statLine, usageOf, toolFailed } = await import("./gateway");
  const T = 1_000_000;
  const rows = [
    { role: "user", text: "Quanto é 17 x 23?", row_id: 1, timestamp: T },
    { role: "tool", name: "terminal", context: "echo $((17*23))", tool_call_id: "c1", timestamp: T + 2, args: { command: "echo $((17*23))" }, content: '{"output":"391","exit_code":0}' },
    { role: "assistant", text: "É 391.", row_id: 3, timestamp: T + 5.2, reasoning: "Multiplicar 17 por 23." },
  ];

  it("a resposta recarregada mantém o rodapé (modelo e tempo), o pensamento e o endereço da pergunta", () => {
    const [u, a] = fromTranscript(rows as never, { model: "gemini-3.8-flash" });
    expect(u).toMatchObject({ role: "user", rowId: 1 });
    expect(a).toMatchObject({ role: "agent", text: "É 391.", reasoning: "Multiplicar 17 por 23.", stat: { model: "gemini-3.8-flash" } });
    expect((a as { stat: { secs: number } }).stat.secs).toBeCloseTo(5.2, 5);
    expect((a as { steps: unknown[] }).steps).toHaveLength(1);
    expect(statLine((a as { stat: { model: string; secs: number } }).stat)).toBe("gemini-3.8-flash · 5,2s");
  });

  it("troca interrompida continua no histórico, marcada", () => {
    const cut = fromTranscript([{ role: "user", text: "faça algo longo", row_id: 5, timestamp: T }, { role: "user", text: "e agora?", row_id: 6, timestamp: T + 9 }] as never, { model: "m" });
    expect(cut.map((m) => m.role)).toEqual(["user", "agent", "user", "agent"]);
    expect(cut[1]).toMatchObject({ interrupted: true, text: "" });
    expect(cut[3]).toMatchObject({ interrupted: true });
    // sem resposta e com turno rodando: não é interrompido, está em andamento
    expect(fromTranscript([{ role: "user", text: "oi", row_id: 1 }] as never, { running: true })).toHaveLength(1);
    // só ferramentas, sem texto final: também interrompido
    const tools = fromTranscript([{ role: "user", text: "x", row_id: 1 }, { role: "tool", name: "terminal", tool_call_id: "t", content: "{}" }] as never, {});
    expect(tools[1]).toMatchObject({ interrupted: true });
  });

  it("erro gravado como texto vira cartão, não resposta", () => {
    const [, a] = fromTranscript([{ role: "user", text: "oi", row_id: 1 }, { role: "assistant", text: "⚠ Gemini HTTP 404 (NOT_FOUND): models/x-1 is not found", row_id: 2 }] as never, { model: "x-1" });
    expect(a).toMatchObject({ text: "", error: { kind: "model" } });
  });

  it("erro retido na sessão (inflight) entra depois da pergunta", () => {
    const msgs = fromTranscript([{ role: "user", text: "oi", row_id: 1 }] as never, {});
    withInflightError(msgs, { user: "oi", error: "HTTP 429 rate limit", error_surface: { code: "rate_limit" } }, "m");
    expect(msgs.map((m) => m.role)).toEqual(["user", "agent"]);
    expect(msgs[1]).toMatchObject({ error: { kind: "limit" }, interrupted: false });
    // pergunta que nem chegou a ser gravada
    const none: never[] = [];
    withInflightError(none, { user: "perdida", error: "boom" });
    expect(none.map((m: { role: string }) => m.role)).toEqual(["user", "agent"]);
  });

  it("tokens do turno = diferença do total da sessão; custo desconhecido não vira US$ 0,00", () => {
    const u = { model: "m", input: 900, output: 100, total: 1000, calls: 2, cost_status: "unknown", cost_usd: 0 };
    expect(turnStat(u as never, 3, 400)).toEqual({ model: "m", secs: 3, tokens: 600 });
    expect(turnStat(u as never, 3, undefined).tokens).toBeUndefined();
    expect(usageOf(u as never)?.cost).toBeNull();
    expect(usageOf({ ...u, cost_status: "estimated", cost_usd: 0.12 } as never)?.cost).toBe(0.12);
    expect(statLine({ model: "m", secs: 12, tokens: 1500 })).toBe("m · 12,0s · 1,5k tokens");
  });

  it("ferramenta que devolveu erro fica vermelha", () => {
    expect(toolFailed('{"error":"arquivo não existe"}')).toBe(true);
    expect(toolFailed('{"output":"ok","exit_code":1}')).toBe(false);
    expect(toolFailed("texto")).toBe(false);
  });
});
