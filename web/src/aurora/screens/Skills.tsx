import { useState } from "react";
import { spot } from "../Chrome";
import { agent, useAgentData } from "../agent";
import type { Skill } from "../agent/types";
import { AgentHeader } from "./Sessions";

const FILTERS: [string, Skill["origin"] | null][] = [
  ["Todas", null],
  ["Aprendidas", "aprendida"],
  ["Hub", "hub"],
  ["Minhas", "sua"],
];

export function Skills() {
  const [skills] = useAgentData(() => agent.skills(), []);
  const [filter, setFilter] = useState<Skill["origin"] | null>(null);
  const list = skills?.filter((s) => !filter || s.origin === filter) ?? [];
  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page au-page-agent">
        <AgentHeader title="Skills" sub="Procedimentos que o Hermes aprendeu sozinho, instalou do Hub ou que você escreveu.">
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FILTERS.map(([label, k]) => (
              <button key={label} className="au-pill au-pill-agent" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {label}
              </button>
            ))}
          </div>
        </AgentHeader>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 14 }}>
          {list.map((s, i) => {
            const learned = s.origin === "aprendida";
            return (
              <div key={s.name} className="au-card au-skill" onMouseMove={spot} style={{ animationDelay: i * 45 + "ms" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "var(--fm)", fontSize: 13, fontWeight: 500 }}>/{s.name}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "var(--fm)", fontSize: 10, padding: "2px 8px", borderRadius: 999, color: learned ? "var(--acc)" : "var(--fg2)", background: learned ? "var(--accSoft)" : "var(--panel2)" }}>{s.origin}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--fg2)", textWrap: "pretty" }}>{s.description}</p>
                <div style={{ height: 3, borderRadius: 3, background: "var(--panel2)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: Math.min(100, s.uses * 1.6) + "%", background: "var(--acc)", borderRadius: 3, animation: "hgrow 1.4s cubic-bezier(.2,.7,.2,1) both" }} />
                </div>
                <div style={{ display: "flex", gap: 14, fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>
                  <span>{s.uses} usos</span>
                  {s.version && <span>v{s.version}</span>}
                  <span style={{ marginLeft: "auto" }}>{s.updated}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
