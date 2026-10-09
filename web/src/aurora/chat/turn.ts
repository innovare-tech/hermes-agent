import { classifyError } from "./errors";
import type { AgentMessage, ChatEvent, ChatMessage, TurnStat, UserMessage } from "./types";

/** Junta dois rodapés: o que `over` informa (modelo, tempo, tokens, custo) vale mais; o que ele não sabe fica como estava. */
export function mergeStat(base?: TurnStat, over?: TurnStat | null): TurnStat | undefined {
  if (!over) return base;
  const defined = Object.fromEntries(Object.entries(over).filter(([, v]) => v !== undefined));
  return { ...base, ...defined };
}

/** Aplica um evento do turno à mensagem viva do agente. `now` só existe para os testes. */
export function applyEvent(m: AgentMessage, e: ChatEvent, now = Date.now()): AgentMessage {
  switch (e.type) {
    case "step": {
      const i = m.steps.findIndex((s) => s.id === e.step.id);
      const steps = i < 0 ? [...m.steps, { ...e.step, startedAt: e.step.startedAt ?? now }] : m.steps.map((s, j) => (j === i ? { ...e.step, startedAt: e.step.startedAt ?? s.startedAt } : s));
      return { ...m, steps };
    }
    case "delta":
      return { ...m, text: m.text + e.text, ...endThinking(m, now) };
    case "reasoning": {
      const reasoning = e.full ? e.text : (m.reasoning ?? "") + e.text;
      return { ...m, reasoning, thinkStart: m.thinkStart ?? now };
    }
    case "done":
      return { ...m, live: false, stat: e.stat, learned: e.learned, steps: settle(m), ...endThinking(m, now) };
    case "approval":
      return { ...m, approval: { ...e.approval, status: "pending" } };
    case "approval.cancel":
      return m.approval?.id === e.id && m.approval.status === "pending" ? { ...m, approval: { ...m.approval, status: "cancelled" } } : m;
    case "error":
      return { ...m, live: false, steps: settle(m), error: classifyError(e.message, e), ...endThinking(m, now) };
    case "interrupted":
      return interrupted(m, now, e.stat);
    case "submitted":
      return m;
  }
}

/** O pensamento acaba quando começa o texto (ou o turno acaba): guarda quanto durou. */
const endThinking = (m: AgentMessage, now: number): Partial<AgentMessage> => (m.thinkStart && m.thinkMs == null ? { thinkMs: now - m.thinkStart } : {});

/** Interrupção: fecha os passos abertos e marca o turno como interrompido (fica no histórico). */
export function interrupted(m: AgentMessage, now = Date.now(), stat?: TurnStat): AgentMessage {
  return { ...m, live: false, interrupted: true, ...(stat ? { stat } : {}), steps: settle(m), ...endThinking(m, now) };
}

const settle = (m: AgentMessage) => m.steps.map((s) => (s.status === "run" ? { ...s, status: "ok" as const } : s));

/** Marca o desfecho do card de aprovação (quem chama responde ao gateway uma única vez). */
export function answered(m: AgentMessage, choice: "once" | "session" | "always" | "deny"): AgentMessage {
  if (!m.approval || m.approval.status !== "pending") return m;
  return { ...m, approval: { ...m.approval, status: choice === "deny" ? "denied" : "approved" } };
}

/** "N perguntas" do cabeçalho: as bolhas do usuário na tela. Bate com o `question_count` da lista de Sessões. */
export function questionCount(messages: ChatMessage[]): number {
  return messages.filter((m) => m.role === "user").length;
}

/** Posição da última pergunta do usuário (-1 se não há). */
export const lastUserIndex = (messages: ChatMessage[]) => messages.map((m) => m.role).lastIndexOf("user");

/** Refazer: fica tudo até a última pergunta; a resposta de baixo sai (o turno novo ocupa o lugar dela). */
export function keepForRetry(list: ChatMessage[]): ChatMessage[] | null {
  const i = lastUserIndex(list);
  return i < 0 ? null : list.slice(0, i + 1);
}

export const RETRY_BLOCKED = "Envie ou remova os anexos pendentes antes de refazer.";

/** Refazer não reconstrói anexo pendente no composer (o backend recusa, código 4018): avisa antes e traduz o erro cru se ele ainda vier. */
export function retryBlock(pending: number, error?: string): string | null {
  return pending > 0 || (!!error && /\b4018\b|reconstruct or combine attached media/i.test(error)) ? RETRY_BLOCKED : null;
}

/** Desfazer: sai a última pergunta e tudo o que veio depois. */
export function keepForUndo(list: ChatMessage[]): ChatMessage[] | null {
  const i = lastUserIndex(list);
  return i < 0 ? null : list.slice(0, i);
}

export type EditPlan = { keep: ChatMessage[]; user: UserMessage } & ({ mode: "truncate"; rowId: number } | { mode: "undo-last" });

/** Editar uma pergunta: com endereço no histórico, o gateway corta ali; sem ele, só a última pode ser editada (desfaz e reenvia). */
export function planEdit(list: ChatMessage[], id: string): EditPlan | null {
  const i = list.findIndex((m) => m.id === id);
  const m = list[i];
  if (i < 0 || m.role !== "user") return null;
  if (m.rowId != null) return { mode: "truncate", rowId: m.rowId, keep: list.slice(0, i), user: m };
  return i === lastUserIndex(list) ? { mode: "undo-last", keep: list.slice(0, i), user: m } : null;
}
