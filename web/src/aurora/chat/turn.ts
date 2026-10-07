import type { AgentMessage, ChatEvent } from "./types";

/** Aplica um evento do turno à mensagem viva do agente. */
export function applyEvent(m: AgentMessage, e: ChatEvent): AgentMessage {
  switch (e.type) {
    case "step": {
      const i = m.steps.findIndex((s) => s.id === e.step.id);
      const steps = i < 0 ? [...m.steps, e.step] : m.steps.map((s, j) => (j === i ? e.step : s));
      return { ...m, steps };
    }
    case "delta":
      return { ...m, text: m.text + e.text };
    case "done":
      return { ...m, live: false, meta: e.meta, learned: e.learned };
    case "approval":
      return { ...m, approval: { ...e.approval, status: "pending" } };
    case "approval.cancel":
      return m.approval?.id === e.id && m.approval.status === "pending" ? { ...m, approval: { ...m.approval, status: "cancelled" } } : m;
    case "error":
      return { ...m, live: false, steps: settle(m), text: (m.text ? m.text + "\n\n" : "") + "⚠ " + e.message };
  }
}

/** Interrupção: fecha os passos abertos e marca o texto, como no protótipo. */
export function interrupted(m: AgentMessage): AgentMessage {
  return { ...m, live: false, steps: settle(m), text: (m.text ? m.text + "\n\n" : "") + "— interrompido." };
}

const settle = (m: AgentMessage) => m.steps.map((s) => (s.status === "run" ? { ...s, status: "ok" as const } : s));

/** Marca o desfecho do card de aprovação (quem chama responde ao gateway uma única vez). */
export function answered(m: AgentMessage, choice: "once" | "session" | "always" | "deny"): AgentMessage {
  if (!m.approval || m.approval.status !== "pending") return m;
  return { ...m, approval: { ...m.approval, status: choice === "deny" ? "denied" : "approved" } };
}
