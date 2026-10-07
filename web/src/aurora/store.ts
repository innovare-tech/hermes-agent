import { useSyncExternalStore } from "react";
import { adapter, type OnBehalf, type OpsSnapshot, type Session } from "./adapter";
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
  toast: null,
  paused: false,
  account: null,
  businesses: [],
  sessions: [],
  inbox: [],
  approvals: [],
  radar: [],
  tickets: [],
  activity: [],
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
  setState(await adapter.load());
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

export function setPrefs(p: Partial<Pick<State, "dir" | "theme">>) {
  setState(p);
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ dir: state.dir, theme: state.theme }));
  } catch {
    // preferência só deste navegador; sem storage segue com o padrão
  }
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
