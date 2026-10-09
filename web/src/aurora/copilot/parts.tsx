// Peças da tela Clientes do Copiloto: avatar, pílulas, diálogo, caixa da chave (mostrada uma vez) e erro em linha.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useEscape } from "../channels/parts";
import { Icon } from "../Icon";
import type { Plan, Status } from "./api";
import { avatarColor, initial, planName, STATUS } from "./model";

export function Avatar({ id, name, size = 34 }: { id: string; name: string; size?: number }) {
  return (
    <span className="cp-avatar" aria-hidden="true" style={{ width: size, height: size, borderRadius: size > 40 ? 13 : size > 30 ? 10 : 8, background: avatarColor(id), fontSize: Math.round(size * 0.41) }}>
      {initial(name)}
    </span>
  );
}

export function StatusPill({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span className="cp-pill" style={{ color: s.color, background: `color-mix(in oklab,${s.color} 14%,transparent)` }}>
      <i />
      {s.label}
    </span>
  );
}

export const PlanTag = ({ plan, labels }: { plan: Plan; labels?: Record<string, string> }) => <span className="cp-plan">{planName(plan, labels)}</span>;

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="cp-err">
      <Icon name="circle-alert" size={14} />
      <span>{children}</span>
    </div>
  );
}

/** Diálogo do painel com ícone, título e descrição. `busy` trava o Esc e o clique fora (ex.: durante a criação). Devolve o foco a quem abriu. */
export function CpDialog({
  title,
  lead,
  icon,
  tone,
  role = "dialog",
  width = 500,
  busy,
  onClose,
  children,
  footer,
  header,
}: {
  title: string;
  lead?: ReactNode;
  icon?: string;
  tone?: "err";
  role?: "dialog" | "alertdialog";
  width?: number;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  /** Algo ao lado do título (os passos do "Adicionar cliente"). */
  header?: ReactNode;
}) {
  const tid = useId();
  const lid = useId();
  const box = useRef<HTMLDivElement>(null);
  useEscape(() => !busy && onClose());

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const el = box.current;
    if (el && !el.contains(document.activeElement)) el.focus();
    return () => back?.focus?.();
  }, []);

  // Tab fica dentro do diálogo (aria-modal não prende o foco sozinho).
  const trap = (e: KeyboardEvent) => {
    if (e.key !== "Tab" || !box.current) return;
    const f = [...box.current.querySelectorAll<HTMLElement>('button:not(:disabled),[href],input:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')];
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="cp-scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={box} tabIndex={-1} role={role} aria-modal="true" aria-labelledby={tid} aria-describedby={lead ? lid : undefined} className="cp-dlg" data-tone={tone} style={{ width: `min(${width}px,100%)` }} onKeyDown={trap}>
        <div className="cp-dlg-body">
          <div style={{ display: "flex", flexDirection: header ? "row" : "column", alignItems: header ? "center" : "flex-start", gap: header ? 12 : 10 }}>
            {icon && (
              <span className="cp-dlg-ic" style={header ? { width: 36, height: 36 } : undefined}>
                <Icon name={icon} size={header ? 17 : 19} />
              </span>
            )}
            <h2 id={tid} className="au-display" style={{ margin: 0, fontSize: 20, lineHeight: 1.25 }}>
              {title}
            </h2>
            {header}
          </div>
          {lead && (
            <p id={lid} style={{ margin: 0, fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.5 }}>
              {lead}
            </p>
          )}
          {children}
        </div>
        <div className="cp-dlg-foot">{footer}</div>
      </div>
    </div>
  );
}

/** A chave da API, uma vez. Fica só no estado do diálogo que a gerou: nada vai para o store, o localStorage nem o toast. */
export function KeyBox({ value, label = "Chave da API" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    clearTimeout(t.current);
    t.current = setTimeout(() => setState("idle"), 2500);
  };
  return (
    <div>
      <div className="cp-key">
        <code aria-label={label}>{value}</code>
        <button className="au-outline" style={{ padding: "5px 10px", fontSize: 12 }} onClick={copy}>
          {state === "copied" ? "Copiada" : "Copiar"}
        </button>
      </div>
      <span role="status" aria-live="polite" style={{ display: "block", minHeight: 16, marginTop: 4, fontSize: 11.5, color: state === "failed" ? "var(--err)" : "var(--fg3)" }}>
        {state === "copied" ? "Chave copiada." : state === "failed" ? "Não consegui copiar sozinho: selecione a chave e copie." : ""}
      </span>
    </div>
  );
}

export const spinIcon = (busy: boolean, idle: string) => <Icon name={busy ? "loader-circle" : idle} size={14} className={busy ? "au-spin" : undefined} />;
