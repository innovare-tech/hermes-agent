// Herói da Saúde: o humor da tela. Crítico (faixa vermelha que chama atenção), calmo (respira devagar) ou com atenção.
import { Icon } from "../Icon";
import type { Incident, Overview } from "./api";
import { HIcon } from "./icons";
import { agoLabel, incidentSpan, pct, type Counts } from "./model";

/** Rola até os incidentes sem mexer na URL e leva o foco junto (leitor de tela). */
function goToIncidents() {
  const el = document.getElementById("incidentes");
  if (!el) return;
  const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
}

export function CriticalHero({ inc, now, acking, onAck }: { inc: Incident; now: number; acking: boolean; onAck: () => void }) {
  const span = incidentSpan(inc, now);
  return (
    <div role="alert" className="hl-hero crit">
      <span className="hl-siren" aria-hidden="true">
        <HIcon name="siren" size={27} />
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0, flex: 1 }}>
        <span className="hl-herolabel">
          <span className="hl-blink" aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--err)" }} />
          Incidente crítico · {inc.code}
        </span>
        <span className="au-display" style={{ fontSize: 24, lineHeight: 1.2 }}>{inc.title}</span>
        {inc.impact && <span style={{ fontSize: 13.5, color: "var(--fg2)" }}>{inc.impact}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flex: "none" }}>
        {/* aria-live="off": o relógio anda sozinho e não pode ser lido de novo a cada atualização */}
        <span aria-live="off" className="au-display" style={{ fontSize: 30, color: "var(--err)", lineHeight: 1 }}>{span.dur}</span>
        <span style={{ fontSize: 11.5, color: "var(--fg2)", textAlign: "right", maxWidth: 240 }}>{span.since}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "none" }}>
        <button className="hl-solid" onClick={goToIncidents}>
          Ver o que o Hermes achou
          <HIcon name="arrow-down" size={14} />
        </button>
        {inc.ackBy ? (
          <span style={{ fontSize: 12, color: "var(--fg2)", textAlign: "center" }}>Reconhecido por {inc.ackBy}</span>
        ) : (
          <button className="au-outline" disabled={acking} onClick={onAck} style={{ background: "var(--panel)" }}>
            {acking ? "Reconhecendo…" : "Estou vendo (reconhecer)"}
          </button>
        )}
      </div>
    </div>
  );
}

export function CalmHero({ overview, counts, now }: { overview: Overview | null; counts: Counts; now: number }) {
  const total = overview?.checks ?? counts.error + counts.warn + counts.pending + counts.ok;
  const stats = [
    { v: overview ? pct(overview.availability30d) : "—", l: "no ar em 30 dias" },
    // Sem nenhum bot cadastrado, "— bots conectados" só confunde: esconde.
    ...(overview?.botsTotal === 0 ? [] : [{ v: overview ? `${overview.botsConnected} de ${overview.botsTotal}` : "—", l: "bots conectados" }]),
    { v: overview?.lastRunAt ? agoLabel(now - overview.lastRunAt) : "—", l: "última checagem" },
  ];
  return (
    <div className="hl-hero calm">
      <span aria-hidden="true" style={{ position: "relative", width: 64, height: 64, flex: "none", display: "grid", placeItems: "center" }}>
        <span className="hl-breathe" style={{ background: "color-mix(in oklab,var(--ok) 18%,transparent)" }} />
        <span style={{ position: "relative", width: 40, height: 40, borderRadius: "50%", background: "color-mix(in oklab,var(--ok) 30%,transparent)", color: "var(--ok)", display: "grid", placeItems: "center" }}>
          <Icon name="check" size={20} />
        </span>
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
        <span className="au-display" style={{ fontSize: 28, lineHeight: 1.15 }}>Tudo funcionando</span>
        <span style={{ fontSize: 14, color: "var(--fg2)", lineHeight: 1.5 }}>{total} {total === 1 ? "verificação rodando" : "verificações rodando"}. Nenhuma com problema agora.</span>
      </div>
      <div style={{ display: "flex", gap: 26, flex: "none" }}>
        {stats.map((c) => (
          <div key={c.l} className="hl-stat">
            <b>{c.v}</b>
            <span>{c.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sem incidente crítico, mas algo fora do normal: âmbar, sem alarme. */
export function AttentionHero({ counts, overview, now }: { counts: Counts; overview: Overview | null; now: number }) {
  const bad = counts.error + counts.warn;
  const title = counts.error ? (counts.error === 1 ? "1 verificação com problema" : `${counts.error} verificações com problema`) : bad === 1 ? "1 verificação em atenção" : `${bad} verificações em atenção`;
  return (
    <div className="hl-hero attn">
      <span style={{ width: 52, height: 52, flex: "none", borderRadius: 16, display: "grid", placeItems: "center", background: "color-mix(in oklab,var(--warn) 16%,transparent)", color: "var(--warn)" }}>
        <Icon name="triangle-alert" size={24} />
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
        <span className="au-display" style={{ fontSize: 26, lineHeight: 1.15 }}>{title}</span>
        <span style={{ fontSize: 14, color: "var(--fg2)", lineHeight: 1.5 }}>
          {counts.error ? "O Hermes abre um incidente se o erro se repetir na próxima checagem. " : "Nada parou, mas vale olhar. "}
          Os detalhes estão nos grupos abaixo.
        </span>
      </div>
      <div className="hl-stat" style={{ flex: "none" }}>
        <b>{overview ? pct(overview.availability30d) : "—"}</b>
        <span>no ar em 30 dias{overview?.lastRunAt ? ` · checado ${agoLabel(now - overview.lastRunAt)}` : ""}</span>
      </div>
    </div>
  );
}
