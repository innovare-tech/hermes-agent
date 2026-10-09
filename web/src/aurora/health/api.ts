// Saúde da plataforma (design A7): contrato com /api/health e /api/incidents. Tudo por perfil (`?profile=` vai no fetchJSON).
import { fetchJSON } from "@/lib/api";
import { ApiError } from "@/lib/api-error";

export type Status = "ok" | "warn" | "error" | "pending" | "paused";
export type GroupKey = "servers" | "mongo" | "whatsapp_bots" | "k8s" | "dead_letters" | "services";
export type Severity = "critical" | "warning";

export type Metrics = { cpu?: number; ram?: number; disk?: number };
export type HistoryPoint = { at: number; value: number };

export type Check = {
  id: string;
  group: GroupKey;
  name: string;
  detail: string;
  kind: string;
  status: Status;
  severity: Severity;
  result: { text?: string; metrics?: Metrics };
  intervalSec: number;
  /** Segundos desde 1970; `null` = nunca rodou. */
  lastRunAt: number | null;
  history: HistoryPoint[];
  historyLabel: string;
  clientId: string | null;
  sourceText: string | null;
  createdAt: number;
};

export type Overview = {
  availability30d: number;
  botsConnected: number;
  botsTotal: number;
  lastRunAt: number | null;
  checks: number;
  lastIncident: Incident | null;
};

export type TimelineResult = "problem" | "signal" | "ruled_out" | "info";
export type TimelineEvent = { at: number; result: TimelineResult; text: string };

export type Approval = {
  id: number;
  /** `pending`, `approved`, `denied`, `expired` ou `blocked` (não consegui enviar ao Telegram). */
  status: string;
  /** `telegram:<chat>[:<tópico>]`. */
  target: string | null;
  /** Destino legível ("Telegram · Alertas de infra"), montado pelo backend. */
  targetLabel?: string;
  expiresAt: number | null;
  decidedBy: string | null;
  result: string | null;
};

export type Incident = {
  id: number;
  code: string;
  checkId: string | null;
  severity: Severity;
  title: string;
  impact: string;
  status: "open" | "resolved";
  startedAt: number;
  ackBy: string | null;
  ackAt: number | null;
  resolvedAt: number | null;
  resolvedBy: string | null;
  note: string | null;
  timeline: TimelineEvent[];
  hypothesis: string | null;
  /** O Hermes ainda não terminou a investigação. */
  investigating: boolean;
  /** Perfil pausado: a investigação só roda quando retomar. */
  investigationPaused?: boolean;
  suggestedAction: { label: string; command: string; needsApproval: boolean } | null;
  approval: Approval | null;
};

export type Parsed = {
  target: string;
  condition: string;
  window: string;
  frequency: string;
  group: GroupKey;
  groupLabel: string;
  severity: Severity;
  notify: string;
  spec: unknown;
};
export type ParseResult = { ok: true; check: Parsed } | { ok: false; reason: string };

export type RecommendedResult = { created: Check[]; skipped: string[] };

export type ServerCfg = { name: string; host: string; user: string; port: number };
export type ServiceCfg = { name: string; url: string };
export type HealthSettings = {
  mongo: { uri_env: string; db: string };
  k8s: { server: string; token_env: string; ca_env: string; namespaces: string };
  servers: ServerCfg[];
  services: ServiceCfg[];
  /** O que já está ligado; nunca traz segredo. */
  status: { mongo: boolean; k8s: boolean; /** Existe `HEALTH_SSH_KEY`: uma chave só para todos os servidores. */ sshKey: boolean; servers: Record<string, { keyEnv: string }> };
};
export type SettingsPatch = Pick<HealthSettings, "mongo" | "k8s" | "servers" | "services">;

/** Frequências aceitas pelo backend, em segundos. */
export const INTERVALS = [60, 300, 900, 3600, 86400] as const;
export const INTERVAL_SHORT: Record<number, string> = { 60: "1 min", 300: "5 min", 900: "15 min", 3600: "1 hora", 86400: "1 dia" };

const j = (method: string, body?: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export const healthApi = {
  checks: () => fetchJSON<Check[]>("/api/health/checks"),
  overview: () => fetchJSON<Overview>("/api/health/overview"),
  run: (id: string) => fetchJSON<Check>(`/api/health/checks/${encodeURIComponent(id)}/run`, j("POST")),
  parse: (text: string, interval: number) => fetchJSON<ParseResult>("/api/health/checks/parse", j("POST", { text, interval })),
  create: (text: string, interval: number, parsed: Parsed) => fetchJSON<Check>("/api/health/checks", j("POST", { text, interval, parsed })),
  recommended: () => fetchJSON<RecommendedResult>("/api/health/checks/recommended", j("POST")),
  settings: () => fetchJSON<HealthSettings>("/api/health/settings"),
  saveSettings: (patch: SettingsPatch) => fetchJSON<HealthSettings>("/api/health/settings", j("PUT", patch)),
  incidents: (status: "open" | "resolved" = "open") => fetchJSON<Incident[]>(`/api/incidents?status=${status}`),
  ack: (id: number) => fetchJSON<Incident>(`/api/incidents/${id}/ack`, j("POST", {})),
  resolve: (id: number, note: string) => fetchJSON<{ incident: Incident; stillFailing: boolean }>(`/api/incidents/${id}/resolve`, j("POST", { note })),
  action: (id: number) => fetchJSON<Incident>(`/api/incidents/${id}/action`, j("POST", {})),
  setPaused: (id: string, paused: boolean) => fetchJSON<Check>(`/api/health/checks/${encodeURIComponent(id)}`, j("PATCH", { paused })),
  remove: (id: string) => fetchJSON<{ ok: boolean }>(`/api/health/checks/${encodeURIComponent(id)}`, j("DELETE")),
};

/** Texto para o usuário: o `detail` em português do backend (400/404/409) ou o texto de reserva. */
export function errText(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.status === 400 || e.status === 404 || e.status === 409 ? e.message : fallback;
  return fallback;
}
