import { useState } from "react";
import { spot } from "../Chrome";
import { Icon } from "../Icon";
import { agent, useAgentData } from "../agent";
import type { MemoryEntry } from "../agent/types";
import { toast } from "../store";
import { AgentHeader } from "./Sessions";

export function Memory() {
  const [data, setData] = useAgentData(() => agent.memory(), []);
  const [q, setQ] = useState("");
  const entries = data?.entries.filter((m) => !q || m.text.toLowerCase().includes(q.toLowerCase())) ?? [];

  const save = async (next: MemoryEntry[], done?: string) => {
    if (!data) return;
    try {
      await agent.setMemory(next);
    } catch {
      return toast("Não consegui salvar a memória");
    }
    setData({ ...data, entries: next });
    if (done) toast(done);
  };

  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page au-page-agent" style={{ gap: 28 }}>
        <AgentHeader title="Memória" sub="O que o Hermes sabe sobre você e seus projetos. Edite, fixe ou esqueça.">
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: "var(--r2)", border: "1px solid var(--line2)", background: "var(--panel)", minWidth: 260 }}>
            <Icon name="search" size={14} color="var(--fg3)" />
            <input aria-label="Filtrar memórias" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar memórias" style={{ flex: 1, border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 13.5 }} />
          </div>
        </AgentHeader>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 24, alignItems: "start" }}>
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>
              <Icon name="file-text" size={12} />
              MEMORY.md<span style={{ marginLeft: "auto" }}>{entries.length} entradas</span>
            </div>
            {entries.map((m, i) => (
              <div key={m.id} className="au-card au-mem" onMouseMove={spot} style={{ borderColor: m.pinned ? "var(--line2)" : undefined, animationDelay: i * 45 + "ms" }}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, textWrap: "pretty" }}>{m.text}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>
                  <span style={{ padding: "2px 8px", borderRadius: 999, background: "var(--panel2)", color: "var(--fg2)" }}>{m.kind}</span>
                  {m.source}
                  <span style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                    <button className="au-mini" title={m.pinned ? "Desafixar" : "Fixar"} aria-pressed={m.pinned} style={{ color: m.pinned ? "var(--acc)" : undefined }} onClick={() => save(data!.entries.map((x) => (x.id === m.id ? { ...x, pinned: !x.pinned } : x)), m.pinned ? undefined : "Memória fixada")}>
                      <Icon name="pin" size={12} />
                    </button>
                    <button
                      className="au-mini"
                      title="Editar"
                      onClick={() => {
                        const text = window.prompt("Editar memória", m.text)?.trim();
                        if (text && text !== m.text) save(data!.entries.map((x) => (x.id === m.id ? { ...x, text } : x)), "Memória atualizada");
                      }}
                    >
                      <Icon name="pencil" size={12} />
                    </button>
                    <button className="au-mini danger" title="Esquecer" onClick={() => save(data!.entries.filter((x) => x.id !== m.id), "Esquecido")}>
                      <Icon name="trash-2" size={12} />
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>
              <Icon name="user-round" size={12} />
              USER.md · modelo de você
            </div>
            <div style={{ padding: 20, borderRadius: "var(--r)", background: "var(--panel)", backdropFilter: "var(--blur)", border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 16 }}>
              {data?.profile.map((p) => (
                <div key={p.k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="au-label">{p.k}</span>
                  <span style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{p.v}</span>
                </div>
              ))}
            </div>
            {data?.note && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "14px 16px", borderRadius: "var(--r)", border: "1px dashed var(--line2)", color: "var(--fg2)", fontSize: 12.5, lineHeight: 1.55 }}>
                <Icon name="sparkles" size={14} color="var(--acc)" className="au-mt2" />
                {data.note}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
