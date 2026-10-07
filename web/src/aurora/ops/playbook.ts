import type { BizId, Playbook } from "../adapter";

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "quando X, faça Y" → fluxo Gatilho → contexto → Y → Atividade. */
export function parsePlaybook(text: string, business: BizId, id = "b" + Date.now()): Playbook | null {
  const d = text.trim();
  if (!d) return null;
  const m = d.match(/quando\s+(.+?),\s*(?:faça|faz|então|entao)?\s*(.+)/i);
  const trigger = cap(m ? m[1] : d);
  const action = cap(m ? m[2] : "Responder com base no histórico");
  return {
    id,
    name: trigger.length > 34 ? trigger.slice(0, 32) + "…" : trigger,
    business,
    trigger,
    runs: 0,
    enabled: true,
    lastRun: "nunca",
    schedule: "",
    deliver: "local",
    nextRun: "",
    lastError: "",
    nodes: [
      { kind: "trigger", text: trigger },
      { kind: "action", text: "Entender o contexto (memória, histórico e pessoa)" },
      { kind: "action", text: action },
      { kind: "end", text: "Registrar na Atividade" },
    ],
  };
}
