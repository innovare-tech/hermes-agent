import type { Activity, ActivityKind } from "../adapter";
import { BizTag } from "../Chrome";
import { Icon } from "../Icon";

export const ACTIVITY_KIND: Record<ActivityKind, { icon: string; color: string; label: string }> = {
  msg: { icon: "send", color: "var(--acc)", label: "Mensagens" },
  cmd: { icon: "square-terminal", color: "var(--fg)", label: "Comandos" },
  pay: { icon: "credit-card", color: "var(--warn)", label: "Pagamentos" },
  mem: { icon: "brain", color: "var(--ok)", label: "Memória" },
  tkt: { icon: "life-buoy", color: "var(--fg2)", label: "Tickets" },
  cfg: { icon: "settings-2", color: "var(--fg2)", label: "Configurações" },
};

/** Uma linha da auditoria: hora, tipo, o que fez, por quê, negócio e Desfazer quando reversível. */
export function ActivityRow({ a, delay, onUndo }: { a: Activity; delay: number; onUndo: () => void }) {
  const k = ACTIVITY_KIND[a.kind];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "46px 28px minmax(0,1fr) auto", gap: 14, alignItems: "start", padding: "15px 0", borderBottom: "1px solid var(--line)", opacity: a.undone ? 0.5 : 1, transition: "opacity .3s", animation: "hblurin .5s both", animationDelay: delay + "ms" }}>
      <span style={{ fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg3)", paddingTop: 5 }}>{a.at}</span>
      <span style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--panel2)", color: k.color }}>
        <Icon name={k.icon} size={13} />
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 14, lineHeight: 1.5, textDecoration: a.undone ? "line-through" : "none" }}>{a.action}</span>
        <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5 }}>Por quê: {a.why}</span>
        <BizTag id={a.business} />
      </div>
      {a.reversible && !a.undone && (
        <button className="au-undo" onClick={onUndo}>
          <Icon name="undo-2" size={12} />
          Desfazer
        </button>
      )}
      {a.undone && <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)", paddingTop: 6 }}>desfeito</span>}
    </div>
  );
}
