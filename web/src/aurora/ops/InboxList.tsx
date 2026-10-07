import type { InboxItem, Priority } from "../adapter";
import { BizTag, CHANNEL_ICON } from "../Chrome";
import { Icon } from "../Icon";

export const PRIORITY: Record<Priority, { label: string; color: string }> = {
  urgente: { label: "urgente", color: "var(--err)" },
  voce: { label: "precisa de você", color: "var(--acc)" },
  resolve: { label: "Hermes resolve", color: "var(--ok)" },
  ignorar: { label: "ignorar", color: "var(--fg3)" },
};

export const INBOX_TABS: [string, Priority | null][] = [
  ["Todas", null],
  ["Urgente", "urgente"],
  ["Você", "voce"],
  ["Hermes resolve", "resolve"],
  ["Ignorar", "ignorar"],
];

export function InboxList({ items, selected, onPick }: { items: InboxItem[]; selected?: string; onPick: (id: string) => void }) {
  if (items.length === 0)
    return (
      <div style={{ padding: "60px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", animation: "hpop .6s cubic-bezier(.3,1.4,.5,1) both" }}>
        <Icon name="party-popper" size={30} color="var(--acc)" />
        <span style={{ fontSize: 14.5, fontWeight: 600 }}>Caixa zerada</span>
        <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>Nada esperando por você aqui.</span>
      </div>
    );
  return (
    <div role="listbox" aria-label="Mensagens" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {items.map((x, i) => {
        const p = PRIORITY[x.priority];
        return (
          <button key={x.id} role="option" aria-selected={x.id === selected} className="au-row" onClick={() => onPick(x.id)} style={{ animationDelay: i * 40 + "ms" }}>
            <span className="au-avatar" style={{ width: 34, height: 34, fontSize: 12 }}>{x.initials}</span>
            <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.from}</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)", flex: "none" }}>{x.receivedAt}</span>
              </span>
              <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.4 }}>{x.summary}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>
                <Icon name={CHANNEL_ICON[x.channel] ?? "message-circle"} size={11} />
                {x.channel}
                <BizTag id={x.business} />
                <span style={{ marginLeft: "auto", color: p.color, whiteSpace: "nowrap" }}>{p.label}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
