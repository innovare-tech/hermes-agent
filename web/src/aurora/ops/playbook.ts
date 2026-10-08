import type { BizId, Playbook } from "../adapter";

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "quando X, faça Y" → fluxo Gatilho → contexto → Y → Atividade. */
export function parsePlaybook(text: string, business: BizId, id = "b" + Date.now()): Playbook | null {
  const d = text.trim();
  if (!d) return null;
  // "Nome: quando X, faça Y" ou "Nome quando X, faça Y": o que vem antes de "quando" é o nome.
  const m = d.match(/^(.*?)\s*\bquando\s+(.+?),\s*(?:faça|faz|então|entao)?\s*(.+)$/i);
  const before = m ? m[1].replace(/[:\-–—]+\s*$/, "").trim() : "";
  const trigger = cap(m ? m[2] : d);
  const action = cap(m ? m[3] : "Responder com base no histórico");
  const name = before || trigger;
  return {
    id,
    name: name.length > 34 ? name.slice(0, 32) + "…" : name,
    business,
    trigger,
    runs: 0,
    enabled: false, // nasce desligado: você revisa e liga
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
