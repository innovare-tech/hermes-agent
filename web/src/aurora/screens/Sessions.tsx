import { useDeferredValue, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Icon } from "../Icon";
import { agent, useAgentData } from "../agent";

const SOURCES = ["Todas", "Web", "CLI", "Telegram", "Discord", "WhatsApp", "Cron"];

/** Título + subtítulo das telas do agente (sem "Pausar tudo"). */
export function AgentHeader({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 className="au-h1">{title}</h1>
        <p style={{ margin: 0, color: "var(--fg2)", fontSize: 14.5 }}>{sub}</p>
      </div>
      {children}
    </div>
  );
}

export function Sessions() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [source, setSource] = useState("Todas");
  const query = useDeferredValue(q);
  const [rows] = useAgentData(() => agent.sessions(query, source), [query, source]);
  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page au-page-agent">
        <AgentHeader title="Sessões" sub="Todas as conversas, de todos os lugares. Uma memória só." />
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: "var(--r)", border: "1px solid var(--line2)", background: "var(--panel)", backdropFilter: "var(--blur)" }}>
          <Icon name="search" size={16} color="var(--fg3)" />
          <input aria-label="Buscar sessões" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar em todo o histórico — texto completo + resumo por IA" style={{ flex: 1, border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 14.5 }} />
          <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>FTS5</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SOURCES.map((s) => (
            <button key={s} className="au-pill au-pill-agent" aria-pressed={source === s} onClick={() => setSource(s)}>
              {s}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--panel)", backdropFilter: "var(--blur)", overflow: "hidden" }}>
          {rows?.map((r, i) => (
            <button key={r.id} className="au-listrow" onClick={() => navigate(`/chat/${r.id}`)} style={{ display: "grid", gridTemplateColumns: "36px minmax(0,1fr) 110px 70px", gap: 16, alignItems: "center", padding: "15px 18px", animation: "hup .4s cubic-bezier(.2,.7,.2,1) both", animationDelay: i * 45 + "ms" }}>
              <span style={{ width: 34, height: 34, borderRadius: "var(--r2)", background: "var(--panel2)", display: "grid", placeItems: "center", color: "var(--fg2)" }}>
                <Icon name={r.icon} size={15} />
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{r.title}</span>
                <span style={{ fontSize: 12.5, color: "var(--fg2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.snippet}</span>
              </span>
              <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg2)" }}>
                {r.source} · {r.msgs} msgs
              </span>
              <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)", textAlign: "right" }}>{r.when}</span>
            </button>
          ))}
          {rows?.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "var(--fg3)", fontSize: 13.5 }}>Nada encontrado. Tente outro termo.</div>}
        </div>
      </div>
    </div>
  );
}
