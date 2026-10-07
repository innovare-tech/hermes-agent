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
    case "error":
      return { ...m, live: false, steps: settle(m), text: (m.text ? m.text + "\n\n" : "") + "⚠ " + e.message };
  }
}

/** Interrupção: fecha os passos abertos e marca o texto, como no protótipo. */
export function interrupted(m: AgentMessage): AgentMessage {
  return { ...m, live: false, steps: settle(m), text: (m.text ? m.text + "\n\n" : "") + "— interrompido." };
}

const settle = (m: AgentMessage) => m.steps.map((s) => (s.status === "run" ? { ...s, status: "ok" as const } : s));
