// Verificações: seis grupos recolhíveis (borda pelo pior status) e, em cada um, as linhas com medidores, frequência,
// sparkline e "Rodar agora". Os bots mostram 6 linhas, sempre incluindo todas as que têm problema.
import { useId, useState } from "react";
import { Icon } from "../Icon";
import type { Check } from "./api";
import { HIcon } from "./icons";
import { agoLabel, countStatuses, freqLabel, GROUPS, groupBorder, groupPills, meters, METER_COLOR, sortChecks, sparkPoints, STATUS, visibleRows, worstStatus } from "./model";

const soft = (c: string, p: number) => `color-mix(in oklab,${c} ${p}%,transparent)`;

/** Sparkline 100×24 na cor do status. `aria-hidden`: a informação também está no texto da linha e na legenda. */
function Spark({ c }: { c: Check }) {
  const pts = sparkPoints(c.history.map((h) => h.value));
  const color = STATUS[c.status].color;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <svg width="100" height="24" viewBox="0 0 100 24" aria-hidden="true" focusable="false">
        {pts ? <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /> : <line x1="1" y1="12" x2="99" y2="12" stroke="var(--line2)" strokeWidth="1.4" strokeDasharray="3 3" />}
      </svg>
      <span className="hl-clip" style={{ fontSize: 10, color: "var(--fg3)" }}>{pts ? c.historyLabel : "sem histórico ainda"}</span>
    </div>
  );
}

function Row({ c, now, busy, fresh, onRun }: { c: Check; now: number; busy: boolean; fresh: boolean; onRun: () => void }) {
  const st = STATUS[c.status];
  const bars = meters(c.result.metrics);
  const text = c.status === "pending" && !c.result.text ? "Aguardando a primeira execução" : (c.result.text ?? "");
  const textColor = c.status === "error" ? "var(--err)" : c.status === "warn" ? "var(--warn)" : "var(--fg2)";
  return (
    <div className={"hl-row" + (c.status === "error" ? " bad" : "") + (fresh ? " fresh" : "")}>
      <span role="img" aria-label={st.label} title={st.label} className={"hl-dot" + (c.status === "error" ? " blink" : "")} style={{ background: st.color, boxShadow: `0 0 0 3px ${soft(st.color, c.status === "ok" ? 15 : 25)}` }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span className="hl-clip" title={c.name} style={{ fontSize: 13.5, fontWeight: 500 }}>{c.name}</span>
        {c.detail && <span className="hl-clip" title={c.detail} style={{ fontSize: 11.5, color: "var(--fg3)" }}>{c.detail}</span>}
      </div>
      <div className="hl-res" style={{ minWidth: 0 }}>
        {bars.length ? (
          <>
            <div className="hl-meters">
              {bars.map((m) => (
                <div key={m.label} className="hl-meter">
                  <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--fg3)" }}>
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
        <Icon name="timer" size={11} />
        {freqLabel(c.intervalSec)}
      </span>
      <Spark c={c} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
        <button className="hl-run" disabled={busy} onClick={onRun} aria-label={`Rodar agora: ${c.name}`}>
          <Icon name={busy ? "loader-circle" : "play"} size={12} className={busy ? "au-spin" : undefined} />
          {busy ? "Rodando…" : "Rodar agora"}
        </button>
        <span style={{ fontSize: 10.5, color: "var(--fg3)" }}>{c.lastRunAt ? agoLabel(now - c.lastRunAt) : "nunca rodou"}</span>
      </div>
    </div>
  );
}

export function ChecksGroups({ checks, now, busy, freshIds, onRun }: { checks: Check[]; now: number; busy: Set<string>; freshIds: Set<string>; onRun: (c: Check) => void }) {
  const uid = useId();
  // Grupo com a verificação recém-criada abre sozinho, mesmo que o usuário o tenha recolhido.
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  // "Ver todos os N bots" aberto, por grupo.
  const [all, setAll] = useState<Record<string, boolean>>({});
  return (
    <>
      {GROUPS.map((g) => {
        const rows = sortChecks(checks.filter((c) => c.group === g.key));
        if (!rows.length) return null;
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
                  <Row key={c.id} c={c} now={now} busy={busy.has(c.id)} fresh={freshIds.has(c.id)} onRun={() => onRun(c)} />
                ))}
                {toggle && (
                  <button className="hl-more" onClick={() => setAll((z) => ({ ...z, [g.key]: !z[g.key] }))}>
                    {all[g.key] ? "Mostrar menos" : `Ver todos os ${rows.length} bots`}
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
