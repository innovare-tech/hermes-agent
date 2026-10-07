import { useState } from "react";
import { spot } from "../Chrome";
import { Icon } from "../Icon";
import { agent, useAgentData } from "../agent";
import type { MemoryData, MemoryTarget } from "../agent/types";
import { ask, toast } from "../store";
import { AgentHeader } from "./Sessions";

const SECTIONS: { target: MemoryTarget; file: string; icon: string; hint: string; empty: string }[] = [
  { target: "memory", file: "Notas do agente", icon: "file-text", hint: "o que ele aprendeu sobre o trabalho", empty: "O Hermes ainda não guardou nenhuma nota." },
  { target: "user", file: "Sobre você", icon: "user-round", hint: "suas preferências e jeito de trabalhar", empty: "Nada sobre você ainda — conte suas preferências." },
];

function Entry({ text, onSave, onForget, delay }: { text: string; onSave: (t: string) => Promise<boolean>; onForget: () => void; delay: number }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  return (
    <div className="au-card au-mem" onMouseMove={spot} style={{ animationDelay: delay + "ms" }}>
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onSave(value)) setEditing(false);
          }}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <textarea aria-label="Editar memória" autoFocus rows={3} value={value} onChange={(e) => setValue(e.target.value)} className="au-memedit" />
          <div style={{ display: "flex", gap: 6 }}>
            <button type="submit" className="au-primary" style={{ padding: "6px 12px", fontSize: 12.5 }}>
              Salvar
            </button>
            <button type="button" className="au-outline" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => (setValue(text), setEditing(false))}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, textWrap: "pretty", whiteSpace: "pre-wrap" }}>{text}</p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
            <button className="au-mini" title="Editar" aria-label="Editar" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={12} />
            </button>
            <button className="au-mini danger" title="Esquecer" aria-label="Esquecer" onClick={onForget}>
              <Icon name="trash-2" size={12} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Memory() {
  const [data, setData] = useAgentData(() => agent.memory(), []);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState<Record<MemoryTarget, string>>({ memory: "", user: "" });

  const apply = async (op: () => Promise<MemoryData>, done: string) => {
    try {
      setData(await op());
      toast(done);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "A memória recusou a alteração");
      return false;
    }
  };

  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page au-page-agent" style={{ gap: 28 }}>
        <AgentHeader title="Memória" sub="O que o Hermes sabe sobre você e seus projetos. Edite ou esqueça.">
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: "var(--r2)", border: "1px solid var(--line2)", background: "var(--panel)", minWidth: 260 }}>
            <Icon name="search" size={14} color="var(--fg3)" />
            <input aria-label="Filtrar memórias" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar memórias" style={{ flex: 1, border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 13.5 }} />
          </div>
        </AgentHeader>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 24, alignItems: "start" }}>
          {SECTIONS.map((sec) => {
            const all = data?.[sec.target] ?? [];
            const entries = all.filter((t) => !q || t.toLowerCase().includes(q.toLowerCase()));
            const used = all.join("\n§\n").length;
            const limit = data?.limits[sec.target] ?? 0;
            return (
              <section key={sec.target} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>
                  <Icon name={sec.icon} size={12} />
                  {sec.file} · {sec.hint}
                  <span style={{ marginLeft: "auto" }} title="Espaço usado: quando enche, o Hermes resume para caber">
                    {used.toLocaleString("pt-BR")} de {limit.toLocaleString("pt-BR")} caracteres
                  </span>
                </div>
                {data && !data.enabled[sec.target] && <p style={{ margin: 0, fontSize: 12.5, color: "var(--warn)" }}>Desligado na configuração do agente.</p>}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const text = adding[sec.target].trim();
                    if (text && (await apply(() => agent.addMemory(sec.target, text), "Guardado na memória"))) setAdding({ ...adding, [sec.target]: "" });
                  }}
                  style={{ display: "flex", gap: 8 }}
                >
                  <input aria-label={`Nova entrada em ${sec.file}`} className="au-meminput" value={adding[sec.target]} onChange={(e) => setAdding({ ...adding, [sec.target]: e.target.value })} placeholder={sec.target === "user" ? "Ex.: prefere respostas curtas, em português" : "Ex.: deploy só às terças, depois das 14h"} />
                  <button type="submit" className="au-outline" style={{ opacity: adding[sec.target].trim() ? 1 : 0.5 }}>
                    Adicionar
                  </button>
                </form>
                {entries.map((t, i) => (
                  <Entry key={t} text={t} delay={i * 45} onSave={(v) => (v.trim() === t ? Promise.resolve(true) : apply(() => agent.editMemory(sec.target, t, v), "Memória atualizada"))} onForget={async () => (await ask({ title: "Esquecer esta memória?", body: "O Hermes deixa de saber disso.", confirm: "Esquecer", danger: true })) && apply(() => agent.removeMemory(sec.target, t), "Esquecido")} />
                ))}
                {data && all.length === 0 && <p style={{ margin: 0, fontSize: 13, color: "var(--fg3)" }}>{sec.empty}</p>}
                {data && all.length > 0 && entries.length === 0 && <p style={{ margin: 0, fontSize: 13, color: "var(--fg3)" }}>Nada com esse termo.</p>}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
