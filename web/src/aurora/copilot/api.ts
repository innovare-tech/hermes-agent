// Clientes do Copiloto (design A8): contrato com /api/copilot e /api/aibiz (docs/aurora/specs/13-copiloto.md).
// Tudo por perfil (`?profile=` vai no fetchJSON). A chave da API (`apiKey`) só existe na resposta de criar,
// rotacionar e reativar: quem chama mostra uma vez e descarta; nada aqui guarda a chave.
import { fetchJSON } from "@/lib/api";

export type Plan = "starter" | "pro";
export type Status = "active" | "no_credit" | "revoked";
export type AuditResult = "ok" | "blocked_scope" | "blocked_query" | "error";

export type Month = { conversations: number; credits: number; creditsLimit: number; tokens: number; toolCalls: number; spendUsd: number | null };

export type Client = {
  systemClientId: string;
  name: string;
  plan: Plan;
  /** Perfil `cli-…` do cliente (aparece em Perfis). */
  profileId: string;
  status: Status;
  /** Só vem na lista; no detalhe use `isNewClient`. */
  isNew?: boolean;
  /** Segundos desde 1970. */
  createdAt: number;
  month: Month;
  lastActivityAt: number | null;
  keyRotatedAt: number | null;
  revoked: { at: number; by: string | null; reason: string | null; purgeAt: number } | null;
};

export type ToolRow = { key: string; label: string; weight: number; enabled: boolean; reason: string };
export type Usage = { daily: { day: string; credits: number }[]; byTool: { key: string; uses: number; credits: number }[]; tokens: number; tokenCredits: number };
export type ClientDetail = Client & { tools: ToolRow[]; usage: Usage; filter: { systemClientId: string } };

export type Counts = { all: number; active: number; no_credit: number; revoked: number };
export type ClientsPage = {
  items: Client[];
  /** Total com a busca e os filtros aplicados. */
  total: number;
  /** Contadores sem filtro (os chips). */
  counts: Counts;
  kpis: { active: number; noCredit: number; spendUsd: number };
  nextCursor: string | null;
};

export type AuditItem = {
  at: number;
  question: string | null;
  askedBy: { name: string; role: string; via: string };
  tool: string;
  toolLabel: string;
  args: unknown;
  /** A consulta que o MCP montou (já com o filtro do cliente). Texto ou JSON. */
  query: unknown;
  rows: number | null;
  ms: number | null;
  result: AuditResult;
  error: string | null;
  credits: number;
};
export type AuditPage = { items: AuditItem[]; nextCursor: string | null };

export type CatalogTool = { key: string; label: string; plans: Plan[]; weight: number };
export type CopilotSettings = {
  mcpUrl: string;
  secretEnv: string;
  plans: Record<Plan, { credits: number }>;
  catalog: CatalogTool[];
  planLabels: Record<Plan, string>;
};

export type DirectoryClient = { systemClientId: string; name: string; plan?: string | null; openAnalyses?: number; channelCount?: number; hasCopilot: boolean };
export type DirectoryPage = { items: DirectoryClient[]; total: number; nextCursor: string | null };

export type Secret = { apiKey: string; client: ClientDetail };

const j = (method: string, body?: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const sid = (id: string) => encodeURIComponent(id);

/** `?a=1&b=2` só com o que tem valor. */
export function qs(p: Record<string, string | number | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

export const PAGE_SIZE = 20;

export const copilotApi = {
  clients: (f: { q?: string; status?: string; plan?: string; cursor?: string | null }) => fetchJSON<ClientsPage>(`/api/copilot/clients${qs({ ...f, limit: PAGE_SIZE })}`),
  client: (id: string) => fetchJSON<ClientDetail>(`/api/copilot/clients/${sid(id)}`),
  audit: (id: string, cursor?: string | null) => fetchJSON<AuditPage>(`/api/copilot/clients/${sid(id)}/audit${qs({ cursor })}`),
  settings: () => fetchJSON<CopilotSettings>("/api/copilot/settings"),
  directory: (q: string, cursor?: string | null) => fetchJSON<DirectoryPage>(`/api/aibiz/clients${qs({ q, cursor })}`),
  create: (systemClientId: string, plan: Plan) => fetchJSON<Secret & { profileId: string }>("/api/copilot/clients", j("POST", { systemClientId, plan })),
  rotate: (id: string, graceHours: 0 | 24) => fetchJSON<Secret>(`/api/copilot/clients/${sid(id)}/rotate-key`, j("POST", { graceHours })),
  revoke: (id: string, reason: string) => fetchJSON<ClientDetail>(`/api/copilot/clients/${sid(id)}/revoke`, j("POST", { confirm: id, reason: reason.trim() || undefined })),
  reactivate: (id: string) => fetchJSON<Secret>(`/api/copilot/clients/${sid(id)}/reactivate`, j("POST", {})),
  setPlan: (id: string, plan: Plan) => fetchJSON<ClientDetail>(`/api/copilot/clients/${sid(id)}`, j("PATCH", { plan })),
};
