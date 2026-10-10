import { useSyncExternalStore } from "react";
import { adapter, type Approval, type AutonomyMode, type BizId, type Channel, type InboxItem, type OnBehalf, type OpsSnapshot, type Person, type Playbook, type PlaybookDraft, type Session, type Ticket } from "./adapter";
import { chat } from "./chat";
import { permissionsApi, type ApprovalRow } from "./permissions/model";
import type { Profile, ProfileDialog } from "./profileLogic";

/** Aviso na tela; `action` desenha um botão (ex.: Desfazer) e dura mais. */

export type Direction = "aurora" | "ambar" | "sinal";
export type Theme = "dark" | "light";

export type State = Omit<OpsSnapshot, "account"> & {
  account: OpsSnapshot["account"] | null;
  /** Sessões recentes da sidebar — vêm do ChatAdapter (gateway real quando houver). */
  sessions: Session[];
  dir: Direction;
  theme: Theme;
  /** "all" ou o id do negócio — filtra todas as telas. */
  biz: string;
  /** Pedidos de ação (escrita) das Permissões que aguardam decisão; somam no contador de Aprovações. */
  actionRequests: ApprovalRow[];
  /** Último aviso (atalho para testes e leitores de tela). */
  toast: { text: string; id: number } | null;
  /** Avisos visíveis, empilhados no canto. `sub` = linha de apoio; `action` = botão (ex.: "Desfazer"). */
  toasts: { text: string; sub?: string; id: number; action?: { label: string; run: () => void } }[];
  /** Confirmação aberta (diálogo do Aurora, no lugar do window.confirm). */
  ask: AskRequest | null;
  /** Passo do assistente de setup (-1 = fechado). */
  onboarding: number;
  /** Perfis (Hermes isolados): lista do agregado /api/ops/profiles e o perfil que o painel mostra. */
  profiles: Profile[];
  profilesStatus: "loading" | "ready" | "error";
  /** Id do perfil atual ("" até a lista chegar). Tudo o que o painel lê vem dele. */
  profileId: string;
  /** Trocando de perfil: barra de 2px e esqueleto até os dados do novo perfil chegarem. */
  switching: boolean;
  /** Variáveis das chaves salvas (ex.: OPENROUTER_API_KEY); o rodapé da barra lateral dá nome e descrição em pt-BR. */
  keys: string[];
  /** Diálogo de perfil aberto (criar/clonar, editar, apagar). */
  profileDialog: ProfileDialog | null;
  /** Assistente curto de configuração de um perfil novo. */
  wizard: boolean;
};

const PREFS_KEY = "hermes.aurora";

function readPrefs(): Partial<Pick<State, "dir" | "theme">> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

let state: State = {
  dir: "aurora",
  theme: "dark",
  ...readPrefs(),
  biz: "all",
  actionRequests: [],
  toast: null,
  toasts: [],
  ask: null,
  onboarding: -1,
  profiles: [],
  profilesStatus: "loading",
  profileId: "",
  switching: false,
  keys: [],
  profileDialog: null,
  wizard: false,
  paused: false,
  account: null,
  businesses: [],
  sessions: [],
  inbox: [],
  approvals: [],
  radar: [],
  tickets: [],
  activity: [],
  autonomy: [],
  briefing: [],
  last24h: { saved: "", autoReplies: 0 },
  health: { online: false, level: "ok", problems: [], uptime: "", items: [], responseTime: "" },
  costs: { month: "", total: 0, limit: null, projection: null, byBusiness: [] },
  watches: [],
  support: { firstResponse: "", resolvedByHermes: "", csat: "", kbUsage: "" },
  kb: [],
  people: [],
  playbooks: [],
  defaultMode: 1,
};

const subs = new Set<() => void>();

export const getState = () => state;

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  subs.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

/** O seletor deve devolver um valor já existente na store (nada de objetos novos). */
export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

/** Filtro de negócio: itens sem negócio ("") aparecem em todos. */
export const inBiz = (s: State) => (x: { business: string }) =>
  s.biz === "all" || x.business === s.biz || x.business === "" || x.business === "all";

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Dados da Central de um perfil que ainda não carregou: o que a troca de perfil zera para não mostrar o anterior. */
export const EMPTY_OPS: Partial<State> = {
  account: null,
  businesses: [],
  inbox: [],
  approvals: [],
  actionRequests: [],
  radar: [],
  tickets: [],
  activity: [],
  autonomy: [],
  briefing: [],
  last24h: { saved: "", autoReplies: 0 },
  health: { online: false, level: "ok", problems: [], uptime: "", items: [], responseTime: "" },
  costs: { month: "", total: 0, limit: null, projection: null, byBusiness: [] },
  watches: [],
  support: { firstResponse: "", resolvedByHermes: "", csat: "", kbUsage: "" },
  kb: [],
  people: [],
  playbooks: [],
  defaultMode: 1,
  sessions: [],
  biz: "all",
};

// Resposta de um perfil que já não é o atual (troca no meio do carregamento) é descartada: nunca mistura perfis.
// Na Conversa e em Sessões só a barra lateral precisa dos dados da Central: lê o mínimo (loadLean) e deixa
// o resto para quando abrir uma tela que usa. Chamadas juntas (entrada no perfil + início do app) viram uma só.
let lean = false;
let fullFor = "";
let leanFor = "";
let flight: { pid: string; full: boolean; p: Promise<void> } | null = null;
export const setOpsLean = (v: boolean) => void (lean = v);

export function loadOps(): Promise<void> {
  const pid = state.profileId;
  if (fullFor && fullFor !== pid) fullFor = "";
  if (leanFor && leanFor !== pid) leanFor = "";
  if (flight && flight.pid === pid && (flight.full || lean)) return flight.p;
  const full = !lean;
  const p = (async () => {
    const snap = full ? await adapter.load() : await adapter.loadLean();
    if (state.profileId === pid) {
      setState(snap);
      if (full) fullFor = pid;
      else leanFor = pid;
    }
  })().finally(() => {
    if (flight?.p === p) flight = null;
  });
  flight = { pid, full, p };
  refreshActionRequests();
  return p;
}

/** Entrada do app: o perfil já carregou os dados ao ser adotado? Então não lê de novo. */
export const loadOpsOnce = () => (fullFor === state.profileId || (lean && leanFor === state.profileId) ? Promise.resolve() : loadOps());

/** Ao sair da Conversa para uma tela de operação: completa o que a leitura enxuta deixou de fora. */
export const ensureFullOps = () => (fullFor === state.profileId ? Promise.resolve() : (setOpsLean(false), loadOps()));

/** Pedidos de ação pendentes (Permissões). Falha em silêncio: o contador só some até a próxima leitura. */
export async function refreshActionRequests() {
  const pid = state.profileId;
  try {
    const actionRequests = await permissionsApi.pending();
    if (state.profileId === pid) setState({ actionRequests });
  } catch {
    /* mantém o que já está na tela */
  }
}

export async function loadSessions() {
  const pid = state.profileId;
  const sessions = await chat.sessions();
  if (state.profileId === pid) setState({ sessions });
}

/** Decide um pedido de ação pelo painel. Conflito (já decidido no Telegram, expirou…) mostra o motivo do servidor. */
export async function decideActionRequest(r: ApprovalRow, approve: boolean): Promise<boolean> {
  try {
    await permissionsApi.decide(r.id, approve);
    setState((s) => ({ actionRequests: s.actionRequests.filter((x) => x.id !== r.id) }));
    toast(approve ? "Pedido aprovado" : "Pedido negado", approve ? "O Hermes executa agora; o resultado aparece no histórico de Permissões." : "O Hermes avisa quem pediu que não vai executar.");
    return true;
  } catch (e) {
    toast(errMsg(e, "Não consegui registrar a decisão"));
    refreshActionRequests(); // pode ter sido decidido em outro lugar: mostra o estado de verdade
    return false;
  }
}

let toastSeq = 0;

export type AskOptions = { title: string; body?: string; confirm: string; danger?: boolean };
type AskRequest = AskOptions & { resolve: (ok: boolean) => void };

/** Confirmação no estilo do Aurora: ``if (await ask({...}))``. Esc/Cancelar = false. */
export function ask(opts: AskOptions): Promise<boolean> {
  state.ask?.resolve(false);
  return new Promise((resolve) => setState({ ask: { ...opts, resolve } }));
}

export function answerAsk(ok: boolean) {
  const a = state.ask;
  setState({ ask: null });
  a?.resolve(ok);
}

export function dismissToast(id: number) {
  setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id), toast: s.toast?.id === id ? null : s.toast }));
}

export type ToastAction = { label: string; run: () => void };
export type ToastOpts = { sub?: string; undo?: () => void; action?: ToastAction; ms?: number };

/** ``toast(texto)``, ``toast(texto, linhaDeApoio, ms?)`` ou ``toast(texto, {sub, undo, action, ms})``.
 *  Com botão (``undo``/``action``) o aviso fica 6 s; senão 3,6 s. Máximo 3 na tela. */
export function toast(text: string, opts?: string | ToastOpts | ToastAction, legacyMs?: number) {
  const o: ToastOpts = typeof opts === "string" ? { sub: opts, ms: legacyMs }
    : opts && "run" in opts ? { action: opts } : { ...(opts ?? {}) };
  const action = o.action ?? (o.undo ? { label: "Desfazer", run: o.undo } : undefined);
  const t = { text, sub: o.sub, id: ++toastSeq, action };
  // Máximo 3 na tela; cada um some sozinho (ou no X).
  setState((s) => ({ toast: t, toasts: [...s.toasts.filter((x) => x.text !== text), t].slice(-3) }));
  setTimeout(() => dismissToast(t.id), o.ms ?? (action ? 6000 : 3600));
}

export function setPrefs(p: Partial<Pick<State, "dir" | "theme">>) {
  setState(p);
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ dir: state.dir, theme: state.theme }));
  } catch {
    // preferência só deste navegador; sem storage segue com o padrão
  }
}

/** Sincroniza com pausas feitas por fora (CLI `hermes pause`, outro navegador). */
export async function refreshPaused() {
  const paused = await adapter.getPaused();
  if (paused !== state.paused) setState({ paused });
}

export async function togglePause() {
  const paused = !state.paused;
  try {
    await adapter.setPaused(paused);
  } catch {
    toast("Não consegui falar com o agente — nada mudou");
    return;
  }
  setState({ paused });
  toast(paused ? "Tudo pausado — nada sai em seu nome" : "Agente retomado");
}

/**
 * Única porta para ações que saem em nome do usuário (enviar, aprovar, executar, pagar).
 * Respeita o kill switch, registra na Atividade e avisa com toast.
 */
export async function actOnBehalf(a: OnBehalf): Promise<boolean> {
  if (state.paused) {
    toast(a.blocked ?? "Agente pausado — retome para executar");
    return false;
  }
  try {
    const entry = await adapter.perform(a);
    setState((s) => ({ activity: [entry, ...s.activity] }));
  } catch (e) {
    toast(errMsg(e, "Falhou — nada foi enviado"));
    return false;
  }
  toast(a.done);
  return true;
}

// ---- Caixa de entrada · Aprovações · Autonomia ----

export const MODES = ["Observar", "Rascunhar", "Autônomo", "Escutar"] as const;

const quote = (t: string) => "“" + t.slice(0, 70) + (t.length > 70 ? "…" : "") + "”";

export async function replyInbox(x: InboxItem, text: string) {
  const ok = await actOnBehalf({
    business: x.business,
    kind: "msg",
    action: `Respondeu ${x.from} via ${x.channel}: ${quote(text)}`,
    why: "aprovado por você na caixa de entrada.",
    done: `Enviado para ${x.from.split(" ")[0]} · ${x.channel}`,
    blocked: "Agente pausado — retome para enviar",
    target: { kind: "reply", id: x.id, text },
  });
  if (ok) setState((s) => ({ inbox: s.inbox.filter((y) => y.id !== x.id) }));
}

export async function archiveInbox(id: string) {
  await adapter.archive(id).catch(() => {});
  setState((s) => ({ inbox: s.inbox.filter((y) => y.id !== id) }));
  toast("Arquivado");
}

export async function keepInbox(id: string) {
  try {
    await adapter.keep(id);
  } catch (e) {
    return toast(errMsg(e, "Não consegui atualizar"));
  }
  setState((s) => ({ inbox: s.inbox.map((y) => (y.id === id ? { ...y, priority: "voce" as const } : y)) }));
  toast("Ok, esse fica com você");
}

export async function approve(x: Approval) {
  // Rascunho da caixa de entrada: aprovar = enviar a resposta.
  if (x.inboxId) {
    const item = state.inbox.find((i) => i.id === x.inboxId);
    if (item) await replyInbox(item, x.preview);
    setState((s) => ({ approvals: s.approvals.filter((y) => y.id !== x.id) }));
    return;
  }
  const ok = await actOnBehalf({
    business: x.business,
    kind: x.kind === "pagamento" || x.kind === "reembolso" ? "pay" : x.kind === "mensagem" ? "msg" : "cmd",
    action: x.title,
    why: "aprovado por você. " + x.why,
    reversible: false,
    done: "Aprovado · executando",
    target: { kind: "approval", id: x.id },
  });
  if (ok) setState((s) => ({ approvals: s.approvals.filter((y) => y.id !== x.id) }));
}

export async function deny(x: Approval) {
  try {
    await adapter.deny(x);
  } catch (e) {
    toast(errMsg(e, "Não consegui negar — tente de novo"));
    return;
  }
  setState((s) => ({ approvals: s.approvals.filter((y) => y.id !== x.id) }));
  toast("Negado — o Hermes não vai fazer isso");
}

export async function setAutonomy(c: Channel, mode: AutonomyMode) {
  // Grupo em Autônomo responde sozinho para todo mundo: o backend só aceita com confirmação explícita.
  const confirm = mode === 2 && c.mode !== 2 && c.kind === "group";
  if (confirm && !(await ask({ title: `Deixar o Hermes responder sozinho em “${c.name}”?`, body: "Ele vai responder para todas as pessoas do grupo, sem você revisar antes.", confirm: "Sim, responder sozinho" }))) return;
  try {
    await adapter.setAutonomy(c.id, mode, confirm);
  } catch (e) {
    toast(errMsg(e, "Não consegui salvar a autonomia"));
    return;
  }
  setState((s) => ({ autonomy: s.autonomy.map((y) => (y.id === c.id ? { ...y, mode } : y)) }));
  toast(`${c.name} → ${MODES[mode]}`);
}

export async function setDefaultMode(mode: AutonomyMode) {
  try {
    await adapter.setDefaultMode(mode);
  } catch (e) {
    return toast(errMsg(e, "Não consegui salvar o padrão"));
  }
  setState({ defaultMode: mode });
  toast(`Canais novos começam em ${MODES[mode]}`);
}

// ---- Atividade ----

export async function undoActivity(id: string) {
  try {
    await adapter.undo(id);
  } catch {
    toast("Não consegui desfazer");
    return;
  }
  setState((s) => ({ activity: s.activity.map((a) => (a.id === id ? { ...a, undone: true } : a)) }));
  toast("Desfeito");
}

// ---- Negócios · canais ----

export async function saveBusiness(b: { id?: string; name: string; color: string }) {
  try {
    const saved = await adapter.saveBusiness(b);
    setState((s) => ({ businesses: s.businesses.some((x) => x.id === saved.id) ? s.businesses.map((x) => (x.id === saved.id ? saved : x)) : [...s.businesses, saved] }));
    toast(b.id ? "Negócio atualizado" : `Negócio “${saved.name}” criado`);
    return saved;
  } catch (e) {
    toast(errMsg(e, "Não consegui salvar o negócio"));
    return null;
  }
}

export async function deleteBusiness(id: string) {
  try {
    await adapter.deleteBusiness(id);
  } catch (e) {
    return toast(errMsg(e, "Não consegui remover o negócio"));
  }
  const clear = <T extends { business: BizId }>(xs: T[]) => xs.map((x) => (x.business === id ? { ...x, business: "" } : x));
  setState((s) => ({ businesses: s.businesses.filter((b) => b.id !== id), biz: s.biz === id ? "all" : s.biz, autonomy: clear(s.autonomy), people: clear(s.people), playbooks: clear(s.playbooks) }));
  toast("Negócio removido");
}

export async function setChannelBusiness(c: Channel, businessId: BizId) {
  try {
    await adapter.setChannelBusiness(c.id, businessId || null);
  } catch (e) {
    return toast(errMsg(e, "Não consegui salvar"));
  }
  setState((s) => ({ autonomy: s.autonomy.map((y) => (y.id === c.id ? { ...y, business: businessId } : y)) }));
}

// ---- Radar · Suporte · Pessoas · Playbooks ----

export async function setWatches(words: string[]) {
  try {
    await adapter.setWatches(words);
  } catch (e) {
    toast(errMsg(e, "Não consegui salvar as palavras vigiadas"));
    return false;
  }
  setState({ watches: words });
  return true;
}

export const ticketCard = (t: Ticket) =>
  actOnBehalf({ business: t.business, kind: "tkt", action: `Abriu card para o ticket #${t.n} — ${t.title}`, why: "pedido seu no painel de suporte.", done: `Card criado: “${t.title}”`, target: { kind: "ticket", n: t.n, op: "card" } });

export const ticketReply = (t: Ticket) =>
  actOnBehalf({ business: t.business, kind: "msg", action: `Respondeu ${t.client} no ticket #${t.n}`, why: "pedido seu no painel de suporte.", done: "Resposta enviada para " + t.client, blocked: "Agente pausado — retome para enviar", target: { kind: "ticket", n: t.n, op: "reply" } });

export async function savePerson(p: Omit<Person, "id" | "initials" | "waitingHours"> & { id?: string }, done?: string) {
  try {
    const saved = await adapter.savePerson(p);
    setState((s) => ({ people: s.people.some((x) => x.id === saved.id) ? s.people.map((x) => (x.id === saved.id ? saved : x)) : [...s.people, saved].sort((a, b) => a.name.localeCompare(b.name)) }));
    toast(done ?? (p.id ? "Contato atualizado" : `${saved.name} adicionado`));
    return saved;
  } catch (e) {
    toast(errMsg(e, "Não consegui salvar o contato"));
    return null;
  }
}

export async function deletePerson(id: string) {
  try {
    await adapter.deletePerson(id);
  } catch (e) {
    return toast(errMsg(e, "Não consegui remover"));
  }
  setState((s) => ({ people: s.people.filter((p) => p.id !== id) }));
  toast("Contato removido");
}

export async function savePlaybook(p: PlaybookDraft, done?: string) {
  try {
    const saved = await adapter.savePlaybook(p);
    setState((s) => ({ playbooks: s.playbooks.some((x) => x.id === saved.id) ? s.playbooks.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...s.playbooks] }));
    if (done) toast(done);
    return saved;
  } catch (e) {
    toast(errMsg(e, "Não consegui salvar o playbook"));
    return null;
  }
}

export async function deletePlaybook(id: string) {
  try {
    await adapter.deletePlaybook(id);
  } catch (e) {
    return toast(errMsg(e, "Não consegui remover"));
  }
  setState((s) => ({ playbooks: s.playbooks.filter((p) => p.id !== id) }));
  toast("Playbook removido");
}

/** "Executar agora": passa pelo kill switch e vira Atividade; o gateway executa no próximo ciclo. */
export async function runPlaybook(p: Playbook) {
  const ok = await actOnBehalf({
    business: p.business,
    kind: "cmd",
    action: `Executou o playbook “${p.name}”`,
    why: "pedido por você em Playbooks.",
    done: "Playbook na fila — o Hermes executa em instantes",
    blocked: "Agente pausado — retome para executar",
    target: { kind: "playbook", id: p.id },
  });
  if (ok) await loadOps().catch(() => {});
}
