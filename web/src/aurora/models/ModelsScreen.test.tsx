// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getState } from "../store";

const net = vi.hoisted(() => ({ fetchJSON: vi.fn() }));
vi.mock("@/lib/api", () => ({ fetchJSON: net.fetchJSON }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Init = { method?: string; body?: string } | undefined;
const m = (id: string, caps: string[], o: Record<string, unknown> = {}) => ({ id, caps, capsKnown: true, priceIn: null, priceOut: null, pricePerMin: null, context: null, ...o });
const prov = (id: string, name: string, models: unknown[], o: Record<string, unknown> = {}) => ({ id, name, kind: "openai", baseUrl: `https://${id}.example.com/v1`, editable: true, keyHint: "…a91f", status: "ok", error: null, checkedAt: null, models, ...o });

const NOUS = prov("nous", "Nous Portal", [m("hermes-4-70b", ["text"], { priceIn: 0.13, priceOut: 0.4, context: 128000 })], { kind: "builtin", editable: false, keyHint: "" });
const OR = prov("custom:openrouter", "OpenRouter", [m("gemini-flash", ["text", "vision"], { priceIn: 0.3, priceOut: 2.5 }), m("kimi-k2", ["text"], { priceIn: 0.55, priceOut: 2.2 })]);
const BAD = prov("custom:openai", "OpenAI", [m("gpt-5-mini", ["text", "vision"])], { status: "error", error: { code: "unauthorized", message: "x", since: 1759871640 } });

const meta = (unit: string, i: number | null, o: number | null) => ({ unit, tokensIn: i, tokensOut: o, measured: false });
const ROUTING = {
  default: { provider: "nous", model: "hermes-4-70b" },
  tasks: {
    main: { inherit: true }, "channel.telegram": { inherit: true }, "channel.whatsapp": { inherit: true }, "channel.api": { inherit: true },
    group_analysis: { inherit: true }, triage_jev: { provider: "", model: "", minConfidence: 0.7 }, vision: { inherit: true },
    transcription: { inherit: true }, compaction: { inherit: true }, scheduled: { inherit: true },
  },
  taskMeta: {
    default: meta("mil mensagens", 1500, 400), main: meta("mil mensagens", 2500, 600), "channel.telegram": meta("mil mensagens", 1800, 400),
    "channel.whatsapp": meta("mil mensagens", 1800, 350), "channel.api": meta("mil mensagens", 1200, 300), group_analysis: meta("mil lotes", 6000, 700),
    triage_jev: meta("mil decisões", 700, 0), vision: meta("mil imagens", 1400, 250), transcription: meta("mil áudios de 1 min", null, null),
    compaction: meta("mil resumos", 8000, 800), scheduled: meta("mil execuções", 3000, 600),
  },
};
const LIMITS = { dailyUsd: 15, monthlyUsd: 300, alertPct: 80, onLimit: "pause_non_urgent", saved: true };
const SPEND = { today: 6.9, month: 58.4, dayOfMonth: 8, daysInMonth: 31 };

type RoutingState = { default: unknown; tasks: Record<string, unknown>; taskMeta: unknown };
let state: { provs: unknown[]; fail: boolean; routing: RoutingState };
const calls: { url: string; init: Init }[] = [];

function route(url: string, init: Init) {
  calls.push({ url, init });
  if (state.fail && url === "/api/providers") return Promise.reject(new Error("fora do ar"));
  if (url === "/api/providers" && !init) return Promise.resolve(state.provs);
  if (url === "/api/models/routing" && !init) return Promise.resolve(state.routing);
  if (url === "/api/limits" && !init) return Promise.resolve(LIMITS);
  if (url === "/api/usage/spend") return Promise.resolve(SPEND);
  if (url === "/api/providers/test") return Promise.resolve(JSON.parse(init!.body!).apiKey === "sk-boa-123456" ? { ok: true, latencyMs: 500, models: ["llama-70b", "qwen-vl"] } : { ok: false, code: "unauthorized", message: "A chave foi recusada (erro 401). Confira se copiou inteira." });
  if (url === "/api/providers" && init?.method === "POST") {
    const created = prov("custom:together-ai", "Together AI", [m("llama-70b", ["text"])]);
    state.provs = [...state.provs, created];
    return Promise.resolve(created);
  }
  if (url === "/api/models/routing" && init?.method === "PUT") return Promise.resolve({ ...ROUTING, tasks: { ...ROUTING.tasks, vision: { provider: "custom:openrouter", model: "gemini-flash" } } });
  if (url.startsWith("/api/providers/") && init?.method === "DELETE") {
    const gone = decodeURIComponent(url.split("/")[3]);
    state.provs = state.provs.filter((p) => (p as { id: string }).id !== gone);
    // O backend devolve as tarefas que usavam o provedor para a herança.
    state.routing = { ...state.routing, tasks: Object.fromEntries(Object.entries(state.routing.tasks).map(([k, v]) => [k, (v as { provider?: string }).provider === gone ? { inherit: true } : v])) };
    return Promise.resolve({ ok: true, affected: [] });
  }
  return Promise.reject(new Error(`sem rota: ${url}`));
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount() {
  const { ModelsScreen } = await import("./ModelsScreen");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<ModelsScreen />));
  await flush();
}
async function flush(ms = 30) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}
const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error("elemento não encontrado");
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
};
const byText = (sel: string, t: string | RegExp) => [...document.querySelectorAll(sel)].find((e) => (typeof t === "string" ? e.textContent?.trim() === t : t.test(e.textContent ?? "")));
async function type(el: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  calls.length = 0;
  state = { provs: [NOUS, OR, BAD], fail: false, routing: ROUTING };
  net.fetchJSON.mockReset();
  net.fetchJSON.mockImplementation(route);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = container = null;
});

const trigger = (task: string) => document.querySelector(`button[aria-haspopup="listbox"][aria-labelledby="mdl-row-${task}"]`);
const bodyOf = (url: string, method: string) => {
  const c = calls.find((x) => x.url === url && x.init?.method === method);
  return c ? JSON.parse(c.init!.body!) : null;
};
const region = () => document.querySelector("[role=region]");
const toasts = () => getState().toasts.map((t) => `${t.text} ${t.sub ?? ""}`).join(" | ");

describe("Modelos", () => {
  it("mostra provedores, a tabela de tarefas e os limites; provedor com problema e triagem sem modelo ficam à vista", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    for (const s of ["Nous Portal", "OpenRouter", "Com problema", "Quem faz o quê", "Modelo padrão", "Conversa principal", "Triagem", "Visão de imagens", "Transcrição de áudio", "Por dia", "Por mês", "US$ 6,90", "de US$ 15,00"]) expect(text).toContain(s);
    expect(text).toContain("Chave recusada desde 07/10"); // cartão vermelho
    expect(text).toContain("Sem modelo de decisão. A triagem está desligada"); // triagem sem Jev configurado
    expect(text).toContain("No ritmo atual o mês fecha em ~US$ 226,"); // projeção do mês
    expect(trigger("default")?.textContent).toContain("hermes-4-70b");
    expect(trigger("main")?.textContent).toContain("Herdado de Modelo padrão · Nous Portal");
    expect(trigger("channel.api")?.textContent).toContain("Herdado de Conversa principal");
    // Custo estimado do padrão: 1000 × (1500×0,13 + 400×0,40) ÷ 1e6 ≈ US$ 0,35
    expect(text).toContain("US$ 0,35");
    // O padrão não lê imagens: a Visão herdeira avisa; a Triagem não pode usar o padrão.
    expect(text).toContain("hermes-4-70b não lê imagens. Escolha outro modelo.");
    expect(document.querySelector("[role=switch][aria-label='Usar o padrão em Triagem']")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("sem provedor: explica o que é e oferece adicionar", async () => {
    state.provs = [];
    await mount();
    expect(document.body.textContent).toContain("Nenhum provedor conectado");
    expect(byText("button", "Adicionar provedor")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Quem faz o quê");
  });

  it("erro ao carregar: avisa que o salvo continua valendo e tenta de novo", async () => {
    state.fail = true;
    await mount();
    expect(document.querySelector("[role=alert]")?.textContent).toContain("Não consegui carregar a configuração de modelos");
    state.fail = false;
    await click(byText("button", /Tentar de novo/));
    await flush();
    expect(document.body.textContent).toContain("Quem faz o quê");
    expect(document.querySelector("[role=alert]")).toBeNull();
  });

  it("escolher modelo: o que não lê imagens fica desabilitado com o motivo; salvar manda só o que mudou", async () => {
    await mount();
    await click(trigger("vision"));
    const list = document.querySelector("[role=listbox]")!;
    expect(list).toBeTruthy();
    const opts = [...list.querySelectorAll("[role=option]")];
    const kimi = opts.find((o) => o.textContent?.includes("kimi-k2"))!;
    expect(kimi.getAttribute("aria-disabled")).toBe("true");
    expect(kimi.textContent).toContain("Não lê imagens");
    await click(kimi); // desabilitado: nada acontece
    expect(region()).toBeNull();
    await click(opts.find((o) => o.textContent?.includes("gemini-flash")));
    expect(document.querySelector("[role=listbox]")).toBeNull(); // fechou
    expect(trigger("vision")?.textContent).toContain("gemini-flash");
    expect(region()?.textContent).toContain("1 alteração não salva");
    await click(byText("button", "Salvar"));
    await flush();
    expect(bodyOf("/api/models/routing", "PUT")).toEqual({ tasks: { vision: { provider: "custom:openrouter", model: "gemini-flash" } } });
    expect(region()).toBeNull();
    expect(toasts()).toContain("Modelos salvos");
  });

  it("a busca no seletor filtra e avisa quando nada casa", async () => {
    await mount();
    await click(trigger("default"));
    const input = document.querySelector("[role=listbox] input") as HTMLInputElement;
    await type(input, "kimi");
    const names = [...document.querySelectorAll("[role=option]")].map((o) => o.textContent ?? "");
    expect(names).toHaveLength(1);
    expect(names[0]).toContain("kimi-k2");
    await type(input, "zzz");
    expect(document.querySelector("[role=listbox]")?.textContent).toContain("Nenhum modelo com “zzz”.");
  });

  it("Esc fecha o seletor", async () => {
    await mount();
    await click(trigger("default"));
    expect(document.querySelector("[role=listbox]")).toBeTruthy();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.querySelector("[role=listbox]")).toBeNull();
  });

  it("usar o padrão: desligar copia o modelo herdado; descartar volta ao salvo", async () => {
    await mount();
    const sw = () => document.querySelector("[role=switch][aria-label='Usar o padrão em Conversa principal']")!;
    expect(sw().getAttribute("aria-checked")).toBe("true");
    await click(sw());
    expect(sw().getAttribute("aria-checked")).toBe("false");
    expect(trigger("main")?.textContent).toContain("hermes-4-70b"); // ponto de partida: o modelo herdado
    expect(region()?.textContent).toContain("1 alteração não salva");
    await click(byText("button", "Descartar"));
    expect(sw().getAttribute("aria-checked")).toBe("true");
    expect(region()).toBeNull();
  });

  it("limites: ajusta o limite de 5 em 5 e escolhe o que fazer ao bater", async () => {
    await mount();
    await click(document.querySelector("button[aria-label='Aumentar o limite por dia']"));
    expect(document.body.textContent).toContain("de US$ 20,00");
    await click(byText("[role=radio]", /Pausar o perfil/));
    await click(byText("[role=radio]", "90%"));
    expect(region()?.textContent).toContain("3 alterações não salvas");
    await click(byText("button", "Salvar"));
    await flush();
    expect(bodyOf("/api/limits", "PUT")).toEqual({ dailyUsd: 20, monthlyUsd: 300, alertPct: 90, onLimit: "pause_profile" });
  });

  it("adicionar provedor: só salva depois de um teste que deu certo, e mexer na chave invalida o teste", async () => {
    await mount();
    await click(byText("button", /Adicionar provedor compatível com OpenAI/));
    const dlg = document.querySelector("[role=dialog]")!;
    expect(dlg).toBeTruthy();
    const inputs = dlg.querySelectorAll("input");
    const [name, url, key] = [inputs[0], inputs[1], inputs[2]] as HTMLInputElement[];
    const save = () => byText("button", "Adicionar provedor") as HTMLButtonElement;
    const test = () => byText("button", /Testar (conexão|de novo)/) as HTMLButtonElement;
    expect(save().disabled).toBe(true);
    expect(test().disabled).toBe(true);
    await type(name, "Together AI");
    await type(url, "api.together.xyz");
    expect(dlg.textContent).toContain("Precisa começar com https://");
    await type(url, "https://api.together.xyz/v1");
    await type(key, "sk-errada");
    await click(test());
    await flush();
    expect(dlg.querySelector("[role=status]")?.textContent).toContain("erro 401");
    expect(save().disabled).toBe(true);
    await type(key, "sk-boa-123456");
    expect(dlg.querySelector("[role=status]")?.textContent).toContain("Teste antes de salvar"); // mexeu na chave: teste invalidado
    await click(test());
    await flush();
    expect(dlg.querySelector("[role=status]")?.textContent).toBe("Conectado em 0,5 s · 2 modelos encontrados");
    expect(dlg.textContent).toContain("qwen-vl");
    expect(save().disabled).toBe(false);
    await click(save());
    await flush();
    expect(bodyOf("/api/providers", "POST")).toEqual({ name: "Together AI", baseUrl: "https://api.together.xyz/v1", apiKey: "sk-boa-123456", kind: "openai" });
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(document.body.textContent).toContain("Together AI");
    expect(document.body.textContent).not.toContain("sk-boa-123456"); // a chave não volta para a tela
  });

  it("remover provedor: lista o efeito em cada tarefa e só apaga ao confirmar", async () => {
    state.routing = { ...ROUTING, tasks: { ...ROUTING.tasks, vision: { provider: "custom:openrouter", model: "gemini-flash" }, compaction: { provider: "custom:openrouter", model: "kimi-k2" } } };
    await mount();
    await click(document.querySelector("button[aria-label='Remover OpenRouter']"));
    const dlg = document.querySelector("[role=alertdialog]")!;
    expect(dlg.textContent).toContain("Remover OpenRouter?");
    expect(dlg.textContent).toContain("A chave é apagada deste perfil.");
    expect(dlg.textContent).toContain("Visão de imagens fica sem modelo: as imagens deixam de ser analisadas.");
    expect(dlg.textContent).toContain("Resumo e compactação volta para o padrão (hermes-4-70b).");
    await click(byText("button", "Cancelar"));
    expect(document.querySelector("[role=alertdialog]")).toBeNull();
    expect(calls.some((c) => c.init?.method === "DELETE")).toBe(false);
    await click(document.querySelector("button[aria-label='Remover OpenRouter']"));
    await click(byText("button", "Remover provedor"));
    await flush();
    expect(calls.some((c) => c.init?.method === "DELETE" && c.url === "/api/providers/custom%3Aopenrouter")).toBe(true);
    expect(document.querySelector("[role=alertdialog]")).toBeNull();
    expect(toasts()).toContain("OpenRouter removido");
    expect(document.body.textContent).not.toContain("não aparece mais na lista"); // as tarefas voltaram a herdar
  });

  it("testar um provedor salvo mostra o resultado no cartão", async () => {
    const base = route;
    net.fetchJSON.mockImplementation((url: string, init: Init) => (url === "/api/providers/custom%3Aopenrouter/test" ? Promise.resolve({ ok: true, latencyMs: 430, models: ["a", "b"] }) : base(url, init)));
    await mount();
    const card = document.querySelector("button[aria-label='Remover OpenRouter']")!.closest(".mdl-card")!;
    await click(card.querySelector("button.mdl-sbtn"));
    await flush();
    expect(card.querySelector("[role=status]")?.textContent).toBe("Respondeu em 0,4 s · 2 modelos");
  });
});
