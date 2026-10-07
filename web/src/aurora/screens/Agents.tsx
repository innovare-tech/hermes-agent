import { spot } from "../Chrome";
import { Icon } from "../Icon";
import { agent, useAgentData } from "../agent";
import { AgentHeader } from "./Sessions";

export function Agents() {
  const [data] = useAgentData(() => agent.subagents(), [], 1100);
  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page au-page-agent">
        <AgentHeader title="Subagentes" sub="Trabalhadores isolados, cada um com sua conversa e seu terminal." />
        <div className="au-label" style={{ fontSize: 11 }}>Em execução · {data?.running.length ?? 0}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
          {data?.running.map((a, i) => (
            <div key={a.id} className="au-card" onMouseMove={spot} style={{ display: "flex", flexDirection: "column", gap: 14, padding: 18, borderColor: "var(--line2)", animation: "hup .45s cubic-bezier(.2,.7,.2,1) both", animationDelay: i * 45 + "ms" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--acc)", animation: "hpulse 1.4s ease-in-out infinite" }} />
                <span style={{ fontFamily: "var(--fm)", fontSize: 12.5, fontWeight: 500 }}>{a.name}</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>{a.elapsed}</span>
              </div>
              <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{a.task}</span>
              <div role="progressbar" aria-valuenow={a.pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 4, borderRadius: 4, background: "var(--panel2)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: a.pct + "%", background: "var(--acc)", borderRadius: 4, transition: "width 1.1s linear" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: "var(--r2)", background: "var(--code)", fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg2)", whiteSpace: "nowrap", overflow: "hidden" }}>
                <span style={{ color: "var(--acc)" }}>›</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{a.now}</span>
              </div>
              <div style={{ display: "flex", gap: 12, fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>
                <span>{a.backend}</span>
                <span>{a.tools} ferramentas</span>
                <span style={{ marginLeft: "auto" }}>pai: {a.parent}</span>
              </div>
            </div>
          ))}
          {data?.running.length === 0 && <p style={{ margin: 0, fontSize: 13, color: "var(--fg2)" }}>Nenhum subagente rodando agora.</p>}
        </div>
        <div className="au-label" style={{ fontSize: 11, marginTop: 8 }}>Concluídos hoje</div>
        <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--panel)", backdropFilter: "var(--blur)", overflow: "hidden" }}>
          {data?.done.map((d, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr) 120px 70px", gap: 14, alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
              <Icon name="circle-check" size={15} color="var(--ok)" />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 13.5 }}>{d.task}</span>
                <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>{d.name}</span>
              </span>
              <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg2)" }}>{d.tokens}</span>
              <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)", textAlign: "right" }}>{d.dur}</span>
            </div>
          ))}
          {data?.done.length === 0 && <div style={{ padding: "14px 18px", fontSize: 13, color: "var(--fg3)" }}>Nada concluído hoje.</div>}
        </div>
      </div>
    </div>
  );
}
