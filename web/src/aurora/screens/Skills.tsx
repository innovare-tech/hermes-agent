import { useState } from "react";
import { spot } from "../Chrome";
import { Icon } from "../Icon";
import { agent, useAgentData } from "../agent";
import type { Skill } from "../agent/types";
import { toast } from "../store";
import { AgentHeader } from "./Sessions";

const ORIGIN: Record<Skill["origin"], string> = { incluida: "Incluída no Hermes", hub: "Instalada do Hub", local: "Criada aqui" };
const FILTERS: [string, Skill["origin"] | null][] = [
  ["Todas", null],
  ["Incluídas no Hermes", "incluida"],
  ["Do Hub", "hub"],
  ["Criadas aqui", "local"],
];

/** Tira trechos em chinês/japonês/coreano entre parênteses (vêm de skills de terceiros sem tradução). */
export const cleanDescription = (d: string) => d.replace(/\s*[（(][^()（）]*[぀-ヿ㐀-鿿가-힯][^()（）]*[)）]/g, "").trim();

function Detail({ s, onToggle, onClose }: { s: Skill; onToggle: () => void; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const open = async () => {
    try {
      setContent(await agent.skillContent(s.name));
    } catch {
      toast("Não consegui abrir o conteúdo da skill");
    }
  };
  return (
    <div className="au-card" style={{ gridColumn: "1 / -1", padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: "var(--fm)", fontSize: 15, fontWeight: 600 }}>/{s.name}</span>
        <span className="au-chip">{ORIGIN[s.origin]}</span>
        {s.category && <span className="au-chip">{s.category}</span>}
        <button role="switch" aria-checked={s.enabled} aria-label={`${s.enabled ? "Desligar" : "Ligar"} ${s.name}`} className="au-switch lg" onClick={onToggle} style={{ marginLeft: "auto" }}>
          <span />
        </button>
        <button className="au-mini" aria-label="Fechar detalhe" onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--fg2)" }}>{cleanDescription(s.description)}</p>
      <span style={{ fontSize: 12.5, color: "var(--fg3)" }}>
        {s.uses ? `Usada ${s.uses} ${s.uses === 1 ? "vez" : "vezes"}.` : "Ainda não foi usada."} {s.enabled ? "Ligada: o Hermes pode usar quando fizer sentido." : "Desligada: o Hermes não usa."}
      </span>
      {content === null ? (
        <button className="au-outline" onClick={open} style={{ alignSelf: "flex-start" }}>
          Ver o procedimento completo
        </button>
      ) : (
        <pre className="au-pre" style={{ maxHeight: 360 }}>{content}</pre>
      )}
    </div>
  );
}

export function Skills() {
  const [skills, setSkills] = useAgentData(() => agent.skills(), []);
  const [filter, setFilter] = useState<Skill["origin"] | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const needle = q.trim().toLowerCase();
  const list = (skills ?? []).filter((s) => (!filter || s.origin === filter) && (!needle || s.name.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle)));
  const count = (k: Skill["origin"] | null) => (skills ?? []).filter((s) => !k || s.origin === k).length;

  const toggle = async (s: Skill) => {
    try {
      await agent.toggleSkill(s.name, !s.enabled);
    } catch {
      return toast("Não consegui alterar a skill");
    }
    setSkills((skills ?? []).map((x) => (x.name === s.name ? { ...x, enabled: !s.enabled } : x)));
    toast(`/${s.name} ${s.enabled ? "desligada" : "ligada"}`);
  };

  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page au-page-agent">
        <AgentHeader title="Skills" sub="Procedimentos que o Hermes sabe seguir: os que vêm com ele, os instalados do Hub e os criados nesta máquina." />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: "var(--r2)", border: "1px solid var(--line2)", background: "var(--panel)", flex: "1 1 260px", maxWidth: 380 }}>
            <Icon name="search" size={14} color="var(--fg3)" />
            <input aria-label="Buscar skill" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou descrição" style={{ flex: 1, border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 13.5 }} />
          </div>
          {FILTERS.map(([label, k]) => (
            <button key={label} className="au-pill au-pill-agent" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {label} <span style={{ opacity: 0.6 }}>{count(k)}</span>
            </button>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "var(--fg3)" }}>As descrições das skills incluídas vêm em inglês, como o Hermes as distribui.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 14 }}>
          {list.map((s, i) =>
            s.name === sel ? (
              <Detail key={s.name} s={s} onToggle={() => toggle(s)} onClose={() => setSel(null)} />
            ) : (
              <button key={s.name} className="au-card au-skill" onMouseMove={spot} onClick={() => setSel(s.name)} style={{ animationDelay: Math.min(i, 20) * 30 + "ms", textAlign: "left", cursor: "pointer", opacity: s.enabled ? 1 : 0.55 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "var(--fm)", fontSize: 13, fontWeight: 500 }}>/{s.name}</span>
                  <span style={{ marginLeft: "auto", fontSize: 10.5, padding: "2px 8px", borderRadius: 999, color: s.origin === "local" ? "var(--acc)" : "var(--fg2)", background: s.origin === "local" ? "var(--accSoft)" : "var(--panel2)" }}>{ORIGIN[s.origin]}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--fg2)", textWrap: "pretty", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{cleanDescription(s.description)}</p>
                <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: "var(--fg3)" }}>
                  <span>{s.uses ? `${s.uses} ${s.uses === 1 ? "uso" : "usos"}` : "nunca usada"}</span>
                  {!s.enabled && <span>desligada</span>}
                </div>
              </button>
            ),
          )}
          {skills && list.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: "var(--fg3)" }}>{needle ? "Nenhuma skill com esse termo." : "Nenhuma skill nesta categoria."}</p>}
        </div>
      </div>
    </div>
  );
}
