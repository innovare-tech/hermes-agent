import { useNavigate } from "react-router";
import { Icon } from "../Icon";
import { money } from "./gateway";
import type { SessionInfo } from "./types";

const k = (n: number) => (n / 1000).toFixed(1).replace(".", ",") + "k";

export function ContextPanel({ info, onCompress }: { info: SessionInfo; onCompress: () => void }) {
  const navigate = useNavigate();
  const pct = info.ctxMax && info.ctxUsed ? Math.min(95, (info.ctxUsed / info.ctxMax) * 100) : 0;
  return (
    <aside
      aria-label="Contexto da sessão"
      style={{ width: 300, flex: "none", borderLeft: "1px solid var(--line)", background: "var(--bg2)", backdropFilter: "var(--blur)", WebkitBackdropFilter: "var(--blur)", overflow: "auto", padding: "20px 20px 28px", display: "flex", flexDirection: "column", gap: 26, animation: "hin .3s ease both" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="au-label" title="Quanto da conversa o modelo consegue considerar de uma vez. Quando enche, use Compactar.">Memória da conversa</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span className="au-display" style={{ fontSize: 30, lineHeight: 1 }}>{info.ctxUsed == null ? "—" : k(info.ctxUsed)}</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>de {info.ctxMax ? Math.round(info.ctxMax / 1000) + "k" : "—"} tokens</span>
        </div>
        <div style={{ height: 6, borderRadius: 6, background: "var(--panel2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: pct + "%", background: "var(--acc)", borderRadius: 6, transition: "width .8s cubic-bezier(.2,.7,.2,1)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>
          <span title={info.cost == null ? "O provedor deste modelo não informa o custo" : undefined}>{info.cost == null ? "custo não informado" : "custo da conversa " + money(info.cost)}</span>
          <button onClick={onCompress} title="Resume o começo da conversa para liberar espaço no contexto" style={{ padding: 0, border: 0, background: "transparent", color: "var(--acc)", cursor: "pointer", font: "inherit" }}>
            Compactar
          </button>
        </div>
      </div>

      {info.memories && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="au-label">Memórias usadas</span>
          {info.memories.map((m) => (
            <div key={m} style={{ padding: "10px 12px", borderRadius: "var(--r2)", background: "var(--panel)", border: "1px solid var(--line)", fontSize: 12.5, lineHeight: 1.45, color: "var(--fg2)" }}>{m}</div>
          ))}
        </div>
      )}

      {info.skill && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="au-label">Skill ativa</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: "var(--r2)", background: "var(--accSoft)", fontFamily: "var(--fm)", fontSize: 12, color: "var(--fg)" }}>
            <Icon name="sparkles" size={13} color="var(--acc)" />
            {info.skill.name}
            <span style={{ marginLeft: "auto", color: "var(--fg3)" }}>{info.skill.version}</span>
          </div>
        </div>
      )}

      {info.subagents && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="au-label">Subagentes</span>
          {info.subagents.map((a) => (
            <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg2)" }}>
              <Icon name="circle-check" size={12} color="var(--ok)" />
              {a.name}
              <span style={{ marginLeft: "auto", color: "var(--fg3)" }}>{a.dur}</span>
            </div>
          ))}
          <button onClick={() => navigate("/agents")} style={{ alignSelf: "flex-start", padding: 0, border: 0, background: "transparent", color: "var(--acc)", fontSize: 12.5, cursor: "pointer" }}>
            Ver todos →
          </button>
        </div>
      )}
    </aside>
  );
}
