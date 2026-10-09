// Saúde (A7): lógica pura da tela (ordenação, grupos, cores das barras, durações). Sem React, sem rede.
import type { Check, GroupKey, Incident, Metrics, Status, TimelineResult } from "./api";

// ---- status ----

export const STATUS: Record<Status, { color: string; label: string }> = {
  ok: { color: "var(--ok)", label: "Normal" },
  warn: { color: "var(--warn)", label: "Atenção" },
  error: { color: "var(--err)", label: "Com problema" },
  pending: { color: "var(--fg3)", label: "Aguardando a primeira execução" },
  paused: { color: "var(--fg3)", label: "Pausada" },
};

const RANK: Record<Status, number> = { error: 0, warn: 1, pending: 2, ok: 3, paused: 4 };

/** Problemas primeiro (erro, atenção, aguardando, ok); dentro de cada nível, a ordem que veio (já por grupo e nome). */
export function sortChecks<T extends Pick<Check, "status">>(rows: T[]): T[] {
  return rows.map((r, i) => [r, i] as const).sort((a, b) => RANK[a[0].status] - RANK[b[0].status] || a[1] - b[1]).map(([r]) => r);
}

/** Pior status de um conjunto: erro > atenção > aguardando > ok. Vazio conta como ok. */
export function worstStatus(list: Status[]): Status {
  return list.reduce<Status>((w, s) => (RANK[s] < RANK[w] ? s : w), "ok");
}

// ---- grupos ----

export type GroupDef = { key: GroupKey; label: string; desc: string; icon: string; /** Quantas linhas mostrar antes de "Ver todos". */ limit?: number };

export const BOT_LIMIT = 6;

export const GROUPS: GroupDef[] = [
  { key: "servers", label: "Servidores", desc: "CPU, memória e disco das máquinas", icon: "server" },
  { key: "mongo", label: "Banco · MongoDB", desc: "Réplicas, velocidade e espaço", icon: "database" },
  { key: "whatsapp_bots", label: "Bots de WhatsApp", desc: "Um por cliente: conectado ou caído e a última mensagem", icon: "phone", limit: BOT_LIMIT },
  { key: "k8s", label: "Kubernetes", desc: "Pods (partes do sistema rodando) e reinícios", icon: "container" },
  { key: "dead_letters", label: "Filas de falha", desc: "Dead letters: o que não conseguiu ser entregue, volume e tendência", icon: "inbox" },
  { key: "services", label: "Microserviços", desc: "Cada serviço responde ao “você está bem?” (health)", icon: "network" },
];

export type Counts = { error: number; warn: number; pending: number; ok: number; paused: number };

export function countStatuses(rows: Pick<Check, "status">[]): Counts {
  const c: Counts = { error: 0, warn: 0, pending: 0, ok: 0, paused: 0 };
  for (const r of rows) c[r.status] += 1;
  return c;
}

export type Pill = { status: Status; label: string };

/** Pílulas do cabeçalho do grupo: só aparecem as que têm alguém; "ok" aparece sempre que houver. */
export function groupPills(c: Counts): Pill[] {
  const out: Pill[] = [];
  if (c.error) out.push({ status: "error", label: `${c.error} com problema` });
  if (c.warn) out.push({ status: "warn", label: `${c.warn} atenção` });
  if (c.pending) out.push({ status: "pending", label: `${c.pending} aguardando` });
  if (c.ok) out.push({ status: "ok", label: `${c.ok} ok` });
  if (c.paused) out.push({ status: "paused", label: `${c.paused} pausada${c.paused > 1 ? "s" : ""}` });
  return out;
}

/** "2 com problema · 1 em atenção · 40 normais" (ou só "43 normais"). */
export function checksSummary(c: Counts): string {
  return [c.error && `${c.error} com problema`, c.warn && `${c.warn} em atenção`, c.pending && `${c.pending} aguardando`, c.ok && `${c.ok} normais`, c.paused && `${c.paused} pausada${c.paused > 1 ? "s" : ""}`].filter(Boolean).join(" · ");
}

/** Borda do grupo pelo pior status: vermelho, âmbar ou a linha neutra. */
export function groupBorder(worst: Status): string {
  return worst === "error" ? "color-mix(in oklab,var(--err) 45%,transparent)" : worst === "warn" ? "color-mix(in oklab,var(--warn) 35%,transparent)" : "var(--line)";
}

/**
 * Linhas visíveis de um grupo com limite (bots): `limit` linhas, mas SEMPRE todas as que têm problema ou atenção.
 * `rows` já vem com os problemas primeiro. `toggle` diz se existe o botão "Ver todos / Mostrar menos".
 */
export function visibleRows<T extends Pick<Check, "status">>(rows: T[], limit: number | undefined, expanded: boolean): { shown: T[]; hidden: number; toggle: boolean } {
  if (!limit) return { shown: rows, hidden: 0, toggle: false };
  const problems = rows.filter((r) => r.status === "error" || r.status === "warn").length;
  const cut = Math.max(limit, problems);
  const hidden = Math.max(0, rows.length - cut);
  return { shown: expanded ? rows : rows.slice(0, cut), hidden, toggle: hidden > 0 };
}

// ---- medidores (CPU / memória / disco) ----

export type MeterTone = "ok" | "warn" | "error";

/** ≥ 90 vermelho, ≥ 80 âmbar, abaixo disso neutro. */
export function meterTone(v: number): MeterTone {
  return v >= 90 ? "error" : v >= 80 ? "warn" : "ok";
}

export const METER_COLOR: Record<MeterTone, string> = { ok: "var(--fg3)", warn: "var(--warn)", error: "var(--err)" };

export type Meter = { label: string; value: number; tone: MeterTone };

/** Mini barras de uma verificação de servidor; sem `metrics` (ou sem nenhum número) volta vazio e a linha mostra o texto. */
export function meters(m: Metrics | undefined): Meter[] {
  const out: Meter[] = [];
  if (!m) return out;
  for (const [label, v] of [["CPU", m.cpu], ["Memória", m.ram], ["Disco", m.disk]] as [string, number | undefined][]) {
    if (typeof v === "number" && Number.isFinite(v)) out.push({ label, value: Math.max(0, Math.min(100, v)), tone: meterTone(v) });
  }
  return out;
}

// ---- tempo ----

export const nowSec = () => Date.now() / 1000;

/** "14 min", "2 h 15 min", "3 d 4 h". Abaixo de 1 min: "menos de 1 min". */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return "menos de 1 min";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

/** "a cada 1 min", "a cada 1 hora"… para os intervalos aceitos; qualquer outro valor vira segundos/minutos. */
export function freqLabel(sec: number): string {
  if (sec % 86400 === 0) return `a cada ${sec / 86400} ${sec === 86400 ? "dia" : "dias"}`;
  if (sec % 3600 === 0) return `a cada ${sec / 3600} ${sec === 3600 ? "hora" : "horas"}`;
  if (sec % 60 === 0) return `a cada ${sec / 60} min`;
  return `a cada ${sec} s`;
}

/** "agora", "há 20 s", "há 5 min", "há 3 h", "há 2 d". */
export function agoLabel(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s < 5) return "agora";
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}

const two = (n: number) => String(n).padStart(2, "0");
export const clock = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
};

/** Quantos dias de calendário separam `ts` de `now` (0 = hoje, 1 = ontem). */
function dayGap(ts: number, now: number): number {
  const a = new Date(ts * 1000);
  const b = new Date(now * 1000);
  return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 86400000);
}

/** "09:28" (hoje), "ontem 22:10" ou "05/10 22:10". */
export function sinceLabel(ts: number, now: number): string {
  const gap = dayGap(ts, now);
  if (gap <= 0) return clock(ts);
  if (gap === 1) return `ontem ${clock(ts)}`;
  const d = new Date(ts * 1000);
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${clock(ts)}`;
}

/** "hoje às 09:28", "ontem às 18:20" ou "05/10 às 18:20". */
export function whenLabel(ts: number, now: number): string {
  const gap = dayGap(ts, now);
  const hm = clock(ts);
  if (gap <= 0) return `hoje às ${hm}`;
  if (gap === 1) return `ontem às ${hm}`;
  const d = new Date(ts * 1000);
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} às ${hm}`;
}

/** "99,98%". */
export const pct = (v: number) => `${v.toFixed(2).replace(".", ",")}%`;

// ---- sparkline 100×24 ----

/** Pontos do polyline. Menos de 2 valores: `null` (a linha mostra "sem histórico ainda"). Série constante fica no meio. */
export function sparkPoints(values: number[]): string | null {
  if (values.length < 2) return null;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const r = mx - mn;
  return values.map((v, i) => `${((i / (values.length - 1)) * 98 + 1).toFixed(1)},${(r === 0 ? 12 : 22 - ((v - mn) / r) * 20).toFixed(1)}`).join(" ");
}

// ---- incidentes ----

export const TIMELINE: Record<TimelineResult, { icon: string; color: string; label: string }> = {
  problem: { icon: "circle-x", color: "var(--err)", label: "Achou problema" },
  signal: { icon: "trending-up", color: "var(--warn)", label: "Sinal suspeito" },
  ruled_out: { icon: "circle-check", color: "var(--ok)", label: "Descartado" },
  info: { icon: "info", color: "var(--fg3)", label: "Informação" },
};

/** O herói é o crítico aberto mais antigo (a API já manda críticos primeiro, mais antigos primeiro; reforça aqui). */
export function heroIncident(list: Incident[]): Incident | null {
  return list.filter((i) => i.severity === "critical" && i.status === "open").sort((a, b) => a.startedAt - b.startedAt)[0] ?? null;
}

/** Contagem para o badge da Sidebar: críticos abertos (vermelho) ou, se só há atenção, os abertos (âmbar). */
export function badgeOf(list: Pick<Incident, "severity" | "status">[]): { critical: number; open: number } {
  const open = list.filter((i) => i.status === "open");
  return { critical: open.filter((i) => i.severity === "critical").length, open: open.length };
}

/** Texto e cor do badge de Saúde na Sidebar: críticos abertos em vermelho; só atenção, os abertos em âmbar. */
export function healthCount(b: { critical: number; open: number }): { text: string; tone: "hl-crit" | "hl-warn" | "" } {
  return b.critical > 0 ? { text: String(b.critical), tone: "hl-crit" } : b.open > 0 ? { text: String(b.open), tone: "hl-warn" } : { text: "", tone: "" };
}

export type FixState =
  | { kind: "none" }
  | { kind: "ready" }
  | { kind: "pending"; target: string; minutesLeft: number | null; expiresAt: number | null }
  | { kind: "approved"; by: string | null; result: string | null }
  | { kind: "denied"; by: string | null }
  | { kind: "expired" }
  | { kind: "blocked" };

/** "Telegram · tópico 12" a partir de `telegram:<chat>[:<tópico>]`; o ID do chat não aparece. */
export function targetLabel(target: string | null): string {
  if (!target) return "Telegram";
  const [platform, , thread] = target.split(":");
  const name = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : "Telegram";
  return thread ? `${name} · tópico ${thread}` : name;
}

/** Em que pé está a correção sugerida: sem sugestão, pronta, aguardando aprovação, aprovada, negada ou vencida. */
export function fixState(inc: Pick<Incident, "suggestedAction" | "approval">, now: number): FixState {
  if (!inc.suggestedAction) return { kind: "none" };
  const a = inc.approval;
  if (!a) return { kind: "ready" };
  switch (a.status) {
    case "pending":
      return { kind: "pending", target: a.targetLabel || targetLabel(a.target), expiresAt: a.expiresAt, minutesLeft: a.expiresAt ? Math.max(0, Math.ceil((a.expiresAt - now) / 60)) : null };
    case "approved":
      return { kind: "approved", by: a.decidedBy, result: a.result };
    case "denied":
      return { kind: "denied", by: a.decidedBy };
    case "expired":
      return { kind: "expired" };
    case "blocked":
      return { kind: "blocked" };
    default:
      return { kind: "ready" };
  }
}

// ---- conexões ----

/** Uma chave SSH só, para todos os servidores, guardada em Chaves com este nome. */
export const SSH_KEY_ENV = "HEALTH_SSH_KEY";

/** Nome do servidor como o backend grava (minúsculas, letras, números e hífen). */
export const serverSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9-]/g, "");

// ---- resultado de "Rodar agora" ----

/** Toast honesto depois de rodar uma verificação: o que o servidor devolveu, nada inventado. */
export function runToast(prev: Pick<Check, "status" | "name">, next: Pick<Check, "status" | "name" | "result">, hasOpenIncident: boolean): { text: string; sub: string } {
  const out = next.result.text ?? "";
  if (prev.status === "pending") return { text: "Primeira execução feita", sub: out || "O Hermes segue checando na frequência escolhida." };
  if (next.status === "error") {
    return prev.status === "error"
      ? { text: `${next.name}: continua com problema`, sub: `${out} ${hasOpenIncident ? "O incidente segue aberto." : "Se continuar assim, o Hermes abre um incidente."}`.trim() }
      : { text: `${next.name}: deu problema agora`, sub: `${out} O Hermes abre um incidente se o erro se repetir.`.trim() };
  }
  if (next.status === "warn") return { text: `${next.name}: em atenção`, sub: out };
  return prev.status === "ok" ? { text: `${next.name}: ok`, sub: out || "Rodei agora, sem mudança." } : { text: `${next.name}: voltou ao normal`, sub: `${out} ${hasOpenIncident ? "O incidente fechou sozinho." : ""}`.trim() };
}
