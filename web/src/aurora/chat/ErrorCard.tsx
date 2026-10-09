import { useState } from "react";
import { Icon } from "../Icon";
import type { ChatError } from "./types";

type Props = { error: ChatError; onRetry?: () => void; onSwitchModel?: () => void };

/** Erro do provedor em português: o que houve, o que fazer, e o texto técnico original recolhido. */
export function ErrorCard({ error, onRetry, onSwitchModel }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="au-errcard" role="alert">
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span className="au-errcard-ic">
          <Icon name="circle-alert" size={16} />
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{error.title}</span>
          <span style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>{error.body}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {onRetry && error.retryable && (
          <button className="au-primary" onClick={onRetry}>
            <Icon name="rotate-ccw" size={13} />
            Tentar de novo
          </button>
        )}
        {onSwitchModel && error.switchModel && (
          <button className={error.retryable ? "au-outline" : "au-primary"} onClick={onSwitchModel}>
            Trocar modelo
          </button>
        )}
        {onRetry && !error.retryable && (
          <button className="au-outline" onClick={onRetry}>
            Tentar de novo
          </button>
        )}
        <button className="au-ghost" aria-expanded={open} onClick={() => setOpen(!open)} style={{ marginLeft: "auto", fontSize: 12 }}>
          Detalhe técnico
          <Icon name={open ? "chevron-up" : "chevron-down"} size={12} />
        </button>
      </div>
      {open && <pre className="au-pre" style={{ margin: 0, userSelect: "text" }}>{error.detail}</pre>}
    </div>
  );
}
