import { spot } from "../Chrome";
import { agent, useAgentData } from "../agent";
import type { Gateway } from "../agent/types";
import { toast } from "../store";
import { AgentHeader } from "./Sessions";

const STATUS_COLOR: Record<Gateway["status"], string> = { conectado: "var(--ok)", pareando: "var(--warn)", desligado: "var(--fg3)", erro: "var(--err)" };

export function Gateways() {
  const [data, setData] = useAgentData(() => agent.gateways(), []);
  const toggle = async (g: Gateway) => {
    try {
      await agent.toggleGateway(g);
    } catch {
      return toast("Não consegui alterar " + g.name);
    }
    setData({ ...data!, items: data!.items.map((x) => (x.id === g.id ? { ...x, enabled: !x.enabled, status: x.enabled ? "desligado" : x.status === "desligado" ? "pareando" : x.status } : x)) });
    toast(`${g.name} ${g.enabled ? "desligado" : "ligado"}`);
  };
  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page au-page-agent">
        <AgentHeader title="Gateways" sub="Um agente, uma memória, em todo lugar onde você conversa.">
          {data && (
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, padding: "7px 13px", borderRadius: 999, border: "1px solid var(--line2)", fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg2)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: data.summary.running ? "var(--ok)" : "var(--err)", animation: data.summary.running ? "hpulse 2s infinite" : "none" }} />
              {data.summary.label}
            </span>
          )}
        </AgentHeader>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
          {data?.items.map((g, i) => (
            <div key={g.id} className="au-card au-gw" onMouseMove={spot} style={{ animationDelay: i * 45 + "ms" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className="au-display" style={{ width: 40, height: 40, borderRadius: "var(--r2)", background: "var(--panel2)", display: "grid", placeItems: "center", fontSize: 18, letterSpacing: 0 }}>{g.mono}</span>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 500 }}>{g.name}</span>
                  <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.account}</span>
                </span>
                <button role="switch" aria-checked={g.enabled} aria-label={`${g.enabled ? "Desligar" : "Ligar"} ${g.name}`} className="au-switch lg" onClick={() => toggle(g)}>
                  <span />
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--fm)", fontSize: 11, color: STATUS_COLOR[g.status] }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[g.status] }} />
                {g.status}
                <span style={{ marginLeft: "auto", color: "var(--fg3)" }}>{g.stat}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
