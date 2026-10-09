// Lógica pura da tela Clientes do Copiloto: ordem, cor do avatar, faixa da barra de créditos, rótulos, paginação e diff de plano.
import { agoLabel, clock, dayGap, plural, whenLabel } from "../health/model";
import type { AuditItem, CatalogTool, Client, ClientDetail, Counts, Plan, Status, Usage } from "./api";

export { plural };

// ---- status e plano ----

export const STATUS: Record<Status, { label: string; color: string }> = {
  active: { label: "Ativo", color: "var(--ok)" },
  no_credit: { label: "Sem saldo", color: "var(--warn)" },
  revoked: { label: "Revogado", color: "var(--fg3)" },
};

export const STATUS_FILTERS: { key: "" | Status; label: string }[] = [
  { key: "", label: "Todos" },
  { key: "active", label: "Ativos" },
  { key: "no_credit", label: "Sem saldo" },
  { key: "revoked", label: "Revogados" },
];

export const PLANS: Plan[] = ["starter", "pro"];

/** "Starter" / "Pro": o rótulo do backend (`planLabels`) ou o id com a inicial maiúscula. */
export const planName = (p: Plan | string, labels?: Record<string, string>) => labels?.[p] ?? p.charAt(0).toUpperCase() + p.slice(1);

/** Contagem do chip: "Todos" usa `all`; o resto, o status. */
export const countOf = (c: Counts | null | undefined, key: "" | Status): number => (c ? (key === "" ? c.all : c[key]) : 0);

// ---- avatar ----

const PALETTE = ["#ff9f7a", "#7cb8ff", "#5ee0c0", "#a395ff", "#f5c26b", "#f48fd0", "#c2e66b", "#62d6f0"];

/** Cor estável por id: a mesma soma dos códigos de sempre, então o cliente nunca troca de cor. */
export function avatarColor(id: string): string {
  let sum = 0;
  for (const ch of id) sum += ch.charCodeAt(0);
  return PALETTE[sum % PALETTE.length];
}

export const initial = (name: string) => (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase();

// ---- ordem e cliente novo ----

const RANK: Record<Status, number> = { no_credit: 1, active: 2, revoked: 3 };
const WEEK = 7 * 86400;

/** O backend marca `isNew` na lista; o detalhe não traz, então vale a mesma regra: ativo, sem uso, criado há menos de 7 dias. */
export function isNewClient(c: Pick<Client, "status" | "lastActivityAt" | "createdAt"> & { isNew?: boolean }, now: number): boolean {
  return c.isNew ?? (c.status === "active" && !c.lastActivityAt && now - c.createdAt < WEEK);
}

/** Novos, sem saldo, ativos, revogados; dentro de cada grupo, o mais recente primeiro. Não altera a entrada. */
export function sortClients<T extends Pick<Client, "status" | "lastActivityAt" | "createdAt"> & { isNew?: boolean }>(items: T[], now: number): T[] {
  const key = (c: T) => (isNewClient(c, now) ? 0 : RANK[c.status]);
  return items
    .map((c, i) => ({ c, i }))
    .sort((a, b) => key(a.c) - key(b.c) || (b.c.lastActivityAt ?? b.c.createdAt) - (a.c.lastActivityAt ?? a.c.createdAt) || a.i - b.i)
    .map((x) => x.c);
}

/** Junta a página nova ao fim da lista, sem repetir quem já estava (a lista pode ter mudado entre as páginas). */
export function mergeClients(prev: Client[], next: Client[]): Client[] {
  const seen = new Set(prev.map((c) => c.systemClientId));
  return [...prev, ...next.filter((c) => !seen.has(c.systemClientId))];
}

/** Troca o item de mesmo id pelos dados novos (o detalhe é um superconjunto do item da lista). */
export function replaceClient(list: Client[], next: Client): Client[] {
  return list.map((c) => (c.systemClientId === next.systemClientId ? { ...c, ...next, isNew: c.isNew && next.status === "active" ? c.isNew : undefined } : c));
}

export const pageLabel = (shown: number, total: number, more: boolean) => (more ? `Mostrando ${shown} de ${total} · carregar mais` : plural(total, "cliente", "clientes"));

/** Gasto do cabeçalho: o backend soma só os itens filtrados, então o número "do mês" vem da última lista sem filtro. */
export function kpiRow(counts: Counts | null, spendUsd: number | null): { active: number; noCredit: number; spendUsd: number | null } {
  return { active: counts?.active ?? 0, noCredit: counts?.no_credit ?? 0, spendUsd };
}

// ---- números e tempo ----

export const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-BR");
export const fmtUsd = (n: number | null | undefined) => (n == null ? "—" : "US$ " + n.toFixed(2).replace(".", ","));

/** 1.800 → "1,8 mil"; 5.900.000 → "5,9 mi". */
export function fmtTokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(".", ",")} mil`;
  return `${(n / 1_000_000).toFixed(1).replace(".", ",")} mi`;
}

const two = (n: number) => String(n).padStart(2, "0");
const dm = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}`;
};

/** "há 2 min" / "nunca usou". */
export const lastLabel = (ts: number | null, now: number) => (ts ? agoLabel(now - ts) : "nunca usou");

/** Linha da lista: o que o cliente fez por último (ou quando foi revogado). */
export const rowLast = (c: Pick<Client, "lastActivityAt" | "revoked" | "status">, now: number) =>
  c.status === "revoked" && c.revoked ? `revogado em ${dm(c.revoked.at)}` : lastLabel(c.lastActivityAt, now);

/** KPI "Última atividade": "2 min" + "atrás"; sem uso, "—" + "nunca usou". */
export function lastParts(ts: number | null, now: number): { v: string; s: string } {
  if (!ts) return { v: "—", s: "nunca usou" };
  const l = agoLabel(now - ts);
  return l === "agora" ? { v: "agora", s: " " } : { v: l.replace(/^há /, ""), s: "atrás" };
}

export const monthName = (now: number) => new Date(now * 1000).toLocaleDateString("pt-BR", { month: "long" });
/** "dia 1º de novembro". */
export const renewLabel = (now: number) => {
  const d = new Date(now * 1000);
  return `dia 1º de ${new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString("pt-BR", { month: "long" })}`;
};

/** "em 29 dias (08/11)"; passou do prazo: "na próxima limpeza". */
export function purgeLabel(purgeAt: number, now: number): string {
  const days = Math.ceil((purgeAt - now) / 86400);
  return days <= 0 ? "na próxima limpeza" : `em ${plural(days, "dia", "dias")} (${dm(purgeAt)})`;
}

/** Quem revogou: "painel" é a própria equipe, pela tela. */
export const byLabel = (by: string | null | undefined) => (!by || by === "painel" ? "a equipe, pelo painel" : by);

// ---- créditos ----

export type Band = { pct: number; tone: "ok" | "warn" | "err"; color: string };
const BAND_COLOR = { ok: "var(--acc)", warn: "var(--warn)", err: "var(--err)" } as const;

/** Barra de créditos do mês: âmbar a partir de 80%, vermelha ao zerar (100%). A porcentagem arredonda para baixo, então 79,9% nunca vira 80. */
export function creditBand(used: number, limit: number): Band {
  const ratio = limit > 0 ? used / limit : 0;
  const tone = ratio >= 1 ? "err" : ratio >= 0.8 ? "warn" : "ok";
  return { pct: Math.min(100, Math.floor(ratio * 100)), tone, color: BAND_COLOR[tone] };
}

export type DayBar = { day: string; label: string; title: string; credits: number };

/** Créditos por dia do mês, do dia 1 até o último dia com uso (ou hoje, no horário de Brasília). Dia sem uso é 0, não buraco. */
export function dayBars(daily: Usage["daily"], now: number): DayBar[] {
  if (!daily.length) return [];
  const byDay = new Map(daily.map((d) => [d.day, d.credits ?? 0]));
  const today = new Date((now - 3 * 3600) * 1000).toISOString().slice(0, 10);
  const last = [daily[daily.length - 1].day, today].sort().pop()!;
  const [y, m] = daily[0].day.split("-").map(Number);
  const out: DayBar[] = [];
  for (let d = 1; d <= 31; d++) {
    const key = `${y}-${two(m)}-${two(d)}`;
    if (key > last) break;
    const credits = byDay.get(key) ?? 0;
    out.push({ day: key, label: two(d), title: `${two(d)}/${two(m)}: ${plural(credits, "crédito", "créditos")}`, credits });
  }
  return out;
}

export type ToolUse = { key: string; label: string; uses: number | null; credits: number; pct: number };

/** Linhas da tabela de consumo. Os créditos dos tokens entram como uma linha própria, então as partes fecham 100%. */
export function toolUsage(usage: Usage, catalog: Pick<CatalogTool, "key" | "label">[]): ToolUse[] {
  const rows = usage.byTool.map((t) => ({ key: t.key, label: catalog.find((c) => c.key === t.key)?.label ?? t.key, uses: t.uses as number | null, credits: t.credits ?? 0 }));
  if (usage.tokenCredits > 0) rows.push({ key: "_tokens", label: "Texto lido e escrito pela IA", uses: null, credits: usage.tokenCredits });
  const total = rows.reduce((a, r) => a + r.credits, 0);
  return rows.map((r) => ({ ...r, pct: total ? Math.round((r.credits / total) * 100) : 0 }));
}

// ---- plano ----

export type DiffRow = { kind: "in" | "out" | "credits"; label: string };

export const toolsOf = (catalog: CatalogTool[], plan: Plan) => catalog.filter((t) => t.plans.includes(plan));

/** O que muda ao trocar de plano: ferramentas que entram, as que saem e os créditos do mês. Mesmo plano: nada. */
export function planDiff(catalog: CatalogTool[], from: Plan, to: Plan, credits: Record<Plan, { credits: number }>): DiffRow[] {
  if (from === to) return [];
  const rows: DiffRow[] = [];
  for (const t of catalog) {
    const had = t.plans.includes(from);
    const has = t.plans.includes(to);
    if (has && !had) rows.push({ kind: "in", label: `Entra: ${t.label}` });
    if (had && !has) rows.push({ kind: "out", label: `Sai: ${t.label}` });
  }
  rows.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "in" ? -1 : 1));
  rows.push({ kind: "credits", label: `Créditos: ${fmtInt(credits[from].credits)} → ${fmtInt(credits[to].credits)} por mês` });
  return rows;
}

/** Plano acima do atual (para o atalho "Mudar para Pro"); `null` no último. */
export const nextPlan = (p: Plan): Plan | null => PLANS[PLANS.indexOf(p) + 1] ?? null;

// ---- revogar ----

export const canRevoke = (typed: string, sid: string) => typed.trim() === sid;

// ---- auditoria ----

export type AuditTone = "ok" | "err" | "warn";
export type AuditView = { tool: string; tone: AuditTone; icon: string; note: string; noteIcon: string; scope: boolean };

/** Como a linha da auditoria se apresenta: recusa de outro cliente em vermelho, consulta não permitida em âmbar. */
export function auditView(a: Pick<AuditItem, "result" | "toolLabel" | "ms" | "error">, sid: string): AuditView {
  switch (a.result) {
    case "blocked_scope":
      return { tool: "Recusado: outro cliente", tone: "err", icon: "shield-x", noteIcon: "shield-x", scope: true, note: "Recusado antes de consultar: o pedido citava outro cliente. Nada foi lido." };
    case "blocked_query":
      return { tool: "Consulta não permitida", tone: "warn", icon: "ban", noteIcon: "ban", scope: false, note: "Não executada: a consulta saía do que o Copiloto pode fazer (só leitura e só deste cliente)." };
    case "error":
      return { tool: a.toolLabel, tone: "warn", icon: "triangle-alert", noteIcon: "triangle-alert", scope: false, note: `A consulta deu erro${a.error ? `: ${a.error}` : "."}` };
    default:
      return { tool: a.toolLabel, tone: "ok", icon: "wrench", noteIcon: "shield-check", scope: false, note: `Só leitura · filtro systemClientId = "${sid}"${a.ms != null ? ` · ${a.ms} ms` : ""}` };
  }
}

/** A consulta feita, em texto: o que o MCP montou (JSON formatado) ou, sem isso, os argumentos da ferramenta. */
export function queryText(a: Pick<AuditItem, "query" | "args">): string {
  const v = a.query ?? a.args;
  if (v == null || v === "") return "Nenhuma consulta foi registrada.";
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

/** "Cláudio (dono) · Aibiz Manager". */
export const askedBy = (b: AuditItem["askedBy"]) => `${b.name}${b.role ? ` (${b.role})` : ""} · ${b.via}`;

export const auditDay = (ts: number, now: number) => {
  const g = dayGap(ts, now);
  return g <= 0 ? "Hoje" : g === 1 ? "Ontem" : dm(ts);
};
export { clock };

export const rowsLabel = (n: number | null) => (n == null ? "—" : String(n));

// ---- faixa de contexto do detalhe ----

export type Banner = { tone: "warn" | "muted" | "ok"; icon: string; text: string; action?: { label: string; plan: Plan } };

export function bannerOf(d: Pick<ClientDetail, "status" | "plan" | "revoked" | "lastActivityAt" | "createdAt"> & { isNew?: boolean }, now: number): Banner | null {
  if (d.status === "revoked" && d.revoked) {
    const why = d.revoked.reason ? ` (${d.revoked.reason})` : "";
    return {
      tone: "muted",
      icon: "ban",
      text: `Acesso revogado ${whenLabel(d.revoked.at, now)} por ${byLabel(d.revoked.by)}${why}. O gestor vê “Copiloto indisponível”. A memória do perfil é apagada ${purgeLabel(d.revoked.purgeAt, now)}.`,
    };
  }
  if (d.status === "no_credit") {
    const up = nextPlan(d.plan);
    return {
      tone: "warn",
      icon: "wallet",
      text: `Os créditos do mês acabaram. O Copiloto responde ao gestor que o saldo acabou e não consulta nada até renovar (${renewLabel(now)})${up ? " ou mudar de plano" : ""}.`,
      action: up ? { label: `Mudar para ${planName(up)}`, plan: up } : undefined,
    };
  }
  if (isNewClient(d, now)) return { tone: "ok", icon: "sparkles", text: "Cliente novo. Ainda não houve nenhuma pergunta: o gestor vê o Copiloto no Aibiz Manager a partir de agora." };
  return null;
}

// ---- adicionar cliente ----

/** As 5 etapas que o "Criar Copiloto" percorre (o backend faz tudo numa chamada; a tela só mostra o andamento). */
export const CREATE_STEPS = [
  "Criar o perfil",
  "Gerar a chave",
  "Prender a chave ao cliente",
  "Liberar as ferramentas do plano",
  "Conectar ao Aibiz Manager",
] as const;

/** Descrição de cada etapa na revisão. */
export function stepDetail(i: number, o: { profile: string; sid: string; plan: string; tools: number; credits: number }): string {
  return [
    o.profile,
    "mostrada uma vez no final",
    `systemClientId = "${o.sid}" em toda consulta · só leitura`,
    `${o.plan}: ${plural(o.tools, "ferramenta", "ferramentas")} · ${fmtInt(o.credits)} créditos por mês`,
    "cadastre a chave no Aibiz Manager para o gestor ver o Copiloto",
  ][i];
}

/** Id do perfil que o backend vai criar a partir do nome (mesma regra de `_slug`; só para a revisão: o definitivo vem na resposta). */
export const profilePreview = (name: string) =>
  "cli-" +
  (name
    .normalize("NFKD")
    .replace(/\P{ASCII}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24)
    .replace(/-$/, "") || "cliente");

/** Informação do cliente do banco no passo 1. */
export const directoryInfo = (c: { plan?: string | null; channelCount?: number }) =>
  [c.plan ? `${c.plan} do Aibiz` : "", typeof c.channelCount === "number" ? plural(c.channelCount, "canal", "canais") : ""].filter(Boolean).join(" · ") || "cliente do banco da Aibiz";
