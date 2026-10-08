import { beforeEach, describe, expect, it, vi } from "vitest";

const net = vi.hoisted(() => ({ fetchJSON: vi.fn() }));
vi.mock("@/lib/api", () => ({ fetchJSON: net.fetchJSON }));

const A = await import("./api");
type P = import("./api").Provider;
type M = import("./api").ModelEntry;
type R = import("./api").Routing;

const model = (id: string, caps: M["caps"], o: Partial<M> = {}): M => ({ id, caps, capsKnown: true, priceIn: null, priceOut: null, pricePerMin: null, context: null, ...o });
const prov = (id: string, models: M[], o: Partial<P> = {}): P => ({ id, name: id[0].toUpperCase() + id.slice(1), kind: "openai", baseUrl: `https://${id}.example.com/v1`, editable: true, keyHint: "…a91f", status: "ok", error: null, checkedAt: null, models, ...o });

const NOUS = prov("nous", [model("hermes-4-405b", ["text"], { priceIn: 1, priceOut: 3 }), model("hermes-4-70b", ["text"], { priceIn: 0.13, priceOut: 0.4, context: 128000 })], { kind: "builtin", editable: false });
const OR = prov("openrouter", [model("gemini-flash", ["text", "vision"], { priceIn: 0.3, priceOut: 2.5, context: 1_000_000 })]);
const GROQ = prov("groq", [model("llama", ["text"]), model("whisper-large-v3-turbo", ["audio"], { pricePerMin: 0.0007 })]);
const JEV = prov("typesafe", [model("jev-latest", ["decision"], { priceIn: 0.042, priceOut: 0, latency: "0,07–0,5 s" })], { kind: "decision" });
const PROVS = [NOUS, OR, GROQ, JEV];

const routing = (o: Partial<R["tasks"]> = {}, def: R["default"] = { provider: "nous", model: "hermes-4-70b" }): R => ({
  default: def,
  tasks: {
    main: { inherit: true }, "channel.telegram": { inherit: true }, "channel.whatsapp": { inherit: true }, "channel.api": { inherit: true },
    group_analysis: { inherit: true }, triage_jev: { provider: "typesafe", model: "jev-latest", minConfidence: 0.7 }, vision: { inherit: true },
    transcription: { inherit: true }, compaction: { inherit: true }, scheduled: { inherit: true }, ...o,
  },
  taskMeta: {} as R["taskMeta"],
});

beforeEach(() => net.fetchJSON.mockReset());

describe("herança", () => {
  it("canais herdam da conversa principal; o resto, do padrão; escolha própria interrompe a herança", () => {
    const cfg = A.toCfg(routing({ main: { provider: "nous", model: "hermes-4-405b" }, "channel.whatsapp": { provider: "openrouter", model: "gemini-flash" } }));
    expect(A.eff("default", cfg)).toMatchObject({ p: "nous", m: "hermes-4-70b", own: true });
    expect(A.eff("main", cfg)).toMatchObject({ p: "nous", m: "hermes-4-405b", own: true });
    expect(A.eff("channel.telegram", cfg)).toMatchObject({ p: "nous", m: "hermes-4-405b", own: false }); // da Conversa principal
    expect(A.eff("channel.whatsapp", cfg)).toMatchObject({ p: "openrouter", m: "gemini-flash", own: true });
    expect(A.eff("scheduled", cfg)).toMatchObject({ p: "nous", m: "hermes-4-70b", own: false }); // do padrão
  });

  it("sem padrão, o que herda fica sem modelo; triagem desligada também", () => {
    const cfg = A.toCfg({ ...routing({ triage_jev: { provider: "", model: "" } }), default: null });
    expect(A.eff("default", cfg)).toEqual({ none: true, own: true });
    expect(A.eff("vision", cfg)).toMatchObject({ none: true, own: false });
    expect(A.eff("triage_jev", cfg)).toMatchObject({ none: true });
  });

  it("modelOk: o catálogo só afirma o que sabe", () => {
    expect(A.modelOk(OR.models[0], "vision")).toBe(true);
    expect(A.modelOk(NOUS.models[0], "vision")).toBe(false);
    expect(A.modelOk(model("x", ["text"], { capsKnown: false }), "vision")).toBe(true); // desconhecido: não bloqueia
    expect(A.modelOk(model("x", ["text"], { capsKnown: false }), "audio")).toBe(false);
    expect(A.modelOk(GROQ.models[1], "text")).toBe(false);
    expect(A.modelOk(undefined, "text")).toBe(false);
  });
});

describe("salvar só o que mudou", () => {
  it("toCfg/toBody: mudança vira pedido; sem mudança não há pedido", () => {
    const saved = A.toCfg(routing());
    expect(A.toBody(saved, saved)).toBeNull();
    const cfg = { ...saved, vision: { p: "openrouter", m: "gemini-flash" }, main: { def: true } as const, triage_jev: { p: "typesafe", m: "jev-latest", min: 85 }, default: { p: "nous", m: "hermes-4-405b" } };
    expect(A.changedTasks(cfg, saved).sort()).toEqual(["default", "triage_jev", "vision"]);
    expect(A.toBody(cfg, saved)).toEqual({
      default: { provider: "nous", model: "hermes-4-405b" },
      tasks: { vision: { provider: "openrouter", model: "gemini-flash" }, triage_jev: { provider: "typesafe", model: "jev-latest", minConfidence: 0.85 } },
    });
    // Voltar a herdar manda inherit; a confiança só vai na triagem.
    const back = { ...saved, vision: { def: true } as const };
    expect(A.toBody({ ...back }, A.toCfg(routing({ vision: { provider: "openrouter", model: "gemini-flash" } })))).toEqual({ tasks: { vision: { inherit: true } } });
  });

  it("a confiança da triagem vira % (50 a 95) e volta fração", () => {
    expect(A.toCfg(routing()).triage_jev).toEqual({ p: "typesafe", m: "jev-latest", min: 70 });
    expect(A.MIN_CONF).toMatchObject({ min: 50, max: 95, step: 5 });
  });
});

describe("custo estimado", () => {
  const meta = { unit: "mil mensagens", tokensIn: 1500, tokensOut: 400, measured: false };
  it("preço × tokens médios por mil unidades; por minuto de áudio; sem dado vira nada", () => {
    expect(A.costPerK(NOUS.models[1], meta)).toBeCloseTo((1000 * (1500 * 0.13 + 400 * 0.4)) / 1e6, 6); // US$ 0,36
    expect(A.costPerK(GROQ.models[1], { ...meta, tokensIn: null, tokensOut: null })).toBeCloseTo(0.7, 6); // 1000 áudios de 1 min
    expect(A.costPerK(JEV.models[0], { unit: "mil decisões", tokensIn: 700, tokensOut: 0, measured: false })).toBeCloseTo(0.0294, 4);
    expect(A.costPerK(model("sem-preco", ["text"]), meta)).toBeNull();
    expect(A.costPerK(NOUS.models[0], undefined)).toBeNull();
    expect(A.costPerK(undefined, meta)).toBeNull();
  });
  it("formata em US$ com vírgula e milhar com ponto", () => {
    expect(A.usd(0.36)).toBe("US$ 0,36");
    expect(A.usd(0.003)).toBe("< US$ 0,01");
    expect(A.usd(0)).toBe("US$ 0,00");
    expect(A.usd(1234.5)).toBe("US$ 1.234,50");
    expect(A.usdOrDash(null)).toBe("—");
    expect(A.ctxLabel(128000)).toBe("128 mil");
    expect(A.ctxLabel(1_000_000)).toBe("1 milhão");
    expect(A.ctxLabel(null)).toBe("");
    expect(A.modelMeta(JEV.models[0])).toBe("decide em 0,07–0,5 s · saída grátis");
    expect(A.modelMeta(GROQ.models[1])).toBe("US$ 0,0007 por minuto");
    expect(A.modelMeta(NOUS.models[1])).toBe("128 mil de contexto");
  });
});

describe("remover provedor", () => {
  it("o padrão fica vazio; tarefa que o padrão atende volta a herdar; sem capacidade fica sem modelo", () => {
    const cfg = A.toCfg(routing({ vision: { provider: "openrouter", model: "gemini-flash" }, compaction: { provider: "openrouter", model: "gemini-flash" }, transcription: { provider: "groq", model: "whisper-large-v3-turbo" } }, { provider: "openrouter", model: "gemini-flash" }));
    const fx = A.removalEffects("openrouter", cfg, PROVS);
    const by = Object.fromEntries(fx.map((f) => [f.task, f]));
    expect(by["Modelo padrão"]).toMatchObject({ tone: "err", what: expect.stringContaining("fica vazio") });
    expect(Object.keys(by)).toEqual(["Modelo padrão", "Visão de imagens", "Resumo e compactação"]);
    // Com o padrão também no OpenRouter, nenhuma tarefa tem para onde voltar.
    expect(by["Visão de imagens"]).toMatchObject({ tone: "err", what: expect.stringContaining("as imagens deixam de ser analisadas") });
    expect(by["Resumo e compactação"].tone).toBe("err");

    // Padrão em outro provedor com texto: compactação volta; visão não (o padrão não lê imagens).
    const cfg2 = A.toCfg(routing({ vision: { provider: "openrouter", model: "gemini-flash" }, compaction: { provider: "openrouter", model: "gemini-flash" } }));
    const fx2 = A.removalEffects("openrouter", cfg2, PROVS);
    expect(fx2.find((f) => f.task === "Resumo e compactação")).toMatchObject({ tone: "back", what: "volta para o padrão (hermes-4-70b)." });
    expect(fx2.find((f) => f.task === "Visão de imagens")).toMatchObject({ tone: "err" });
    // Sem uso, sem efeitos; remover o Jev desliga a triagem.
    expect(A.removalEffects("groq", cfg2, PROVS)).toEqual([]);
    expect(A.removalEffects("typesafe", cfg2, PROVS)[0]).toMatchObject({ task: "Triagem", what: expect.stringContaining("triagem desliga") });
  });
});

describe("limites", () => {
  it("barra âmbar passando do alerta, vermelha passando do limite", () => {
    expect(A.limitView(6.9, 15, 80)).toMatchObject({ over: false, warn: false, bar: "var(--acc)", width: "46%" });
    expect(A.limitView(12, 15, 80)).toMatchObject({ over: false, warn: true, bar: "var(--warn)" });
    expect(A.limitView(15, 15, 80)).toMatchObject({ over: true, bar: "var(--err)", width: "100%" });
    expect(A.limitView(40, 15, 80).width).toBe("100%");
    expect(A.limitView(5, 0, 80).pct).toBe(0); // sem limite não divide por zero
  });
  it("projeção do mês: gasto até hoje ÷ dias passados × dias do mês", () => {
    expect(A.projectMonth({ today: 6.9, month: 58.4, dayOfMonth: 8, daysInMonth: 31 })).toBeCloseTo(226.3, 1);
    expect(A.projectMonth({ today: 0, month: 0, dayOfMonth: 1, daysInMonth: 31 })).toBe(0);
  });
  it("detecta quais campos de limite mudaram", () => {
    const a = { dailyUsd: 15, monthlyUsd: 300, alertPct: 80, onLimit: "pause_non_urgent" as const };
    expect(A.limitsChanged(a, a)).toEqual([]);
    expect(A.limitsChanged({ ...a, dailyUsd: 20, onLimit: "notify" }, a)).toEqual(["dailyUsd", "onLimit"]);
  });
});

describe("provedores", () => {
  it("frase de problema com data; resultado do teste", () => {
    const at = new Date(2026, 9, 7, 22, 14).getTime() / 1000;
    const bad = prov("openai", [], { status: "error", error: { code: "unauthorized", message: "x", since: at } });
    expect(A.errorLine(bad)).toBe("Chave recusada desde 07/10, 22:14. Tudo que usa Openai está falhando.");
    expect(A.errorLine({ ...bad, error: { code: "unreachable", message: "x", since: null } })).toBe("Sem resposta. Tudo que usa Openai está falhando.");
    expect(A.errorLine(prov("a", []))).toBe("");
    expect(A.testLine({ ok: true, latencyMs: 430, models: ["a", "b"] })).toBe("Respondeu em 0,4 s · 2 modelos");
    expect(A.connectLine({ ok: true, latencyMs: 500, models: ["a"] })).toBe("Conectado em 0,5 s · 1 modelo encontrado");
    expect(A.testLine({ ok: false, code: "unauthorized", message: "A chave foi recusada (erro 401)." })).toBe("A chave foi recusada (erro 401).");
  });
  it("valida o endereço como o diálogo (https e domínio, ou localhost)", () => {
    expect(A.urlOk("https://api.together.xyz/v1")).toBe(true);
    expect(A.urlOk("http://localhost:11434/v1")).toBe(true);
    expect(A.urlOk("api.together.xyz")).toBe(false);
    expect(A.urlOk("https://sem-ponto")).toBe(false);
    expect(A.urlOk("")).toBe(false);
    expect(A.hostOf("https://api.groq.com/openai/v1")).toBe("api.groq.com");
    expect(A.providerColor("nous")).toBe("#a395ff");
    expect(A.providerColor("meu-servidor")).toBe(A.providerColor("meu-servidor"));
  });
});

describe("chamadas", () => {
  it("escapa o id do provedor (custom:chave) e manda o corpo certo", async () => {
    net.fetchJSON.mockResolvedValue({});
    await A.modelsApi.update("custom:together-ai", { apiKey: "k" });
    expect(net.fetchJSON).toHaveBeenLastCalledWith("/api/providers/custom%3Atogether-ai", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ apiKey: "k" }) }));
    await A.modelsApi.testSaved("custom:x");
    expect(net.fetchJSON).toHaveBeenLastCalledWith("/api/providers/custom%3Ax/test", expect.objectContaining({ method: "POST" }));
    await A.modelsApi.test("https://a.b/v1", "k");
    expect(JSON.parse(net.fetchJSON.mock.lastCall![1].body)).toEqual({ baseUrl: "https://a.b/v1", apiKey: "k", kind: "openai" });
    await A.modelsApi.saveRouting({ tasks: { vision: { inherit: true } } });
    expect(net.fetchJSON).toHaveBeenLastCalledWith("/api/models/routing", expect.objectContaining({ method: "PUT" }));
  });
});
