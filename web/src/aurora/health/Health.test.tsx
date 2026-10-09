// @vitest-environment jsdom
// Fluxo da tela Saúde com o backend simulado em memória: humor crítico, grupos, correção com aprovação,
// resolver com aviso, criar verificação (parse -> criar), vazio com recomendadas e erro.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Check, HealthSettings, Incident, Overview } from "./api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const calls: { url: string; method: string; body: unknown }[] = [];
let checks: Check[];
let incidents: Incident[];
let failAll = false;
let slow = false;
let stillFailing = false;
let parseReply: unknown;
let settings: HealthSettings;

const NOW = Date.now() / 1000;
const check = (p: Partial<Check>): Check => ({ id: "c", group: "whatsapp_bots", name: "Bot", detail: "cli-bot", kind: "bot", status: "ok", severity: "critical", result: { text: "Conectado" }, intervalSec: 60, lastRunAt: NOW - 20, history: [{ at: NOW - 600, value: 3 }, { at: NOW - 300, value: 9 }, { at: NOW, value: 5 }], historyLabel: "mensagens por janela", clientId: null, sourceText: null, createdAt: NOW - 9999, ...p });
const incident = (p: Partial<Incident>): Incident => ({ id: 118, code: "INC-118", checkId: "k1", severity: "critical", title: "wa-gateway: 2 de 3 prontos", impact: "3 clientes", status: "open", startedAt: NOW - 14 * 60, ackBy: null, ackAt: null, resolvedAt: null, resolvedBy: null, note: null, timeline: [{ at: NOW - 800, result: "problem", text: "O pod reiniciou 7 vezes (OOMKilled)." }, { at: NOW - 700, result: "ruled_out", text: "Os outros 44 bots estão normais." }], hypothesis: "Sem memória no pod.", investigating: false, suggestedAction: { label: "Reiniciar o wa-gateway", command: "kubectl rollout restart deploy/wa-gateway", needsApproval: true }, approval: null, ...p });
const overview = (): Overview => ({ availability30d: 99.98, botsConnected: 7, botsTotal: 8, lastRunAt: NOW - 12, checks: checks.length, lastIncident: null });

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  fetchJSON: vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    if (slow) await new Promise((r) => setTimeout(r, 30));
    if (failAll) throw new Error("fora do ar");
    if (url === "/api/health/checks" && method === "GET") return checks;
    if (url === "/api/health/overview") return overview();
    if (url.startsWith("/api/incidents?status=open")) return incidents;
    if (url === "/api/health/settings" && method === "GET") return settings;
    if (url === "/api/health/settings" && method === "PUT") {
      settings = { ...settings, ...body, status: { ...settings.status, servers: Object.fromEntries((body.servers as { name: string }[]).map((s) => [s.name, { keyEnv: "HEALTH_SSH_KEY" }])) } };
      return settings;
    }
    if (url === "/api/health/checks/parse") return parseReply;
    if (url === "/api/health/checks" && method === "POST") {
      const c = check({ id: "novo", group: "servers", name: "Disco da VPS1", status: "pending", result: {}, lastRunAt: null, history: [] });
      checks = [c, ...checks];
      return c;
    }
    if (url === "/api/health/checks/recommended") {
      checks = [check({ id: "r1", name: "Bot da Padaria" })];
      return { created: checks, skipped: ["Kubernetes: falta o endereço do cluster"] };
    }
    const run = /^\/api\/health\/checks\/(\w+)\/run$/.exec(url);
    if (run) return checks.find((c) => c.id === run[1])!;
    const act = /^\/api\/incidents\/(\d+)\/(ack|resolve|action)$/.exec(url);
    if (act) {
      const i = incidents.find((x) => x.id === Number(act[1]))!;
      if (act[2] === "ack") Object.assign(i, { ackBy: "Equipe (painel)", ackAt: NOW });
      if (act[2] === "action") Object.assign(i, { approval: { id: 5, status: "pending", target: "telegram:-100:12", expiresAt: NOW + 15 * 60, decidedBy: null, result: null } });
      if (act[2] === "resolve") {
        incidents = incidents.filter((x) => x.id !== i.id);
        return { incident: { ...i, status: "resolved" }, stillFailing };
      }
      return { ...i }; // cópia: a API de verdade devolve um objeto novo
    }
    throw new Error("rota inesperada " + url);
  }),
}));

const { Health } = await import("../screens/Health");
const { getState } = await import("../store");

let container: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const q = (sel: string) => container.querySelector<HTMLElement>(sel);
const byText = (sel: string, text: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.textContent?.includes(text));
const click = (el: Element | null | undefined) => act(async () => { (el as HTMLElement).click(); });
const type = (el: HTMLTextAreaElement | HTMLInputElement | null | undefined, value: string) =>
  act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el!.dispatchEvent(new Event("input", { bubbles: true }));
  });
const toasts = () => getState().toasts.map((t) => `${t.text} | ${t.sub ?? ""}`);

async function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<MemoryRouter><Health /></MemoryRouter>));
  await flush();
}

beforeEach(() => {
  calls.length = 0;
  failAll = false;
  slow = false;
  stillFailing = false;
  parseReply = { ok: false, reason: "Não entendi o que medir." };
  const bots = Array.from({ length: 8 }, (_, i) => check({ id: `b${i}`, name: `Cliente ${i}`, status: i === 7 ? "error" : "ok", result: { text: i === 7 ? "Caído desde 09:28" : "Conectado" } }));
  checks = [
    check({ id: "k1", group: "k8s", name: "wa-gateway", status: "error", result: { text: "2 de 3 prontos · 7 reinícios" }, historyLabel: "reinícios · 1 h" }),
    check({ id: "s1", group: "servers", name: "VPS2", status: "warn", result: { text: "memória alta", metrics: { cpu: 71, ram: 94, disk: 66 } }, historyLabel: "CPU · 1 h" }),
    ...bots,
  ];
  incidents = [incident({})];
  settings = { mongo: { uri_env: "AIBIZ_MONGO_URI", db: "aibiz" }, k8s: { server: "", token_env: "K8S_TOKEN", ca_env: "K8S_CA_CERT", namespaces: "default" }, servers: [{ name: "vps1", host: "10.0.0.1", user: "deploy", port: 22 }], services: [], status: { mongo: true, k8s: false, sshKey: false, servers: { vps1: { keyEnv: "HEALTH_SSH_KEY" } } } };
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
});

describe("Saúde", () => {
  it("incidente crítico: herói com role=alert, cartão com linha do tempo e hipótese", async () => {
    await mount();
    const hero = q('[role="alert"]');
    expect(hero?.textContent).toContain("Incidente crítico · INC-118");
    expect(hero?.textContent).toContain("14 min");
    expect(hero?.textContent).toContain("Ver o que o Hermes achou");
    expect(hero?.textContent).toContain("Estou vendo (reconhecer)");
    const card = q("article");
    expect(card?.textContent).toContain("O pod reiniciou 7 vezes (OOMKilled).");
    expect(card?.textContent).toContain("Hipótese: Sem memória no pod.");
    expect(q('[role="img"][aria-label="Achou problema"]')).toBeTruthy();
    expect(card?.textContent).toContain("Reiniciar o wa-gateway");
  });

  it("grupos recolhíveis com aria-expanded, borda pelo pior status e bots cortados em 6 com o problema primeiro", async () => {
    await mount();
    const heads = [...container.querySelectorAll<HTMLElement>("button[aria-expanded]")];
    expect(heads).toHaveLength(3); // servidores, bots, kubernetes (os outros grupos não têm verificação)
    expect(heads.every((h) => h.getAttribute("aria-expanded") === "true")).toBe(true);
    const botHead = heads.find((h) => h.textContent?.includes("Bots de WhatsApp"))!;
    expect(botHead.textContent).toContain("1 com problema");
    expect(botHead.textContent).toContain("7 ok");
    const panel = document.getElementById(botHead.getAttribute("aria-controls")!)!;
    expect(panel.querySelectorAll(".hl-row")).toHaveLength(6);
    expect(panel.querySelector(".hl-row")?.textContent).toContain("Cliente 7"); // o caído vem primeiro
    await click(byText("button", "Ver todos os 8 bots"));
    expect(panel.querySelectorAll(".hl-row")).toHaveLength(8);
    await click(botHead);
    expect(botHead.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(botHead.getAttribute("aria-controls")!)).toBeNull();
  });

  it("linha: ponto com title, mini barras de servidor (≥ 90 vermelho), chip de frequência e sparkline aria-hidden", async () => {
    await mount();
    const row = [...container.querySelectorAll<HTMLElement>(".hl-row")].find((r) => r.textContent?.includes("VPS2"))!;
    expect(row.querySelector('[role="img"]')?.getAttribute("title")).toBe("Atenção");
    expect(row.textContent).toContain("CPU");
    expect(row.textContent).toContain("94%");
    const bars = [...row.querySelectorAll<HTMLElement>(".hl-meter .bar > span")].map((b) => b.style.background);
    expect(bars).toEqual(["var(--fg3)", "var(--err)", "var(--fg3)"]);
    expect(row.textContent).toContain("a cada 1 min");
    expect(row.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(row.textContent).toContain("CPU · 1 h");
  });

  it("correção vira 'Aguardando aprovação no Telegram' com destino e expiração; reconhecer mostra quem", async () => {
    await mount();
    await click(byText("article button", "Reiniciar o wa-gateway"));
    await flush();
    expect(calls.some((c) => c.url === "/api/incidents/118/action" && c.method === "POST")).toBe(true);
    const card = q("article")!;
    expect(card.textContent).toContain("Aguardando aprovação no Telegram");
    expect(card.textContent).toContain("Telegram · tópico 12");
    expect(card.textContent).toContain("Expira às");
    expect(card.textContent).not.toContain("-100"); // o ID do chat não aparece
    expect(toasts().join("\n")).toContain("Pedido de aprovação enviado");

    await click(byText("article button", "Reconhecer"));
    await flush();
    expect(q("article")?.textContent).toContain("Reconhecido por Equipe (painel)");
    expect(q('[role="alert"]')?.textContent).toContain("Reconhecido por Equipe (painel)");
  });

  it("sem correção sugerida o botão não aparece; investigando mostra o aviso", async () => {
    incidents = [incident({ suggestedAction: null, investigating: true, hypothesis: null })];
    await mount();
    const card = q("article")!;
    expect(card.textContent).not.toContain("Reiniciar");
    expect(card.textContent).toContain("O Hermes está investigando…");
    expect(card.querySelector('[role="status"][aria-live="polite"]')).toBeTruthy();
  });

  it("Resolver: diálogo com nota, aviso da verificação ainda com erro e toast honesto (stillFailing)", async () => {
    stillFailing = true;
    await mount();
    await click(byText("article button", "Resolver"));
    const dlg = document.querySelector('[role="dialog"][aria-modal="true"]')!;
    expect(dlg.textContent).toContain("ainda mostram problema");
    await type(dlg.querySelector("textarea"), "aumentei a memória");
    await click(byText('[role="dialog"] button', "Marcar resolvido"));
    await flush();
    const post = calls.find((c) => c.url === "/api/incidents/118/resolve");
    expect(post?.body).toEqual({ note: "aumentei a memória" });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(toasts().join("\n")).toContain("A verificação ainda mostra problema; o Hermes reabre se continuar.");
    expect(q('[role="alert"]')).toBeNull();
  });

  it("Rodar agora: spinner, chamada ao servidor e toast com o resultado", async () => {
    await mount();
    await click(container.querySelector('[aria-label="Rodar agora: wa-gateway"]'));
    await flush();
    expect(calls.some((c) => c.url === "/api/health/checks/k1/run" && c.method === "POST")).toBe(true);
    expect(toasts().join("\n")).toContain("wa-gateway: continua com problema");
    expect(toasts().join("\n")).toContain("O incidente segue aberto.");
  });

  it("Criar verificação: Criar só libera depois de 'Entendi assim'; mostra o motivo em vermelho quando não entende", async () => {
    await mount();
    await click(byText("button", "Criar verificação"));
    const dlg = () => document.querySelector('[role="dialog"]')!;
    const create = () => [...dlg().querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Criar verificação")!;
    expect(create().disabled).toBe(true);
    await type(dlg().querySelector("textarea"), "coisa vaga");
    await click(byText('[role="dialog"] button', "Ver o que o Hermes entendeu"));
    await flush();
    expect(dlg().textContent).toContain("Não entendi o que medir.");
    expect(create().disabled).toBe(true);

    parseReply = { ok: true, check: { target: "Disco da VPS1", condition: "passar de 85%", window: "sempre", frequency: "a cada 5 min", group: "servers", groupLabel: "Servidores", severity: "critical", notify: "Telegram · Alertas de infra", spec: { kind: "ssh" } } };
    await click([...dlg().querySelectorAll<HTMLElement>(".hl-ex")][1]);
    await click(byText('[role="dialog"] button', "Ver o que o Hermes entendeu"));
    await flush();
    expect(dlg().textContent).toContain("Entendi assim:");
    expect(dlg().textContent).toContain("Disco da VPS1");
    expect(dlg().textContent).toContain("qualquer horário");
    expect(dlg().textContent).toContain("Telegram · Alertas de infra");
    expect(create().disabled).toBe(false);
    await click(dlg().querySelector('.hl-seg button:nth-child(3)')); // 15 min
    await click(create());
    await flush();
    const post = calls.find((c) => c.url === "/api/health/checks" && c.method === "POST");
    expect(post?.body).toMatchObject({ text: "Avise se o disco da vps1 ficar cheio", interval: 900, parsed: { groupLabel: "Servidores", spec: { kind: "ssh" } } });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain("Aguardando a primeira execução");
    expect(container.querySelector(".hl-row.fresh")?.textContent).toContain("Disco da VPS1");
  });

  it("Conexões: lê, mostra a variável da chave SSH sem segredo e salva com PUT", async () => {
    await mount();
    await click(byText("button", "Conexões"));
    await flush();
    const dlg = document.querySelector('[role="dialog"]')!;
    expect(dlg.textContent).toContain("Chave SSH do monitor: em Chaves como HEALTH_SSH_KEY (o arquivo da chave privada em base64, numa linha)");
    expect(dlg.textContent?.match(/HEALTH_SSH_KEY/g)).toHaveLength(1); // uma vez só, não por servidor
    expect(dlg.textContent).toContain("chave desligada");
    expect(dlg.textContent).toContain("base64, como saem do kubectl");
    expect(dlg.textContent).toContain("AIBIZ_MONGO_URI");
    expect(dlg.textContent).toContain("ligado"); // Mongo
    expect(dlg.textContent).toContain("desligado"); // cluster
    const save = byText('[role="dialog"] button', "Salvar conexões") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await type(dlg.querySelector<HTMLInputElement>('input[placeholder="aibiz_mrz"]'), "outro_banco");
    expect(save.disabled).toBe(false);
    await click(save);
    await flush();
    const put = calls.find((c) => c.url === "/api/health/settings" && c.method === "PUT");
    expect(put?.body).toMatchObject({ mongo: { uri_env: "AIBIZ_MONGO_URI", db: "outro_banco" }, servers: [{ name: "vps1", host: "10.0.0.1", user: "deploy", port: 22 }] });
    expect(Object.keys(put?.body as object).sort()).toEqual(["k8s", "mongo", "servers", "services"]); // só nomes de variável, nada de segredo
  });

  it("tudo verde: herói calmo com os números do overview e linha única de incidentes", async () => {
    incidents = [];
    checks = checks.map((c) => ({ ...c, status: "ok" as const }));
    await mount();
    expect(q('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("Tudo funcionando");
    expect(container.textContent).toContain("99,98%");
    expect(container.textContent).toContain("7 de 8");
    expect(container.textContent).toContain("Nenhum incidente aberto.");
    expect(q(".hl-breathe")).toBeTruthy();
  });

  it("vazio: 'Usar as recomendadas' mostra o criado e o que falta configurar", async () => {
    checks = [];
    incidents = [];
    await mount();
    expect(container.textContent).toContain("Nenhuma verificação ainda");
    expect(byText("button", "Criar uma do zero")).toBeTruthy();
    await click(byText("button", "Usar as recomendadas"));
    await flush();
    expect(calls.some((c) => c.url === "/api/health/checks/recommended" && c.method === "POST")).toBe(true);
    expect(container.textContent).toContain("1 verificação recomendada foi criada");
    expect(container.textContent).toContain("Kubernetes: falta o endereço do cluster");
    expect(container.textContent).toContain("Bot da Padaria");
  });

  it("erro: 'Não consegui falar com o monitor' e Tentar de novo recarrega", async () => {
    failAll = true;
    await mount();
    expect(q('[role="alert"]')?.textContent).toContain("Não consegui falar com o monitor");
    expect(q('[role="alert"]')?.textContent).toContain("os avisos no Telegram também podem ter parado");
    failAll = false;
    await click(byText("button", "Tentar de novo"));
    await flush();
    expect(container.textContent).not.toContain("Não consegui falar com o monitor");
    expect(container.textContent).toContain("Incidente crítico · INC-118");
  });

  it("carregando: skeleton enquanto espera", async () => {
    slow = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<MemoryRouter><Health /></MemoryRouter>));
    expect(q('[aria-busy="true"]')).toBeTruthy();
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(q('[aria-busy="true"]')).toBeNull();
  });
});
