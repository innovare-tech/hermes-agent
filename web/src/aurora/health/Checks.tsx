// Verificações: seis grupos recolhíveis (borda pelo pior status) e, em cada um, as linhas com medidores, frequência,
// sparkline e "Rodar agora". Bots e Kubernetes mostram 6 linhas, sempre incluindo as com problema, atenção ou pausadas.
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../Icon";
import type { Check } from "./api";
import { HIcon } from "./icons";
import { agoLabel, countStatuses, freqLabel, GROUPS, groupBorder, groupPills, meters, METER_COLOR, shortDetail, sortChecks, sparkPoints, STATUS, visibleRows, worstStatus } from "./model";

const soft = (c: string, p: number) => `color-mix(in oklab,${c} ${p}%,transparent)`;

/** Sparkline 100×24 na cor do status. `aria-hidden`: a informação também está no texto da linha e na legenda. */
function Spark({ c }: { c: Check }) {
  const pts = sparkPoints(c.history.map((h) => h.value));
  const color = STATUS[c.status].color;
  return (
    <div className="hl-spark">
      <svg width="100" height="24" viewBox="0 0 100 24" aria-hidden="true" focusable="false">
        {pts ? <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /> : <line x1="1" y1="12" x2="99" y2="12" stroke="var(--line2)" strokeWidth="1.4" strokeDasharray="3 3" />}
      </svg>
      <span className="hl-clip" style={{ fontSize: 11.5, color: "var(--fg3)" }}>{pts ? c.historyLabel : "sem histórico ainda"}</span>
    </div>
  );
}

export type RowActions = { onRun: (c: Check) => void; onPause: (c: Check, paused: boolean) => void; onRemove: (c: Check) => void };

/** "⋯": Pausar/Retomar e Remover… (a confirmação fica dentro do menu). Esc e clique fora fecham e o foco volta ao "⋯". */
function RowMenu({ c, busy, actions }: { c: Check; busy: boolean; actions: RowActions }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const close = (refocus: boolean) => {
    setOpen(false);
    setConfirm(false);
    if (refocus) btn.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(true);
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && close(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);
  // Foco no primeiro item ao abrir e em "Cancelar" ao pedir a confirmação.
  useEffect(() => {
    if (open) wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, confirm]);
  const paused = c.status === "paused";
  return (
    <div ref={wrap} className="hl-menuwrap">
      <button ref={btn} className="hl-more-btn" aria-label={`Mais ações: ${c.name}`} aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => (open ? close(false) : setOpen(true))}>
        <Icon name="ellipsis" size={15} />
      </button>
      {open && (
        <div role="menu" aria-label={`Ações de ${c.name}`} className="hl-menu">
          {confirm ? (
            <>
              <span className="hl-menu-q">Remover esta verificação? O histórico some.</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button role="menuitem" className="hl-menu-btn" onClick={() => setConfirm(false)}>
                  Cancelar
                </button>
                <button
                  role="menuitem"
                  className="hl-menu-btn danger"
                  onClick={() => {
                    close(false);
                    actions.onRemove(c);
                  }}
                >
                  Remover
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                role="menuitem"
                className="hl-menu-item"
                title={paused ? undefined : "Para de rodar e de chamar a equipe (ex.: número banido, canal desativado)"}
                onClick={() => {
                  close(true);
                  actions.onPause(c, !paused);
                }}
              >
                <Icon name={paused ? "play" : "pause"} size={13} />
                {paused ? "Retomar" : "Pausar"}
              </button>
              <button role="menuitem" className="hl-menu-item danger" onClick={() => setConfirm(true)}>
                <Icon name="trash-2" size={13} />
                Remover…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ c, now, busy, fresh, actions }: { c: Check; now: number; busy: boolean; fresh: boolean; actions: RowActions }) {
  const st = STATUS[c.status];
  const bars = c.status === "paused" ? [] : meters(c.result.metrics);
  const text =
    c.status === "paused" ? "Pausada: não roda nem abre incidente" : c.status === "pending" && !c.result.text ? "Aguardando a primeira execução" : (c.result.text ?? "");
  const textColor = c.status === "error" ? "var(--err)" : c.status === "warn" ? "var(--warn)" : "var(--fg2)";
  const detail = shortDetail(c.detail);
  return (
    <div className={"hl-row" + (c.status === "error" ? " bad" : "") + (fresh ? " fresh" : "")}>
      <span role="img" aria-label={st.label} title={st.label} className={"hl-dot" + (c.status === "error" ? " blink" : "")} style={{ background: st.color, boxShadow: `0 0 0 3px ${soft(st.color, c.status === "ok" ? 15 : 25)}` }} />
      <div className="hl-namec">
        <span className="hl-clip" title={c.name} style={{ fontSize: 13.5, fontWeight: 500 }}>{c.name}</span>
        {detail && <span className="hl-clip" title={detail} style={{ fontSize: 11.5, color: "var(--fg3)" }}>{detail}</span>}
      </div>
      <div className="hl-res">
        {bars.length ? (
          <>
            <div className="hl-meters">
              {bars.map((m) => (
                <div key={m.label} className="hl-meter">
                  <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--fg3)" }}>
                    <span>{m.label}</span>
                    <span className="hl-mono" style={{ color: m.tone === "ok" ? "var(--fg2)" : METER_COLOR[m.tone] }}>{Math.round(m.value)}%</span>
                  </span>
                  <span className="bar" role="presentation">
                    <span style={{ width: `${m.value}%`, background: METER_COLOR[m.tone] }} />
                  </span>
                </div>
              ))}
            </div>
            {c.status !== "ok" && text && <span style={{ display: "block", marginTop: 5, fontSize: 11.5, color: textColor, lineHeight: 1.4 }}>{text}</span>}
          </>
        ) : (
          <span style={{ display: "block", fontSize: 12.5, color: textColor, lineHeight: 1.4 }}>{text || "—"}</span>
        )}
      </div>
      <span className="hl-chip">
        <Icon name={c.status === "paused" ? "pause" : "timer"} size={11} />
        {c.status === "paused" ? "pausada" : freqLabel(c.intervalSec)}
      </span>
      <Spark c={c} />
      <div className="hl-acts">
        <div className="hl-btns">
          {c.status === "paused" ? (
            <button className="hl-run" disabled={busy} onClick={() => actions.onPause(c, false)} aria-label={`Retomar: ${c.name}`}>
              <Icon name="play" size={12} />
              Retomar
            </button>
          ) : (
            <button className="hl-run" disabled={busy} onClick={() => actions.onRun(c)} aria-label={`Rodar agora: ${c.name}`}>
              <Icon name={busy ? "loader-circle" : "play"} size={12} className={busy ? "au-spin" : undefined} />
              {busy ? "Rodando…" : "Rodar agora"}
            </button>
          )}
          <RowMenu c={c} busy={busy} actions={actions} />
        </div>
        <span className="hl-ago">{c.lastRunAt ? agoLabel(now - c.lastRunAt) : "nunca rodou"}</span>
      </div>
    </div>
  );
}

/** Microserviços sem nenhum endereço: o grupo aparece mesmo assim, com o convite. */
function EmptyServices({ onConnections }: { onConnections: () => void }) {
  const g = GROUPS.find((x) => x.key === "services")!;
  return (
    <div className="hl-group">
      <div className="hl-ghead" style={{ cursor: "default" }}>
        <span style={{ width: 32, height: 32, flex: "none", borderRadius: 10, background: "var(--panel2)", color: "var(--fg2)", display: "grid", placeItems: "center" }}>
          <HIcon name={g.icon} size={15} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <span className="hl-gname" style={{ fontSize: 14.5, fontWeight: 600 }}>{g.label}</span>
          <span style={{ fontSize: 12, color: "var(--fg2)" }}>Nenhum serviço ainda. Adicione os endereços de /health em Conexões.</span>
        </span>
        <button className="au-outline" onClick={onConnections} style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
          <Icon name="plug" size={13} color="var(--acc)" />
          Abrir Conexões
        </button>
      </div>
    </div>
  );
}

export function ChecksGroups({ checks, now, busy, freshIds, actions, onConnections }: { checks: Check[]; now: number; busy: Set<string>; freshIds: Set<string>; actions: RowActions; onConnections: () => void }) {
  const uid = useId();
  // Grupo com a verificação recém-criada abre sozinho, mesmo que o usuário o tenha recolhido.
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  // "Ver todos os N …" aberto, por grupo.
  const [all, setAll] = useState<Record<string, boolean>>({});
  return (
    <>
      {GROUPS.map((g) => {
        // Problemas primeiro, depois a recém-criada (fica visível mesmo com o corte dos 6), depois o resto.
        const sorted = sortChecks(checks.filter((c) => c.group === g.key));
        const bad = (c: Check) => c.status === "error" || c.status === "warn";
        const rows = [...sorted.filter(bad), ...sorted.filter((c) => !bad(c) && freshIds.has(c.id)), ...sorted.filter((c) => !bad(c) && !freshIds.has(c.id))];
        if (!rows.length) return g.key === "services" ? <EmptyServices key={g.key} onConnections={onConnections} /> : null;
        const counts = countStatuses(rows);
        const worst = worstStatus(rows.map((r) => r.status));
        const hasFresh = rows.some((r) => freshIds.has(r.id));
        const open = !closed[g.key] || hasFresh;
        const { shown, toggle } = visibleRows(rows, g.limit, !!all[g.key]);
        const panel = `${uid}-${g.key}`;
        return (
          <div key={g.key} className="hl-group" style={{ borderColor: groupBorder(worst) }}>
            <button className="hl-ghead" aria-expanded={open} aria-controls={panel} onClick={() => setClosed((z) => ({ ...z, [g.key]: open }))}>
              <span style={{ width: 32, height: 32, flex: "none", borderRadius: 10, background: "var(--panel2)", color: "var(--fg2)", display: "grid", placeItems: "center" }}>
                <HIcon name={g.icon} size={15} />
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                <span className="hl-gname" style={{ fontSize: 14.5, fontWeight: 600 }}>{g.label}</span>
                <span style={{ fontSize: 12, color: "var(--fg2)" }}>{g.desc}</span>
              </span>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {groupPills(counts).map((p) => (
                  <span key={p.status} className="hl-pill" style={{ background: soft(STATUS[p.status].color, 14), color: STATUS[p.status].color }}>
                    <i aria-hidden="true" />
                    {p.label}
                  </span>
                ))}
              </span>
              <Icon name={open ? "chevron-up" : "chevron-down"} size={15} color="var(--fg3)" />
            </button>
            {open && (
              <div id={panel}>
                {shown.map((c) => (
                  <Row key={c.id} c={c} now={now} busy={busy.has(c.id)} fresh={freshIds.has(c.id)} actions={actions} />
                ))}
                {toggle && (
                  <button className="hl-more" onClick={() => setAll((z) => ({ ...z, [g.key]: !z[g.key] }))}>
                    {all[g.key] ? "Mostrar menos" : `Ver todos os ${rows.length} ${g.unit ?? "itens"}`}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
