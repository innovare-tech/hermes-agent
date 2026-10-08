// Permissões por origem (design A6): contrato com /api/ops/permissions e /api/ops/approvals, tipos e a lógica pura
// da tela (nível efetivo de cada célula, diferenças, ações em massa, contadores e frases do histórico).
// Tudo vem do backend; só o texto de apoio (explicações das linhas) é fixo.
import { fetchJSON } from "@/lib/api";

export type Level = "allow" | "approve" | "deny";
export type Matrix = Record<string, Partial<Record<string, Level>>>;
export type Action = { key: string; group: string; label: string; writes: boolean; description?: string };
export type McpServer = { id: string; label: string; discovered: boolean; tools: number };
export type HardDeny = { label: string; patterns: string[] };

export type Permissions = {
  enabled: boolean;
  origins: string[];
  originLabels: Record<string, string>;
  actions: Action[];
  mcpServers: McpServer[];
  matrix: Matrix;
  hardDeny: HardDeny[];
  approvers: (string | number)[];
  approvalTarget: string;
  approvalTtlMin: number;
};

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired" | "blocked";
/** Linha de `GET /api/ops/approvals` (colunas do ops.db; horários em segundos desde 1970). */
export type ApprovalRow = {
  id: number;
  at: number;
  origin: string | null;
  requested_by: string | null;
  requested_by_id: string | null;
  context: string | null;
  action: string | null;
  summary: string | null;
  command: string | null;
  status: ApprovalStatus;
  rule: string | null;
  target: string | null;
  decided_by: string | null;
  decided_at: number | null;
  note: string | null;
  result: string | null;
  expires_at: number | null;
};

const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export type PermissionsPatch = { enabled?: boolean; matrix?: Matrix; approvers?: string[]; approvalTarget?: string };

export const permissionsApi = {
  get: () => fetchJSON<Permissions>("/api/ops/permissions"),
  save: (patch: PermissionsPatch) => fetchJSON<Permissions>("/api/ops/permissions", json("PUT", patch)),
  /** Tudo o que o painel mostra (pendentes e decididos); os filtros são aplicados aqui, no cliente. */
  approvals: () => fetchJSON<ApprovalRow[]>("/api/ops/approvals?limit=500"),
  decide: (id: number, approve: boolean) => fetchJSON<ApprovalRow>(`/api/ops/approvals/${id}/decide`, json("POST", { approve })),
};

export const APPROVALS_LIMIT = 500;

/** O painel decide como "dashboard" (rota /decide). Com lista de aprovadores, só decide se estiver nela. */
export const PANEL_APPROVER = "dashboard";

// ---- níveis e origens ----

export const LEVELS: { id: Level; label: string; icon: string; color: string; line: string }[] = [
  { id: "allow", label: "Permitido", icon: "circle-check", color: "var(--ok)", line: "Faz sozinho, sem pedir." },
  { id: "approve", label: "Pede aprovação", icon: "hand", color: "var(--warn)", line: "Manda no Telegram e espera alguém aprovar." },
  { id: "deny", label: "Bloqueado", icon: "ban", color: "var(--fg2)", line: "Recusa e explica por quê." },
];
export const levelInfo = (l: Level) => LEVELS.find((x) => x.id === l) ?? LEVELS[1];

export const WHATSAPP = "whatsapp_group";
export const WHATSAPP_WHY = "Grupos de clientes nunca alteram nada sem um humano.";

export type OriginMeta = { label: string; sub: string; icon: string; color: string };
const ORIGINS: Record<string, OriginMeta> = {
  whatsapp_group: { label: "WhatsApp", sub: "Grupos de clientes", icon: "phone", color: "#25a35a" },
  telegram_team: { label: "Telegram", sub: "Equipe", icon: "send", color: "#2f8fd6" },
  api_copilot: { label: "API", sub: "Copiloto", icon: "braces", color: "#7b6cf0" },
  scheduled: { label: "Agendadas", sub: "Tarefas no horário", icon: "calendar-clock", color: "#c27a1c" },
};
/** Origem desconhecida (backend novo): usa o rótulo que ele mandou. */
export function originMeta(id: string | null, labels: Record<string, string> = {}): OriginMeta {
  if (!id) return { label: "Painel", sub: "Você, direto", icon: "layout-dashboard", color: "#6b7390" };
  return ORIGINS[id] ?? { label: labels[id] ?? id, sub: "", icon: "plug", color: "#6b7390" };
}

// ---- grupos e linhas ----

export type Group = { id: string; label: string; icon: string; mcp: boolean; server?: McpServer; rows: Action[] };

const BUILTIN: { id: string; label: string; icon: string; keys: string[] }[] = [
  { id: "db", label: "Banco de dados", icon: "database", keys: ["db"] },
  { id: "cluster", label: "Cluster", icon: "container", keys: ["cluster"] },
  { id: "server", label: "Servidores", icon: "square-terminal", keys: ["server"] },
  { id: "files", label: "Arquivos e web", icon: "folder", keys: ["files", "web"] },
];

/** Explicação sem jargão de cada linha fixa. Conector MCP usa a descrição que a própria ferramenta declara. */
export const ROW_HELP: Record<string, string> = {
  "db.read": "Consultar dados (SELECT). Não muda nada.",
  "db.write": "Inserir, atualizar ou corrigir registros.",
  "cluster.read": "Ver pods e logs. Pods são as partes do sistema que estão rodando.",
  "cluster.write": "Reiniciar, escalar (pôr mais ou menos cópias) e fazer deploy.",
  "server.read": "Ver espaço em disco, processos, arquivos de log (df, ps, tail).",
  "server.write": "Instalar, mudar configuração, parar serviços.",
  files: "Ler e criar arquivos na pasta de trabalho do Hermes.",
  web: "Pesquisar e ler páginas públicas.",
};
export const MCP_NO_DESC_READ = "Só lê. Não muda nada no serviço.";
export const MCP_NO_DESC_WRITE = "Pode mudar algo no serviço.";
export const rowHelp = (a: Action) => ROW_HELP[a.key] ?? (a.description?.trim() || (a.writes ? MCP_NO_DESC_WRITE : MCP_NO_DESC_READ));

/** Grupos da matriz na ordem do design: banco, cluster, servidores, arquivos e web, e um por conector MCP. */
export function buildGroups(p: Pick<Permissions, "actions" | "mcpServers">): Group[] {
  const out: Group[] = [];
  for (const b of BUILTIN) {
    const rows = p.actions.filter((a) => b.keys.includes(a.group));
    if (rows.length) out.push({ id: b.id, label: b.label, icon: b.icon, mcp: false, rows });
  }
  const servers = new Map(p.mcpServers.map((s) => [s.id, s]));
  for (const a of p.actions) {
    const id = a.group.startsWith("mcp:") ? a.group.slice(4) : "";
    if (id && !servers.has(id)) servers.set(id, { id, label: id, discovered: true, tools: 0 });
  }
  for (const s of servers.values()) out.push({ id: "mcp:" + s.id, label: s.label, icon: "plug", mcp: true, server: s, rows: p.actions.filter((a) => a.group === "mcp:" + s.id) });
  return out;
}

// ---- nível efetivo (mesma regra do backend, `guardrails._level`) ----

export function levelOf(matrix: Matrix, a: Action, origin: string): Level {
  const row = matrix[a.key];
  let level: Level;
  if (row && row[origin]) level = row[origin] as Level;
  else if (origin === WHATSAPP && a.writes) level = "deny";
  else level = a.key.startsWith("mcp.") ? (a.writes ? "approve" : "allow") : "approve";
  return origin === WHATSAPP && a.writes && level === "allow" ? "deny" : level;
}

/** Rascunho = matriz completa (toda ação × origem), já com os padrões que o backend aplica quando falta regra. */
export type Draft = Record<string, Record<string, Level>>;

export function buildDraft(p: Pick<Permissions, "actions" | "origins" | "matrix">): Draft {
  return Object.fromEntries(p.actions.map((a) => [a.key, Object.fromEntries(p.origins.map((o) => [o, levelOf(p.matrix, a, o)]))]));
}

export type Cell = { action: Action; origin: string; from: Level; to: Level };

/** Células diferentes do que está salvo. */
export function changes(p: Pick<Permissions, "actions" | "origins">, saved: Draft, draft: Draft): Cell[] {
  const out: Cell[] = [];
  for (const a of p.actions) for (const o of p.origins) if (draft[a.key]?.[o] !== saved[a.key]?.[o]) out.push({ action: a, origin: o, from: saved[a.key]?.[o], to: draft[a.key]?.[o] });
  return out;
}

/** O que passa a acontecer sem ninguém revisar: ação que altera virando "Permitido". */
export const newlyAllowed = (cs: Cell[]) => cs.filter((c) => c.to === "allow" && c.action.writes);

/** Opção "Permitido" desabilitada? Grupo de WhatsApp nunca altera nada. */
export const allowBlocked = (a: Action, origin: string) => origin === WHATSAPP && a.writes;

/** Corpo do PUT: a linha inteira (todas as origens) de cada ação que mudou. */
export function matrixPatch(cs: Cell[], draft: Draft): Matrix {
  const out: Matrix = {};
  for (const c of cs) out[c.action.key] = { ...draft[c.action.key] };
  return out;
}

export type BulkMode = "approve-writes" | "deny-writes" | "reset";

export const BULK: { id: BulkMode; label: string; icon: string; color: string }[] = [
  { id: "approve-writes", label: "Tudo que altera pede aprovação", icon: "hand", color: "var(--warn)" },
  { id: "deny-writes", label: "Bloquear tudo que altera", icon: "ban", color: "var(--fg2)" },
  { id: "reset", label: "Voltar ao que estava salvo", icon: "rotate-ccw", color: "var(--fg2)" },
];

export function applyBulk(p: Pick<Permissions, "actions">, saved: Draft, draft: Draft, origin: string, mode: BulkMode): Draft {
  const next: Draft = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, { ...v }]));
  for (const a of p.actions) {
    if (mode === "reset") next[a.key][origin] = saved[a.key][origin];
    else if (a.writes) next[a.key][origin] = mode === "approve-writes" ? "approve" : "deny";
  }
  return next;
}

/** Quantas ações de cada nível a coluna tem (a barrinha do cabeçalho). */
export function columnCounts(p: Pick<Permissions, "actions">, draft: Draft, origin: string): Record<Level, number> {
  const n: Record<Level, number> = { allow: 0, approve: 0, deny: 0 };
  for (const a of p.actions) if (draft[a.key]?.[origin]) n[draft[a.key][origin]]++;
  return n;
}

// ---- destino e aprovadores ----

/** `telegram:<chat>` ou `telegram:<chat>:<tópico>`; vazio = sem destino. */
export const TARGET_RE = /^telegram:-?\d+(:\d+)?$/;
export const validTarget = (t: string) => t.trim() === "" || TARGET_RE.test(t.trim());
/** Id de usuário do Telegram: só dígitos. */
export const validApprover = (id: string) => /^\d{1,20}$/.test(id.trim());

// ---- histórico ----

export type HistTab = "all" | "approved" | "denied" | "blocked";

/** Pedidos aguardando decisão ficam num bloco à parte; o histórico é o que já foi decidido ou bloqueado. */
export const splitApprovals = (rows: ApprovalRow[]) => ({ pending: rows.filter((r) => r.status === "pending"), history: rows.filter((r) => r.status !== "pending") });

export const HIST_TABS: { id: HistTab; label: string; pass: (r: ApprovalRow) => boolean }[] = [
  { id: "all", label: "Todas", pass: () => true },
  { id: "approved", label: "Aprovadas", pass: (r) => r.status === "approved" },
  { id: "denied", label: "Negadas", pass: (r) => r.status === "denied" || r.status === "expired" },
  { id: "blocked", label: "Bloqueadas", pass: (r) => r.status === "blocked" },
];

export const tabCounts = (history: ApprovalRow[]) => Object.fromEntries(HIST_TABS.map((t) => [t.id, history.filter(t.pass).length])) as Record<HistTab, number>;
export const filterTab = (history: ApprovalRow[], tab: HistTab) => history.filter((HIST_TABS.find((t) => t.id === tab) ?? HIST_TABS[0]).pass);

export const STATUS: Record<ApprovalStatus, { label: string; icon: string; color: string }> = {
  pending: { label: "Aguardando", icon: "hand", color: "var(--warn)" },
  approved: { label: "Aprovado", icon: "check", color: "var(--ok)" },
  denied: { label: "Negado", icon: "x", color: "var(--err)" },
  expired: { label: "Expirou", icon: "timer-off", color: "var(--fg2)" },
  blocked: { label: "Bloqueado", icon: "ban", color: "var(--fg2)" },
};

const pad = (n: number) => String(n).padStart(2, "0");
export const clock = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "Hoje" / "Ontem" / "08/10". */
export function dayLabel(ts: number, now = new Date()): string {
  const d = new Date(ts * 1000);
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  return days === 0 ? "Hoje" : days === 1 ? "Ontem" : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** "40 s", "4 min", "2 h 5 min". */
export function span(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

/** Quanto falta para o pedido pendente expirar (null se não houver prazo). */
export const expiresIn = (r: ApprovalRow, now = Date.now() / 1000) => (r.expires_at ? Math.max(0, r.expires_at - now) : null);

/** Quem pediu e onde: "Diego · telegram · Equipe". */
export const requestedBy = (r: ApprovalRow) => [r.requested_by && r.requested_by !== "?" ? r.requested_by : "", r.context ?? ""].filter(Boolean).join(" · ");

/** Linhas à direita: quem decidiu e o tempo (ou o motivo, nos bloqueios). */
export function decisionLines(r: ApprovalRow, ttlMin: number): { by: string; took: string } {
  const took = r.decided_at ? `em ${span(r.decided_at - r.at)}` : "";
  const note = r.note ? ` · “${r.note}”` : "";
  switch (r.status) {
    case "approved":
      return { by: `Aprovado por ${r.decided_by || "alguém"}`, took: took + note };
    case "denied":
      return { by: `Negado por ${r.decided_by || "alguém"}`, took: took + note };
    case "expired":
      return { by: "Ninguém respondeu", took: `expirou em ${ttlMin} min` };
    case "blocked":
      return { by: "Bloqueado pela regra", took: r.rule || r.note || "" };
    default:
      return { by: "Aguardando decisão", took: "" };
  }
}
