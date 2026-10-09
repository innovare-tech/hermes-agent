// O backend não guarda no histórico os cartões de comando "/", o "Pensamento" (quando ele não vem), os tokens do
// rodapé nem se o turno foi interrompido ou falhou. Guardamos isso aqui, por sessão, no localStorage (melhor esforço)
// e devolvemos à tela ao recarregar. Âncora: o `rowId` da pergunta do usuário (-1 = antes de qualquer pergunta).
import { isFailedTurnText } from "./errors";
import { baseName, parseAttachRefs } from "./attachments";
import type { AgentMessage, ChatError, ChatMessage, CommandCard } from "./types";

export type TurnExtra = { n: number; r?: string; ms?: number; tok?: number; cost?: number; st?: "i" | ChatError };
export type CardExtra = { n: number; after: number; cmd: string; card: CommandCard };
/** `names`: nome original do anexo por nome do arquivo no servidor (o texto recarregado só traz o caminho do servidor). */
export type Extras = { cards: CardExtra[]; turns: Record<string, TurnExtra>; names?: Record<string, string> };

export const MAX_ENTRIES = 50;
export const MAX_BYTES = 200_000;
const MAX_THINK = 20_000;
const MAX_SESSIONS = 40;
const MAX_NAMES = 100;
const KEY = "hermes.aurora.chat.";

const slimCard = (c: CommandCard): CommandCard => (c.raw && c.raw.length > 4000 ? { ...c, raw: c.raw.slice(0, 4000) } : c);

/** O que vale guardar das mensagens que estão na tela. */
export function extrasOf(messages: ChatMessage[]): Extras {
  const ex: Extras = { cards: [], turns: {} };
  let anchor: number | null = -1;
  messages.forEach((m, n) => {
    if (m.role === "user") {
      anchor = m.rowId ?? null;
      for (const att of m.attachments ?? []) for (const p of att.paths ?? []) if (baseName(p) !== att.name) (ex.names ??= {})[baseName(p)] = att.name;
    } else if (m.role === "system") {
      if (!m.pending && m.card && anchor != null) ex.cards.push({ n, after: anchor, cmd: m.cmd, card: slimCard(m.card) });
    } else if (!m.live && anchor != null && anchor >= 0 && !ex.turns[anchor]) {
      const t: TurnExtra = { n };
      if (m.reasoning) t.r = m.reasoning.slice(0, MAX_THINK);
      if (m.thinkMs != null) t.ms = m.thinkMs;
      if (m.stat?.tokens) t.tok = m.stat.tokens;
      if (m.stat?.cost != null) t.cost = m.stat.cost;
      if (m.error) t.st = { ...m.error, detail: m.error.detail.slice(0, 2000) };
      else if (m.interrupted) t.st = "i";
      if (Object.keys(t).length > 1) ex.turns[anchor] = t;
    }
  });
  return ex;
}

/** Só as últimas `MAX_ENTRIES` entradas e no máximo `MAX_BYTES` (descarta as mais antigas primeiro). */
export function limitExtras(ex: Extras, maxEntries = MAX_ENTRIES, maxBytes = MAX_BYTES): Extras {
  type Ent = { n: number; c?: CardExtra; k?: string; t?: TurnExtra };
  const all: Ent[] = [...ex.cards.map((c): Ent => ({ n: c.n, c })), ...Object.entries(ex.turns).map(([k, t]): Ent => ({ n: t.n, k, t }))].sort((a, b) => b.n - a.n).slice(0, maxEntries);
  const build = (list: Ent[]): Extras => ({ cards: list.flatMap((e) => (e.c ? [e.c] : [])).sort((a, b) => a.n - b.n), turns: Object.fromEntries(list.flatMap((e) => (e.t ? [[e.k!, e.t]] : []))) });
  const names = ex.names ? Object.fromEntries(Object.entries(ex.names).slice(-MAX_NAMES)) : undefined;
  let out = { ...build(all), ...(names && Object.keys(names).length ? { names } : {}) };
  while (all.length && JSON.stringify(out).length > maxBytes) {
    all.pop();
    out = { ...build(all), ...(out.names ? { names: out.names } : {}) };
  }
  return out;
}

/** Devolve às mensagens do histórico o que o backend não guardou. O que veio do backend (pensamento) tem prioridade. */
export function applyExtras(messages: ChatMessage[], ex: Extras | null): ChatMessage[] {
  if (!ex || (!ex.cards.length && !Object.keys(ex.turns).length && !ex.names)) return messages;
  const out: ChatMessage[] = [];
  const flush = (after: number | null) => {
    if (after == null) return;
    for (const c of ex.cards) if (c.after === after) out.push({ id: `cx${c.n}-${after}`, role: "system", cmd: c.cmd, card: c.card });
  };
  let anchor: number | null = -1;
  let seen = false;
  flush(-1);
  for (const m of messages) {
    if (m.role === "user") {
      if (anchor !== -1) flush(anchor);
      anchor = m.rowId ?? null;
      seen = false;
      const chips = ex.names && !m.attachments?.length ? parseAttachRefs(m.text, ex.names).attachments : [];
      out.push(chips.length ? { ...m, attachments: chips } : m);
    } else if (m.role === "agent" && !seen && anchor != null) {
      seen = true;
      out.push(withTurn(m, ex.turns[anchor]));
    } else out.push(m);
  }
  if (anchor !== -1) flush(anchor);
  return out;
}

function withTurn(m: AgentMessage, t?: TurnExtra): AgentMessage {
  if (!t) return m;
  const a = { ...m };
  if (!a.reasoning && t.r) a.reasoning = t.r;
  a.thinkMs ??= t.ms;
  if (a.stat && (t.tok || t.cost != null)) a.stat = { ...a.stat, tokens: a.stat.tokens ?? t.tok, cost: a.stat.cost ?? t.cost };
  // Turno sem resposta: o histórico só tem o aviso em inglês — volta o estado de antes (interrompido ou erro do provedor).
  if (t.st && (!a.error || isFailedTurnText(a.error.detail))) {
    if (t.st === "i") Object.assign(a, { error: undefined, interrupted: true }); // com texto parcial também
    else if (!a.text) Object.assign(a, { error: t.st, interrupted: false });
  }
  return a;
}

const store = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export function loadExtras(sid: string): Extras | null {
  try {
    const j = JSON.parse(store()?.getItem(KEY + sid) ?? "null") as Extras | null;
    return j && Array.isArray(j.cards) && j.turns && typeof j.turns === "object" ? j : null;
  } catch {
    return null;
  }
}

export function saveExtras(sid: string, messages: ChatMessage[]) {
  const s = store();
  if (!s) return;
  try {
    const fresh = extrasOf(messages);
    const names = { ...loadExtras(sid)?.names, ...fresh.names };
    const ex = limitExtras({ ...fresh, ...(Object.keys(names).length ? { names } : {}) });
    if (!ex.cards.length && !Object.keys(ex.turns).length && !ex.names) return void s.removeItem(KEY + sid);
    s.setItem(KEY + sid, JSON.stringify(ex));
    // Só as últimas MAX_SESSIONS sessões ficam guardadas.
    const idx = (JSON.parse(s.getItem(KEY + "index") ?? "[]") as string[]).filter((x) => x !== sid);
    idx.push(sid);
    for (const old of idx.splice(0, Math.max(0, idx.length - MAX_SESSIONS))) s.removeItem(KEY + old);
    s.setItem(KEY + "index", JSON.stringify(idx));
  } catch {
    // sem storage / cota cheia: o recarregar só perde esses extras
  }
}
