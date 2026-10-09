import { useDeferredValue, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Icon } from "../Icon";
import { agent, useAgentData } from "../agent";
import { plural } from "../chat/sources";
import { hitParts } from "../chat/snippet";
import { ask, loadSessions, toast } from "../store";


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
  const [all, setAll] = useAgentData(() => agent.sessions(query, "Todas"), [query]);
  const [editing, setEditing] = useState<string | null>(null);
  const rename = async (id: string, title: string) => {
    setEditing(null);
    const t = title.trim();
    if (!t || all?.find((r) => r.id === id)?.title === t) return;
    try {
      await agent.renameSession(id, t);
      setAll((all ?? []).map((r) => (r.id === id ? { ...r, title: t } : r)));
      loadSessions().catch(() => {});
      toast("Conversa renomeada");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui renomear");
    }
  };
  const remove = async (id: string, title: string) => {
    if (!(await ask({ title: `Apagar “${title}”?`, body: "A conversa e o histórico dela somem para sempre. O que o Hermes guardou na memória continua.", confirm: "Apagar", danger: true }))) return;
    try {
      await agent.deleteSession(id);
      setAll((all ?? []).filter((r) => r.id !== id));
      loadSessions().catch(() => {});
      toast("Conversa apagada");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui apagar");
    }
  };
  // Filtros só das origens que existem nos dados (nunca um filtro que sempre dá vazio).
  const sources = ["Todas", ...Array.from(new Set((all ?? []).map((r) => r.source)))];
  const rows = all?.filter((r) => source === "Todas" || r.source === source);
  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page au-page-agent">
        <AgentHeader title="Sessões" sub="Todas as conversas, de todos os lugares. Uma memória só." />
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: "var(--r)", border: "1px solid var(--line2)", background: "var(--panel)", backdropFilter: "var(--blur)" }}>
          <Icon name="search" size={16} color="var(--fg3)" />
          <input aria-label="Buscar sessões" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar em todas as conversas" style={{ flex: 1, border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 14.5 }} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {sources.map((s) => (
            <button key={s} className="au-pill au-pill-agent" aria-pressed={source === s} onClick={() => setSource(s)}>
              {s}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--panel)", backdropFilter: "var(--blur)", overflow: "hidden" }}>
          {rows?.map((r, i) => (
            <div key={r.id} className="au-listrow au-sessrow" role="button" tabIndex={0} onClick={() => editing !== r.id && navigate(`/chat/${r.id}`)} onKeyDown={(e) => e.key === "Enter" && editing !== r.id && navigate(`/chat/${r.id}`)} style={{ display: "grid", gridTemplateColumns: "36px minmax(0,1fr) 150px 110px 64px", gap: 16, alignItems: "center", padding: "15px 18px", cursor: "pointer", animation: "hup .4s cubic-bezier(.2,.7,.2,1) both", animationDelay: Math.min(i, 20) * 30 + "ms" }}>
              <span style={{ width: 34, height: 34, borderRadius: "var(--r2)", background: "var(--panel2)", display: "grid", placeItems: "center", color: "var(--fg2)" }}>
                <Icon name={r.icon} size={15} />
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                {editing === r.id ? (
                  <input
                    aria-label="Novo título"
                    autoFocus
                    defaultValue={r.title}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Escape") setEditing(null);
                      if (e.key === "Enter") rename(r.id, (e.target as HTMLInputElement).value);
                    }}
                    onBlur={(e) => rename(r.id, e.target.value)}
                    className="au-inline"
                    style={{ fontSize: 14, fontWeight: 500, padding: "4px 8px", border: "1px solid var(--acc)", borderRadius: "var(--r2)", background: "var(--panel)" }}
                  />
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{r.title}</span>
                )}
                <span style={{ fontSize: 12.5, color: "var(--fg2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {hitParts(r.snippet, query).map((p, i) => (p.hit ? <mark key={i} className="au-hit">{p.t}</mark> : p.t))}
                </span>
              </span>
              <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg2)" }}>
                {r.source} · {plural(r.msgs, "mensagem", "mensagens")}
              </span>
              <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)", textAlign: "right", whiteSpace: "nowrap" }}>{r.when}</span>
              <span className="au-rowactions" style={{ display: "flex", gap: 2, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                <button className="au-mini" title="Renomear" aria-label={`Renomear ${r.title}`} onClick={() => setEditing(r.id)}>
                  <Icon name="pencil" size={12} />
                </button>
                <button className="au-mini danger" title="Apagar" aria-label={`Apagar ${r.title}`} onClick={() => remove(r.id, r.title)}>
                  <Icon name="trash-2" size={12} />
                </button>
              </span>
            </div>
          ))}
          {rows?.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "var(--fg3)", fontSize: 13.5 }}>{query.trim() ? "Nenhuma conversa com esse termo." : "Nenhuma conversa ainda — comece uma na Conversa."}</div>}
        </div>
      </div>
    </div>
  );
}
