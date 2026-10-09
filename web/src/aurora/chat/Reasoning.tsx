import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { Markdown } from "./Markdown";
import { fmtElapsed } from "./toolLabels";
import { useReveal } from "./useReveal";

type Props = { text: string; ms?: number; since?: number; live: boolean };

/** "Pensamento" da resposta: recolhido por padrão, mostra quanto o modelo pensou. */
export function Reasoning({ text, ms, since, live }: Props) {
  const [open, setOpen] = useState(false);
  const body = useReveal<HTMLDivElement>(open);
  const thinking = live && ms == null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!thinking) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [thinking]);
  const label = thinking ? `Pensando${since ? " · " + fmtElapsed(now - since) : "…"}` : ms != null && ms >= 1000 ? `Pensou por ${fmtElapsed(ms)}` : "Pensamento";
  return (
    <div className="au-think">
      <button className="au-ghost" aria-expanded={open} onClick={() => setOpen(!open)} style={{ fontFamily: "var(--fm)", fontSize: 11.5 }}>
        <Icon name={thinking ? "loader-circle" : "brain"} size={13} color="var(--acc)" className={thinking ? "au-spin" : undefined} />
        {label}
        <Icon name={open ? "chevron-up" : "chevron-down"} size={12} />
      </button>
      {open && <div ref={body} className="au-think-body"><Markdown text={text} /></div>}
    </div>
  );
}
