// Tela Canais (A2): tipos do contrato, chamadas à API e a lógica pura (ordem, filtros, frases da janela).
// Tudo vem do backend (/api/ops/channels, /api/ops/listen, /api/clients); nada de dado fixo aqui.
import { fetchJSON } from "@/lib/api";
import type { AutonomyMode } from "../adapter";

export type Section = "group" | "team" | "direct";
export type Window = { useDefault: boolean; silenceMin: number; maxMin: number };
export type Suggestion = { clientId: string; name: string; confidence: number };

/** Canal como `GET /api/ops/channels` devolve (colunas do ops.db + campos do contrato do A2). */
export type ChannelRow = {
  id: string;
  platform: string;
  name: string;
  kind: string;
  mode: AutonomyMode;
  business_id: string | null;
  last_seen: number | null;
  section: Section;
  clientId: string | null;
  clientName: string | null;
  notClient: boolean;
  suggestion: Suggestion | null;
  /** Id do chat na plataforma (JID do grupo no WhatsApp). */
  chat_id?: string;
  /** Quem já escreveu no canal; null = ninguém ainda. Para participantes do grupo, veja `size`. */
  members: number | null;
  /** Só grupos de WhatsApp: a ponte deixa as mensagens dele chegarem. */
  listening?: boolean;
  /** Só grupos de WhatsApp: participantes do grupo, como o WhatsApp informa. */
  size?: number | null;
  /** Grupo do número que nunca falou com o Hermes: ainda não existe no ops.db. */
  discovered?: boolean;
  todayCount: number;
  last: { at: number; from: string; text: string } | null;
  lastAlert: { at: number; analysisId: number } | null;
  /** null só nos grupos descobertos (ainda sem canal no ops.db). */
  window: Window | null;
  problem: { code?: string; message: string; fixable?: boolean } | null;
  receivesAlerts: boolean;
  requiresConfirm: boolean;
};

export type ClientHit = { systemClientId: string; name: string; plan: string; openAnalyses: number; channelCount: number };
export type ClientPage = { items: ClientHit[]; total: number; nextCursor: string | null };

/** O que o PATCH aceita (chaves ausentes não mudam). */
export type ChannelPatch = {
  mode?: AutonomyMode;
  clientId?: string | null;
  notClient?: boolean;
  window?: { useDefault: true } | { silenceMin: number; maxMin: number } | null;
  confirm?: boolean;
};

const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export type WaPolicy = "allowlist" | "open" | "pairing" | "disabled";
export type WaGroupsInfo = { policy: WaPolicy; updatedAt: number | null; count: number };

export const groupsApi = {
  info: () => fetchJSON<WaGroupsInfo>("/api/ops/whatsapp/groups"),
  listen: (chatId: string, on: boolean) => fetchJSON<{ chatId: string; listening: boolean }>("/api/ops/whatsapp/groups/listen", json("POST", { chatId, on })),
};

export const channelsApi = {
  list: () => fetchJSON<ChannelRow[]>("/api/ops/channels"),
  patch: (id: string, body: ChannelPatch) => fetchJSON<ChannelRow>(`/api/ops/channels/${encodeURIComponent(id)}`, json("PATCH", body)),
  clients: (q: string, cursor?: string | null) => fetchJSON<ClientPage>(`/api/clients?limit=30&q=${encodeURIComponent(q)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
  defaultWindow: async () => {
    const l = await fetchJSON<{ silence_min: number; max_min: number }>("/api/ops/listen");
    return { silenceMin: l.silence_min, maxMin: l.max_min };
  },
  setDefaultWindow: async (w: { silenceMin: number; maxMin: number }) => {
    const l = await fetchJSON<{ silence_min: number; max_min: number }>("/api/ops/listen", json("PUT", { silence_min: w.silenceMin, max_min: w.maxMin }));
    return { silenceMin: l.silence_min, maxMin: l.max_min };
  },
};

// ---- modos ----

export type ModeInfo = { mode: AutonomyMode; label: string; icon: string; color: string; line: string; guarantee: string };

/** Na ordem do design: Observar · Escutar · Rascunhar · Autônomo. */
export const MODE_INFO: ModeInfo[] = [
  { mode: 0, label: "Observar", icon: "eye", color: "var(--fg2)", line: "Só guarda as mensagens. Não analisa, não avisa, não responde.", guarantee: "Só guarda as mensagens." },
  { mode: 3, label: "Escutar", icon: "ear", color: "var(--ok)", line: "Analisa e avisa a equipe no Telegram. Nunca responde no grupo.", guarantee: "Nada é enviado ao grupo — só a equipe é avisada." },
  { mode: 1, label: "Rascunhar", icon: "pen-line", color: "var(--warn)", line: "Escreve uma resposta e espera você aprovar antes de enviar.", guarantee: "Nada sai sem você aprovar." },
  { mode: 2, label: "Autônomo", icon: "zap", color: "var(--acc)", line: "Responde sozinho, sem pedir aprovação.", guarantee: "O Hermes responde sozinho, sem revisão." },
];
export const modeInfo = (m: AutonomyMode): ModeInfo => MODE_INFO.find((x) => x.mode === m) ?? MODE_INFO[0];

/** Motivo de um modo não poder ser escolhido neste canal (null = pode). */
export const modeBlocked = (c: ChannelRow, m: AutonomyMode): string | null =>
  m === 3 && c.receivesAlerts ? "Este canal recebe os avisos do Escutar — ele não pode escutar a si mesmo." : null;

// ---- seções, ordem e filtros ----

export const SECTIONS: { id: Section; title: string; sub: string; icon: string }[] = [
  { id: "group", title: "Grupos de clientes", sub: "Os marcados “Não escutado” não chegam ao Hermes.", icon: "users" },
  { id: "team", title: "Equipe", sub: "Quem recebe os avisos do Escutar e conversa com a equipe.", icon: "send" },
  { id: "direct", title: "Conversas diretas", sub: "Pessoas que escrevem no privado.", icon: "user-round" },
];

/** Precisa de cliente: tudo que não é da equipe e ainda não tem vínculo nem foi marcado "não é cliente". */
export const needsLink = (c: ChannelRow) => c.section !== "team" && !c.discovered && !c.clientId && !c.notClient;

export type Filters = { q: string; client: string; mode: AutonomyMode | "all"; unlinked: boolean; problem: boolean };
export const NO_FILTERS: Filters = { q: "", client: "all", mode: "all", unlinked: false, problem: false };
export const filtersActive = (f: Filters) => f.q.trim() !== "" || f.client !== "all" || f.mode !== "all" || f.unlinked || f.problem;

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function applyFilters(rows: ChannelRow[], f: Filters): ChannelRow[] {
  const q = fold(f.q.trim());
  return rows.filter(
    (c) =>
      (!q || fold(c.name).includes(q)) &&
      (f.client === "all" || c.clientId === f.client) &&
      (f.mode === "all" || (!c.discovered && c.mode === f.mode)) &&
      (!f.unlinked || needsLink(c)) &&
      (!f.problem || !!c.problem),
  );
}

/** Dentro do cartão: escutados antes dos não escutados; entre os escutados, sem vínculo, depois com problema, depois o resto (ordem estável); os não escutados por nome. */
export function sortSection(rows: ChannelRow[]): ChannelRow[] {
  const rank = (c: ChannelRow) => (needsLink(c) ? 0 : c.problem ? 1 : 2);
  return rows
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const ma = notListened(a.c), mb = notListened(b.c);
      if (ma !== mb) return ma ? 1 : -1;
      if (ma) return a.c.name.localeCompare(b.c.name, "pt-BR") || a.i - b.i;
      return rank(a.c) - rank(b.c) || a.i - b.i;
    })
    .map((x) => x.c);
}

/** Clientes que têm canal vinculado (opções do filtro Cliente). */
export function linkedClients(rows: ChannelRow[]): { id: string; name: string }[] {
  const m = new Map<string, string>();
  for (const c of rows) if (c.clientId) m.set(c.clientId, c.clientName ?? c.clientId);
  return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export const modeCounts = (rows: ChannelRow[]) => MODE_INFO.map((i) => ({ ...i, count: rows.filter((c) => !c.discovered && c.listening !== false && c.mode === i.mode).length }));

// ---- escuta dos grupos de WhatsApp ----

/** Grupo que a ponte descarta ("Não escutado"). `listening` ausente = não é grupo de WhatsApp ou backend antigo: tratado como escutado. */
export const notListened = (c: ChannelRow) => c.listening === false;

/** Só grupos de WhatsApp têm lista de liberados. */
export const isWaGroup = (c: ChannelRow) => c.platform === "whatsapp" && c.kind === "group";

/** JID do chat (o backend manda `chat_id`; senão sai do id `plataforma:jid`). */
export const chatIdOf = (c: ChannelRow) => c.chat_id ?? c.id.slice(c.platform.length + 1);

/** O que a linha/gaveta pode oferecer. Grupo descoberto ainda não existe no ops.db: só dá para escutar. */
export function channelActions(c: ChannelRow, canListen: boolean) {
  const real = !c.discovered;
  return { mode: real, link: real && c.section !== "team", window: real, participants: real && isWaGroup(c), listen: canListen && isWaGroup(c) };
}

/** "N participantes" (tamanho do grupo no WhatsApp, se vier) ou, senão, quantas pessoas já escreveram. */
export function participantsLabel(c: ChannelRow): string {
  if (typeof c.size === "number" && c.size > 0) return c.size === 1 ? "1 participante" : `${c.size} participantes`;
  if (c.members) return c.members === 1 ? "1 pessoa escreveu" : `${c.members} pessoas escreveram`;
  return "";
}

/** "há 3 min", "há 2 h", "há 4 dias" (ms de época). */
export function agoLabel(ms: number, now = Date.now()): string {
  const min = Math.max(0, Math.floor((now - ms) / 60000));
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "há 1 dia" : `há ${d} dias`;
}

/** Linha do topo da seção de grupos; aviso quando a política do perfil não é allowlist. */
export function groupsSummary(info: WaGroupsInfo, rows: ChannelRow[], now = Date.now()): { text: string; warn: string | null } {
  if (info.policy === "open") return { text: "", warn: "Todos os grupos chegam ao Hermes (sem lista)" };
  if (info.policy !== "allowlist") return { text: "", warn: "Grupos desligados neste perfil" };
  if (info.updatedAt == null) return { text: "A lista de grupos aparece alguns segundos depois que o WhatsApp conecta", warn: null };
  const on = rows.filter((r) => isWaGroup(r) && r.listening).length;
  const n = info.count;
  return { text: `${n === 1 ? "1 grupo" : `${n} grupos`} no WhatsApp · ${on === 1 ? "1 escutado" : `${on} escutados`} · atualizado ${agoLabel(info.updatedAt, now)}`, warn: null };
}

// ---- janela de análise ----

export const WINDOW_LIMITS = { silence: [1, 60], max: [5, 240] } as const;

/** Mensagem de erro da janela (null = válida). */
export function windowError(w: { silenceMin: number; maxMin: number }): string | null {
  if (!Number.isInteger(w.silenceMin) || !Number.isInteger(w.maxMin)) return "Informe os minutos em números inteiros.";
  if (w.silenceMin < WINDOW_LIMITS.silence[0] || w.silenceMin > WINDOW_LIMITS.silence[1]) return "O silêncio vai de 1 a 60 minutos.";
  if (w.maxMin < WINDOW_LIMITS.max[0] || w.maxMin > WINDOW_LIMITS.max[1]) return "O máximo vai de 5 a 240 minutos.";
  if (w.maxMin <= w.silenceMin) return "O máximo precisa ser maior que o silêncio.";
  return null;
}

export const windowSentence = (w: { silenceMin: number; maxMin: number }) => `Analisar quando o grupo ficar ${w.silenceMin} min em silêncio, ou no máximo a cada ${w.maxMin} min.`;

const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Exemplo com horários (a partir das 10:00) para o diálogo do padrão. */
export function windowExample(w: { silenceMin: number; maxMin: number }): string {
  const start = 10 * 60;
  return `Se a conversa para às ${hhmm(start)}, o Hermes analisa às ${hhmm(start + w.silenceMin)}. Se ela não para, analisa às ${hhmm(start + w.maxMin)}.`;
}

/** Como o canal vai ser analisado, em uma linha (para a gaveta). */
export function windowAppliesNote(mode: AutonomyMode): string | null {
  if (mode === 0) return "O Observar só guarda as mensagens, não analisa. A janela não se aplica.";
  if (mode === 2) return "No Autônomo o Hermes lê cada mensagem na hora. A janela não se aplica.";
  return null;
}

const BRAND: Record<string, string> = { whatsapp: "WhatsApp", whatsapp_cloud: "WhatsApp Business", api_server: "API" };
export const platformLabel = (p: string) => BRAND[p] ?? (p ? p[0].toUpperCase() + p.slice(1) : p);
