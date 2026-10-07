import type { Playbook } from "../adapter";
import { spot } from "../Chrome";
import { Icon } from "../Icon";

const NODE = {
  trigger: { label: "Gatilho", icon: "zap", color: "var(--acc)" },
  action: { label: "Ação", icon: "play", color: "var(--fg)" },
  cond: { label: "Condição", icon: "git-branch", color: "var(--warn)" },
  end: { label: "Fim", icon: "flag", color: "var(--ok)" },
};

/** Diagrama vertical do playbook, com um ponto de luz percorrendo cada conector. */
export function PlaybookFlow({ p }: { p: Playbook }) {
  return (
    <div className="au-card" onMouseMove={spot} style={{ padding: "26px 24px 30px", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
      <div style={{ alignSelf: "stretch", display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
        <span className="au-display" style={{ lineHeight: 1, fontSize: 24 }}>{p.name}</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>última execução {p.lastRun}</span>
      </div>
      {p.nodes.map((n, i) => {
        const k = NODE[n.kind];
        const trigger = n.kind === "trigger";
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
            <div style={{ width: "100%", maxWidth: 460, display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px", borderRadius: "var(--r)", border: `1px solid ${trigger ? "var(--acc)" : "var(--line)"}`, background: "var(--panel2)", animation: "hblurin .5s both", animationDelay: i * 110 + "ms" }}>
              <span style={{ width: 32, height: 32, flex: "none", borderRadius: "var(--r2)", background: trigger ? "var(--accSoft)" : "var(--panel)", color: k.color, display: "grid", placeItems: "center" }}>
                <Icon name={k.icon} size={14} />
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <span className="au-label" style={{ color: k.color }}>{k.label}</span>
                <span style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.45 }}>{n.text}</span>
                {n.elseText && (
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    <span className="au-tag" style={{ color: "var(--ok)", padding: "2px 8px" }}>sim → continua</span>
                    <span className="au-tag" style={{ color: "var(--fg2)", borderColor: "var(--line2)", padding: "2px 8px" }}>não → {n.elseText}</span>
                  </span>
                )}
              </span>
            </div>
            {i < p.nodes.length - 1 && (
              <div aria-hidden="true" style={{ position: "relative", width: 2, height: 30, background: "var(--line2)" }}>
                <span style={{ position: "absolute", left: -3, width: 8, height: 8, borderRadius: "50%", background: "var(--acc)", boxShadow: "0 0 10px var(--acc)", animation: "hflow 2.2s ease-in-out infinite", animationDelay: i * 350 + "ms" }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
