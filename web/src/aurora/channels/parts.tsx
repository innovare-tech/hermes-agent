// Peças da tela Canais: camadas (Esc), diálogo, menu e segmentado de modo, contador −/+ e a sugestão de vínculo.
import { useEffect, useId, useRef, type ReactNode } from "react";
import type { AutonomyMode } from "../adapter";
import { Icon } from "../Icon";
import { getState } from "../store";
import { MODE_INFO, modeBlocked, modeInfo, type ChannelRow } from "./model";

const layers: Array<() => void> = [];

/** Esc fecha só a camada mais alta (menu, diálogo ou gaveta). O diálogo de confirmação global tem a vez dele. */
export function useEscape(onEsc: () => void, active = true) {
  const ref = useRef(onEsc);
  useEffect(() => {
    ref.current = onEsc;
  });
  useEffect(() => {
    if (!active) return;
    const me = () => ref.current();
    layers.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !getState().ask && layers[layers.length - 1] === me) me();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const i = layers.indexOf(me);
      if (i >= 0) layers.splice(i, 1);
    };
  }, [active]);
}

/** Diálogo do Aurora: fundo escurecido, `aria-modal`, Esc e clique fora fecham (a menos que esteja ocupado). */
export function Modal({ title, onClose, busy, width = 480, role = "dialog", children }: { title: string; onClose: () => void; busy?: boolean; width?: number; role?: "dialog" | "alertdialog"; children: ReactNode }) {
  const id = useId();
  useEscape(() => !busy && onClose());
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 75, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 24, animation: "hin .2s ease both" }} onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role={role} aria-modal="true" aria-labelledby={id} className="au-card au-float" style={{ width: `min(${width}px,100%)`, maxHeight: "calc(100vh - 48px)", overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        <span id={id} style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>
          {title}
        </span>
        {children}
      </div>
    </div>
  );
}

/** Fecha ao clicar fora de `ref` (menus). */
export function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.("[data-ch-chip]") && onOutside();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  });
}

/** Chip colorido do modo (abre o menu). */
export function ModeChip({ mode, open, onClick }: { mode: AutonomyMode; open: boolean; onClick: () => void }) {
  const i = modeInfo(mode);
  return (
    <button
      className="au-ch-chip"
      data-ch-chip
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={`Modo: ${i.label}. Trocar`}
      style={{ color: i.color }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon name={i.icon} size={13} />
      {i.label}
      <Icon name="chevron-down" size={12} />
    </button>
  );
}

/** Menu de modo da linha: cada opção explica o que faz; as bloqueadas dizem o motivo. */
export function ModeMenu({ row, onPick, onClose }: { row: ChannelRow; onPick: (m: AutonomyMode) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useOutside(ref, onClose);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, []);
  const move = (e: React.KeyboardEvent, step: number) => {
    e.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]:not([aria-disabled="true"])') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + step + items.length) % items.length]?.focus();
  };
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Modo de ${row.name}`}
      className="au-card au-float au-ch-menu"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => (e.key === "ArrowDown" ? move(e, 1) : e.key === "ArrowUp" ? move(e, -1) : undefined)}
    >
      {MODE_INFO.map((i) => {
        const why = modeBlocked(row, i.mode);
        return (
          <button key={i.mode} role="menuitemradio" aria-checked={row.mode === i.mode} aria-disabled={!!why} className="au-ch-item" onClick={() => !why && onPick(i.mode)}>
            <span style={{ color: i.color, marginTop: 1 }}>
              <Icon name={i.icon} size={16} />
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: i.color }}>{i.label}</span>
              <span style={{ fontSize: 12, lineHeight: 1.45, color: "var(--fg2)" }}>{i.line}</span>
              {why && <span style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--warn)" }}>{why}</span>}
            </span>
            {row.mode === i.mode && <Icon name="check" size={14} color={i.color} />}
          </button>
        );
      })}
    </div>
  );
}

/** Segmentado de modo da gaveta (inclui Escutar). Bloqueado: `aria-disabled` e o motivo escrito logo abaixo. */
export function ModeSegment({ row, onPick }: { row: ChannelRow; onPick: (m: AutonomyMode) => void }) {
  const blocked = MODE_INFO.map((i) => modeBlocked(row, i.mode)).find(Boolean);
  const cur = modeInfo(row.mode);
  return (
    <>
      <div role="radiogroup" aria-label={`Modo de ${row.name}`} style={{ display: "flex", gap: 3, padding: 3, borderRadius: "var(--r2)", background: "var(--panel2)" }}>
        {MODE_INFO.map((i) => {
          const why = modeBlocked(row, i.mode);
          const on = row.mode === i.mode;
          return (
            <button key={i.mode} role="radio" aria-checked={on} aria-disabled={!!why} title={why ?? undefined} className="au-seg" style={{ color: on ? i.color : undefined, opacity: why ? 0.45 : 1, cursor: why ? "not-allowed" : undefined }} onClick={() => !why && onPick(i.mode)}>
              {i.label}
            </button>
          );
        })}
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--fg2)" }}>{cur.line}</p>
      <p style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.45, color: cur.color }}>
        <Icon name={cur.icon} size={14} />
        {cur.guarantee}
      </p>
      {blocked && <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: "var(--warn)" }}>Escutar indisponível: {blocked}</p>}
    </>
  );
}

/** Contador − n + (digitável). `invalid` deixa a borda vermelha. */
export function Stepper({ label, value, min, max, step, invalid, disabled, onChange }: { label: string; value: number; min: number; max: number; step: number; invalid?: boolean; disabled?: boolean; onChange: (n: number) => void }) {
  return (
    <div role="group" aria-label={label} className="au-ch-step" data-invalid={invalid ? "true" : undefined} style={disabled ? { opacity: 0.5 } : undefined}>
      <button type="button" aria-label={`Diminuir ${label}`} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        <Icon name="minus" size={14} />
      </button>
      <input type="number" inputMode="numeric" aria-label={label} aria-invalid={invalid || undefined} disabled={disabled} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? NaN : Math.round(Number(e.target.value)))} />
      <button type="button" aria-label={`Aumentar ${label}`} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}

/** Sugestão de vínculo de um canal sem cliente: confirmar, escolher outro ou "não é cliente". */
export function SuggestionBar({ row, busy, onConfirm, onChoose, onNotClient }: { row: ChannelRow; busy?: boolean; onConfirm: () => void; onChoose: () => void; onNotClient: () => void }) {
  const s = row.suggestion;
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div className="au-ch-sugg" onClick={(e) => e.stopPropagation()}>
      {s ? (
        <>
          <span style={{ flex: 1, minWidth: 220 }}>
            Parece ser o cliente <b>{s.name}</b> <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>(systemClientId {s.clientId})</span> — {Math.round(s.confidence * 100)}% de confiança
          </span>
          <span className="au-ch-bar" role="img" aria-label={`${Math.round(s.confidence * 100)}% de confiança`}>
            <span style={{ width: `${Math.round(s.confidence * 100)}%` }} />
          </span>
          <button className="au-primary" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={busy} onClick={stop(onConfirm)}>
            Confirmar
          </button>
          <button className="au-outline" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={busy} onClick={stop(onChoose)}>
            Escolher outro
          </button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, minWidth: 220, color: "var(--fg2)" }}>Não encontrei um cliente parecido.</span>
          <button className="au-primary" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={busy} onClick={stop(onChoose)}>
            Escolher cliente
          </button>
        </>
      )}
      <button className="au-outline" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={busy} onClick={stop(onNotClient)}>
        Não é cliente
      </button>
    </div>
  );
}
