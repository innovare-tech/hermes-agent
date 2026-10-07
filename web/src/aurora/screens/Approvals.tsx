import { PageHeader, spot } from "../Chrome";
import { Icon } from "../Icon";
import { ApprovalCard } from "../ops/ApprovalCard";
import { AutonomySegment } from "../ops/AutonomySegment";
import { approve, deny, inBiz, setAutonomy, useStore } from "../store";

export function Approvals() {
  const s = useStore((x) => x);
  const f = inBiz(s);
  const list = s.approvals.filter(f);
  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page">
        <PageHeader title="Aprovações" sub="O que o Hermes quer fazer e precisa do seu ok. Ajuste ao lado o quanto ele pode agir sozinho em cada canal." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 20, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            {list.map((x, i) => (
              <ApprovalCard
                key={x.id}
                icon={x.icon}
                title={x.title}
                business={x.business}
                meta={`${x.kind} · ${x.createdAt}`}
                risk={x.risk}
                why={x.why}
                preview={x.preview}
                source={x.source}
                onApprove={() => approve(x)}
                onDeny={() => deny(x)}
                delay={i * 60}
              />
            ))}
            {list.length === 0 && (
              <div className="au-card" onMouseMove={spot} style={{ padding: 48, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, animation: "hpop .6s cubic-bezier(.3,1.4,.5,1) both" }}>
                <Icon name="shield-check" size={30} color="var(--ok)" />
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>Nada pendente</span>
                <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>O Hermes não precisa de nenhuma decisão sua agora.</span>
              </div>
            )}
          </div>

          <div className="au-card" onMouseMove={spot} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="au-label">Autonomia por canal</span>
            <p style={{ margin: "6px 0 8px", fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5 }}>
              Observar: só lê. Rascunhar: escreve e espera você. Autônomo: responde sozinho e registra na Atividade.
            </p>
            {s.autonomy.filter(f).map((c) => {
              const biz = s.businesses.find((b) => b.id === c.business);
              return (
                <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500 }}>
                    <Icon name={c.icon} size={13} color="var(--fg2)" />
                    {c.name}
                    <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: biz?.color ?? "var(--fg3)" }} />
                  </span>
                  <AutonomySegment channel={c} onPick={(m) => setAutonomy(c, m)} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
