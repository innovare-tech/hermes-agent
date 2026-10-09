// Configurações › Permissões (A6): o que o Hermes pode fazer conforme a origem do pedido. Matriz editável com
// rascunho (barra "N regras alteradas"), bloqueio fixo, destino e aprovadores, e o histórico de aprovações.
// Dados reais de /api/ops/permissions e /api/ops/approvals; a única coisa fictícia é a ilustração do Telegram (rotulada).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Modal } from "../channels/parts";
import { AgentHeader } from "../screens/Sessions";
import { ask, toast } from "../store";
import { ApprovalsHistory } from "./History";
import { PermissionsMatrix } from "./Matrix";
import { TelegramExample } from "./TelegramExample";
import {
  applyBulk,
  buildDraft,
  buildGroups,
  changes,
  LEVELS,
  matrixPatch,
  newlyAllowed,
  originMeta,
  permissionsApi,
  PANEL_APPROVER,
  validApprover,
  validTarget,
  type ApprovalRow,
  type Draft,
  type Permissions,
} from "./model";
import "./permissions.css";

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function PermissionsPanel() {
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [load, setLoad] = useState<"loading" | "ok" | "error">("loading");
  const [saved, setSaved] = useState<Draft>({});
  const [draft, setDraft] = useState<Draft>({});
  const [rows, setRows] = useState<ApprovalRow[] | null>(null);
  const [rowsError, setRowsError] = useState(false);
  const [deciding, setDeciding] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const exampleRef = useRef<HTMLHeadingElement>(null);

  const adopt = useCallback((p: Permissions, resetDraft: boolean) => {
    setPerms(p);
    const base = buildDraft(p);
    setSaved(base);
    if (resetDraft) setDraft(base);
  }, []);

  const loadPerms = useCallback(async () => {
    setLoad("loading");
    try {
      adopt(await permissionsApi.get(), true);
      setLoad("ok");
    } catch {
      setLoad("error");
    }
  }, [adopt]);

  const loadRows = useCallback(async (silent = false) => {
    if (!silent) setRowsError(false);
    try {
      setRows(await permissionsApi.approvals());
      setRowsError(false);
    } catch {
      if (!silent) setRowsError(true); // atualização em segundo plano que falha não derruba o que já está na tela
    }
  }, []);

  useEffect(() => {
    loadPerms();
    loadRows();
    const iv = setInterval(() => loadRows(true), 20000);
    return () => clearInterval(iv);
  }, [loadPerms, loadRows]);

  const groups = useMemo(() => (perms ? buildGroups(perms) : []), [perms]);
  const diff = useMemo(() => (perms ? changes(perms, saved, draft) : []), [perms, saved, draft]);
  const cells = diff.length; // uma "regra" = uma ação vinda de uma origem (uma célula da matriz)

  const save = async () => {
    if (!perms || saving) return;
    const before = saved;
    const cs = diff;
    setConfirming(false);
    setSaving(true);
    try {
      const next = await permissionsApi.save({ matrix: matrixPatch(cs, draft) });
      adopt(next, true);
      toast("Permissões salvas", {
        sub: `${cells} ${plural(cells, "regra mudou", "regras mudaram")}. Vale a partir do próximo pedido.`,
        undo: async () => {
          try {
            adopt(await permissionsApi.save({ matrix: matrixPatch(cs, before) }), true);
            toast("Desfeito");
          } catch (e) {
            toast(errMsg(e, "Não consegui desfazer"));
          }
        },
      });
    } catch (e) {
      toast(errMsg(e, "Não consegui salvar. Nada mudou."));
    } finally {
      setSaving(false);
    }
  };
  const askSave = () => (newlyAllowed(diff).length ? setConfirming(true) : save());

  const toggleEnabled = async () => {
    if (!perms) return;
    if (perms.enabled && !(await ask({ title: "Desligar as permissões?", body: "Telegram, API e tarefas agendadas voltam a fazer tudo sem pedir. Só grupos de clientes continuam sem poder alterar nada.", confirm: "Desligar", danger: true }))) return;
    try {
      const next = await permissionsApi.save({ enabled: !perms.enabled });
      adopt(next, false);
      toast(next.enabled ? "Permissões ligadas" : "Permissões desligadas", next.enabled ? "Vale a partir do próximo pedido." : "As regras ficam guardadas.");
    } catch (e) {
      toast(errMsg(e, "Não consegui mudar. Nada mudou."));
    }
  };

  const decide = async (r: ApprovalRow, approve: boolean) => {
    setDeciding(r.id);
    try {
      const out = await permissionsApi.decide(r.id, approve);
      setRows((rs) => (rs ?? []).map((x) => (x.id === out.id ? out : x)));
      toast(approve ? "Pedido aprovado" : "Pedido negado", approve ? "O Hermes executa agora; o resultado aparece no histórico." : "O Hermes avisa quem pediu que não vai executar.");
      setTimeout(() => loadRows(true), 3000);
    } catch (e) {
      toast(errMsg(e, "Não consegui registrar a decisão"));
      loadRows(true); // pode ter sido decidido no Telegram ou ter expirado: mostra o estado de verdade
    } finally {
      setDeciding(null);
    }
  };

  const showExample = () => {
    exampleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    exampleRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="pm-root" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <AgentHeader title="Permissões" sub="O que o Hermes pode fazer depende de onde veio o pedido. Um cliente no WhatsApp não tem o mesmo poder que a equipe no Telegram.">
        <div className="au-ml-auto" style={{ display: "flex", gap: 6, flexWrap: "wrap" }} aria-label="Legenda dos níveis">
          {LEVELS.map((l) => (
            <span key={l.id} title={l.line} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, background: l.id === "deny" ? "var(--panel2)" : `color-mix(in oklab,${l.color} 14%,transparent)`, color: l.color, fontSize: 12, fontWeight: 600 }}>
              <Icon name={l.icon} size={13} />
              {l.label}
            </span>
          ))}
        </div>
      </AgentHeader>

      {load === "loading" && (
        <div aria-busy="true" role="status" aria-label="Carregando as permissões" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="pm-skel" style={{ height: 520, borderRadius: "var(--r)", border: "1px solid var(--line)" }} />
          <div className="pm-skel" style={{ height: 140, borderRadius: "var(--r)", border: "1px solid var(--line)" }} />
        </div>
      )}

      {load === "error" && (
        <div role="alert" className="au-card" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, padding: 28, borderColor: "color-mix(in oklab,var(--err) 35%,transparent)" }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "color-mix(in oklab,var(--err) 14%,transparent)", color: "var(--err)" }}>
            <Icon name="cloud-off" size={19} />
          </span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Não consegui carregar as permissões</span>
          <span style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.55, maxWidth: 600 }}>As regras que já estavam salvas continuam valendo. Enquanto esta tela não carregar, o Hermes trata tudo que não está liberado como “pede aprovação”.</span>
          <button className="au-primary" onClick={loadPerms}>
            <Icon name="rotate-cw" size={14} />
            Tentar de novo
          </button>
        </div>
      )}

      {load === "ok" && perms && (
        <>
          <EnabledCard enabled={perms.enabled} onToggle={toggleEnabled} />

          <PermissionsMatrix perms={perms} groups={groups} saved={saved} draft={draft} onPick={(a, o, l) => setDraft((d) => ({ ...d, [a.key]: { ...d[a.key], [o]: l } }))} onBulk={(o, mode) => setDraft((d) => applyBulk(perms, saved, d, o, mode))} />

          <section className="au-card" aria-label="Sempre bloqueado" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 18, borderColor: "color-mix(in oklab,var(--err) 35%,var(--line))" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ width: 36, height: 36, flex: "none", borderRadius: 11, background: "color-mix(in oklab,var(--err) 16%,transparent)", color: "var(--err)", display: "grid", placeItems: "center" }}>
                <Icon name="lock" size={17} />
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 240 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Sempre bloqueado</span>
                <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>Vale para todos os canais e não dá para liberar por aqui. O Hermes recusa, explica e avisa no destino das aprovações.</span>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--line2)", fontSize: 11.5, color: "var(--fg2)" }}>
                <Icon name="lock" size={12} />
                Não editável
              </span>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 8 }}>
              {perms.hardDeny.map((h) => (
                <li key={h.label} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 13px", borderRadius: "var(--r2)", background: "var(--panel2)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                    <Icon name="ban" size={14} color="var(--err)" />
                    {h.label}
                  </span>
                  {h.patterns.length > 0 && <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg2)", lineHeight: 1.5 }}>{h.patterns.join(" · ")}</span>}
                </li>
              ))}
            </ul>
          </section>

          <ApprovalSettings key={JSON.stringify([perms.approvalTarget, perms.approvers])} perms={perms} onSaved={(p) => adopt(p, false)} />

          <section className="pm-split">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 ref={exampleRef} id="pm-telegram" tabIndex={-1} className="au-display" style={{ margin: 0, fontSize: 21, outline: "none" }}>
                Como chega no Telegram
              </h2>
              <TelegramExample ttlMin={perms.approvalTtlMin} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--fg2)", lineHeight: 1.5 }}>
                <Rule icon="users">
                  {(perms.approvers.length
                    ? `Quem pode aprovar: ${perms.approvers.length} ${plural(perms.approvers.length, "pessoa", "pessoas")} da lista acima.`
                    : "Quem pode aprovar: qualquer pessoa que veja o pedido no Telegram.") +
                    (perms.allowSelfApproval === false ? " Quem pediu não aprova o próprio pedido." : " Quem pediu também pode aprovar o próprio pedido.")}
                </Rule>
                <Rule icon="timer">Sem resposta em {perms.approvalTtlMin} minutos, o pedido expira e conta como negado.</Rule>
                <Rule icon="layout-dashboard">O mesmo pedido aparece aqui, no histórico, com Aprovar e Negar. Vale o que for decidido primeiro.</Rule>
              </div>
            </div>
            <ApprovalsHistory panelBlocked={false} rows={rows} error={rowsError} ttlMin={perms.approvalTtlMin} deciding={deciding} onRetry={() => loadRows()} onDecide={decide} onExample={showExample} />
          </section>

          {cells > 0 && (
            <div role="region" aria-label="Alterações não salvas" className="au-float pm-bar2">
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warn)" }} />
              <span style={{ fontSize: 13 }} aria-live="polite">
                {cells} {plural(cells, "regra alterada", "regras alteradas")}
              </span>
              <button className="au-outline" disabled={saving} onClick={() => setDraft(saved)} style={{ borderRadius: 999, padding: "7px 12px", fontSize: 12.5 }}>
                Descartar
              </button>
              <button className="au-primary" disabled={saving} onClick={askSave} style={{ borderRadius: 999, padding: "7px 14px", fontSize: 12.5 }}>
                <Icon name={saving ? "loader-circle" : "check"} size={13} className={saving ? "au-spin" : undefined} />
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          )}

          {confirming && (
            <Modal title="Liberar sem aprovação?" role="alertdialog" onClose={() => setConfirming(false)}>
              <span style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: "color-mix(in oklab,var(--warn) 16%,transparent)", color: "var(--warn)" }}>
                <Icon name="shield-alert" size={19} />
              </span>
              <span style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.5 }}>Estas ações vão acontecer sem ninguém revisar antes:</span>
              <ul style={{ listStyle: "none", margin: 0, display: "flex", flexDirection: "column", gap: 7, padding: "12px 14px", borderRadius: "var(--r2)", background: "var(--panel2)" }}>
                {newlyAllowed(diff).map((c) => (
                  <li key={c.action.key + c.origin} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}>
                    <Icon name="circle-check" size={13} color="var(--ok)" />
                    <span>
                      <b>{c.action.label}</b> vindo de {originMeta(c.origin, perms.originLabels).label}
                    </span>
                  </li>
                ))}
              </ul>
              <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>Dá para voltar atrás aqui a qualquer momento. Vale a partir do próximo pedido.</span>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button autoFocus className="au-outline" onClick={() => setConfirming(false)}>
                  Voltar
                </button>
                <button className="au-primary" onClick={save}>
                  Sim, salvar
                </button>
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}

function Rule({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span style={{ display: "flex", gap: 7 }}>
      <Icon name={icon} size={13} color="var(--fg3)" className="au-mt3" />
      {children}
    </span>
  );
}

/** Interruptor geral (`enabled`) com o que muda em cada estado. Salva na hora. */
function EnabledCard({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <section className="au-card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", borderColor: enabled ? undefined : "color-mix(in oklab,var(--warn) 45%,transparent)" }}>
      <span style={{ width: 36, height: 36, flex: "none", borderRadius: 11, display: "grid", placeItems: "center", background: enabled ? "var(--accSoft)" : "color-mix(in oklab,var(--warn) 16%,transparent)", color: enabled ? "var(--acc)" : "var(--warn)" }}>
        <Icon name={enabled ? "shield-check" : "shield-alert"} size={17} />
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
        <span id="pm-enabled" style={{ fontSize: 15, fontWeight: 600 }}>
          Permissões ligadas
        </span>
        <span id="pm-enabled-d" style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5, maxWidth: 720 }}>
          {enabled
            ? "Todo pedido do Telegram, da API e das tarefas agendadas passa pela matriz abaixo. O que pede aprovação espera alguém decidir no Telegram. O bloqueio fixo vale para todos."
            : "Desligadas: Telegram, API e tarefas agendadas fazem tudo sem pedir, como antes. Só grupos de clientes continuam sem poder alterar nada. As regras da matriz ficam guardadas, mas ainda não valem."}
        </span>
      </div>
      <button role="switch" aria-checked={enabled} aria-labelledby="pm-enabled" aria-describedby="pm-enabled-d" className="au-switch lg" onClick={onToggle}>
        <span />
      </button>
    </section>
  );
}

/** Destino das aprovações (`telegram:<chat>:<tópico>`) e ids dos aprovadores. Tem o próprio Salvar. */
function ApprovalSettings({ perms, onSaved }: { perms: Permissions; onSaved: (p: Permissions) => void }) {
  const [target, setTarget] = useState(perms.approvalTarget);
  const [ids, setIds] = useState<string[]>(perms.approvers.map(String));
  const [draftId, setDraftId] = useState("");
  const [self, setSelf] = useState(perms.allowSelfApproval !== false);
  const [busy, setBusy] = useState(false);
  const targetOk = validTarget(target);
  const idOk = draftId === "" || validApprover(draftId);
  const dirty = target.trim() !== perms.approvalTarget || ids.join() !== perms.approvers.map(String).join() || self !== (perms.allowSelfApproval !== false);
  const people = ids.filter((i) => i !== PANEL_APPROVER);

  const addId = () => {
    const v = draftId.trim();
    if (!v || !validApprover(v)) return;
    if (!ids.includes(v)) setIds([...ids, v]);
    setDraftId("");
  };
  const submit = async () => {
    if (!targetOk || busy) return;
    setBusy(true);
    try {
      onSaved(await permissionsApi.save({ approvalTarget: target.trim(), approvers: ids, allowSelfApproval: self }));
      toast("Destino e aprovadores salvos", "Vale a partir do próximo pedido.");
    } catch (e) {
      toast(errMsg(e, "Não consegui salvar. Nada mudou."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="au-card" aria-label="Destino das aprovações e aprovadores" style={{ display: "flex", flexDirection: "column", gap: 16, padding: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Para onde vão os pedidos e quem aprova</span>
        <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>Pedidos que vêm do Telegram respondem no próprio chat. Os de outras origens vão para o destino abaixo.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 18 }}>
        <div className="pm-field">
          <label htmlFor="pm-target" style={{ fontSize: 12.5, fontWeight: 600 }}>
            Destino das aprovações
          </label>
          <span className="pm-input" data-invalid={!targetOk || undefined}>
            <input id="pm-target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="telegram:-1001234567890:12" spellCheck={false} autoComplete="off" aria-invalid={!targetOk || undefined} aria-describedby="pm-target-d" />
          </span>
          <span id="pm-target-d" style={{ fontSize: 11.5, lineHeight: 1.45, color: targetOk ? "var(--fg3)" : "var(--err)" }}>
            {targetOk ? (target.trim() ? "Chat do Telegram e, depois do segundo “:”, o tópico." : "Sem destino, o pedido de fora do Telegram é bloqueado em vez de esperar aprovação.") : "Use telegram:<chat>:<tópico> só com números, por exemplo telegram:-1001234567890:12."}
          </span>
        </div>

        <div className="pm-field">
          <label htmlFor="pm-approver" style={{ fontSize: 12.5, fontWeight: 600 }}>
            Quem pode aprovar (ids do Telegram)
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {people.map((i) => (
              <span key={i} className="pm-id">
                {i}
                <button aria-label={`Remover ${i}`} onClick={() => setIds(ids.filter((x) => x !== i))}>
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span className="pm-input" data-invalid={!idOk || undefined} style={{ flex: 1 }}>
              <input id="pm-approver" inputMode="numeric" value={draftId} onChange={(e) => setDraftId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addId())} placeholder="123456789" aria-invalid={!idOk || undefined} aria-describedby="pm-approver-d" autoComplete="off" />
            </span>
            <button className="au-outline" disabled={!draftId.trim() || !idOk} onClick={addId}>
              Adicionar
            </button>
          </div>
          <span id="pm-approver-d" style={{ fontSize: 11.5, lineHeight: 1.45, color: idOk ? "var(--fg3)" : "var(--err)" }}>
            {!idOk ? "O id do Telegram tem só números." : people.length ? "No Telegram, só estas pessoas aprovam; aqui no painel, você sempre pode." : "Lista vazia: qualquer pessoa que veja o pedido pode aprovar."}
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, marginTop: 4 }}>
            <button type="button" role="switch" aria-checked={self} aria-label="Quem pediu pode aprovar o próprio pedido" className="au-switch" onClick={() => setSelf(!self)} style={{ marginLeft: 0 }}>
              <span />
            </button>
            Quem pediu pode aprovar o próprio pedido
            <span style={{ color: "var(--fg3)" }}>{self ? "· útil enquanto há um aprovador só" : "· exige uma segunda pessoa"}</span>
          </label>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          className="au-outline"
          disabled={!dirty || busy}
          onClick={() => {
            setTarget(perms.approvalTarget);
            setIds(perms.approvers.map(String));
            setSelf(perms.allowSelfApproval !== false);
            setDraftId("");
          }}
        >
          Descartar
        </button>
        <button className="au-primary" disabled={!dirty || !targetOk || busy} onClick={submit}>
          {busy ? "Salvando…" : "Salvar destino e aprovadores"}
        </button>
      </div>
    </section>
  );
}
