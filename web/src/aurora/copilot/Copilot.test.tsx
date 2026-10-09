// @vitest-environment jsdom
// Fluxo da tela Clientes do Copiloto com o backend simulado em memória: lista, filtros, paginação, detalhe e abas,
// rotacionar, revogar, reativar, mudar de plano, adicionar em 3 passos, estados (vazio, erro, carregando) e a chave que some.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditItem, CatalogTool, Client, ClientDetail, CopilotSettings, DirectoryClient } from "./api";
import { sortClients } from "./model";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.now() / 1000;
const DAY = 86400;
const CATALOG: CatalogTool[] = [
  { key: "my_channels_status", label: "Status dos canais", plans: ["starter", "pro"], weight: 1 },
  { key: "search_conversations", label: "Consultar conversas", plans: ["starter", "pro"], weight: 2 },
  { key: "audit_operator", label: "Auditar atendente", plans: ["pro"], weight: 5 },
];
const SETTINGS: CopilotSettings = { mcpUrl: "http://mcp", secretEnv: "COPILOT_MCP_JWT_SECRET", plans: { starter: { credits: 1000 }, pro: { credits: 5000 } }, catalog: CATALOG, planLabels: { starter: "Starter", pro: "Pro" } };

type Rec = { c: Client; audit: AuditItem[]; credits: number };
const client = (p: Partial<Client> & { systemClientId: string; name: string }): Client => ({
  plan: "starter",
  profileId: "cli-" + p.systemClientId,
  status: "active",
  createdAt: NOW - 60 * DAY,
  month: { conversations: 10, credits: 100, creditsLimit: 1000, tokens: 4000, toolCalls: 3, spendUsd: 1.5 },
  lastActivityAt: NOW - 3600,
  keyRotatedAt: null,
  revoked: null,
  ...p,
});
const audit = (p: Partial<AuditItem>): AuditItem => ({ at: NOW - 600, question: "Quantos atendimentos ontem?", askedBy: { name: "Marcos", role: "dono", via: "Aibiz Manager" }, tool: "search_conversations", toolLabel: "Consultar conversas", args: null, query: { systemClientId: "abc123", status: "sem_resposta" }, rows: 14, ms: 120, result: "ok", error: null, credits: 2, ...p });

let db: Rec[];
let directory: DirectoryClient[];
let calls: { url: string; method: string; body: unknown }[];
let failList = false;
let failDetail = false;
let slow = 0;
let createDelay = 0;
let nextKey = 1;
let lastKey = "";

const detail = (r: Rec): ClientDetail => ({
  ...r.c,
  tools: CATALOG.map((t) => ({ key: t.key, label: t.label, weight: t.weight, enabled: t.plans.includes(r.c.plan), reason: t.plans.includes(r.c.plan) ? `Liberado pelo plano ${r.c.plan === "pro" ? "Pro" : "Starter"} · só leitura` : "Só no plano Pro" })),
  usage: { daily: [{ day: new Date((NOW - 3 * 3600) * 1000).toISOString().slice(0, 10), credits: r.c.month.credits }], byTool: [{ key: "search_conversations", uses: 7, credits: r.c.month.credits }], tokens: 4000, tokenCredits: 0 },
  filter: { systemClientId: r.c.systemClientId },
});
const recOf = (sid: string) => {
  const r = db.find((x) => x.c.systemClientId === sid);
  if (!r) throw Object.assign(new Error("Cliente não encontrado"), { status: 404 });
  return r;
};
const counts = () => ({ all: db.length, active: db.filter((r) => r.c.status === "active").length, no_credit: db.filter((r) => r.c.status === "no_credit").length, revoked: db.filter((r) => r.c.status === "revoked").length });
const newKey = () => (lastKey = `hk_live_test${nextKey++}secretkey`);

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  fetchJSON: vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    if (slow) await new Promise((r) => setTimeout(r, slow));
    const u = new URL(url, "http://x");
    const p = u.pathname;
    const get = (k: string) => u.searchParams.get(k) ?? "";
    if (p === "/api/copilot/settings") return SETTINGS;
    if (p === "/api/copilot/clients" && method === "GET") {
      if (failList) throw new Error("fora do ar");
      const q = get("q").toLowerCase();
      let items = db.map((r) => r.c).filter((c) => (!q || c.name.toLowerCase().includes(q) || c.systemClientId.includes(q)) && (!get("status") || c.status === get("status")) && (!get("plan") || c.plan === get("plan")));
      items = sortClients(items, NOW);
      const start = Number(get("cursor") || 0);
      const limit = Number(get("limit") || 20);
      return { items: items.slice(start, start + limit), total: items.length, counts: counts(), kpis: { active: counts().active, noCredit: counts().no_credit, spendUsd: 42.5 }, nextCursor: start + limit < items.length ? String(start + limit) : null };
    }
    if (p === "/api/copilot/clients" && method === "POST") {
      if (createDelay) await new Promise((r) => setTimeout(r, createDelay));
      const d = directory.find((x) => x.systemClientId === body.systemClientId)!;
      const c = client({ systemClientId: d.systemClientId, name: d.name, plan: body.plan, lastActivityAt: null, createdAt: NOW, month: { conversations: 0, credits: 0, creditsLimit: SETTINGS.plans[body.plan as "pro"].credits, tokens: 0, toolCalls: 0, spendUsd: 0 } });
      db.push({ c, audit: [], credits: 0 });
      d.hasCopilot = true;
      return { profileId: c.profileId, apiKey: newKey(), client: detail(recOf(c.systemClientId)) };
    }
    if (p === "/api/aibiz/clients") {
      const q = get("q").toLowerCase();
      const items = directory.filter((c) => !q || c.name.toLowerCase().includes(q) || c.systemClientId.includes(q));
      return { items: q ? items : [...items].sort((a, b) => Number(a.hasCopilot) - Number(b.hasCopilot)), total: items.length, nextCursor: null };
    }
    const m = /^\/api\/copilot\/clients\/([^/]+)(?:\/(audit|rotate-key|revoke|reactivate))?$/.exec(p);
    if (m) {
      if (failDetail) throw new Error("fora do ar");
      const r = recOf(decodeURIComponent(m[1]));
      if (!m[2] && method === "GET") return detail(r);
      if (!m[2] && method === "PATCH") {
        r.c = { ...r.c, plan: body.plan, month: { ...r.c.month, creditsLimit: SETTINGS.plans[body.plan as "pro"].credits } };
        return detail(r);
      }
      if (m[2] === "audit") return { items: r.audit, nextCursor: null };
      if (m[2] === "rotate-key") return { apiKey: newKey(), client: detail(r) };
      if (m[2] === "revoke") {
        if (body.confirm !== r.c.systemClientId) throw Object.assign(new Error("para revogar, digite o systemClientId do cliente"), { status: 400 });
        r.c = { ...r.c, status: "revoked", revoked: { at: NOW, by: "painel", reason: body.reason ?? null, purgeAt: NOW + 30 * DAY } };
        return detail(r);
      }
      if (m[2] === "reactivate") {
        r.c = { ...r.c, status: "active", revoked: null };
        return { apiKey: newKey(), client: detail(r) };
      }
    }
    throw new Error("rota inesperada " + method + " " + url);
  }),
}));

const { Copilot } = await import("../screens/Copilot");
const { getState } = await import("../store");

let container: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const byText = (sel: string, text: string) => qa(sel).find((e) => e.textContent?.includes(text));
const click = (el: Element | null | undefined) => act(async () => { (el as HTMLElement).click(); });
const type = (el: HTMLInputElement | null | undefined, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el!.dispatchEvent(new Event("input", { bubbles: true }));
  });
const esc = () => act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
const names = () => qa("button.cp-item").map((b) => b.querySelector(".cp-ellip")?.textContent);
const dialog = () => q('[role="dialog"],[role="alertdialog"]');
const toasts = () => getState().toasts.map((t) => `${t.text} | ${t.sub ?? ""}`).join("\n");

async function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<MemoryRouter><Copilot /></MemoryRouter>));
  await flush();
  await flush();
}

const open = async (name: string) => {
  await click(qa("button.cp-item").find((b) => b.textContent?.includes(name)));
  await flush();
};

beforeEach(() => {
  calls = [];
  failList = false;
  failDetail = false;
  slow = 0;
  createDelay = 0;
  lastKey = "";
  db = [
    { c: client({ systemClientId: "abc123", name: "Padaria Sol", month: { conversations: 212, credits: 312, creditsLimit: 1000, tokens: 1800, toolCalls: 20, spendUsd: 3.4 } }), credits: 312, audit: [
      audit({}),
      audit({ at: NOW - 900, question: "Compara meu atendimento com o da Padaria Lua.", tool: "search_conversations", rows: 0, ms: 15, result: "blocked_scope", query: null, args: { text: "Padaria Lua" }, credits: 0 }),
    ] },
    { c: client({ systemClientId: "k82f1q", name: "Ótica Visão", plan: "pro", status: "no_credit", month: { conversations: 1022, credits: 5000, creditsLimit: 5000, tokens: 9_600_000, toolCalls: 200, spendUsd: 18.4 } }), credits: 5000, audit: [] },
    { c: client({ systemClientId: "de7731", name: "Doce Encanto Confeitaria", status: "revoked", lastActivityAt: NOW - 40 * DAY, revoked: { at: NOW - 3 * DAY, by: "Carla", reason: "Contrato encerrado", purgeAt: NOW + 27 * DAY } }), credits: 0, audit: [] },
    { c: client({ systemClientId: "ai7781", name: "Academia Ipê", lastActivityAt: null, createdAt: NOW - DAY, month: { conversations: 0, credits: 0, creditsLimit: 1000, tokens: 0, toolCalls: 0, spendUsd: 0 } }), credits: 0, audit: [] },
  ];
  directory = [
    { systemClientId: "abc123", name: "Padaria Sol", plan: "Starter", channelCount: 3, hasCopilot: true },
    { systemClientId: "zz9001", name: "Restaurante Sabor da Serra", plan: "Pro", channelCount: 1, hasCopilot: false },
    { systemClientId: "zz9002", name: "Construtora Vitória", plan: null, channelCount: 2, hasCopilot: false },
  ];
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async () => {}) } });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
});

describe("Clientes do Copiloto", () => {
  it("lista na ordem novos, sem saldo, ativos, revogados; selecionado com aria-current; faixa de isolamento e KPIs", async () => {
    await mount();
    expect(q("h1")?.textContent).toBe("Clientes do Copiloto");
    expect(container.textContent).not.toContain("Fase 3");
    expect(q(".cp-strip")?.textContent).toContain("O Copiloto só lê dados daquele cliente.");
    expect(names()).toEqual(["Academia Ipê", "Ótica Visão", "Padaria Sol", "Doce Encanto Confeitaria"]);
    expect(qa("button.cp-item").map((b) => b.getAttribute("aria-current"))).toEqual(["true", null, null, null]);
    expect(qa("button.cp-item")[3].dataset.revoked).toBe("true");
    const kpis = q('[aria-label="Resumo do mês"]')!.textContent!;
    expect(kpis).toContain("2ativos"); // abc123 e ai7781
    expect(kpis).toContain("1sem saldo");
    expect(kpis).toContain("US$ 42,50");
    const chips = qa('[aria-label="Situação"] .cp-chip').map((b) => b.textContent);
    expect(chips).toEqual(["Todos4", "Ativos2", "Sem saldo1", "Revogados1"]);
    // item: plano, id em mono, conversas e gasto, status e última atividade
    const padaria = qa("button.cp-item").find((b) => b.textContent?.includes("Padaria Sol"))!;
    expect(padaria.textContent).toContain("Starter");
    expect(padaria.textContent).toContain("abc123");
    expect(padaria.textContent).toContain("212 conversas");
    expect(padaria.textContent).toContain("US$ 3,40");
    expect(padaria.textContent).toContain("Ativo");
    expect(padaria.textContent).toContain("há 1 h");
  });

  it("detalhe do cliente novo: cabeçalho, faixa 'Cliente novo', 4 KPIs, link para o perfil e ações", async () => {
    await mount();
    const art = q("article")!;
    expect(art.textContent).toContain("Academia Ipê");
    expect(art.textContent).toContain("systemClientId ai7781");
    expect(art.textContent).toContain("Plano Starter");
    expect(art.querySelector('a[href="/settings/perfis?perfil=cli-ai7781"]')?.textContent).toContain("perfil cli-ai7781");
    expect(q(".cp-banner")?.textContent).toContain("Cliente novo");
    expect(qa(".cp-kpibox").map((k) => k.querySelector("span")?.textContent)).toEqual(["Conversas no mês", "Gasto no mês", "Créditos", "Última atividade"]);
    expect(art.textContent).toContain("nunca usou");
    expect(byText("button", "Mudar plano")).toBeTruthy();
    expect(byText("button", "Rotacionar chave")).toBeTruthy();
    expect(byText("button", "Revogar acesso")?.className).toContain("danger");
    expect(byText("article button", "Reativar")).toBeUndefined();
  });

  it("aba Ferramentas: filtro do cliente e cadeado nas fora do plano", async () => {
    await mount();
    await open("Padaria Sol");
    expect(q("article")?.textContent).toContain('systemClientId = "abc123"');
    const tools = qa(".cp-tool");
    expect(tools).toHaveLength(3);
    expect(tools[0].textContent).toContain("Liberado pelo plano Starter · só leitura");
    expect(tools[2].textContent).toContain("Auditar atendente");
    expect(tools[2].textContent).toContain("Só no plano Pro");
    expect(tools[2].dataset.on).toBe("false");
    expect(q('[role="tab"][aria-selected="true"]')?.textContent).toBe("Ferramentas");
  });

  it("aba Consumo: barra de créditos com faixa, créditos por dia e tabela por ferramenta", async () => {
    await mount();
    await open("Padaria Sol");
    await click(byText('[role="tab"]', "Consumo"));
    const bar = q('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuenow")).toBe("31");
    expect(bar.dataset.tone).toBe("ok");
    expect(q("article")?.textContent).toContain("312 de 1.000 (31%)");
    expect(q(".cp-days")).toBeTruthy();
    expect(qa(".cp-trow")[1].textContent).toContain("Consultar conversas");
    expect(q("article")?.textContent).toContain("Tokens no mês: 4,0 mil");
    expect(q("article")?.textContent).toContain("Tokens são os pedaços de texto");

    await open("Ótica Visão");
    expect(q('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("100");
    expect(q('[role="progressbar"]')?.dataset.tone).toBe("err");
    expect(q(".cp-banner")?.textContent).toContain("Os créditos do mês acabaram");
    expect(q("article")?.textContent).toContain("Tokens no mês: 4,0 mil"); // detalhe vem da API, não do KPI da lista
  });

  it("aba Auditoria: linha expansível com a consulta em mono e o filtro; recusa de outro cliente em vermelho", async () => {
    await mount();
    await open("Padaria Sol");
    await click(byText('[role="tab"]', "Auditoria"));
    await flush();
    expect(calls.some((c) => c.url === "/api/copilot/clients/abc123/audit")).toBe(true);
    const rows = qa(".cp-arow");
    expect(rows).toHaveLength(2);
    const first = rows[0].querySelector("button")!;
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(rows[0].textContent).toContain("“Quantos atendimentos ontem?”");
    expect(rows[0].textContent).toContain("Marcos (dono) · Aibiz Manager");
    expect(rows[0].textContent).toContain("14");
    await click(first);
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(rows[0].querySelector(".cp-code")?.textContent).toContain('"systemClientId": "abc123"');
    expect(rows[0].textContent).toContain('Só leitura · filtro systemClientId = "abc123" · 120 ms');
    // recusa
    expect(rows[1].dataset.scope).toBe("true");
    expect(rows[1].textContent).toContain("Recusado: outro cliente");
    await click(rows[1].querySelector("button"));
    expect(rows[1].textContent).toContain("Padaria Lua");
    expect(rows[1].textContent).toContain("Nada foi lido");
  });

  it("auditoria vazia explica e leva ao perfil", async () => {
    await mount();
    await click(byText('[role="tab"]', "Auditoria"));
    await flush();
    expect(q("article")?.textContent).toContain("O gestor ainda não fez nenhuma pergunta");
    expect(byText("article a", "Abrir o perfil cli-ai7781")).toBeTruthy();
  });

  it("busca, chips com aria-pressed e 'Limpar filtros' quando nada bate", async () => {
    await mount();
    const nc = byText('[aria-label="Situação"] button', "Sem saldo")!;
    expect(nc.getAttribute("aria-pressed")).toBe("false");
    await click(nc);
    await flush();
    expect(nc.getAttribute("aria-pressed")).toBe("true");
    expect(calls.at(-1)!.url).toContain("status=no_credit");
    expect(names()).toEqual(["Ótica Visão"]);
    await click(byText('[aria-label="Plano"] button', "Starter"));
    await flush();
    expect(calls.at(-1)!.url).toContain("plan=starter");
    expect(q("section")?.textContent).toContain("Nenhum cliente com esses filtros");
    await click(byText("button", "Limpar filtros"));
    await flush();
    expect(names()).toHaveLength(4);
    expect(nc.getAttribute("aria-pressed")).toBe("false");

    await type(q('input[type="search"]') as HTMLInputElement, "doce");
    await wait(320);
    expect(calls.at(-1)!.url).toContain("q=doce");
    expect(names()).toEqual(["Doce Encanto Confeitaria"]);
  });

  it("paginação de 20 em 20 pelo nextCursor", async () => {
    for (let i = 0; i < 26; i++) db.push({ c: client({ systemClientId: `id${String(i).padStart(2, "0")}`, name: `Cliente ${String(i).padStart(2, "0")}`, lastActivityAt: NOW - 100 * (i + 1) }), credits: 0, audit: [] });
    await mount();
    expect(names()).toHaveLength(20);
    expect(byText("button.cp-more", "Mostrando 20 de 30 · carregar mais")).toBeTruthy();
    await click(byText("button.cp-more", "carregar mais"));
    await flush();
    expect(calls.at(-1)!.url).toContain("cursor=20");
    expect(names()).toHaveLength(30);
    expect(q(".cp-more")).toBeNull();
    expect(q(".cp-foot")?.textContent).toBe("30 clientes");
  });

  it("rotacionar: padrão Em 24 horas, chave mostrada uma vez com Copiar, Esc e clique fora não fecham, e some ao fechar (nem no store nem no localStorage)", async () => {
    await mount();
    await open("Padaria Sol");
    await click(byText("article button", "Rotacionar chave"));
    expect(dialog()?.getAttribute("aria-modal")).toBe("true");
    expect(dialog()?.textContent).toContain("Rotacionar a chave de Padaria Sol");
    const radios = qa('[role="radio"]');
    expect(radios.map((r) => r.textContent)).toEqual(["Agora", "Em 24 horas"]);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true"]); // a rotina é 24 horas, não "Agora"
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0]);
    expect(dialog()?.textContent).toContain("continua valendo por mais 24 horas");
    await click(radios[0]);
    expect(dialog()?.textContent).toContain("Use se a chave vazou");
    await click(radios[1]);
    await click(byText("button", "Gerar chave nova"));
    await flush();
    expect(calls.find((c) => c.url.endsWith("/rotate-key"))?.body).toEqual({ graceHours: 24 });
    expect(lastKey).toMatch(/^hk_live_/);
    expect(dialog()?.textContent).toContain(lastKey);
    expect(dialog()?.textContent).toContain("Atualize no Aibiz Manager");
    expect(dialog()?.textContent).toContain("a chave não aparece de novo");
    // com a chave na tela, Esc e clique fora não fecham
    await esc();
    expect(dialog()).not.toBeNull();
    await act(async () => { q(".cp-scrim")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
    expect(dialog()).not.toBeNull();
    expect(byText("[role=dialog] button", "Cancelar")).toBeUndefined();
    await click(byText("button", "Copiar"));
    expect((navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(lastKey);
    expect(dialog()?.textContent).toContain("Chave copiada");
    // a chave não vai para toast, store nem storage
    expect(toasts()).not.toContain(lastKey);
    expect(JSON.stringify(getState())).not.toContain(lastKey);
    expect(JSON.stringify({ ...localStorage })).not.toContain(lastKey);
    await click(byText("button", "Já copiei, fechar"));
    expect(dialog()).toBeNull();
    expect(document.body.textContent).not.toContain(lastKey);
    expect(toasts()).toContain("Chave de Padaria Sol rotacionada");
  });

  it("revogar: alertdialog, só libera digitando o systemClientId; motivo opcional; vira revogado com Reativar", async () => {
    await mount();
    await open("Padaria Sol");
    await click(byText("article button", "Revogar acesso"));
    const d = dialog()!;
    expect(d.getAttribute("role")).toBe("alertdialog");
    expect(d.textContent).toContain("Revogar o acesso de Padaria Sol?");
    expect(d.textContent).toContain("Copiloto indisponível");
    expect(d.textContent).toContain("30 dias");
    expect(d.textContent).toContain("A auditoria das consultas continua aqui");
    const ok = byText("button", "Revogar acesso")!;
    const ok2 = [...d.querySelectorAll("button")].find((b) => b.textContent?.includes("Revogar acesso")) as HTMLButtonElement;
    expect(ok2.disabled).toBe(true);
    expect(ok).toBeTruthy();
    const [sidInput, reason] = [...d.querySelectorAll<HTMLInputElement>("input")];
    await type(sidInput, "abc12");
    expect(ok2.disabled).toBe(true);
    await type(sidInput, "abc123");
    expect(ok2.disabled).toBe(false);
    await type(reason, "Contrato encerrado");
    await click(ok2);
    await flush();
    expect(calls.find((c) => c.url.endsWith("/revoke"))?.body).toEqual({ confirm: "abc123", reason: "Contrato encerrado" });
    expect(dialog()).toBeNull();
    expect(q(".cp-banner")?.textContent).toContain("Acesso revogado");
    expect(q(".cp-banner")?.textContent).toContain("Contrato encerrado");
    expect(q(".cp-banner")?.textContent).toContain("em 30 dias");
    expect(byText("article button", "Reativar")).toBeTruthy();
    expect(byText("article button", "Revogar acesso")).toBeUndefined();
    expect((byText("article button", "Mudar plano") as HTMLButtonElement).disabled).toBe(true);
    expect(toasts()).toContain("Acesso de Padaria Sol revogado");
    // vai para o fim da lista, a 60%
    expect(names().slice(-2)).toEqual(["Padaria Sol", "Doce Encanto Confeitaria"]);
    expect(qa("button.cp-item").at(-2)!.dataset.revoked).toBe("true");
    expect(byText("button.cp-chip", "Revogados")?.textContent).toContain("2");
  });

  it("revogado: Reativar gera chave nova, mostrada uma vez", async () => {
    await mount();
    await open("Doce Encanto");
    expect(q(".cp-banner")?.textContent).toContain("por Carla (Contrato encerrado)");
    await click(byText("article button", "Reativar"));
    await click(byText("button", "Reativar e gerar chave"));
    await flush();
    expect(calls.some((c) => c.url.endsWith("/reactivate") && c.method === "POST")).toBe(true);
    expect(dialog()?.textContent).toContain(lastKey);
    await esc();
    expect(dialog()).not.toBeNull(); // a chave só some pelo botão
    await click(byText("button", "Já copiei, fechar"));
    expect(dialog()).toBeNull();
    expect(document.body.textContent).not.toContain(lastKey);
    expect(q(".cp-banner")).toBeNull();
    expect(byText("article button", "Revogar acesso")).toBeTruthy();
  });

  it("mudar plano: cartões com role=radio, atual marcado, diff de ferramentas e créditos, PATCH", async () => {
    await mount();
    await open("Padaria Sol");
    await click(byText("article button", "Mudar plano"));
    const cards = qa('[role="dialog"] [role="radio"]');
    expect(cards.map((c) => c.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    expect(cards[0].textContent).toContain("atual");
    const ok = [...dialog()!.querySelectorAll("button")].find((b) => b.textContent === "Mudar plano") as HTMLButtonElement;
    expect(ok.disabled).toBe(true);
    await click(cards[1]);
    expect(ok.disabled).toBe(false);
    expect(dialog()?.textContent).toContain("Entra: Auditar atendente");
    expect(dialog()?.textContent).toContain("Créditos: 1.000 → 5.000 por mês");
    expect(dialog()?.textContent).toContain("A cobrança muda no financeiro do Aibiz");
    await click(ok);
    await flush();
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ plan: "pro" });
    expect(dialog()).toBeNull();
    expect(q("article")?.textContent).toContain("Plano Pro");
    expect(toasts()).toContain("Padaria Sol agora no Pro");
  });

  it("sem saldo no Starter: o atalho 'Mudar para Pro' abre o diálogo já no Pro", async () => {
    db[1].c = { ...db[1].c, plan: "starter" };
    await mount();
    await open("Ótica Visão");
    await click(byText(".cp-banner button", "Mudar para Pro"));
    expect(qa('[role="dialog"] [role="radio"]').map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "true"]);
  });

  it("adicionar cliente em 3 passos: quem já tem Copiloto desabilitado, plano, revisão com progresso, chave uma vez, cliente novo no topo", async () => {
    createDelay = 1300;
    await mount();
    await click(byText("button", "Adicionar cliente"));
    const d = dialog()!;
    expect(d.textContent).toContain("Adicionar cliente ao Copiloto");
    // clique fora não fecha em nenhum passo; Esc fecha nos passos 1 e 2
    await act(async () => { q(".cp-scrim")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
    expect(dialog()).not.toBeNull();
    await esc();
    expect(dialog()).toBeNull();
    await click(byText("button", "Adicionar cliente"));
    await flush();
    const rows = qa(".cp-dirrow");
    expect(rows.map((r) => r.textContent?.includes("já tem Copiloto"))).toEqual([false, false, true]); // sem busca, os sem Copiloto primeiro
    expect(rows[2].getAttribute("aria-disabled")).toBe("true");
    await click(rows[2]);
    const cont = byText("[role=dialog] button", "Continuar") as HTMLButtonElement;
    expect(cont.disabled).toBe(true);
    await click(rows[0]);
    expect(rows[0].getAttribute("aria-pressed")).toBe("true");
    expect(cont.disabled).toBe(false);
    await click(cont);
    // passo 2: plano
    expect(dialog()?.textContent).toContain("Restaurante Sabor da Serra");
    const plans = qa('[role="dialog"] [role="radio"]');
    expect(plans.map((p) => p.tabIndex)).toEqual([0, -1]); // roving: um ponto de Tab só
    await act(async () => { plans[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(plans.map((p) => p.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    expect(plans.map((p) => p.tabIndex)).toEqual([-1, 0]);
    expect(document.activeElement).toBe(plans[1]);
    expect(plans[0].textContent).toContain("1.000 créditos por mês");
    expect(plans[1].textContent).toContain("5.000 créditos por mês");
    await click(plans[1]);
    expect(plans[1].getAttribute("aria-checked")).toBe("true");
    await click(byText("[role=dialog] button", "Continuar"));
    // passo 3: revisão das 5 etapas
    const etapas = qa('[aria-label="Etapas"] li');
    expect(etapas).toHaveLength(5);
    expect(etapas[0].textContent).toContain("cli-restaurante-sabor-da-ser");
    expect(etapas[2].textContent).toContain('systemClientId = "zz9001" em toda consulta');
    expect(etapas[3].textContent).toContain("Pro: 3 ferramentas");
    expect(etapas[4].textContent).toContain("você faz no Aibiz Manager com a chave abaixo");
    await click(byText("[role=dialog] button", "Criar Copiloto"));
    expect(byText("[role=dialog] button", "Criando…")).toBeTruthy();
    // durante a criação o Esc não fecha
    await esc();
    expect(dialog()).not.toBeNull();
    await wait(700);
    expect(q('[aria-label="Etapas"] li[aria-current="step"]')).toBeTruthy();
    await wait(900);
    await flush();
    expect(calls.find((c) => c.method === "POST" && c.url === "/api/copilot/clients")?.body).toEqual({ systemClientId: "zz9001", plan: "pro" });
    expect(dialog()?.textContent).toContain(lastKey);
    expect(dialog()?.textContent).toContain("Ela aparece só agora");
    expect(byText("[role=dialog] button", "Já copiei, fechar")).toBeTruthy();
    expect(byText("[role=dialog] button", "Cancelar")).toBeUndefined();
    // a etapa do Aibiz Manager é manual: sem ✓ mesmo no fim
    expect(qa('[aria-label="Etapas"] li').map((li) => li.dataset.done)).toEqual(["true", "true", "true", "true", "false"]);
    await esc();
    expect(dialog()).not.toBeNull();
    // o cliente já está no topo, selecionado e com a faixa de cliente novo
    expect(names()[0]).toBe("Restaurante Sabor da Serra");
    expect(qa("button.cp-item")[0].getAttribute("aria-current")).toBe("true");
    await flush();
    expect(q(".cp-banner")?.textContent).toContain("Cliente novo");
    expect(toasts()).toContain("Restaurante Sabor da Serra no Copiloto");
    expect(toasts()).not.toContain(lastKey);
    await click(byText("[role=dialog] button", "Já copiei, fechar"));
    expect(dialog()).toBeNull();
    expect(document.body.textContent).not.toContain(lastKey);
  });

  it("Esc fecha o diálogo e devolve o foco ao botão que abriu", async () => {
    await mount();
    await open("Padaria Sol");
    const btn = byText("article button", "Rotacionar chave")!;
    btn.focus();
    await click(btn);
    expect(dialog()).not.toBeNull();
    await esc();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(btn);
  });

  it("falha ao criar mostra o motivo em português e deixa tentar de novo", async () => {
    await mount();
    await click(byText("button", "Adicionar cliente"));
    await flush();
    await click(qa(".cp-dirrow")[0]);
    await click(byText("[role=dialog] button", "Continuar"));
    await click(byText("[role=dialog] button", "Continuar"));
    directory[1].hasCopilot = true; // alguém criou antes
    const f = (await import("@/lib/api")).fetchJSON as unknown as ReturnType<typeof vi.fn>;
    const impl = f.getMockImplementation()! as (u: string, i?: RequestInit) => Promise<unknown>;
    f.mockImplementationOnce(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw Object.assign(new Error("este cliente já tem Copiloto"), { status: 400 });
      return impl(url, init);
    });
    await click(byText("[role=dialog] button", "Criar Copiloto"));
    await flush();
    expect(q('[role="alert"]')?.textContent).toBeTruthy();
    expect(dialog()).not.toBeNull();
    expect(byText("[role=dialog] button", "Criar Copiloto")).toBeTruthy();
  });

  it("vazio: 'Nenhum cliente no Copiloto ainda' com 'Adicionar o primeiro cliente'", async () => {
    db = [];
    await mount();
    expect(container.textContent).toContain("Nenhum cliente no Copiloto ainda");
    expect(q(".cp-strip")).toBeTruthy(); // a faixa de isolamento fica
    await click(byText("button", "Adicionar o primeiro cliente"));
    expect(dialog()?.textContent).toContain("Adicionar cliente ao Copiloto");
  });

  it("erro: avisa que os Copilotos continuam funcionando e 'Tentar de novo' recarrega", async () => {
    failList = true;
    await mount();
    const alert = q('[role="alert"]')!;
    expect(alert.textContent).toContain("Não consegui carregar os clientes do Copiloto");
    expect(alert.textContent).toContain("Os Copilotos continuam funcionando");
    failList = false;
    await click(byText("button", "Tentar de novo"));
    await flush();
    await flush();
    expect(q('[role="alert"]')).toBeNull();
    expect(names()).toHaveLength(4);
  });

  it("carregando: esqueleto da lista e do detalhe enquanto a API responde", async () => {
    slow = 40;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<MemoryRouter><Copilot /></MemoryRouter>));
    expect(q('[role="status"][aria-label="Carregando os clientes"]')?.getAttribute("aria-busy")).toBe("true");
    expect(q('[role="status"][aria-label="Carregando o cliente"]')).toBeTruthy();
    await wait(300);
    expect(q('[aria-label="Carregando os clientes"]')).toBeNull();
    expect(names()).toHaveLength(4);
  });

  it("detalhe que não carrega mostra o erro só ali, com 'Tentar de novo'", async () => {
    failDetail = true;
    await mount();
    expect(names()).toHaveLength(4);
    expect(q(".cp-detail")?.textContent).toContain("Não consegui carregar este cliente");
    failDetail = false;
    await click(byText(".cp-detail button", "Tentar de novo"));
    await flush();
    expect(q("article")?.textContent).toContain("Academia Ipê");
  });

  it("revogar: placeholder não é o código, 'O código não confere' e o Esc devolve o foco a 'Revogar acesso'", async () => {
    await mount();
    await open("Padaria Sol");
    const btn = byText("article button", "Revogar acesso")!;
    btn.focus();
    await click(btn);
    const input = dialog()!.querySelector<HTMLInputElement>("input")!;
    expect(input.placeholder).toBe("Digite o código do cliente");
    expect(dialog()!.querySelector("b.cp-mono")?.textContent).toBe("abc123"); // o código fica acima, em mono, como referência
    expect(dialog()!.textContent).not.toContain("O código não confere");
    await type(input, "abc12"); // ainda digitando
    expect(dialog()!.textContent).not.toContain("O código não confere");
    await type(input, "abc124");
    expect(dialog()!.textContent).toContain("O código não confere");
    await type(input, "abc123");
    expect(dialog()!.textContent).not.toContain("O código não confere");
    await esc();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(btn);
  });

  it("revogado: Mudar plano e Rotacionar desabilitados dizem como destravar; o link do perfil leva ao perfil", async () => {
    await mount();
    await open("Doce Encanto");
    for (const t of ["Mudar plano", "Rotacionar chave"]) {
      const b = byText("article button", t) as HTMLButtonElement;
      expect(b.disabled).toBe(true);
      expect(b.title).toBe("Reative o Copiloto para mudar");
    }
    expect(q("article")?.textContent).toContain("Reative o Copiloto para mudar");
    expect(q('article a[href="/settings/perfis?perfil=cli-de7731"]')).toBeTruthy();
    expect(q(".cp-banner")?.textContent).toContain("em 27 dias");
  });

  it("mudar plano: um ponto de Tab só (roving) e setas trocam o plano", async () => {
    await mount();
    await open("Padaria Sol");
    await click(byText("article button", "Mudar plano"));
    const cards = qa('[role="dialog"] [role="radio"]');
    expect(cards.map((c) => c.tabIndex)).toEqual([0, -1]);
    await act(async () => { cards[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
    expect(cards.map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    expect(cards.map((c) => c.tabIndex)).toEqual([-1, 0]);
    expect(document.activeElement).toBe(cards[1]);
    await act(async () => { cards[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); });
    expect(cards[0].getAttribute("aria-checked")).toBe("true");
  });

  it("filtro sem resultado: o detalhe deixa de mostrar o cliente que saiu da lista e a dica só aparece com texto na busca", async () => {
    await mount();
    await open("Padaria Sol");
    expect(q("article")?.textContent).toContain("Padaria Sol");
    await click(byText('[aria-label="Situação"] button', "Sem saldo"));
    await flush();
    expect(names()).toEqual(["Ótica Visão"]);
    expect(q("article")).toBeNull();
    expect(q(".cp-detail")?.textContent).toContain("Selecione um cliente");
    await click(byText('[aria-label="Plano"] button', "Starter"));
    await flush();
    expect(q("section")?.textContent).toContain("Nenhum cliente com esses filtros");
    expect(q("section")?.textContent).not.toContain("Busque pelo nome");
    await type(q('input[type="search"]') as HTMLInputElement, "zzz");
    await wait(320);
    expect(q("section")?.textContent).toContain("Busque pelo nome ou pelo systemClientId");
    await click(byText("button", "Limpar filtros"));
    await flush();
    expect(q("article")?.textContent).toContain("Padaria Sol"); // voltou à lista, volta o detalhe
  });
});
