import type { AutonomyMode, Channel } from "../adapter";
import { MODES } from "../store";

const COLOR = ["var(--fg)", "var(--acc)", "var(--ok)"];

/** Observar / Rascunhar / Autônomo para um canal. */
export function AutonomySegment({ channel, onPick }: { channel: Channel; onPick: (mode: AutonomyMode) => void }) {
  return (
    <div role="radiogroup" aria-label={`Autonomia em ${channel.name}`} style={{ display: "flex", gap: 3, padding: 3, borderRadius: "var(--r2)", background: "var(--panel2)" }}>
      {MODES.map((m, i) => {
        const on = channel.mode === i;
        return (
          <button key={m} role="radio" aria-checked={on} className="au-seg" style={on ? { color: COLOR[i] } : undefined} onClick={() => onPick(i as AutonomyMode)}>
            {m}
          </button>
        );
      })}
    </div>
  );
}
