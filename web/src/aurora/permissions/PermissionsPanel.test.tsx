// @vitest-environment jsdom
// Fluxo da tela Permissões com o backend simulado em memória: carregar, editar a matriz, regra fixa do WhatsApp,
// diálogo "Liberar sem aprovação?", salvar, erro de carga e decidir um pedido pendente.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalRow, Permissions } from "./model";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const calls: { url: string; method: string; body: unknown }[] = [];
let perms: Permissions;
let approvals: ApprovalRow[];
let failPerms = false;

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  fetchJSON: vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    if (url === "/api/ops/permissions" && method === "GET") {
      if (failPerms) throw new Error("fora do ar");
      return perms;
    }
    if (url === "/api/ops/permissions" && method === "PUT") {
      if (body.matrix) for (const [k, row] of Object.entries(body.matrix)) perms.matrix[k] = { ...perms.matrix[k], ...(row as object) };
      if ("enabled" in body) perms.enabled = body.enabled;
      return perms;
    }
    if (url.startsWith("/api/ops/approvals?")) return approvals;
    if (/\/decide$/.test(url)) {
      const a = approvals.find((x) => url.includes(`/${x.id}/`))!;
      Object.assign(a, { status: body.approve ? "approved" : "denied", decided_by: "Você (painel)", decided_at: a.at + 30 });
      return a;
    }
    throw new Error("rota inesperada " + url);
  }),
}));

const { PermissionsPanel } = await import("./PermissionsPanel");

const A = (key: string, group: string, label: string, writes: boolean) => ({ key, group, label, writes });
const row = (p: Partial<ApprovalRow>): ApprovalRow => ({ id: 1, at: Date.now() / 1000 - 600, origin: "telegram_team", requested_by: "Diego", requested_by_id: "9", context: "telegram · Equipe", action: "cluster.write", summary: "Mudar cluster", command: "kubectl scale deploy/x --replicas=4", status: "approved", rule: null, target: null, decided_by: "Rafael", decided_at: Date.now() / 1000 - 540, note: null, result: null, expires_at: null, ...p });

let container: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const q = (sel: string) => container.querySelector<HTMLElement>(sel);
const byText = (sel: string, text: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.textContent?.includes(text));
const click = (el: Element | null | undefined) => act(async () => { (el as HTMLElement).click(); });

async function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<MemoryRouter><PermissionsPanel /></MemoryRouter>));
  await flush();
}

beforeEach(() => {
  calls.length = 0;
  failPerms = false;
  perms = {
    enabled: false,
    origins: ["whatsapp_group", "telegram_team", "api_copilot", "scheduled"],
    originLabels: {},
    actions: [A("db.read", "db", "Ler banco", false), A("db.write", "db", "Escrever banco", true), A("mcp.github.create_pr", "mcp:github", "create-pr", true)],
    mcpServers: [{ id: "github", label: "github", discovered: true, tools: 1 }, { id: "linear", label: "linear", discovered: false, tools: 0 }],
    matrix: { "db.read": { whatsapp_group: "allow", telegram_team: "allow", api_copilot: "deny", scheduled: "allow" }, "db.write": { whatsapp_group: "deny", telegram_team: "approve", api_copilot: "deny", scheduled: "deny" } },
    hardDeny: [{ label: "Apagar banco ou tabela", patterns: ["DROP TABLE"] }],
    approvers: [],
    approvalTarget: "",
    approvalTtlMin: 15,
  };
  approvals = [row({ id: 3, status: "pending", decided_by: null, decided_at: null, expires_at: Date.now() / 1000 + 600 }), row({ id: 2 }), row({ id: 1, status: "blocked", rule: "Apagar banco ou tabela", decided_by: null, decided_at: null })];
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

describe("Permissões", () => {
  it("mostra a matriz, o bloqueio fixo, o histórico com contadores e o exemplo rotulado", async () => {
    await mount();
    expect(q('[aria-label="Escrever banco vindo de Telegram: Pede aprovação"]')).toBeTruthy();
    expect(q('[role="switch"][aria-checked="false"]')).toBeTruthy(); // permissões desligadas
    expect(container.textContent).toContain("Sempre bloqueado");
    expect(container.textContent).toContain("DROP TABLE");
    expect(container.textContent).toContain("Aguardando decisão");
    expect(container.querySelector('[aria-label*="Exemplo ilustrativo"]')).toBeTruthy();
    const tabs = [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
    expect(tabs).toEqual(["Todas2", "Aprovadas1", "Negadas0", "Bloqueadas1"]);
  });

  it("WhatsApp: a opção 'Permitido' de linha que altera fica desabilitada com o motivo escrito", async () => {
    await mount();
    await click(q('[aria-label^="Escrever banco vindo de WhatsApp"]'));
    const allow = q('[role="listbox"] [role="option"][aria-disabled="true"]');
    expect(allow?.textContent).toContain("Permitido");
    expect(allow?.textContent).toContain("Grupos de clientes nunca alteram nada sem um humano.");
    await click(allow);
    expect(q('[role="listbox"]')).toBeTruthy(); // clicar na desabilitada não fecha nem altera
    expect(container.textContent).not.toContain("regra alterada");
  });

  it("editar mostra a barra, Descartar volta, e Esc fecha o popover", async () => {
    await mount();
    await click(q('[aria-label^="Ler banco vindo de API"]'));
    await click(q('[role="option"]:nth-child(2)')); // Pede aprovação (1º filho é o contexto)
    expect(container.textContent).toContain("1 regra alterada");
    expect(q('[aria-label^="Ler banco vindo de API"]')?.getAttribute("aria-label")).toContain("Alterado, não salvo");
    await click(byText('[role="region"] button', "Descartar"));
    expect(container.textContent).not.toContain("regra alterada");

    await click(q('[aria-label^="Ler banco vindo de API"]'));
    expect(q('[role="listbox"]')).toBeTruthy();
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(q('[role="listbox"]')).toBeNull();
  });

  it("liberar uma ação que altera abre o diálogo e só salva depois do 'Sim'", async () => {
    await mount();
    await click(q('[aria-label^="Escrever banco vindo de Telegram"]'));
    await click(byText('[role="option"]', "Permitido"));
    await click(byText('[role="region"] button', "Salvar"));
    const dlg = document.querySelector('[role="alertdialog"]');
    expect(dlg?.textContent).toContain("Liberar sem aprovação?");
    expect(dlg?.textContent).toContain("Escrever banco vindo de Telegram");
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    await click(byText('[role="alertdialog"] button', "Sim, salvar"));
    await flush();
    const put = calls.find((c) => c.method === "PUT");
    expect((put?.body as { matrix: Record<string, Record<string, string>> }).matrix["db.write"].telegram_team).toBe("allow");
    expect(container.textContent).not.toContain("regra alterada");
    expect(q('[aria-label="Escrever banco vindo de Telegram: Permitido"]')).toBeTruthy();
  });

  it("menu da coluna: 'Tudo que altera pede aprovação' muda só o que altera, inclusive MCP", async () => {
    await mount();
    await click(q('[aria-label="Ações em massa da coluna API"]'));
    await click(byText('[role="menuitem"]', "Tudo que altera pede aprovação"));
    expect(q('[aria-label^="Escrever banco vindo de API"]')?.getAttribute("aria-label")).toContain("Pede aprovação");
    expect(q('[aria-label^="create-pr vindo de API"]')?.getAttribute("aria-label")).toContain("Pede aprovação");
    expect(q('[aria-label^="Ler banco vindo de API"]')?.getAttribute("aria-label")).toBe("Ler banco vindo de API: Bloqueado");
  });

  it("decide um pedido pendente pelo painel", async () => {
    await mount();
    await click(q('[aria-label^="Aprovar:"]'));
    await flush();
    const call = calls.find((c) => c.url === "/api/ops/approvals/3/decide");
    expect(call).toMatchObject({ method: "POST", body: { approve: true } });
    expect(container.textContent).not.toContain("Aguardando decisão");
  });

  it("com lista de aprovadores, o painel (o dono) continua podendo aprovar", async () => {
    perms.approvers = ["123"];
    await mount();
    expect(container.textContent).not.toContain("Este painel não está na lista de aprovadores");
    expect((q('[aria-label^="Aprovar:"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("erro ao carregar: mensagem, regras salvas continuam e 'Tentar de novo' recarrega", async () => {
    failPerms = true;
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Não consegui carregar as permissões");
    failPerms = false;
    await click(byText("button", "Tentar de novo"));
    await flush();
    expect(q('[aria-label^="Ler banco vindo de API"]')).toBeTruthy();
  });

  it("histórico vazio e filtro sem resultado", async () => {
    approvals = [];
    await mount();
    expect(container.textContent).toContain("Nenhuma aprovação ainda");
    await act(async () => root.unmount());
    container.remove();
    approvals = [row({ id: 5 })];
    await mount();
    await click(byText('[role="tab"]', "Bloqueadas"));
    expect(container.textContent).toContain("Nada com este filtro");
    await click(byText("button", "Ver todas"));
    expect(container.textContent).not.toContain("Nada com este filtro");
  });
});
