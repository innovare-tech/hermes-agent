// Histórico de aprovações (A6): pedidos aguardando decisão no topo, depois o que já foi decidido ou bloqueado,
// com filtro e contadores reais. Clicar numa linha mostra o comando exato e o resultado.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Icon } from "../Icon";
import {
  clock,
  dayLabel,
  decisionLines,
  expiresIn,
  filterTab,
  HIST_TABS,
  originMeta,
  requestedBy,
  span,
  splitApprovals,
  STATUS,
  tabCounts,
  type ApprovalRow,
  type HistTab,
} from "./model";

const PAGE = 30;

export type HistoryProps = {
  rows: ApprovalRow[] | null;
  error: boolean;
  ttlMin: number;
  deciding: number | null;
  /** Há lista de aprovadores e o painel não está nela: o /decide recusaria. */
  panelBlocked: boolean;
  onRetry: () => void;
  onDecide: (r: ApprovalRow, approve: boolean) => void;
  onExample: () => void;
};

function Origin({ r, size = 18 }: { r: ApprovalRow; size?: number }) {
  const m = originMeta(r.origin);
  return (
    <span title={m.label} aria-label={`Origem: ${m.label}`} role="img" style={{ flex: "none", width: size, height: size, borderRadius: 5, background: m.color, color: "#fff", display: "grid", placeItems: "center" }}>
      <Icon name={m.icon} size={Math.round(size * 0.55)} />
    </span>
  );
}

export function ApprovalsHistory(p: HistoryProps) {
  const [tab, setTab] = useState<HistTab>("all");
  const [shown, setShown] = useState(PAGE);
  const [openId, setOpenId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 15000);
    return () => clearInterval(t);
  }, []);

  const { pending, history } = splitApprovals(p.rows ?? []);
  const counts = tabCounts(history);
  const list = filterTab(history, tab);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 className="au-display" style={{ margin: 0, fontSize: 21 }}>
          Histórico de aprovações
        </h2>
        {p.rows && history.length > 0 && (
          <div role="tablist" aria-label="Filtrar histórico" className="au-ml-auto" style={{ display: "flex", gap: 3, padding: 3, borderRadius: 10, background: "var(--panel2)" }}>
            {HIST_TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className="au-seg" onClick={() => (setTab(t.id), setShown(PAGE))} style={{ flex: "none", display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", color: tab === t.id ? "var(--fg)" : "var(--fg2)" }}>
                {t.label}
                <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>{counts[t.id]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <section className="au-card" aria-label="Aguardando decisão" style={{ overflow: "hidden", borderColor: "color-mix(in oklab,var(--warn) 45%,transparent)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", borderBottom: "1px solid var(--line)", fontSize: 13, fontWeight: 600 }}>
            <Icon name="hand" size={14} color="var(--warn)" />
            Aguardando decisão
            <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>{pending.length}</span>
          </div>
          {p.panelBlocked && (
            <p style={{ margin: 0, padding: "10px 16px", fontSize: 12, lineHeight: 1.5, color: "var(--fg2)", borderBottom: "1px solid var(--line)" }}>
              Este painel não está na lista de aprovadores, então a decisão tem que vir do Telegram. Para decidir por aqui, ligue “Este painel também pode aprovar” acima.
            </p>
          )}
          {pending.map((r) => {
            const left = expiresIn(r, now);
            const busy = p.deciding === r.id;
            return (
              <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Origin r={r} />
                  <span className="pm-clip" style={{ fontSize: 13, fontWeight: 500 }}>
                    {r.summary || "Pedido"}
                  </span>
                  <span style={{ marginLeft: "auto", flex: "none", fontSize: 11.5, color: "var(--fg3)" }}>{left === null ? "" : left > 0 ? `expira em ${span(left)}` : "expirando"}</span>
                </div>
                <code className="au-code" style={{ fontSize: 11.5, maxHeight: 96, overflow: "auto" }}>
                  {r.command}
                </code>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11.5, color: "var(--fg3)", flex: 1, minWidth: 160 }}>
                    {requestedBy(r) ? `Pedido por ${requestedBy(r)}` : "Pedido sem identificação"} · {clock(r.at)}
                  </span>
                  <button className="au-outline" disabled={busy || p.panelBlocked} onClick={() => p.onDecide(r, false)} style={{ padding: "6px 12px", fontSize: 12.5 }} aria-label={`Negar: ${r.summary ?? "pedido"} (${r.command ?? ""})`.slice(0, 160)}>
                    Negar
                  </button>
                  <button className="au-primary" disabled={busy || p.panelBlocked} onClick={() => p.onDecide(r, true)} style={{ padding: "6px 14px", fontSize: 12.5 }} aria-label={`Aprovar: ${r.summary ?? "pedido"} (${r.command ?? ""})`.slice(0, 160)}>
                    <Icon name={busy ? "loader-circle" : "check"} size={13} className={busy ? "au-spin" : undefined} />
                    {busy ? "Decidindo…" : "Aprovar"}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <div className="au-card" style={{ overflow: "hidden" }}>
        {p.rows === null && !p.error && (
          <div role="status" aria-busy="true" aria-label="Carregando o histórico" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 18 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="pm-skel" style={{ height: 38 }} />
            ))}
          </div>
        )}
        {p.error && (
          <div role="alert" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, padding: "24px 22px" }}>
            <Icon name="cloud-off" size={20} color="var(--err)" />
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>Não consegui carregar o histórico</span>
            <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5 }}>As permissões continuam valendo. Só a lista de pedidos não chegou.</span>
            <button className="au-outline" onClick={p.onRetry}>
              Tentar de novo
            </button>
          </div>
        )}
        {p.rows && history.length === 0 && (
          <Empty icon="history" title="Nenhuma aprovação ainda" body="Quando o Hermes precisar de algo que está em “Pede aprovação”, o pedido vai para o Telegram e a decisão aparece aqui. Pedidos bloqueados também. Veja ao lado como o pedido chega." action="Ver como chega no Telegram" actionIcon="send" onAction={p.onExample} />
        )}
        {p.rows && history.length > 0 && list.length === 0 && <Empty icon="history" title="Nada com este filtro" body="Troque o filtro para ver as outras decisões." action="Ver todas" actionIcon="list" onAction={() => setTab("all")} />}
        {list.slice(0, shown).map((r) => {
          const S = STATUS[r.status];
          const d = decisionLines(r, p.ttlMin);
          const open = openId === r.id;
          return (
            <div key={r.id} style={{ borderBottom: "1px solid var(--line)" }}>
              <button className="pm-hist" aria-expanded={open} onClick={() => setOpenId(open ? null : r.id)}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontFamily: "var(--fm)", fontSize: 12 }}>{clock(r.at)}</span>
                  <span style={{ fontSize: 11, color: "var(--fg3)" }}>{dayLabel(r.at)}</span>
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 500, minWidth: 0 }}>
                    <Origin r={r} />
                    <span className="pm-clip">{r.summary || "Pedido"}</span>
                  </span>
                  <span className="pm-clip" title={r.command ?? ""} style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg2)" }}>
                    {r.command}
                  </span>
                  <span className="pm-clip" style={{ fontSize: 11.5, color: "var(--fg3)" }}>
                    {requestedBy(r) ? `Pedido por ${requestedBy(r)}` : originMeta(r.origin).label}
                  </span>
                </span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, textAlign: "right", minWidth: 0 }}>
                  <span className="pm-chip" style={{ background: `color-mix(in oklab,${S.color} 14%,transparent)`, color: S.color }}>
                    <Icon name={S.icon} size={12} />
                    {S.label}
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--fg2)" }}>{d.by}</span>
                  {d.took && <span style={{ fontSize: 11, color: "var(--fg3)", overflowWrap: "anywhere" }}>{d.took}</span>}
                </span>
              </button>
              {open && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 14px 90px" }}>
                  <span className="au-label">Comando exato</span>
                  <code className="au-code" style={{ fontSize: 11.5, maxHeight: 180, overflow: "auto" }}>
                    {r.command}
                  </code>
                  {r.rule && <span style={{ fontSize: 12, color: "var(--fg2)" }}>Regra: {r.rule}</span>}
                  {r.result && (
                    <>
                      <span className="au-label">Resultado</span>
                      <code className="au-code" style={{ fontSize: 11.5, maxHeight: 180, overflow: "auto" }}>
                        {r.result}
                      </code>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {list.length > shown && (
          <button className="au-ghost" onClick={() => setShown(shown + PAGE)} style={{ width: "100%", justifyContent: "center", padding: "11px 16px", fontSize: 12.5, fontWeight: 600, color: "var(--acc)" }}>
            Mostrar mais ({list.length - shown})
          </button>
        )}
        {p.rows && history.length > 0 && (
          <Link to="/activity" style={{ display: "block", padding: "11px 16px", fontSize: 12.5, fontWeight: 600, textAlign: "center", color: "var(--acc)" }}>
            Ver tudo no registro de atividades
          </Link>
        )}
      </div>
    </div>
  );
}

function Empty({ icon, title, body, action, actionIcon, onAction }: { icon: string; title: string; body: string; action: string; actionIcon: string; onAction: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, padding: "26px 22px" }}>
      <Icon name={icon} size={22} color="var(--fg3)" />
      <span style={{ fontSize: 14.5, fontWeight: 600 }}>{title}</span>
      <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5, maxWidth: 440 }}>{body}</span>
      <button className="au-primary" onClick={onAction} style={{ padding: "8px 13px", fontSize: 12.5 }}>
        <Icon name={actionIcon} size={13} />
        {action}
      </button>
    </div>
  );
}
