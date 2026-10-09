// Diálogos do detalhe: Rotacionar chave, Revogar acesso, Mudar plano e Reativar.
// A chave nova mora só no estado de cada diálogo; fechar apaga.
import { useState } from "react";
import { Icon } from "../Icon";
import { errText } from "../health/api";
import { copilotApi, type ClientDetail, type CopilotSettings, type Plan } from "./api";
import { canRevoke, fmtInt, planDiff, planName, PLANS, toolsOf } from "./model";
import { CpDialog, InlineError, KeyBox, KeyWarn, radioProps, spinIcon } from "./parts";

type Done = (c: ClientDetail) => void;

// ---- Rotacionar ----

const GRACES = [0, 24] as const;

export function RotateDialog({ client, onClose, onDone }: { client: ClientDetail; onClose: () => void; onDone: Done }) {
  const [grace, setGrace] = useState<0 | 24>(24); // a rotina é a troca em 24 horas; "Agora" é para chave vazada
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [key, setKey] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await copilotApi.rotate(client.systemClientId, grace);
      setKey(r.apiKey);
      onDone(r.client);
    } catch (e) {
      setErr(errText(e, "Não consegui gerar a chave nova. A antiga continua valendo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CpDialog
      title={`Rotacionar a chave de ${client.name}`}
      icon="key-round"
      lead="Uma chave nova é gerada. Ela continua presa a este cliente e só lê dados dele."
      busy={busy}
      locked={!!key}
      onClose={onClose}
      footer={
        key ? (
          <button className="au-primary" onClick={onClose}>
            Já copiei, fechar
          </button>
        ) : (
          <>
            <button className="au-outline" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button className="au-primary" onClick={run} disabled={busy}>
              {spinIcon(busy, "key-round")}
              {busy ? "Gerando…" : "Gerar chave nova"}
            </button>
          </>
        )
      }
    >
      {!key && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span id="cp-rot-l" style={{ fontSize: 13, fontWeight: 600 }}>A chave antiga para de funcionar</span>
          <div className="cp-seg" role="radiogroup" aria-labelledby="cp-rot-l">
            {([[0, "Agora"], [24, "Em 24 horas"]] as const).map(([g, l]) => (
              <button key={g} {...radioProps<0 | 24>(g, GRACES, grace, setGrace)} disabled={busy}>
                {l}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, color: "var(--fg3)", lineHeight: 1.45 }}>
            {grace === 0
              ? "Use se a chave vazou. O Aibiz Manager e qualquer integração com a chave antiga deixam de funcionar na hora, até receberem a nova."
              : "Use na troca de rotina: a antiga continua valendo por mais 24 horas, o suficiente para o Aibiz Manager e as integrações se atualizarem."}
          </span>
        </div>
      )}
      {err && <InlineError>{err}</InlineError>}
      {key && (
        <div className="cp-ok">
          <span style={{ fontSize: 13, fontWeight: 600 }}>Chave nova gerada. Ela aparece só agora.</span>
          <span style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.45 }}>
            Atualize no Aibiz Manager antes de fechar. {grace === 0 ? "A antiga já parou de funcionar." : "A antiga ainda vale por 24 horas."}
          </span>
          <KeyBox value={key} label="Chave nova da API" />
          <KeyWarn />
        </div>
      )}
    </CpDialog>
  );
}

// ---- Revogar ----

const CONSEQUENCES = [
  ["key-round", "A chave para de funcionar e o gestor vê “Copiloto indisponível” no Aibiz Manager."],
  ["brain", "A memória do perfil fica guardada por 30 dias e depois é apagada."],
  ["file-search", "A auditoria das consultas continua aqui."],
  ["rotate-ccw", "Dá para reativar nesses 30 dias, com uma chave nova."],
] as const;

export function RevokeDialog({ client, onClose, onDone }: { client: ClientDetail; onClose: () => void; onDone: Done }) {
  const sid = client.systemClientId;
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [touched, setTouched] = useState(false);
  const ok = canRevoke(typed, sid);
  // Não reclama no 1º caractere: só depois de sair do campo ou de digitar o tamanho do código.
  const mismatch = !ok && !!typed.trim() && (touched || typed.trim().length >= sid.length);

  const run = async () => {
    if (busy) return;
    if (!ok) return setTouched(true);
    setBusy(true);
    setErr("");
    try {
      onDone(await copilotApi.revoke(sid, reason));
    } catch (e) {
      setErr(errText(e, "Não consegui revogar o acesso. Nada mudou."));
      setBusy(false);
    }
  };

  return (
    <CpDialog
      title={`Revogar o acesso de ${client.name}?`}
      icon="ban"
      tone="err"
      role="alertdialog"
      lead="O Copiloto deixa de funcionar para este cliente na hora."
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button className="au-outline" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="au-primary au-danger" onClick={run} disabled={!ok || busy} style={{ opacity: ok && !busy ? 1 : 0.4, cursor: ok && !busy ? "pointer" : "not-allowed" }}>
            {spinIcon(busy, "ban")}
            {busy ? "Revogando…" : "Revogar acesso"}
          </button>
        </>
      }
    >
      <ul className="cp-box" style={{ margin: 0, listStyle: "none" }}>
        {CONSEQUENCES.map(([i, l]) => (
          <li key={l} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, lineHeight: 1.45 }}>
            <span style={{ marginTop: 2, color: "var(--fg3)" }}>
              <Icon name={i} size={13} />
            </span>
            {l}
          </li>
        ))}
      </ul>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 13 }}>
          Para confirmar, digite o código do cliente: <b className="cp-mono" style={{ fontSize: 12.5, padding: "1px 6px", borderRadius: 5, background: "var(--panel2)", wordBreak: "break-all" }}>{sid}</b>
        </span>
        <input autoFocus className="cp-input mono" data-ok={ok} value={typed} placeholder="Digite o código do cliente" aria-invalid={mismatch} aria-describedby={mismatch ? "cp-rev-bad" : undefined} autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} onBlur={() => setTouched(true)} onKeyDown={(e) => e.key === "Enter" && run()} disabled={busy} />
        {mismatch && (
          <span id="cp-rev-bad" role="alert" style={{ fontSize: 12.5, color: "var(--err)" }}>
            O código não confere
          </span>
        )}
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 13 }}>
          Motivo <span style={{ color: "var(--fg3)" }}>(opcional, fica no registro)</span>
        </span>
        <input className="cp-input" style={{ fontSize: 13 }} value={reason} maxLength={300} placeholder="Ex.: contrato encerrado" onChange={(e) => setReason(e.target.value)} disabled={busy} />
      </label>
      {err && <InlineError>{err}</InlineError>}
    </CpDialog>
  );
}

// ---- Mudar plano ----

export function NeedSettings({ title, onClose, onRetry, busy }: { title: string; onClose: () => void; onRetry: () => void; busy: boolean }) {
  return (
    <CpDialog
      title={title}
      icon="cloud-off"
      lead="Não consegui carregar os planos e as ferramentas agora. Nada foi alterado."
      onClose={onClose}
      footer={
        <>
          <button className="au-outline" onClick={onClose}>
            Fechar
          </button>
          <button className="au-primary" onClick={onRetry} disabled={busy}>
            {spinIcon(busy, "rotate-cw")}
            Tentar de novo
          </button>
        </>
      }
    >
      <span />
    </CpDialog>
  );
}

export function PlanDialog({ client, settings, initial, onClose, onDone }: { client: ClientDetail; settings: CopilotSettings; initial?: Plan; onClose: () => void; onDone: Done }) {
  const [sel, setSel] = useState<Plan>(initial ?? client.plan);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const changed = sel !== client.plan;
  const diff = planDiff(settings.catalog, client.plan, sel, settings.plans);

  const run = async () => {
    if (!changed || busy) return;
    setBusy(true);
    setErr("");
    try {
      onDone(await copilotApi.setPlan(client.systemClientId, sel));
    } catch (e) {
      setErr(errText(e, "Não consegui mudar o plano. Nada mudou."));
      setBusy(false);
    }
  };

  return (
    <CpDialog
      title={`Mudar o plano de ${client.name}`}
      icon="arrow-right-left"
      lead="Escolha o plano. As ferramentas mudam na hora."
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button className="au-outline" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="au-primary" onClick={run} disabled={!changed || busy} style={{ opacity: changed && !busy ? 1 : 0.4, cursor: changed && !busy ? "pointer" : "not-allowed" }}>
            {spinIcon(busy, "check")}
            {busy ? "Mudando…" : "Mudar plano"}
          </button>
        </>
      }
    >
      <div className="cp-plans" role="radiogroup" aria-label="Plano">
        {PLANS.map((p) => (
          <button key={p} {...radioProps<Plan>(p, PLANS, sel, setSel)} className="cp-plancard" style={{ gap: 5, padding: 12 }} disabled={busy}>
            <span style={{ display: "flex", alignItems: "center", fontFamily: "var(--fd)", fontWeight: 600, fontSize: 16 }}>
              {planName(p, settings.planLabels)}
              {client.plan === p && <span style={{ marginLeft: "auto", fontFamily: "var(--fb)", fontSize: 11, fontWeight: 500, color: "var(--fg3)" }}>atual</span>}
            </span>
            <span style={{ fontSize: 12, color: "var(--fg2)" }}>
              {fmtInt(settings.plans[p].credits)} créditos por mês · {toolsOf(settings.catalog, p).length} ferramentas
            </span>
          </button>
        ))}
      </div>
      {changed && (
        <ul className="cp-box" style={{ margin: 0, listStyle: "none", gap: 5 }} aria-label="O que muda">
          {diff.map((x) => (
            <li key={x.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: x.kind === "in" ? "var(--ok)" : x.kind === "out" ? "var(--warn)" : "var(--fg2)" }}>
              <Icon name={x.kind === "in" ? "plus" : x.kind === "out" ? "minus" : "coins"} size={13} />
              {x.label}
            </li>
          ))}
        </ul>
      )}
      <span style={{ fontSize: 12, color: "var(--fg3)" }}>Vale na hora para o gestor. A cobrança muda no financeiro do Aibiz, não aqui.</span>
      {err && <InlineError>{err}</InlineError>}
    </CpDialog>
  );
}

// ---- Reativar ----

export function ReactivateDialog({ client, onClose, onDone }: { client: ClientDetail; onClose: () => void; onDone: Done }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [key, setKey] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await copilotApi.reactivate(client.systemClientId);
      setKey(r.apiKey);
      onDone(r.client);
    } catch (e) {
      setErr(errText(e, "Não consegui reativar. O acesso continua revogado."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CpDialog
      title={`Reativar o acesso de ${client.name}`}
      icon="rotate-ccw"
      lead="O Copiloto volta a funcionar com uma chave nova. A antiga continua inválida e a memória do perfil é mantida."
      busy={busy}
      locked={!!key}
      onClose={onClose}
      footer={
        key ? (
          <button className="au-primary" onClick={onClose}>
            Já copiei, fechar
          </button>
        ) : (
          <>
            <button className="au-outline" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button className="au-primary" onClick={run} disabled={busy}>
              {spinIcon(busy, "rotate-ccw")}
              {busy ? "Reativando…" : "Reativar e gerar chave"}
            </button>
          </>
        )
      }
    >
      {err && <InlineError>{err}</InlineError>}
      {key && (
        <div className="cp-ok">
          <span style={{ fontSize: 13, fontWeight: 600 }}>Acesso reativado. A chave aparece só agora.</span>
          <span style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.45 }}>Cadastre a chave nova no Aibiz Manager antes de fechar.</span>
          <KeyBox value={key} label="Chave nova da API" />
          <KeyWarn />
        </div>
      )}
    </CpDialog>
  );
}
