import type { Person } from "../adapter";
import { spot } from "../Chrome";
import { Icon } from "../Icon";

/** Ficha de uma pessoa: espera, contexto guardado pelo Hermes e pendências. */
export function PersonCard({ p, businessName, onDraft, onHistory }: { p: Person; businessName: string; onDraft: () => void; onHistory: () => void }) {
  const wc = p.waitingHours > 24 ? "var(--err)" : "var(--acc)";
  const fields = [
    { k: "Negócio", v: businessName },
    { k: "Último assunto", v: p.lastTopic },
    { k: "Tom preferido", v: p.tone },
    { k: "Canais", v: p.channels },
  ];
  return (
    <div className="au-card" onMouseMove={spot} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span className="au-avatar" style={{ width: 56, height: 56, fontSize: 16 }}>{p.initials}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
          <span className="au-display" style={{ lineHeight: 1, fontSize: 28 }}>{p.name}</span>
          <span style={{ fontSize: 13, color: "var(--fg2)" }}>{p.role}</span>
        </div>
      </div>
      {p.waitingHours > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: "var(--r2)", border: `1px solid ${wc}`, fontSize: 13 }}>
          <Icon name="hourglass" size={14} color={wc} />
          Esperando sua resposta há {p.waitingHours}h
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
        {fields.map((f) => (
          <div key={f.k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="au-label">{f.k}</span>
            <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{f.v}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="au-label">Pendências</span>
        {(p.pending.length ? p.pending : ["Nada pendente"]).map((pd) => (
          <div key={pd} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
            <span aria-hidden="true" style={{ width: 16, height: 16, flex: "none", borderRadius: 5, border: "1.5px solid var(--line2)" }} />
            {pd}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="au-primary" onClick={onDraft}>
          <Icon name="pen-line" size={14} />
          Rascunhar mensagem
        </button>
        <button className="au-outline" onClick={onHistory}>
          Ver histórico
        </button>
      </div>
    </div>
  );
}
