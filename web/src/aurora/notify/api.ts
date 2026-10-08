// Avisos (design A4): contrato com /api/notify, tipos e funções puras da tela.
import { fetchJSON } from "@/lib/api";

/** Destino de um aviso: número do tópico, `null` = Geral (sem tópico) ou `"off"` = não enviar (fica só no painel). */
export type TopicRef = number | null | "off";
export type Row = { topic: TopicRef; quiet: boolean };

export type Routes = {
  chatId: string | null;
  analyses: { critical: Row; high: Row; medium: Row; low: Row; mentions: number[] };
  infra: { critical: Row; warning: Row; info: Row; mentions: number[] };
  digest: { topic: TopicRef; time: string; /** 0 = domingo … 6 = sábado */ days: number[] };
  quietHours: { from: string; to: string; weekend: boolean; tz: string };
};

export type TgTopic = { threadId: number; name: string; color: string; icon: string };
export type TgMember = { id: number; name: string; username: string | null; role: string };
export type TgChat = { id: string; title: string; members: number; isForum: boolean; botIsAdmin: boolean; canManageTopics: boolean };
export type TgState = {
  connected: boolean;
  /** `ok`; `no_token` (bot não conectado), `no_chat` (falta o grupo), `error` (Telegram não respondeu). */
  status: "ok" | "no_token" | "no_chat" | "error";
  chatId: string | null;
  bot: { username: string | null } | null;
  chat: TgChat | null;
  topics: TgTopic[];
  members: TgMember[];
  error?: { code: string; message: string };
};

export type TestType = "analyses" | "infra" | "digest";
export type TestResult = { ok: true; topic: TopicRef; topicName: string; latencyMs: number; messageUrl: string | null } | { ok: false; code: string; message: string };

const j = (method: string, body?: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const nf = <T>(path: string, init?: RequestInit) => fetchJSON<T>("/api/notify" + path, init);

export const notifyApi = {
  telegram: () => nf<TgState>("/telegram"),
  setChat: (chatId: string) => nf<TgState>("/telegram", j("PUT", { chatId })),
  refreshTopics: (create = false) => nf<TgState>("/telegram/topics/refresh", j("POST", { create })),
  routes: () => nf<Routes>("/routes"),
  saveRoutes: (r: Routes) => nf<Routes>("/routes", j("PUT", r)),
  test: (type: TestType, draft: Routes) => nf<TestResult>("/test", j("POST", { type, draft })),
};

// ---- tipos de aviso e níveis (textos do protótipo) ----

export type Kind = TestType;
export type Level = { key: string; label: string; icon: string; color: string };

export const ANALYSIS_LEVELS: Level[] = [
  { key: "critical", label: "Crítica", icon: "siren", color: "var(--err)" },
  { key: "high", label: "Alta", icon: "arrow-up", color: "var(--warn)" },
  { key: "medium", label: "Média", icon: "minus", color: "var(--info)" },
  { key: "low", label: "Baixa", icon: "arrow-down", color: "var(--fg2)" },
];
export const INFRA_LEVELS: Level[] = [
  { key: "critical", label: "Crítica", icon: "siren", color: "var(--err)" },
  { key: "warning", label: "Atenção", icon: "triangle-alert", color: "var(--warn)" },
  { key: "info", label: "Informativo", icon: "info", color: "var(--info)" },
];

export const DAY_LETTERS = ["D", "S", "T", "Q", "Q", "S", "S"];
export const DAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// ---- tópicos ----

export type TopicInfo = { id: string; value: TopicRef; name: string; icon: string; color: string; sub: string };

const GENERAL: TopicInfo = { id: "geral", value: null, name: "Geral (sem tópico)", icon: "hash", color: "#7f91a4", sub: "Tópico principal do grupo" };
const OFF: TopicInfo = { id: "off", value: "off", name: "Não enviar", icon: "bell-off", color: "#555c70", sub: "Fica só no painel" };

const SUBS: Record<string, string> = {
  "alertas de infra": "Servidores, filas, gateways",
  "grupos de clientes": "Análises dos grupos de WhatsApp",
  conversa: "Papo geral da equipe",
};

/** Opções do seletor: os tópicos do grupo, Geral e Não enviar. Grupo sem tópicos só oferece Geral e Não enviar. */
export function topicOptions(topics: TgTopic[], isForum: boolean): TopicInfo[] {
  const real = isForum ? topics.map((t) => ({ id: String(t.threadId), value: t.threadId as TopicRef, name: t.name, icon: t.icon || "hash", color: t.color, sub: SUBS[t.name.toLowerCase()] ?? "Tópico do grupo" })) : [];
  return [...real, GENERAL, OFF];
}

/** Dados de um destino salvo; um tópico que o painel não conhece (apagado, ou criado fora) aparece pelo número. */
export function topicInfo(ref: TopicRef, topics: TgTopic[]): TopicInfo {
  if (ref === null) return GENERAL;
  if (ref === "off") return OFF;
  const t = topics.find((x) => x.threadId === ref);
  return t ? { id: String(ref), value: ref, name: t.name, icon: t.icon || "hash", color: t.color, sub: SUBS[t.name.toLowerCase()] ?? "Tópico do grupo" } : { id: String(ref), value: ref, name: `Tópico ${ref}`, icon: "hash", color: "#7f91a4", sub: "Tópico que o painel não conhece" };
}

/** Quais dos 3 tópicos padrão ainda não existem no grupo (por nome). */
export const DEFAULT_TOPIC_NAMES = ["Alertas de infra", "Grupos de clientes", "Conversa"];
export const missingDefaults = (topics: TgTopic[]) => DEFAULT_TOPIC_NAMES.filter((n) => !topics.some((t) => t.name.toLowerCase() === n.toLowerCase()));

// ---- horários ----

/** Soma `min` minutos a "HH:MM" (volta à meia-noite). */
export function shiftTime(hm: string, min: number): string {
  const [h, m] = hm.split(":").map(Number);
  const t = (((h * 60 + m + min) % 1440) + 1440) % 1440;
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}

/** "Segunda a sexta", "3 dias por semana"… e o aviso de nenhum dia marcado. */
export function daysHint(days: number[]): string {
  if (!days.length) return "Nenhum dia marcado: o resumo não será enviado.";
  if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) return "Segunda a sexta";
  return `${days.length} ${days.length === 1 ? "dia" : "dias"} por semana`;
}

/** Texto do interruptor de silêncio de uma linha (protótipo). */
export function quietLabel(row: Row, critical: boolean, q: Routes["quietHours"]): string {
  if (row.topic === "off") return "—";
  if (critical) return "Sempre na hora";
  return row.quiet ? `Segura das ${q.from} às ${q.to}` : "Na hora, sem pausa";
}

// ---- alterações não salvas ----

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Quantas partes mudaram: cada nível, cada lista de menções, o resumo e o horário de silêncio. */
export function countChanges(cur: Routes, saved: Routes): number {
  let n = 0;
  for (const sec of ["analyses", "infra"] as const) {
    for (const k of Object.keys(cur[sec]) as (keyof Routes[typeof sec])[]) if (!same(cur[sec][k], saved[sec][k])) n++;
  }
  if (!same(cur.digest, saved.digest)) n++;
  if (!same(cur.quietHours, saved.quietHours)) n++;
  return n;
}

export const changesLabel = (n: number) => `${n} ${n === 1 ? "alteração não salva" : "alterações não salvas"}`;

/** Resultado do teste em uma frase (protótipo): "Chegou em “Grupos de clientes” em 0,6 s". */
export function testLabel(r: TestResult): string {
  return r.ok ? `Chegou em “${r.topicName}” em ${(r.latencyMs / 1000).toFixed(1).replace(".", ",")} s` : r.message;
}

// ---- pré-visualização ----

export type PreviewKind = Kind;

/** Linha das menções no balão: @usuário em azul (quem não tem @usuário aparece pelo nome). */
export function mentionLine(ids: number[], members: TgMember[]): string {
  return ids.map((id) => { const m = members.find((x) => x.id === id); return m ? (m.username ? "@" + m.username : m.name) : "equipe"; }).join(" ");
}

/** Pessoas ainda não marcadas que casam com a busca por nome ou @usuário (sem acento). */
export function matchPeople(members: TgMember[], chosen: number[], q: string): TgMember[] {
  const n = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const k = n(q.trim());
  return members.filter((p) => !chosen.includes(p.id) && (!k || n(p.name + " " + (p.username ? "@" + p.username : "")).includes(k)));
}
