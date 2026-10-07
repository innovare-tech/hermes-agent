import type { ReactNode } from "react";
import { BizTag, spot } from "../Chrome";
import { Icon } from "../Icon";

export const RISK_COLOR: Record<string, string> = { baixo: "var(--ok)", médio: "var(--warn)", alto: "var(--err)" };

type Props = {
  icon: string;
  title: string;
  business?: string;
  meta: string;
  risk?: string;
  why?: string;
  preview: string;
  source?: string;
  onApprove: () => void;
  onDeny: () => void;
  /** Ações extras (ex.: "Sempre" / "Nesta sessão" nas aprovações de comando da Conversa). */
  extra?: ReactNode;
  delay?: number;
};

/** Cartão de aprovação: o que o Hermes quer fazer, por quê, prévia exata e Negar/Aprovar. */
export function ApprovalCard({ icon, title, business, meta, risk, why, preview, source, onApprove, onDeny, extra, delay = 0 }: Props) {
  return (
    <div className="au-card" onMouseMove={spot} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12, animation: "hblurin .5s both", animationDelay: delay + "ms" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 36, height: 36, flex: "none", borderRadius: "var(--r2)", background: "var(--accSoft)", color: "var(--acc)", display: "grid", placeItems: "center" }}>
          <Icon name={icon} size={16} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{title}</span>
          <span style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)", flexWrap: "wrap" }}>
            {business && <BizTag id={business} />}
            {meta}
          </span>
        </span>
        {risk && (
          <span className="au-tag" style={{ color: RISK_COLOR[risk] ?? "var(--fg3)" }}>
            risco {risk}
          </span>
        )}
      </div>
      {why && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--fg2)", textWrap: "pretty" }}>{why}</p>}
      <pre className="au-code">{preview}</pre>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {source && <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>{source}</span>}
        <button className="au-outline danger" onClick={onDeny} style={{ marginLeft: "auto" }}>
          Negar
        </button>
        {extra}
        <button className="au-primary" onClick={onApprove}>
          Aprovar
        </button>
      </div>
    </div>
  );
}
