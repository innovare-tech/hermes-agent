import { describe, expect, it, vi } from "vitest";

// Cliente falso: guarda o handler de estado para simular a queda da conexão.
const fake = vi.hoisted(() => ({ state: null as null | ((s: string) => void), connects: 0, profile: "", calls: [] as [string, Record<string, unknown>][], configSet: null as null | ((p: Record<string, unknown>) => Record<string, unknown>), asked: [] as { title: string; body: string; confirm: string }[], answer: true }));
vi.mock("../store", () => ({ ask: async (o: { title: string; body: string; confirm: string }) => (fake.asked.push(o), fake.answer) }));
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
      if (method === "config.set" && fake.configSet) return fake.configSet(params);
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
  const { fromTranscript, withInflightError, turnStat, statLine, usageOf, toolFailed, stepResult } = await import("./gateway");
  const { applyExtras } = await import("./persist");
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

  it("turno que o backend fechou com o aviso em inglês volta como cartão em português; a pergunta fica", () => {
    const NOTICE = "Your request was not processed. Send it again if you still want me to carry it out.";
    const msgs = fromTranscript([{ role: "user", text: "faça X", row_id: 1, timestamp: T }, { role: "assistant", text: NOTICE, row_id: 2, timestamp: T + 1 }] as never, { model: "m" });
    expect(msgs.map((m) => m.role)).toEqual(["user", "agent"]);
    expect(msgs[0]).toMatchObject({ text: "faça X", rowId: 1 });
    expect(msgs[1]).toMatchObject({ text: "", error: { title: "Esta pergunta não foi respondida", retryable: true } });
  });

  it("recarregar devolve cartões de comando, pensamento e 'interrompido' guardados", () => {
    const rows = [
      { role: "user", text: "p1", row_id: 1, timestamp: T },
      { role: "assistant", text: "r1", row_id: 2, timestamp: T + 1 },
      { role: "user", text: "p2", row_id: 3, timestamp: T + 2 },
      { role: "assistant", text: "Your request was not processed. Send it again if you still want me to carry it out.", row_id: 4, timestamp: T + 3 },
    ];
    const card = { kind: "card" as const, icon: "gauge", title: "Estado da conversa" };
    const extras = { cards: [{ n: 2, after: 1, cmd: "/status", card }], turns: { "1": { n: 1, r: "pensei", ms: 4000, tok: 900 }, "3": { n: 3, st: "i" as const } } };
    const out = applyExtras(fromTranscript(rows as never, { model: "m" }), extras);
    expect(out.map((m) => m.role)).toEqual(["user", "agent", "system", "user", "agent"]);
    expect(out[1]).toMatchObject({ reasoning: "pensei", thinkMs: 4000, stat: { model: "m", tokens: 900 } });
    expect(out[2]).toMatchObject({ cmd: "/status", card });
    expect(out[4]).toMatchObject({ interrupted: true, error: undefined });
  });

  it("ferramenta negada não é 'executada' nem erro; ganha resumo quando conhecida", () => {
    const denied = stepResult("execute_code", '{"error":"BLOCKED: User denied execute_code script execution."}');
    expect(denied.status).toBe("denied");
    expect(stepResult("search_files", '{"total_count":2,"files":["a","b"]}')).toMatchObject({ status: "ok", summary: { line: "2 arquivos encontrados" } });
    expect(stepResult("terminal", '{"error":"falhou"}').status).toBe("err");
    const [, a] = fromTranscript([{ role: "user", text: "x", row_id: 1 }, { role: "tool", name: "execute_code", tool_call_id: "t", args: { code: "a\nb" }, content: "BLOCKED: User denied this command." }, { role: "assistant", text: "ok", row_id: 3 }] as never, {});
    expect((a as { steps: { status: string }[] }).steps[0].status).toBe("denied");
  });

  it("ferramenta que devolveu erro fica vermelha", () => {
    expect(toolFailed('{"error":"arquivo não existe"}')).toBe(true);
    expect(toolFailed('{"output":"ok","exit_code":1}')).toBe(false);
    expect(toolFailed("texto")).toBe(false);
  });
});

describe("/model digitado usa o fluxo do seletor", () => {
  const WARN = "!!! LARGE CONTEXT MODEL SWITCH !!!\n\nThis session holds ~171,345 tokens of context.\nSwitching to gemini-3.8-flash makes the next reply re-read all of it uncached (providers key prompt caches per model) — a one-time full-price input cost.\n\nThreshold: model.switch_context_confirm_tokens (currently 100,000; 0 disables this check).\nConfirm only if you intend to switch now.";
  const setup = async (answer: boolean) => {
    fake.answer = answer;
    fake.asked.length = 0;
    fake.calls.length = 0;
    fake.configSet = (p) => (p.confirm_expensive_model ? { value: "gemini-3.8-flash", info: { model: "gemini-3.8-flash" } } : { confirm_required: true, confirm_message: WARN });
    const id = await gatewayChat.create(); // sessão "viva"
    return gatewayChat.slash(id, "/model gemini-3.8-flash");
  };
  it("pede confirmação em português e, confirmado, troca com confirm_expensive_model", async () => {
    const r = await setup(true);
    expect(fake.asked).toHaveLength(1);
    expect(fake.asked[0].body).toBe("Esta conversa tem cerca de 171.345 tokens de contexto. Trocar para gemini-3.8-flash faz a próxima resposta reler tudo sem cache, o que custa mais. Confirme só se quiser trocar agora.");
    expect(fake.calls.filter(([m]) => m === "config.set").map(([, p]) => p.confirm_expensive_model)).toEqual([undefined, true]);
    expect(fake.calls.some(([m]) => m === "slash.exec")).toBe(false);
    expect(r).toMatchObject({ type: "output", output: "Modelo da conversa: gemini-3.8-flash" });
  });
  it("recusado: não troca e vira cartão de troca cancelada", async () => {
    const r = await setup(false);
    expect(fake.calls.filter(([m]) => m === "config.set")).toHaveLength(1);
    expect(r).toMatchObject({ type: "error", message: "Troca de modelo cancelada" });
    fake.configSet = null;
  });
});
