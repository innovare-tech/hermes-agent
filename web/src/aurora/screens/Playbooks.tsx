import { useState } from "react";
import { BizTag, NotConnectedPage, PageHeader, spot, useNotConnected } from "../Chrome";
import { Icon } from "../Icon";
import { parsePlaybook } from "../ops/playbook";
import { PlaybookFlow } from "../ops/PlaybookFlow";
import { inBiz, savePlaybook, useStore } from "../store";

export function Playbooks() {
  const nc = useNotConnected();
  const s = useStore((x) => x);
  const [draft, setDraft] = useState("");
  const [selId, setSelId] = useState("b1");
  const list = s.playbooks.filter(inBiz(s));
  const sel = list.find((p) => p.id === selId) ?? list[0] ?? s.playbooks[0];

  const create = async () => {
    const p = parsePlaybook(draft, s.biz === "all" ? (s.businesses[0]?.id ?? "all") : s.biz);
    if (p && (await savePlaybook(p, "Fluxo criado · ativo"))) {
      setDraft("");
      setSelId(p.id);
    }
  };

  if (nc) return <NotConnectedPage title="Playbooks" sub="Quando acontecer X, faça Y." icon="workflow" what="Playbooks ainda não têm backend." needs="Criar e executar fluxos “quando X, faça Y” exige salvar e disparar automações (skills + agendamentos e gatilhos do gateway), o que ainda não existe." />;
  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page">
        <PageHeader title="Playbooks" sub="Quando acontecer X, faça Y. Descreva em uma frase — o Hermes monta o fluxo, e você ajusta." noPanic />

        <div className="au-card" onMouseMove={spot} style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <Icon name="wand-sparkles" size={16} color="var(--acc)" />
          <input
            aria-label="Descreva o playbook"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="ex.: quando um cliente pedir nota fiscal no WhatsApp, gere a NF no sistema e envie o PDF"
            style={{ flex: 1, border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 14 }}
          />
          <button className="au-primary" onClick={create} style={{ opacity: draft.trim() ? 1 : 0.45 }}>
            Criar fluxo
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {list.map((p, i) => {
              const on = sel?.id === p.id;
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={on}
                  onClick={() => setSelId(p.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelId(p.id)}
                  style={{ display: "flex", flexDirection: "column", gap: 8, padding: "15px 16px", borderRadius: "var(--r)", border: `1px solid ${on ? "var(--acc)" : "var(--line)"}`, background: "var(--panel)", backdropFilter: "var(--blur)", cursor: "pointer", boxShadow: on ? "0 0 0 3px var(--accSoft)" : "none", transition: "all .25s", animation: "hblurin .5s both", animationDelay: i * 50 + "ms" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                    <button
                      role="switch"
                      aria-checked={p.enabled}
                      aria-label={`${p.enabled ? "Desligar" : "Ligar"} ${p.name}`}
                      className="au-switch"
                      onClick={(e) => {
                        e.stopPropagation();
                        savePlaybook({ ...p, enabled: !p.enabled });
                      }}
                    >
                      <span />
                    </button>
                  </div>
                  <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.45 }}>{p.trigger}</span>
                  <span style={{ display: "flex", gap: 10, alignItems: "center", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>
                    <BizTag id={p.business} />
                    {p.runs} execuções
                  </span>
                </div>
              );
            })}
          </div>
          {sel && <PlaybookFlow key={sel.id} p={sel} />}
        </div>
      </div>
    </div>
  );
}
