import { useState } from "react";
import { useNavigate } from "react-router";
import { PageHeader } from "../Chrome";
import { Icon } from "../Icon";
import { PersonCard } from "../ops/PersonCard";
import { draftToPerson, inBiz, useStore } from "../store";

export function People() {
  const s = useStore((x) => x);
  const navigate = useNavigate();
  const [waitOnly, setWaitOnly] = useState(false);
  const [selId, setSelId] = useState("p1");
  const all = s.people.filter(inBiz(s));
  const list = all.filter((p) => !waitOnly || p.waitingHours > 24);
  const sel = list.find((p) => p.id === selId) ?? list[0];

  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
          <PageHeader title="Pessoas" sub="Todo mundo com quem você fala, em todos os negócios — com o contexto que o Hermes guardou de cada um." noPanic />
          <button className="au-wait" aria-pressed={waitOnly} onClick={() => setWaitOnly(!waitOnly)}>
            <Icon name="hourglass" size={13} />
            Esperando você há +24h
            <span style={{ fontFamily: "var(--fm)", fontSize: 11 }}>{all.filter((p) => p.waitingHours > 24).length}</span>
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16, alignItems: "start" }}>
          <div className="au-card" role="listbox" aria-label="Pessoas" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {list.map((p, i) => (
              <button key={p.id} role="option" aria-selected={sel?.id === p.id} className="au-listrow" onClick={() => setSelId(p.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", animationDelay: i * 45 + "ms" }}>
                <span className="au-avatar" style={{ width: 34, height: 34, fontSize: 12 }}>{p.initials}</span>
                <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: "var(--fg2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.role}</span>
                </span>
                {p.waitingHours > 0 && (
                  <span className="au-tag" style={{ color: p.waitingHours > 24 ? "var(--err)" : "var(--fg3)", padding: "2px 8px" }}>{p.waitingHours}h</span>
                )}
              </button>
            ))}
          </div>
          {sel && <PersonCard p={sel} businessName={s.businesses.find((b) => b.id === sel.business)?.name ?? ""} onDraft={() => draftToPerson(sel)} onHistory={() => navigate("/sessions")} />}
        </div>
      </div>
    </div>
  );
}
