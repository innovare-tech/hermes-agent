import { useState } from "react";
import { spot } from "../Chrome";
import { Icon } from "../Icon";
import { clock, expiresIn, originMeta, requestedBy, span, type ApprovalRow } from "../permissions/model";

/** Pedido de ação (escrita) pendente das Permissões: o que, quem pediu e o comando exato. */
export function ActionRequestCard({ r, onDecide, delay = 0 }: { r: ApprovalRow; onDecide: (r: ApprovalRow, approve: boolean) => Promise<boolean>; delay?: number }) {
  const [busy, setBusy] = useState(false);
  const o = originMeta(r.origin);
  const left = expiresIn(r);
  const decide = async (approve: boolean) => {
    setBusy(true);
    const ok = await onDecide(r, approve);
    if (!ok) setBusy(false); // aprovado/negado: o cartão sai da lista
  };
  return (
    <div className="au-card" onMouseMove={spot} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12, animation: "hblurin .5s both", animationDelay: delay + "ms", borderColor: "color-mix(in oklab,var(--warn) 45%,transparent)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 36, height: 36, flex: "none", borderRadius: "var(--r2)", background: "var(--accSoft)", color: "var(--acc)", display: "grid", placeItems: "center" }}>
          <Icon name={o.icon} size={16} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{r.summary || "Pedido de ação"}</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>
            {requestedBy(r) ? `Pedido por ${requestedBy(r)}` : `Pedido pelo ${o.label}`} · {clock(r.at)}
          </span>
        </span>
        {left !== null && (
          <span className="au-tag" style={{ color: "var(--warn)" }}>
            {left > 0 ? `expira em ${span(left)}` : "expirando"}
          </span>
        )}
      </div>
      <pre className="au-code" aria-label="Comando exato" style={{ fontFamily: "var(--fm)", maxHeight: 160, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {r.command}
      </pre>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button className="au-outline danger" disabled={busy} onClick={() => decide(false)} style={{ marginLeft: "auto" }} aria-label={`Negar: ${r.summary ?? "pedido"}`.slice(0, 120)}>
          Negar
        </button>
        <button className="au-primary" disabled={busy} onClick={() => decide(true)} aria-label={`Aprovar: ${r.summary ?? "pedido"}`.slice(0, 120)}>
          <Icon name={busy ? "loader-circle" : "check"} size={13} className={busy ? "au-spin" : undefined} />
          {busy ? "Decidindo…" : "Aprovar"}
        </button>
      </div>
    </div>
  );
}
