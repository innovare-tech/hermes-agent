// Modelos › Limites: gasto de hoje e do mês contra o limite, aviso em % e o que fazer quando bater.
import { ALERT_OPTS, LIMIT_STEP, ON_LIMIT, limitView, projectMonth, usd, type LimitsCfg, type Spend } from "./api";
import { MIcon } from "./icons";

export function LimitsPanel({ spend, lim, setLim, profileName }: { spend: Spend | null; lim: LimitsCfg; setLim: (fn: (l: LimitsCfg) => LimitsCfg) => void; profileName: string }) {
  const proj = spend ? projectMonth(spend) : 0;
  const cards = [
    { key: "dailyUsd" as const, label: "Por dia", spent: spend?.today ?? null, limit: lim.dailyUsd, step: LIMIT_STEP.day, month: false },
    { key: "monthlyUsd" as const, label: "Por mês", spent: spend?.month ?? null, limit: lim.monthlyUsd, step: LIMIT_STEP.month, month: true },
  ];
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h2 className="mdl-h2">Limites</h2>
        <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>Quanto este perfil pode gastar com IA. Vale só para {profileName}.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
        {cards.map((c) => {
          const v = c.spent == null ? null : limitView(c.spent, c.limit, lim.alertPct);
          const projPct = (proj / c.limit) * 100;
          const projOver = projPct > 100;
          const showProj = c.month && !!spend;
          const note = !v ? "" : c.month ? (projOver ? `No ritmo atual o mês fecha em ~${usd(proj)}, acima do limite. Aumente o limite ou troque modelos caros.` : `No ritmo atual o mês fecha em ~${usd(proj)} (linha tracejada).`) : "Já passou do alerta de hoje.";
          return (
            <div key={c.key} className="au-card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 18, borderColor: v?.border }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                  <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>{c.label}</span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontFamily: "var(--fd)", fontWeight: 600, fontSize: 30, letterSpacing: "-.02em", lineHeight: 1 }}>{c.spent == null ? "—" : usd(c.spent)}</span>
                    <span style={{ fontSize: 13, color: "var(--fg2)" }}>de {usd(c.limit)}</span>
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                  <span style={{ fontSize: 11, color: "var(--fg3)" }}>Limite</span>
                  <div className="mdl-step">
                    <button title="Diminuir" aria-label={`Diminuir o limite ${c.label.toLowerCase()}`} disabled={c.limit <= c.step} onClick={() => setLim((l) => ({ ...l, [c.key]: Math.max(c.step, l[c.key] - c.step) }))}>
                      <MIcon name="minus" size={13} />
                    </button>
                    <span style={{ minWidth: 62, textAlign: "center", fontFamily: "var(--fm)", fontSize: 12.5 }}>{usd(c.limit)}</span>
                    <button title="Aumentar" aria-label={`Aumentar o limite ${c.label.toLowerCase()}`} onClick={() => setLim((l) => ({ ...l, [c.key]: l[c.key] + c.step }))}>
                      <MIcon name="plus" size={13} />
                    </button>
                  </div>
                </div>
              </div>
              <div role="progressbar" aria-label={`Uso ${c.label.toLowerCase()}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v ? Math.min(100, Math.round(v.pct)) : 0} style={{ position: "relative", height: 8, borderRadius: 8, background: "var(--panel2)" }}>
                {v && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: v.width, borderRadius: 8, background: v.bar, animation: "hgrow 1s cubic-bezier(.2,.7,.2,1) both" }} />}
                {showProj && <span title="Projeção do mês" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: Math.min(100, projPct) + "%", borderRadius: 8, border: `1px dashed ${projOver ? "var(--err)" : "var(--fg3)"}` }} />}
                <span title="Alerta" style={{ position: "absolute", left: `calc(${lim.alertPct}% - 1px)`, top: -4, bottom: -4, width: 2, borderRadius: 2, background: "var(--warn)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "var(--fg2)" }}>
                <span>{v ? `${Math.round(v.pct)}% usado${c.month && spend ? ` · dia ${spend.dayOfMonth} de ${spend.daysInMonth}` : !c.month ? " · zera à meia-noite" : ""}` : "Sem dado de gasto agora"}</span>
                <span style={{ color: "var(--warn)" }}>
                  Alerta em {lim.alertPct}% ({usd((c.limit * lim.alertPct) / 100)})
                </span>
              </div>
              {v && ((c.month && showProj) || (!c.month && v.warn)) && (
                <span style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, lineHeight: 1.45, color: c.month && projOver ? "var(--err)" : "var(--fg2)" }}>
                  <MIcon name={c.month ? "trending-up" : "bell"} size={13} className="au-mt3" />
                  {note}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="au-card" style={{ display: "flex", flexDirection: "column", gap: 16, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>Avisar quando chegar em</span>
          <div role="radiogroup" aria-label="Avisar quando chegar em" style={{ display: "flex", gap: 3, padding: 3, borderRadius: 10, background: "var(--panel2)" }}>
            {ALERT_OPTS.map((v) => {
              const on = lim.alertPct === v;
              return (
                <button key={v} role="radio" aria-checked={on} onClick={() => setLim((l) => ({ ...l, alertPct: v }))} style={{ padding: "5px 12px", borderRadius: 7, border: 0, background: on ? "var(--pop)" : "transparent", color: on ? "var(--fg)" : "var(--fg2)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", boxShadow: on ? "0 2px 8px rgba(0,0,0,.15)" : "none" }}>
                  {v}%
                </button>
              );
            })}
          </div>
          <span style={{ fontSize: 12, color: "var(--fg2)" }}>do limite · o aviso vai para Alertas de infra no Telegram</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span id="mdl-onlimit" style={{ fontSize: 13.5, fontWeight: 600 }}>Quando bater o limite</span>
          <div role="radiogroup" aria-labelledby="mdl-onlimit" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
            {ON_LIMIT.map((o) => {
              const on = lim.onLimit === o.k;
              return (
                <button key={o.k} role="radio" aria-checked={on} className="mdl-limit-opt" onClick={() => setLim((l) => ({ ...l, onLimit: o.k }))} style={{ border: `1px solid ${on ? "var(--acc)" : "var(--line2)"}`, background: on ? "var(--accSoft)" : "transparent" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                    <MIcon name={o.icon} size={15} color={o.color} />
                    {o.label}
                    {on && <MIcon name="circle-check" size={14} color="var(--acc)" className="au-ml-auto" />}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.45 }}>{o.d}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
