import { useState } from "react";
import { Icon } from "../Icon";
import { agent, useAgentData } from "../agent";
import type { LogLevel } from "../agent/types";

const LEVEL_COLOR: Record<LogLevel, string> = { INFO: "var(--fg2)", TOOL: "var(--acc)", WARN: "var(--warn)", ERRO: "var(--err)" };
const LEVELS: ("Tudo" | LogLevel)[] = ["Tudo", "INFO", "TOOL", "WARN", "ERRO"];

export function Logs() {
  const [paused, setPaused] = useState(false);
  const [level, setLevel] = useState<"Tudo" | LogLevel>("Tudo");
  // Pausado = não busca mais (o stream congela onde está).
  const [lines] = useAgentData(() => agent.logs(), [], 2200, !paused);
  const rows = lines?.filter((l) => level === "Tudo" || l.level === level) ?? [];
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: "28px 36px", gap: 16, animation: "hblurin .7s cubic-bezier(.2,.7,.2,1) both" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 className="au-h1">Logs</h1>
          <p style={{ margin: 0, color: "var(--fg2)", fontSize: 14.5 }}>Tudo que o agente e o gateway fazem, em tempo real.</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {LEVELS.map((l) => (
            <button key={l} className="au-pill" aria-pressed={level === l} onClick={() => setLevel(l)} style={{ fontFamily: "var(--fm)", fontSize: 11.5 }}>
              {l}
            </button>
          ))}
          <button onClick={() => setPaused(!paused)} aria-pressed={paused} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 999, border: "1px solid var(--line2)", background: "var(--panel)", color: "var(--fg)", fontSize: 12, cursor: "pointer" }}>
            <Icon name={paused ? "play" : "pause"} size={12} />
            {paused ? "Retomar" : "Pausar"}
          </button>
        </div>
      </div>
      <div role="log" aria-live="polite" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column-reverse", overflow: "auto", padding: "14px 4px", borderRadius: "var(--r)", background: "var(--code)", border: "1px solid var(--line)", fontFamily: "var(--fm)", fontSize: 12, lineHeight: 1.75 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.map((l) => (
            <div key={l.id} className="au-logrow">
              <span style={{ color: "var(--fg3)" }}>{l.t}</span>
              <span style={{ color: LEVEL_COLOR[l.level], fontWeight: 500 }}>{l.level}</span>
              <span style={{ color: "var(--fg2)" }}>{l.src}</span>
              <span style={{ color: "var(--fg)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{l.msg}</span>
            </div>
          ))}
          {!paused && (
            <div aria-hidden="true" style={{ padding: "2px 14px", color: "var(--acc)" }}>
              <span style={{ animation: "hblink 1s step-end infinite" }}>▍</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
