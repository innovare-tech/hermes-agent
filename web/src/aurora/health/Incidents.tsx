// Incidentes abertos: cartão com linha do tempo, hipótese, correção (com aprovação) e Reconhecer / Resolver.
import { useState } from "react";
import { NavLink } from "react-router";
import { Modal } from "../channels/parts";
import { Icon } from "../Icon";
import type { Check, Incident, Overview } from "./api";
import { HIcon } from "./icons";
import { clock, fixState, fmtDuration, incidentSpan, TIMELINE, whenLabel } from "./model";

const SEV = {
  critical: { label: "Crítico", color: "var(--err)", icon: "siren" },
  warning: { label: "Atenção", color: "var(--warn)", icon: "triangle-alert" },
} as const;

const soft = (c: string, p: number) => `color-mix(in oklab,${c} ${p}%,transparent)`;

export type IncidentBusy = { ack?: boolean; fix?: boolean; pause?: boolean };

const NO_FIX_TEXT = "O Hermes não tem uma correção automática para isto. Veja a hipótese e decida com a equipe.";

function FixBlock({ inc, now, busy, onFix, critical }: { inc: Incident; now: number; busy: boolean; onFix: () => void; critical: boolean }) {
  const f = fixState(inc, now);
  const sa = inc.suggestedAction;
  if (f.kind === "none" || !sa) return null;
  const note = { fontSize: 11.5, color: "var(--fg3)", lineHeight: 1.4 } as const;

  if (f.kind === "pending") {
    return (
      <>
        <button className="hl-fix" disabled style={{ background: "var(--panel2)", color: "var(--fg2)" }}>
          <Icon name="hourglass" size={14} />
          <span style={{ flex: 1 }}>Aguardando aprovação no Telegram</span>
        </button>
        <span role="status" style={note}>
          Enviado para {f.target}.{" "}
          {f.expiresAt ? `Expira às ${clock(f.expiresAt)}${f.minutesLeft !== null ? ` (em ${f.minutesLeft} min)` : ""}.` : ""} O comando só roda depois do Aprovar.
        </span>
      </>
    );
  }
  if (f.kind === "approved") {
    return (
      <>
        <button className="hl-fix" disabled style={{ background: soft("var(--ok)", 14), color: "var(--ok)" }}>
          <Icon name="circle-check" size={14} />
          <span style={{ flex: 1 }}>{sa.label}: aprovado</span>
        </button>
        <span style={note}>Aprovado{f.by ? ` por ${f.by}` : ""}. O resultado aparece no histórico de Permissões.</span>
        {f.result && <code className="hl-code">{f.result}</code>}
      </>
    );
  }
  const again = f.kind !== "ready";
  const why =
    f.kind === "denied" ? `Negado${f.by ? ` por ${f.by}` : ""}. Nada foi executado.`
    : f.kind === "expired" ? "O pedido venceu sem resposta. Nada foi executado."
    : f.kind === "blocked" ? "Não consegui enviar o pedido ao Telegram. Nada foi executado."
    : "Mudar servidor ou cluster pede aprovação no Telegram (regra de Permissões).";
  return (
    <>
      <button className="hl-fix" disabled={busy} onClick={onFix} style={{ background: again ? "transparent" : critical ? "var(--err)" : "var(--acc)", color: again ? "var(--fg)" : "var(--accFg)", border: again ? "1px solid var(--line2)" : 0 }}>
        <Icon name={busy ? "loader-circle" : "wrench"} size={14} className={busy ? "au-spin" : undefined} />
        <span style={{ flex: 1 }}>{busy ? "Enviando o pedido…" : again ? `Pedir de novo: ${sa.label}` : sa.label}</span>
      </button>
      <span style={note}>{why}</span>
      <code className="hl-code" title="O comando exato que vai para aprovação">{sa.command}</code>
    </>
  );
}

/** Sem correção automática: diz o que fazer agora e oferece os dois caminhos que o painel sabe fazer. */
function NoFixBlock({ inc, check, busy, onPause }: { inc: Incident; check: Check | null; busy: boolean; onPause: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "11px 13px", borderRadius: "var(--r2)", background: "var(--panel2)" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600 }}>
        <Icon name="circle-alert" size={14} color="var(--warn)" />
        O que fazer agora
      </span>
      <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--fg2)" }}>{inc.recommendation?.trim() || NO_FIX_TEXT}</span>
      {check && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {check.status !== "paused" && (
            <button className="hl-mini" style={{ flex: "none" }} disabled={busy} onClick={onPause} title="Para de rodar e de chamar a equipe; o incidente aberto é fechado">
              {busy ? "Pausando…" : "Pausar verificação"}
            </button>
          )}
          {check.group === "whatsapp_bots" && (
            <NavLink to="/channels" className="hl-mini" style={{ flex: "none", display: "inline-block", textDecoration: "none", textAlign: "center" }}>
              Abrir Canais
            </NavLink>
          )}
        </div>
      )}
    </div>
  );
}

export function IncidentCard({ inc, now, busy, check, onAck, onFix, onResolve, onPause }: { inc: Incident; now: number; busy: IncidentBusy; check?: Check | null; onAck: () => void; onFix: () => void; onResolve: () => void; onPause?: () => void }) {
  const sev = SEV[inc.severity];
  const span = incidentSpan(inc, now);
  const critical = inc.severity === "critical";
  return (
    <article aria-label={`${inc.code}: ${inc.title}`} className="hl-inc" style={{ border: `1px solid ${critical ? "var(--err)" : soft("var(--warn)", 45)}` }}>
      <div className="hl-inc-head" style={{ background: critical ? soft("var(--err)", 9) : "transparent" }}>
        <span style={{ width: 36, height: 36, flex: "none", borderRadius: 11, background: soft(sev.color, 16), color: sev.color, display: "grid", placeItems: "center" }}>
          <HIcon name={sev.icon} size={17} />
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="hl-sev" style={{ background: sev.color }}>{sev.label}</span>
            <span className="hl-mono" style={{ fontSize: 11.5, color: "var(--fg3)" }}>{inc.code}</span>
            {inc.ackBy && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--fg2)" }}>
                <Icon name="eye" size={12} />
                Reconhecido por {inc.ackBy}
                {inc.ackAt ? ` às ${clock(inc.ackAt)}` : ""}
              </span>
            )}
          </span>
          <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{inc.title}</span>
          {inc.impact && <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>{inc.impact}</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flex: "none" }}>
          <span aria-live="off" className="hl-mono" style={{ fontSize: 13, color: sev.color }}>{span.dur}</span>
          <span style={{ fontSize: 11.5, color: "var(--fg3)", textAlign: "right", maxWidth: 230 }}>{span.since}</span>
        </div>
      </div>

      <div className="hl-inc-body">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <span className="au-label">O que o Hermes investigou</span>
          {inc.timeline.map((v, i) => {
            const t = TIMELINE[v.result] ?? TIMELINE.info;
            return (
              <div key={i} className="hl-tl">
                <time dateTime={new Date(v.at * 1000).toISOString()}>{clock(v.at)}</time>
                <span role="img" aria-label={t.label} title={t.label} style={{ marginTop: 3, flex: "none", display: "inline-flex" }}>
                  <HIcon name={t.icon} size={14} color={t.color} />
                </span>
                <span style={{ minWidth: 0 }}>{v.text}</span>
              </div>
            );
          })}
          {inc.investigating ? (
            <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 4, padding: "11px 13px", borderRadius: "var(--r2)", background: "var(--panel2)", fontSize: 13, color: "var(--fg2)" }}>
              <Icon name="loader-circle" size={15} className="au-spin" color="var(--acc)" />
              O Hermes está investigando…
            </div>
          ) : inc.investigationPaused ? (
            <div role="status" style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 4, padding: "11px 13px", borderRadius: "var(--r2)", background: "var(--panel2)", fontSize: 13, color: "var(--fg2)" }}>
              <Icon name="pause" size={15} color="var(--warn)" />
              Perfil pausado: o Hermes investiga quando você retomar.
            </div>
          ) : (
            inc.hypothesis && (
              <div className="hl-hyp">
                <HIcon name="lightbulb" size={15} color="var(--warn)" />
                <span>
                  <b>Hipótese:</b> {inc.hypothesis}
                </span>
              </div>
            )
          )}
        </div>

        <div className="hl-inc-act">
          <span className="au-label">Ações</span>
          <FixBlock inc={inc} now={now} busy={!!busy.fix} onFix={onFix} critical={critical} />
          {!inc.suggestedAction && <NoFixBlock inc={inc} check={check ?? null} busy={!!busy.pause} onPause={() => onPause?.()} />}
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            {!inc.ackBy && (
              <button className="hl-mini" disabled={!!busy.ack} onClick={onAck}>
                {busy.ack ? "Reconhecendo…" : "Reconhecer"}
              </button>
            )}
            <button className="hl-mini" onClick={onResolve} aria-describedby={inc.checkStatus === "error" ? `still-${inc.id}` : undefined}>
              Resolver
            </button>
          </div>
          {inc.checkStatus === "error" && (
            <span id={`still-${inc.id}`} style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--warn)" }}>
              Ainda com problema: vai reabrir se continuar.
            </span>
          )}
          <NavLink to="/logs" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
            <Icon name="scroll-text" size={12} />
            Ver registros
          </NavLink>
        </div>
      </div>
    </article>
  );
}

/** Resolver: nota opcional + o aviso honesto de que a verificação ligada ainda mostra problema (o Hermes reabre sozinho). */
export function ResolveDialog({ inc, stillFailing, busy, onClose, onSubmit }: { inc: Incident; stillFailing: boolean; busy: boolean; onClose: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Modal title={`Resolver “${inc.title}”?`} onClose={onClose} busy={busy}>
      <span style={{ fontSize: 13, color: stillFailing ? "var(--warn)" : "var(--fg2)", lineHeight: 1.5 }}>
        {stillFailing
          ? "As verificações ligadas a ele ainda mostram problema. Se continuar assim depois de resolver, o Hermes reabre o incidente sozinho."
          : "As verificações ligadas a ele estão normais. Se o problema voltar, o Hermes reabre o incidente."}
      </span>
      <textarea
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={1000}
        aria-label="O que foi feito (opcional)"
        placeholder="O que foi feito (opcional). Ex.: aumentei a memória do wa-gateway para 1 GB"
        className="hl-area"
        style={{ fontSize: 13 }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button className="au-outline" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button className="au-primary" disabled={busy} onClick={() => onSubmit(note.trim())}>
          {busy && <Icon name="loader-circle" size={14} className="au-spin" />}
          Marcar resolvido
        </button>
      </div>
    </Modal>
  );
}

/** Nenhum incidente aberto: uma linha só, com o último resolvido se houver. */
export function NoIncidents({ last, now }: { last: Overview["lastIncident"] | undefined; now: number }) {
  const when = last?.resolvedAt ? whenLabel(last.resolvedAt, now) : null;
  const dur = last?.resolvedAt ? fmtDuration(last.resolvedAt - last.startedAt) : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderRadius: "var(--r)", border: "1px solid var(--line)", background: "var(--panel)", fontSize: 13, color: "var(--fg2)" }}>
      <Icon name="circle-check" size={16} color="var(--ok)" />
      <span>
        Nenhum incidente aberto.
        {last && when ? ` O último foi resolvido ${when} (${last.title}, ${dur}).` : " Ainda não houve nenhum incidente neste perfil."}
      </span>
    </div>
  );
}
