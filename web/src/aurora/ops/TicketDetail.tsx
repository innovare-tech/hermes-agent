import type { Ticket } from "../adapter";
import { spot } from "../Chrome";
import { Icon } from "../Icon";

export const TICKET_STATUS: Record<string, string> = {
  investigando: "var(--warn)",
  "aguardando você": "var(--acc)",
  resolvendo: "var(--warn)",
  resolvido: "var(--ok)",
  aberto: "var(--err)",
};

/** Ticket aberto: mensagem do cliente, erro relacionado nos logs e correção proposta. */
export function TicketDetail({ t, onCard, onReply }: { t: Ticket; onCard: () => void; onReply: () => void }) {
  const color = TICKET_STATUS[t.status] ?? "var(--fg3)";
  return (
    <div className="au-card" onMouseMove={spot} style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="au-label">
          #{t.n} · {t.system}
        </span>
        <span className="au-tag" style={{ marginLeft: "auto", color }}>{t.status}</span>
      </div>
      <span className="au-display" style={{ fontSize: 24, lineHeight: 1.2 }}>{t.title}</span>
      <div style={{ padding: "13px 15px", borderRadius: "var(--r) var(--r) var(--r) 4px", background: "var(--panel2)", fontSize: 13.5, lineHeight: 1.55 }}>
        {t.message}
        <div style={{ marginTop: 6, fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>— {t.client}</div>
      </div>
      {t.relatedError && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="au-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="bug" size={12} color="var(--err)" />
            Erro relacionado nos logs
          </span>
          <pre className="au-code" style={{ fontSize: 11.5, lineHeight: 1.65, color: "var(--fg2)", padding: "12px 14px" }}>{t.relatedError}</pre>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "13px 15px", borderRadius: "var(--r)", background: "var(--accSoft)" }}>
        <Icon name="wand-sparkles" size={15} color="var(--acc)" className="au-mt2" />
        <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--acc)" }}>Correção proposta</span>
          <span style={{ fontSize: 13.5, lineHeight: 1.55 }}>{t.proposedFix}</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="au-outline" onClick={onCard} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="square-kanban" size={14} />
          Abrir card
        </button>
        <button className="au-primary" onClick={onReply} style={{ marginLeft: "auto" }}>
          Responder cliente
        </button>
      </div>
    </div>
  );
}
