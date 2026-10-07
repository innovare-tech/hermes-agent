import { useState } from "react";
import type { ActivityKind } from "../adapter";
import { PageHeader, spot } from "../Chrome";
import { ACTIVITY_KIND, ActivityRow } from "../ops/ActivityRow";
import { inBiz, undoActivity, useStore } from "../store";

export function Activity() {
  const s = useStore((x) => x);
  const [kind, setKind] = useState<ActivityKind | null>(null);
  const list = s.activity.filter((a) => (!kind || a.kind === kind) && inBiz(s)(a));
  const chips: [string, ActivityKind | null][] = [["Tudo", null], ...(Object.keys(ACTIVITY_KIND) as ActivityKind[]).map((k) => [ACTIVITY_KIND[k].label, k] as [string, ActivityKind])];
  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page">
        <PageHeader title="Atividade" sub="Tudo que o Hermes fez em seu nome — com o porquê de cada decisão e o botão de desfazer." noPanic />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {chips.map(([label, k]) => (
            <button key={label} className="au-pill" aria-pressed={kind === k} onClick={() => setKind(k)} style={{ paddingRight: 18 }}>
              {label}
            </button>
          ))}
        </div>
        <div className="au-card" onMouseMove={spot} style={{ padding: "4px 22px" }}>
          {list.map((a, i) => (
            <ActivityRow key={a.id} a={a} delay={Math.min(i, 10) * 40} onUndo={() => undoActivity(a.id)} />
          ))}
          {list.length === 0 && <p style={{ margin: 0, padding: "22px 0", fontSize: 13, color: "var(--fg2)" }}>Nada por aqui ainda.</p>}
        </div>
      </div>
    </div>
  );
}
