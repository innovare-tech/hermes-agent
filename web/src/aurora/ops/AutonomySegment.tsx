import type { AutonomyMode } from "../adapter";
import { MODES } from "../store";

const COLOR = ["var(--fg)", "var(--acc)", "var(--ok)", "var(--fg2)"];

/** Observar / Rascunhar / Autônomo / Escutar (de um canal ou do padrão para canais novos). */
export function AutonomySegment({ label, mode, onPick }: { label: string; mode: AutonomyMode; onPick: (mode: AutonomyMode) => void }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "flex", gap: 3, padding: 3, borderRadius: "var(--r2)", background: "var(--panel2)" }}>
      {MODES.map((m, i) => {
        const on = mode === i;
        return (
          <button key={m} role="radio" aria-checked={on} className="au-seg" style={on ? { color: COLOR[i] } : undefined} onClick={() => onPick(i as AutonomyMode)}>
            {m}
          </button>
        );
      })}
    </div>
  );
}
