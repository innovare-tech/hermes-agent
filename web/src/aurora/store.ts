import { useSyncExternalStore } from "react";
import { adapter, type Approval, type Person, type Playbook, type RadarGroup, type Ticket, type AutonomyMode, type Channel, type InboxItem, type OnBehalf, type OpsSnapshot, type Session } from "./adapter";
import { chat } from "./chat";

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
  toast: { text: string; id: number } | null;
  /** Passo do assistente de setup (-1 = fechado). */
  onboarding: number;
};

const PREFS_KEY = "hermes.aurora";

function readPrefs(): Partial<Pick<State, "dir" | "theme" | "demo">> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

let state: State = {
  dir: "aurora",
  theme: "dark",
  demo: false,
  ...readPrefs(),
  biz: "all",
  toast: null,
  onboarding: -1,
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
  health: { online: false, uptime: "", items: [], responseTime: "" },
  costs: { month: "", total: 0, limit: null, projection: null, byBusiness: [] },
  watches: [],
  support: { firstResponse: "", resolvedByHermes: "", csat: "", kbUsage: "" },
  kb: [],
  people: [],
  playbooks: [],
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

export const inBiz = (s: State) => (x: { business: string }) =>
  s.biz === "all" || x.business === s.biz || x.business === "all";

export async function loadOps() {
  setState(await adapter.load({ demo: state.demo }));
}

export async function loadSessions() {
  setState({ sessions: await chat.sessions() });
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string) {
  clearTimeout(toastTimer);
  setState({ toast: { text, id: Date.now() } });
  toastTimer = setTimeout(() => setState({ toast: null }), 3200);
}

export function setPrefs(p: Partial<Pick<State, "dir" | "theme" | "demo">>) {
  setState(p);
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ dir: state.dir, theme: state.theme, demo: state.demo }));
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
  } catch {
    toast("Falhou — nada foi enviado");
    return false;
  }
  toast(a.done);
  return true;
}

// ---- Caixa de entrada · Aprovações · Autonomia ----

export const MODES = ["Observar", "Rascunhar", "Autônomo"] as const;

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

export function keepInbox(id: string) {
  setState((s) => ({ inbox: s.inbox.map((y) => (y.id === id ? { ...y, priority: "voce" as const } : y)) }));
  toast("Ok, esse fica com você");
}

export async function approve(x: Approval) {
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
    await adapter.deny(x.id);
  } catch {
    toast("Não consegui negar — tente de novo");
    return;
  }
  setState((s) => ({ approvals: s.approvals.filter((y) => y.id !== x.id) }));
  toast("Negado — o Hermes não vai fazer isso");
}

export async function setAutonomy(c: Channel, mode: AutonomyMode) {
  try {
    await adapter.setAutonomy(c.id, mode);
  } catch {
    toast("Não consegui salvar a autonomia");
    return;
  }
  setState((s) => ({ autonomy: s.autonomy.map((y) => (y.id === c.id ? { ...y, mode } : y)) }));
  toast(`${c.name} → ${MODES[mode]}`);
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

// ---- Radar · Suporte · Pessoas · Playbooks ----

/** Rascunho do usuário vai para a fila de Aprovações (não sai nada ainda). */
async function draft(a: Omit<Approval, "id" | "createdAt">, done = "Rascunho enviado para Aprovações") {
  try {
    const created = await adapter.draftApproval(a);
    setState((s) => ({ approvals: [created, ...s.approvals] }));
    toast(done);
  } catch {
    toast("Não consegui criar o rascunho");
  }
}

export const draftRadarAlert = (g: RadarGroup) =>
  draft({ business: g.business, kind: "mensagem", icon: "message-square", title: "Responder no grupo " + g.name, risk: "baixo", why: `Alerta do radar: ${g.alert}.`, preview: "Pessoal, já estamos em cima disso. Atualizo vocês aqui em até 15 minutos.", source: "radar de grupos" });

export const draftRadarGroup = (g: RadarGroup) =>
  draft(
    { business: g.business, kind: "mensagem", icon: "message-square", title: `Responder ${g.unanswered.length} pendência(s) em ${g.name}`, risk: "baixo", why: "Perguntas sem resposta há mais de 1 hora.", preview: g.unanswered.map((u) => "→ " + u).join("\n"), source: "radar de grupos" },
    "Rascunhos enviados para Aprovações",
  );

export const draftToPerson = (p: Person) =>
  draft({ business: p.business, kind: "mensagem", icon: "message-square", title: "Mensagem para " + p.name, risk: "baixo", why: `Pendência: ${p.pending[0] ?? p.lastTopic}.`, preview: `Oi, ${p.name.split(" ")[0]}! Sobre ${p.lastTopic.toLowerCase()}: já estou vendo e te retorno ainda hoje.`, source: "pessoas" });

export async function setWatches(words: string[]) {
  try {
    await adapter.setWatches(words);
  } catch {
    toast("Não consegui salvar as palavras vigiadas");
    return false;
  }
  setState({ watches: words });
  return true;
}

export const ticketCard = (t: Ticket) =>
  actOnBehalf({ business: t.business, kind: "tkt", action: `Abriu card para o ticket #${t.n} — ${t.title}`, why: "pedido seu no painel de suporte.", done: `Card criado: “${t.title}”`, target: { kind: "ticket", n: t.n, op: "card" } });

export const ticketReply = (t: Ticket) =>
  actOnBehalf({ business: t.business, kind: "msg", action: `Respondeu ${t.client} no ticket #${t.n}`, why: "pedido seu no painel de suporte.", done: "Resposta enviada para " + t.client, blocked: "Agente pausado — retome para enviar", target: { kind: "ticket", n: t.n, op: "reply" } });

export async function savePlaybook(p: Playbook, done?: string) {
  try {
    await adapter.savePlaybook(p);
  } catch {
    toast("Não consegui salvar o playbook");
    return false;
  }
  setState((s) => ({ playbooks: s.playbooks.some((x) => x.id === p.id) ? s.playbooks.map((x) => (x.id === p.id ? p : x)) : [p, ...s.playbooks] }));
  if (done) toast(done);
  return true;
}

/** Liga/desliga os dados de exemplo nas telas sem backend (só faz diferença com o agente real). */
export async function setDemo(demo: boolean) {
  setPrefs({ demo });
  await loadOps().catch(() => toast("Não consegui recarregar os dados"));
  toast(demo ? "Mostrando dados de exemplo" : "Mostrando só dados reais");
}
