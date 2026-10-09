import { useState } from "react";
import { Icon } from "../Icon";
import { inline } from "./Markdown";
import type { CommandCard as Card } from "./types";
import { useReveal } from "./useReveal";

/** Resposta de um comando "/": cartão curto (estado, uso, esforço…) ou bloco de sistema discreto — nunca fala do agente. */
export function CommandCard({ cmd, card, pending }: { cmd: string; card?: Card; pending?: boolean }) {
  const [open, setOpen] = useState(false);
  const rawRef = useReveal<HTMLPreElement>(open);
  if (pending || !card)
    return (
      <div className="au-syscard pending" role="status" aria-label={`Executando ${cmd}`}>
        <Icon name="loader-circle" size={13} className="au-spin" />
        <span className="au-syscmd">{cmd}</span>
      </div>
    );
  const rawLines = (card.raw ?? "").split("\n").length;
  const system = card.kind === "system" && !!card.raw;
  const rawVisible = !!card.raw && (system ? rawLines <= 6 || open : open);
  return (
    <div className={"au-syscard " + card.kind} role="status">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ marginTop: 1, color: card.kind === "error" ? "var(--err)" : "var(--acc)" }}>
          <Icon name={card.icon} size={14} />
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 13.5, fontWeight: card.kind === "system" ? 400 : 600, color: card.kind === "system" ? "var(--fg2)" : "var(--fg)" }}>
            {card.title}
            <span className="au-syscmd" style={{ marginLeft: 8 }}>{cmd}</span>
          </span>
          {card.lines?.map((l) => (
            <span key={l} style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5 }}>{l}</span>
          ))}
          {card.warn && (
            <span className="au-syswarn" role="note">
              <Icon name="triangle-alert" size={13} />
              <span>{inline(card.warn)}</span>
            </span>
          )}
        </div>
        {card.raw && !system && (
          <button className="au-mini" aria-expanded={open} title={open ? "Esconder o texto original" : "Ver o texto original (em inglês)"} aria-label="Texto original do comando" onClick={() => setOpen(!open)}>
            <Icon name={open ? "chevron-up" : "info"} size={12} />
          </button>
        )}
      </div>
      {rawVisible && <pre ref={rawRef} className="au-pre" style={{ margin: "8px 0 0" }}>{card.raw}</pre>}
      {system && rawLines > 6 && (
        <button className="au-more" onClick={() => setOpen(!open)}>
          {open ? "Esconder a saída" : `Ver a saída (${rawLines} linhas)`}
        </button>
      )}
    </div>
  );
}
