import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PermissionsMatrix } from "./Matrix";
import {
  applyBulk,
  buildDraft,
  buildGroups,
  changes,
  columnCounts,
  dayLabel,
  decisionLines,
  filterTab,
  levelOf,
  matrixPatch,
  newlyAllowed,
  rowHelp,
  span,
  splitApprovals,
  tabCounts,
  validApprover,
  validTarget,
  type Action,
  type ApprovalRow,
  type Permissions,
} from "./model";

const act = (key: string, group: string, writes: boolean, label = key): Action => ({ key, group, label, writes });
const perms: Permissions = {
  enabled: true,
  origins: ["whatsapp_group", "telegram_team", "api_copilot", "scheduled"],
  originLabels: {},
  actions: [act("db.read", "db", false, "Ler banco"), act("db.write", "db", true, "Escrever banco"), act("files", "files", true), act("web", "web", false), act("mcp.github.get_issue", "mcp:github", false, "get_issue"), act("mcp.github.create_pr", "mcp:github", true, "create-pr")],
  mcpServers: [
    { id: "github", label: "github", discovered: true, tools: 2 },
    { id: "linear", label: "linear", discovered: false, tools: 0 },
  ],
  matrix: { "db.read": { whatsapp_group: "allow", telegram_team: "allow", api_copilot: "deny", scheduled: "allow" }, "db.write": { whatsapp_group: "allow", telegram_team: "approve" } },
  hardDeny: [],
  approvers: [],
  approvalTarget: "",
  approvalTtlMin: 15,
};
const [dbRead, dbWrite, , , mcpRead, mcpWrite] = perms.actions;

describe("nível efetivo (mesma regra do backend)", () => {
  it("usa a regra salva", () => {
    expect(levelOf(perms.matrix, dbRead, "api_copilot")).toBe("deny");
    expect(levelOf(perms.matrix, dbWrite, "telegram_team")).toBe("approve");
  });

  it("grupo de WhatsApp nunca altera: 'allow' salvo vira bloqueado e sem regra também", () => {
    expect(levelOf(perms.matrix, dbWrite, "whatsapp_group")).toBe("deny");
    expect(levelOf({}, perms.actions[2], "whatsapp_group")).toBe("deny");
    expect(levelOf({}, dbRead, "whatsapp_group")).toBe("approve"); // leitura sem regra: padrão geral
  });

  it("ferramenta MCP nova: leitura permitida, escrita pede aprovação", () => {
    expect(levelOf({}, mcpRead, "telegram_team")).toBe("allow");
    expect(levelOf({}, mcpWrite, "telegram_team")).toBe("approve");
    expect(levelOf({}, mcpWrite, "whatsapp_group")).toBe("deny");
  });
});

describe("rascunho, diferenças e salvar", () => {
  const saved = buildDraft(perms);

  it("cobre toda ação × origem", () => {
    expect(Object.keys(saved)).toHaveLength(6);
    expect(Object.keys(saved["db.write"])).toEqual(perms.origins);
  });

  it("só conta o que mudou e manda a linha inteira no PUT", () => {
    const draft = structuredClone(saved);
    draft["db.write"].telegram_team = "allow";
    draft["mcp.github.create_pr"].scheduled = "deny";
    const cs = changes(perms, saved, draft);
    expect(cs.map((c) => `${c.action.key}:${c.origin}:${c.from}>${c.to}`)).toEqual(["db.write:telegram_team:approve>allow", "mcp.github.create_pr:scheduled:approve>deny"]);
    expect(newlyAllowed(cs).map((c) => c.action.key)).toEqual(["db.write"]); // liberar leitura não pede confirmação
    expect(matrixPatch(cs, draft)["db.write"]).toEqual(draft["db.write"]);
    expect(Object.keys(matrixPatch(cs, draft))).toHaveLength(2);
  });

  it("liberar leitura não abre o diálogo", () => {
    const draft = structuredClone(saved);
    draft["db.read"].api_copilot = "allow";
    expect(newlyAllowed(changes(perms, saved, draft))).toEqual([]);
  });

  it("ações em massa da coluna: altera→aprovação, altera→bloqueio e voltar ao salvo", () => {
    const a = applyBulk(perms, saved, saved, "scheduled", "approve-writes");
    expect(a["db.write"].scheduled).toBe("approve");
    expect(a["db.read"].scheduled).toBe(saved["db.read"].scheduled);
    const b = applyBulk(perms, saved, a, "scheduled", "deny-writes");
    expect(b["mcp.github.create_pr"].scheduled).toBe("deny");
    expect(applyBulk(perms, saved, b, "scheduled", "reset")).toEqual(saved);
    expect(saved["db.write"].scheduled).not.toBe("deny"); // o original não foi mexido
  });

  it("conta os níveis da coluna para a barrinha", () => {
    expect(columnCounts(perms, saved, "whatsapp_group")).toEqual({ allow: 2, approve: 1, deny: 3 }); // allow: db.read e MCP de leitura; approve: web sem regra; deny: as 3 que alteram
  });
});

describe("grupos", () => {
  it("junta arquivos e web, e cria um grupo por conector (mesmo sem ferramentas)", () => {
    const g = buildGroups(perms);
    expect(g.map((x) => x.id)).toEqual(["db", "files", "mcp:github", "mcp:linear"]);
    expect(g[1].rows.map((r) => r.key)).toEqual(["files", "web"]);
    expect(g[2].rows).toHaveLength(2);
    expect(g[3]).toMatchObject({ mcp: true, rows: [], server: { discovered: false } });
  });

  it("ação MCP de servidor que a lista não conhece ainda vira grupo", () => {
    const g = buildGroups({ actions: [act("mcp.asaas.refund", "mcp:asaas", true)], mcpServers: [] });
    expect(g.map((x) => x.id)).toEqual(["mcp:asaas"]);
  });

  it("explica a linha: texto fixo, descrição da ferramenta ou frase padrão", () => {
    expect(rowHelp(dbRead)).toContain("SELECT");
    expect(rowHelp({ ...mcpRead, description: "Lê uma issue" })).toBe("Lê uma issue");
    expect(rowHelp(mcpWrite)).toMatch(/mudar/);
  });
});

describe("destino e aprovadores", () => {
  it("valida telegram:<chat>[:<tópico>] e ids numéricos", () => {
    expect(["", "telegram:-1001234567890", "telegram:-1001234567890:12"].every(validTarget)).toBe(true);
    expect(["telegram:", "slack:123", "telegram:abc", "telegram:1:2:3"].some(validTarget)).toBe(false);
    expect(validApprover("123456789")).toBe(true);
    expect(["", "abc", "12 3", "dashboard"].some(validApprover)).toBe(false);
  });
});

const row = (p: Partial<ApprovalRow>): ApprovalRow => ({ id: 1, at: 1_000, origin: "telegram_team", requested_by: "Diego", requested_by_id: "1", context: "telegram · Equipe", action: "cluster.write", summary: "Mudar cluster", command: "kubectl scale", status: "approved", rule: null, target: null, decided_by: "Rafael", decided_at: 1_060, note: null, result: null, expires_at: null, ...p });

describe("histórico", () => {
  const rows = [row({ id: 1 }), row({ id: 2, status: "denied" }), row({ id: 3, status: "expired" }), row({ id: 4, status: "blocked", rule: "Apagar banco ou tabela" }), row({ id: 5, status: "pending" })];

  it("pendentes ficam à parte e os contadores são reais (negadas inclui expiradas)", () => {
    const { pending, history } = splitApprovals(rows);
    expect(pending.map((r) => r.id)).toEqual([5]);
    expect(tabCounts(history)).toEqual({ all: 4, approved: 1, denied: 2, blocked: 1 });
    expect(filterTab(history, "denied").map((r) => r.id)).toEqual([2, 3]);
    expect(filterTab(history, "all")).toHaveLength(4);
  });

  it("quem decidiu e o tempo, ou o motivo nos bloqueios", () => {
    expect(decisionLines(row({}), 15)).toEqual({ by: "Aprovado por Rafael", took: "em 1 min" });
    expect(decisionLines(row({ status: "denied", note: "eu mesma faço", decided_at: 1_040 }), 15)).toEqual({ by: "Negado por Rafael", took: "em 40 s · “eu mesma faço”" });
    expect(decisionLines(row({ status: "expired" }), 15)).toEqual({ by: "Ninguém respondeu", took: "expirou em 15 min" });
    expect(decisionLines(row({ status: "blocked", rule: "Apagar banco ou tabela", decided_by: null, decided_at: null }), 15)).toEqual({ by: "Bloqueado pela regra", took: "Apagar banco ou tabela" });
  });

  it("tempos e dias", () => {
    expect(span(40)).toBe("40 s");
    expect(span(125)).toBe("2 min");
    expect(span(3 * 3600 + 5 * 60)).toBe("3 h 5 min");
    const now = new Date(2026, 9, 8, 12, 0, 0);
    expect(dayLabel(now.getTime() / 1000 - 60, now)).toBe("Hoje");
    expect(dayLabel(now.getTime() / 1000 - 86400, now)).toBe("Ontem");
    expect(dayLabel(now.getTime() / 1000 - 5 * 86400, now)).toBe("03/10");
  });
});

describe("matriz (HTML estático)", () => {
  const saved = buildDraft(perms);
  const draft = structuredClone(saved);
  draft["db.write"].telegram_team = "allow";
  const html = renderToStaticMarkup(<PermissionsMatrix perms={perms} groups={buildGroups(perms)} saved={saved} draft={draft} onPick={() => {}} onBulk={() => {}} />);

  it("cada célula tem rótulo completo e a alterada diz que não foi salva", () => {
    expect(html).toContain('aria-label="Escrever banco vindo de Telegram: Permitido. Alterado, não salvo"');
    expect(html).toContain('aria-label="Ler banco vindo de API: Bloqueado"');
  });

  it("grupo MCP recolhível (o primeiro começa aberto) e a regra fixa está no rodapé", () => {
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("conector MCP");
    expect(html).toContain("nunca alteram nada sem um humano");
  });
});
