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
  const { ptPreview, toolOutput, WEB_COMMANDS } = await import("./gateway");
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

  it("menu / sem comandos de terminal", () => {
    const cmds = WEB_COMMANDS.map(([c]) => c);
    for (const t of ["/redraw", "/mouse", "/quit", "/prompt", "/statusbar", "/login", "/yolo", "/topup"]) expect(cmds).not.toContain(t);
  });
});
