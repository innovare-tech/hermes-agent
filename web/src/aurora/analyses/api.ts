// Análises dos grupos (design A3): contrato com /api/analyses e /api/clients, tipos e funções puras da tela.
import { authedFetch, fetchJSON } from "@/lib/api";
import { ApiError } from "@/lib/api-error";

export type Category = "bug" | "duvida" | "sugestao" | "reclamacao" | "elogio" | "social";
export type Urgency = "critica" | "alta" | "media" | "baixa";
export type IrrelevantReason = "social" | "categoria" | "urgencia" | "resolvido_fora";
/** Estado exibido: `open` inclui as que falharam na análise (a equipe também é avisada). */
export type View = "open" | "resolved" | "irrelevant";
export type StatusTab = "open" | "unseen" | "resolved" | "irrelevant" | "all";

export type Quote = { author: string; at: string; text: string };
export type AudioEvidence = { author?: string; at?: string; url: string; transcript?: string; transcriptError?: string };
export type MediaEvidence = { type: string; url: string; thumbUrl?: string; caption: string; author?: string; at?: string };
export type Check = { result: "problem" | "ok" | "info"; text: string; explain?: string };

export type Analysis = {
  id: number;
  code: string;
  status: "open" | "failed" | "resolved" | "irrelevant";
  createdAt: number;
  channelId: string;
  groupName: string;
  platform: string | null;
  clientId: string | null;
  clientName: string | null;
  period: { from: number | null; to: number | null };
  messageCount: number;
  participants: { name: string; role?: string }[];
  category: Category | null;
  urgency: Urgency | null;
  /** 0–1 (vem da triagem; pode faltar). */
  confidence: number | null;
  summary: string;
  evidence: { quotes: Quote[]; audios: AudioEvidence[]; media: MediaEvidence[] };
  checks: Check[];
  hypothesis: string;
  suggestedReply: string;
  error: string | null;
  telegram: { sentAt: number | null; url?: string } | null;
  seenBy: { name: string; at: number }[];
  resolved: { by: string; at: number } | null;
  irrelevant: { reason: IrrelevantReason; note: string; by: string; at: number } | null;
};

export type IgnoredGroup = { channelId: string; groupName: string; count: number; samples: string[] };
export type ClientRow = { systemClientId: string; name: string; plan?: string; openAnalyses?: number };
export type ClientPage = { items: ClientRow[]; total: number; nextCursor: string | null };

export const CATEGORIES: Record<Category, { label: string; icon: string; color: string }> = {
  bug: { label: "Bug", icon: "bug", color: "var(--err)" },
  duvida: { label: "Dúvida", icon: "circle-help", color: "var(--info)" },
  sugestao: { label: "Sugestão", icon: "lightbulb", color: "var(--vio)" },
  reclamacao: { label: "Reclamação", icon: "frown", color: "var(--warn)" },
  elogio: { label: "Elogio", icon: "heart", color: "var(--ok)" },
  social: { label: "Conversa social", icon: "coffee", color: "var(--fg2)" },
};

export const URGENCIES: Record<Urgency, { label: string; icon: string; color: string }> = {
  critica: { label: "Crítica", icon: "siren", color: "var(--err)" },
  alta: { label: "Alta", icon: "arrow-up", color: "var(--warn)" },
  media: { label: "Média", icon: "minus", color: "var(--info)" },
  baixa: { label: "Baixa", icon: "arrow-down", color: "var(--fg2)" },
};

/** Na lista de filtros "Conversa social" não existe: o Hermes ignora esses lotes. */
export const FILTER_CATEGORIES = (Object.keys(CATEGORIES) as Category[]).filter((c) => c !== "social");
export const URGENCY_ORDER = Object.keys(URGENCIES) as Urgency[];

export const IRRELEVANT_REASONS: { id: IrrelevantReason; label: string }[] = [
  { id: "social", label: "Era conversa social" },
  { id: "categoria", label: "Categoria errada" },
  { id: "urgencia", label: "Urgência exagerada" },
  { id: "resolvido_fora", label: "Já tinha sido resolvido em outro lugar" },
];
export const reasonLabel = (id: string) => IRRELEVANT_REASONS.find((r) => r.id === id)?.label ?? id;

export const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: "open", label: "Abertas" },
  { id: "unseen", label: "Não vistas" },
  { id: "resolved", label: "Resolvidas" },
  { id: "irrelevant", label: "Não relevantes" },
  { id: "all", label: "Todas" },
];

// ---- chamadas ----

const j = (method: string, body?: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const an = <T>(path: string, init?: RequestInit) => fetchJSON<T>("/api/analyses" + path, init);

export const analysesApi = {
  /** Tudo que aparece na tela (abertas, resolvidas, não relevantes); os filtros são aplicados aqui, no cliente. */
  all: () => an<Analysis[]>("?status=all&limit=500"),
  get: (id: number) => an<Analysis>(`/${id}`),
  resolve: (id: number) => an<Analysis>(`/${id}/resolve`, j("POST")),
  reopen: (id: number) => an<Analysis>(`/${id}/resolve`, j("DELETE")),
  irrelevant: (id: number, reason: IrrelevantReason, note: string) => an<Analysis>(`/${id}/irrelevant`, j("POST", { reason, note })),
  undoIrrelevant: (id: number) => an<Analysis>(`/${id}/irrelevant`, j("DELETE")),
  seen: (id: number) => an<Analysis>(`/${id}/seen`, j("POST")),
  transcribe: (id: number) => an<Analysis>(`/${id}/transcribe`, j("POST")),
  ignored: () => an<IgnoredGroup[]>("/ignored?date=today"),
  reanalyze: (channelId: string) => an<{ ok: boolean; queued: number }>(`/ignored/${encodeURIComponent(channelId)}/reanalyze`, j("POST")),
};

/** O diretório de clientes é de outra frente: 404 = "ainda vazio", nunca erro de tela. */
async function directory<T>(path: string, empty: T): Promise<T> {
  try {
    return await fetchJSON<T>(path);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return empty;
    throw e;
  }
}

export const clientsApi = {
  page: async (q: string, cursor: string | null): Promise<ClientPage & { available: boolean }> => {
    const qs = new URLSearchParams({ q, limit: "30" });
    if (cursor) qs.set("cursor", cursor);
    const r = await directory<ClientPage | null>("/api/clients?" + qs, null);
    return r ? { available: true, items: r.items ?? [], total: r.total ?? r.items?.length ?? 0, nextCursor: r.nextCursor ?? null } : { available: false, items: [], total: 0, nextCursor: null };
  },
  withAnalyses: async (): Promise<ClientRow[] | null> => {
    const r = await directory<ClientRow[] | { items: ClientRow[] } | null>("/api/clients/with-analyses", null);
    return r === null ? null : Array.isArray(r) ? r : (r.items ?? []);
  },
};

// ---- mídia: o <audio>/<img> não carrega o token, então o arquivo vem por fetch autenticado ----

const blobs = new Map<string, Promise<string>>();

/** URL local (blob:) do arquivo da evidência; guarda em cache para não baixar duas vezes. */
export function mediaBlob(url: string): Promise<string> {
  let p = blobs.get(url);
  if (!p) {
    p = authedFetch(url).then(async (r) => {
      if (!r.ok) throw new Error("arquivo indisponível");
      return URL.createObjectURL(await r.blob());
    });
    p.catch(() => blobs.delete(url));
    blobs.set(url, p);
  }
  return p;
}

// ---- funções puras ----

export const viewOf = (a: Analysis): View => (a.status === "resolved" ? "resolved" : a.status === "irrelevant" ? "irrelevant" : "open");
export const isUnseen = (a: Analysis) => viewOf(a) === "open" && a.seenBy.length === 0;

export type Filters = { clients: string[]; categories: Category[]; urgencies: Urgency[] };
export const NO_FILTERS: Filters = { clients: [], categories: [], urgencies: [] };
export const hasFilters = (f: Filters) => f.clients.length + f.categories.length + f.urgencies.length > 0;

export function matches(a: Analysis, f: Filters): boolean {
  return (!f.clients.length || (!!a.clientId && f.clients.includes(a.clientId))) && (!f.categories.length || (!!a.category && f.categories.includes(a.category))) && (!f.urgencies.length || (!!a.urgency && f.urgencies.includes(a.urgency)));
}

export const tabPass: Record<StatusTab, (a: Analysis) => boolean> = {
  open: (a) => viewOf(a) === "open",
  unseen: isUnseen,
  resolved: (a) => viewOf(a) === "resolved",
  irrelevant: (a) => viewOf(a) === "irrelevant",
  all: () => true,
};

/** Grupos da lista por urgência (Crítica → Baixa). Análise que falhou não tem urgência: vai primeiro, em "Falhou na análise". */
export function groupByUrgency(list: Analysis[]): { key: string; label: string; color: string; items: Analysis[] }[] {
  const failed = list.filter((a) => !a.urgency);
  const groups = URGENCY_ORDER.map((u) => ({ key: u, label: URGENCIES[u].label, color: URGENCIES[u].color, items: list.filter((a) => a.urgency === u) }));
  return [{ key: "failed", label: "Falhou na análise", color: "var(--err)", items: failed }, ...groups].filter((g) => g.items.length);
}

/** Clientes que têm análises (com as abertas), a partir da própria lista: vale quando o diretório não responde. */
export function clientsFrom(list: Analysis[]): ClientRow[] {
  const m = new Map<string, ClientRow>();
  for (const a of list) {
    if (!a.clientId) continue;
    const c = m.get(a.clientId) ?? { systemClientId: a.clientId, name: a.clientName || a.clientId, openAnalyses: 0 };
    if (viewOf(a) === "open") c.openAnalyses = (c.openAnalyses ?? 0) + 1;
    m.set(a.clientId, c);
  }
  return [...m.values()].sort((x, y) => (y.openAnalyses ?? 0) - (x.openAnalyses ?? 0) || x.name.localeCompare(y.name, "pt-BR"));
}

/** Sem acentos e minúsculo, para a busca de clientes. */
export const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Parte o nome em antes / trecho encontrado / depois (a busca ignora acentos). */
export function highlight(name: string, q: string): [string, string, string] {
  const i = q ? norm(name).indexOf(norm(q)) : -1;
  return i < 0 ? [name, "", ""] : [name.slice(0, i), name.slice(i, i + q.length), name.slice(i + q.length)];
}

export const matchesClient = (c: ClientRow, q: string) => !q || norm(c.name).includes(norm(q)) || norm(c.systemClientId).includes(norm(q));

const AVATAR = ["#ff9f7a", "#7cb8ff", "#5ee0c0", "#a395ff", "#f5c26b", "#f48fd0", "#c2e66b", "#62d6f0"];
/** Cor estável por texto (id do cliente, nome da pessoa). */
export const colorOf = (s: string) => AVATAR[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length];
export const initial = (s: string) => (s.replace(/^(dr|dra)\.?\s+/i, "").trim()[0] ?? "?").toUpperCase();

const pad = (n: number) => String(n).padStart(2, "0");
export const hhmm = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "Hoje" / "Ontem" / "08/10" para a data de um instante. */
function dayWord(ts: number, now: Date): string {
  const d = new Date(ts * 1000);
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  return days === 0 ? "Hoje" : days === 1 ? "Ontem" : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** "Hoje, 09:02–09:28". */
export function periodLabel(a: Pick<Analysis, "period" | "createdAt">, now = new Date()): string {
  const from = a.period.from ?? a.createdAt;
  const to = a.period.to ?? from;
  return `${dayWord(from, now)}, ${hhmm(from)}${hhmm(to) === hhmm(from) ? "" : "–" + hhmm(to)}`;
}

/** Hora na lista: hoje mostra HH:MM, antes "Ontem" ou a data. */
export function whenLabel(a: Pick<Analysis, "period" | "createdAt">, now = new Date()): string {
  const t = a.period.to ?? a.createdAt;
  const w = dayWord(t, now);
  return w === "Hoje" ? hhmm(t) : w;
}

export const PLATFORM: Record<string, string> = { whatsapp: "WhatsApp", telegram: "Telegram", discord: "Discord", slack: "Slack", signal: "Signal" };
export const platformLabel = (p: string | null) => (p ? (PLATFORM[p] ?? p[0].toUpperCase() + p.slice(1)) : "");

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Contexto da análise + pergunta, para abrir na Conversa (o Hermes não tem acesso ao painel). */
export function chatPrompt(a: Analysis, question: string): string {
  const cat = a.category ? CATEGORIES[a.category].label : "sem categoria";
  const urg = a.urgency ? URGENCIES[a.urgency].label.toLowerCase() : "sem urgência";
  const lines = [
    `Contexto: análise ${a.code} do grupo “${a.groupName}”${a.clientName ? ` (cliente ${a.clientName})` : ""}, ${cat}, urgência ${urg}.`,
    a.summary && `Resumo: ${a.summary}`,
    a.evidence.quotes.length && "Mensagens citadas:\n" + a.evidence.quotes.slice(0, 6).map((q) => `- [${q.at}] ${q.author}: ${q.text}`).join("\n"),
    a.evidence.audios.some((x) => x.transcript) && "Áudios transcritos:\n" + a.evidence.audios.filter((x) => x.transcript).map((x) => `- ${x.author ?? "?"}: ${x.transcript}`).join("\n"),
    a.checks.length && "O que foi checado:\n" + a.checks.map((c) => `- (${c.result}) ${c.text}`).join("\n"),
    a.hypothesis && `Hipótese: ${a.hypothesis}`,
    a.suggestedReply && `Resposta sugerida: ${a.suggestedReply}`,
    a.error && `Falha na análise: ${a.error}`,
  ].filter(Boolean);
  return `${lines.join("\n\n")}\n\nPergunta: ${question}`;
}

export const CHAT_SUGGESTIONS = ["Por que essa urgência?", "Algum outro cliente foi afetado?", "Escreva uma resposta mais curta"];
