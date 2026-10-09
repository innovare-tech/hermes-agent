// Coluna da direita: cabeçalho com ações, faixa de contexto, 4 KPIs e as abas Ferramentas, Consumo e Auditoria.
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { Icon } from "../Icon";
import { errText } from "../health/api";
import { copilotApi, type AuditItem, type ClientDetail, type Plan } from "./api";
import { askedBy, auditDay, auditView, bannerOf, clock, creditBand, dayBars, fmtInt, fmtTokens, fmtUsd, lastParts, monthName, planName, plural, queryText, renewLabel, rowsLabel, toolUsage } from "./model";
import { Avatar, InlineError, StatusPill, spinIcon } from "./parts";

export type TabKey = "tools" | "use" | "audit";
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "tools", label: "Ferramentas", icon: "wrench" },
  { key: "use", label: "Consumo", icon: "gauge" },
  { key: "audit", label: "Auditoria", icon: "file-search" },
];

const TOOL_ICON: Record<string, string> = {
  my_channels_status: "radio-tower",
  channel_metrics: "gauge",
  search_conversations: "messages-square",
  timeline: "history",
  trace_routing: "git-branch",
  audit_operator: "user-round",
  dead_letters: "inbox",
  describe_domain: "database",
  query: "code-xml",
  aggregate: "layers",
};
const toolIcon = (key: string) => TOOL_ICON[key] ?? "wrench";

const PROFILES_ROUTE = "/settings/perfis";
/** Leva a Perfis já destacando o perfil do cliente. */
const profileHref = (id: string) => `${PROFILES_ROUTE}?perfil=${encodeURIComponent(id)}`;
const REVOKED_HINT = "Reative o Copiloto para mudar";

export type DetailActions = { onPlan: (initial?: Plan) => void; onRotate: () => void; onRevoke: () => void; onReactivate: () => void };

export function ClientDetailView({ d, now, tab, onTab, planLabels, actions }: { d: ClientDetail; now: number; tab: TabKey; onTab: (t: TabKey) => void; planLabels?: Record<string, string>; actions: DetailActions }) {
  const revoked = d.status === "revoked";
  const banner = bannerOf(d, now);
  const last = lastParts(d.lastActivityAt, now);
  const m = d.month;
  const tid = useId();
  const kpis = [
    { l: "Conversas no mês", v: fmtInt(m.conversations), s: "sessões de conversa" },
    { l: "Gasto no mês", v: fmtUsd(m.spendUsd), s: "custo de IA deste perfil" },
    { l: "Créditos", v: fmtInt(m.credits), s: `de ${fmtInt(m.creditsLimit)} do plano` },
    { l: "Última atividade", v: last.v, s: last.s },
  ];

  const tabKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.key === tab);
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (n < 0) return;
    e.preventDefault();
    const t = TABS[(n + TABS.length) % TABS.length];
    onTab(t.key);
    document.getElementById(`${tid}-${t.key}`)?.focus();
  };

  return (
    <article style={{ display: "flex", flexDirection: "column", animation: "hblurin .4s both" }} aria-label={`Cliente ${d.name}`}>
      <div className="cp-dhead">
        <div className="cp-who">
          <Avatar id={d.systemClientId} name={d.name} size={46} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0, flex: 1 }}>
            <h2 className="au-display" style={{ margin: 0, fontSize: 22, lineHeight: 1.15, overflowWrap: "anywhere" }}>{d.name}</h2>
            <span className="cp-meta">
              <span className="cp-mono cp-ellip" title={d.systemClientId}>systemClientId {d.systemClientId}</span>
              <span style={{ padding: "1px 8px", borderRadius: 999, border: "1px solid var(--line2)", fontSize: 11.5, fontWeight: 600, color: "var(--fg)", whiteSpace: "nowrap" }}>Plano {planName(d.plan, planLabels)}</span>
              <StatusPill status={d.status} />
              <Link to={profileHref(d.profileId)} className="cp-mono cp-plink" title={`Abrir o perfil ${d.profileId} em Configurações › Perfis`}>
                <Icon name="layers" size={11} />
                <span className="cp-ellip">perfil {d.profileId}</span>
              </Link>
            </span>
          </div>
        </div>
        <div className="cp-acts">
          <button className="cp-act" disabled={revoked} title={revoked ? REVOKED_HINT : undefined} aria-describedby={revoked ? `${tid}-hint` : undefined} onClick={() => actions.onPlan()}>
            Mudar plano
          </button>
          <button className="cp-act" disabled={revoked} title={revoked ? REVOKED_HINT : undefined} aria-describedby={revoked ? `${tid}-hint` : undefined} onClick={actions.onRotate}>
            <Icon name="key-round" size={13} />
            Rotacionar chave
          </button>
          {revoked ? (
            <button className="cp-act solid" onClick={actions.onReactivate}>
              Reativar
            </button>
          ) : (
            <button className="cp-act danger" onClick={actions.onRevoke}>
              Revogar acesso
            </button>
          )}
          {revoked && (
            <span id={`${tid}-hint`} className="cp-actnote">
              {REVOKED_HINT} o plano ou a chave.
            </span>
          )}
        </div>
      </div>

      {banner && (
        <div className="cp-banner" role="status" style={{ background: banner.tone === "warn" ? "color-mix(in oklab,var(--warn) 10%,transparent)" : banner.tone === "ok" ? "color-mix(in oklab,var(--ok) 8%,transparent)" : "var(--panel2)" }}>
          <Icon name={banner.icon} size={16} color={banner.tone === "warn" ? "var(--warn)" : banner.tone === "ok" ? "var(--ok)" : "var(--fg2)"} />
          <span style={{ flex: 1 }}>{banner.text}</span>
          {banner.action && (
            <button className="au-outline" style={{ padding: "6px 11px", fontSize: 12 }} onClick={() => actions.onPlan(banner.action!.plan)}>
              {banner.action.label}
            </button>
          )}
        </div>
      )}

      <div className="cp-kpis">
        {kpis.map((k) => (
          <div key={k.l} className="cp-kpibox">
            <span>{k.l}</span>
            <b>{k.v}</b>
            <span>{k.s}</span>
          </div>
        ))}
      </div>

      <div className="cp-tabs" role="tablist" aria-label="Detalhes do cliente" onKeyDown={tabKey}>
        {TABS.map((t) => (
          <button key={t.key} id={`${tid}-${t.key}`} role="tab" className="cp-tab" aria-selected={tab === t.key} aria-controls={`${tid}-p`} tabIndex={tab === t.key ? 0 : -1} onClick={() => onTab(t.key)}>
            <Icon name={t.icon} size={13} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="cp-body" id={`${tid}-p`} role="tabpanel" aria-labelledby={`${tid}-${tab}`}>
        {tab === "tools" && <ToolsTab d={d} planLabels={planLabels} />}
        {tab === "use" && <UsageTab d={d} now={now} />}
        {tab === "audit" && <AuditTab key={d.systemClientId} d={d} now={now} />}
      </div>
    </article>
  );
}

// ---- Ferramentas ----

function ToolsTab({ d, planLabels }: { d: ClientDetail; planLabels?: Record<string, string> }) {
  const revoked = d.status === "revoked";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: "var(--r2)", border: "1px dashed var(--line2)", fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.45 }}>
        <Icon name="lock" size={14} color="var(--ok)" />
        <span>
          Todas as ferramentas são <b style={{ color: "var(--fg)" }}>só leitura</b> e filtradas por <span className="cp-mono" style={{ fontSize: 11.5, color: "var(--fg)" }}>systemClientId = "{d.filter.systemClientId}"</span>. O plano {planName(d.plan, planLabels)} define quais aparecem para o gestor.
        </span>
      </div>
      <ul className="cp-tools" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {d.tools.map((t) => {
          const on = t.enabled && !revoked;
          return (
            <li key={t.key} className="cp-tool" data-on={on}>
              <span className="cp-toolic" style={{ background: on ? "var(--accSoft)" : "var(--panel2)", color: on ? "var(--acc)" : "var(--fg3)" }}>
                <Icon name={toolIcon(t.key)} size={14} />
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</span>
                <span style={{ fontSize: 11.5, color: "var(--fg2)", lineHeight: 1.4 }}>Gasta {plural(t.weight, "crédito", "créditos")} por uso.</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: on ? "var(--ok)" : "var(--fg2)" }}>
                  <Icon name={on ? "circle-check" : "lock"} size={11} />
                  {revoked ? "Sem acesso (revogado)" : t.reason}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---- Consumo ----

function UsageTab({ d, now }: { d: ClientDetail; now: number }) {
  const m = d.month;
  const band = creditBand(m.credits, m.creditsLimit);
  const bars = dayBars(d.usage.daily, now);
  const max = Math.max(1, ...bars.map((b) => b.credits));
  const rows = toolUsage(d.usage, d.tools);
  const w = d.tools.map((t) => t.weight);
  const range = w.length ? (Math.min(...w) === Math.max(...w) ? `${Math.min(...w)}` : `${Math.min(...w)} a ${Math.max(...w)}`) : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
          <span style={{ fontWeight: 600 }}>Créditos do plano em {monthName(now)}</span>
          <span style={{ color: band.tone === "ok" ? "var(--fg2)" : band.color }}>
            {fmtInt(m.credits)} de {fmtInt(m.creditsLimit)} ({band.pct}%)
          </span>
        </div>
        <div className="cp-bar" role="progressbar" aria-label="Créditos usados no mês" aria-valuemin={0} aria-valuemax={100} aria-valuenow={band.pct} data-tone={band.tone}>
          <span style={{ width: `${band.pct}%`, background: band.color }} />
        </div>
        <span style={{ fontSize: 11.5, color: "var(--fg2)", lineHeight: 1.45 }}>
          Cada consulta gasta o peso da ferramenta{range ? ` (${range} créditos)` : ""} e mais 1 crédito a cada 2.000 tokens da conversa. Renova {renewLabel(now)}.
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Créditos por dia</span>
        {bars.length === 0 ? (
          <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>Nenhum consumo neste mês ainda.</span>
        ) : (
          <div className="cp-days" role="img" aria-label={`Créditos por dia: ${bars.filter((b) => b.credits).map((b) => `dia ${b.label}, ${b.credits}`).join("; ")}`}>
            {bars.map((b) => (
              <div key={b.day} className="cp-day" title={b.title}>
                <span style={{ height: `${Math.max(2, (b.credits / max) * 100)}%`, ...(b.credits ? {} : { background: "var(--line2)" }) }} />
                <span>{b.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="cp-table">
        <div className="cp-trow h">
          <span>Ferramenta</span>
          <span>Usos</span>
          <span>Créditos</span>
          <span>Parte</span>
        </div>
        {rows.length === 0 && <div className="cp-trow" style={{ display: "block", color: "var(--fg2)" }}>Nenhuma ferramenta foi usada neste mês.</div>}
        {rows.map((r) => (
          <div key={r.key} className="cp-trow">
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <Icon name={r.key === "_tokens" ? "sparkles" : toolIcon(r.key)} size={13} color="var(--fg3)" />
              <span className="cp-ellip">{r.label}</span>
            </span>
            <span className="cp-mono">{r.uses ?? "—"}</span>
            <span className="cp-mono">{fmtInt(r.credits)}</span>
            <span className="cp-share">
              <span aria-hidden="true">
                <span style={{ width: `${r.pct}%` }} />
              </span>
              <span className="cp-mono" style={{ fontSize: 11.5, color: "var(--fg2)", width: 34, textAlign: "right" }}>{r.pct}%</span>
            </span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, padding: "10px 14px", borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--fg2)" }}>
          <span>Tokens no mês: {fmtTokens(d.usage.tokens)}</span>
          <span>Gasto com IA: {fmtUsd(m.spendUsd)}</span>
        </div>
      </div>
      <span style={{ fontSize: 11.5, color: "var(--fg2)" }}>Tokens são os pedaços de texto que a IA lê e escreve; é por eles que o provedor cobra.</span>
    </div>
  );
}

// ---- Auditoria ----

type AuditState = { items: AuditItem[]; next: string | null; loading: boolean; failed: boolean };

function AuditTab({ d, now }: { d: ClientDetail; now: number }) {
  const sid = d.systemClientId;
  const [s, setS] = useState<AuditState>({ items: [], next: null, loading: true, failed: false });
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [err, setErr] = useState("");
  const req = useRef(0);
  const base = useId();

  const load = useCallback(
    async (cursor: string | null) => {
      const id = ++req.current;
      setS((x) => ({ ...x, loading: true, failed: false }));
      setErr("");
      try {
        const p = await copilotApi.audit(sid, cursor);
        if (id !== req.current) return;
        setS((x) => ({ items: cursor ? [...x.items, ...p.items] : p.items, next: p.nextCursor, loading: false, failed: false }));
      } catch (e) {
        if (id !== req.current) return;
        setErr(errText(e, "Não consegui carregar a auditoria."));
        setS((x) => ({ ...x, loading: false, failed: true }));
      }
    },
    [sid],
  );
  useEffect(() => {
    load(null);
    return () => {
      req.current++;
    };
  }, [load]);

  const toggle = (i: number) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.45 }}>Cada pergunta do gestor e o que o Hermes consultou para responder. O filtro do cliente aparece em todas.</span>

      {s.loading && s.items.length === 0 && (
        <div aria-busy="true" role="status" aria-label="Carregando a auditoria" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map((k) => (
            <div key={k} className="cp-skel" style={{ height: 52, borderRadius: "var(--r2)" }} />
          ))}
        </div>
      )}

      {s.failed && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <InlineError>{err}</InlineError>
          <button className="au-outline" onClick={() => load(s.items.length ? s.next : null)}>
            Tentar de novo
          </button>
        </div>
      )}

      {!s.loading && !s.failed && s.items.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: 20, borderRadius: "var(--r2)", border: "1px dashed var(--line2)" }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>Nenhuma consulta registrada</span>
          <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.45 }}>
            {d.status === "revoked" ? "O acesso foi revogado antes de qualquer consulta." : "O gestor ainda não fez nenhuma pergunta. Quando fizer, cada consulta aparece aqui com o filtro do cliente."}
          </span>
          <Link to={profileHref(d.profileId)} style={{ fontSize: 12.5, fontWeight: 600 }}>
            Abrir o perfil {d.profileId}
          </Link>
        </div>
      )}

      {s.items.map((a, i) => {
        const v = auditView(a, sid);
        const isOpen = open.has(i);
        const color = v.tone === "err" ? "var(--err)" : v.tone === "warn" ? "var(--warn)" : "var(--ok)";
        return (
          <div key={`${a.at}-${i}`} className="cp-arow" data-scope={v.scope}>
            <button aria-expanded={isOpen} aria-controls={`${base}-${i}`} onClick={() => toggle(i)}>
              <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span className="cp-mono" style={{ fontSize: 12 }}>{clock(a.at)}</span>
                <span style={{ fontSize: 11.5, color: "var(--fg2)" }}>{auditDay(a.at, now)}</span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 13, lineHeight: 1.4, overflowWrap: "anywhere" }}>{a.question ? `“${a.question}”` : <span style={{ color: "var(--fg2)" }}>pergunta não registrada</span>}</span>
                <span style={{ fontSize: 11.5, color: "var(--fg2)" }}>{askedBy(a.askedBy)}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: v.tone === "ok" ? "var(--fg2)" : color, minWidth: 0, fontWeight: v.scope ? 600 : 400 }}>
                <Icon name={v.icon} size={13} />
                <span className="cp-ellip" title={v.tool}>{v.tool}</span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                <span className="cp-mono" style={{ fontSize: 12.5, color: a.rows ? "var(--fg)" : "var(--fg2)" }}>{rowsLabel(a.rows)}</span>
                <span style={{ fontSize: 11.5, color: "var(--fg2)" }}>linhas</span>
              </span>
              <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={14} color="var(--fg3)" />
            </button>
            {isOpen && (
              <div className="cp-aq" id={`${base}-${i}`}>
                <div className="cp-code" tabIndex={0} aria-label="Consulta feita">{queryText(a)}</div>
                <span className="cp-note" style={{ color: v.tone === "ok" ? "var(--ok)" : color }}>
                  <Icon name={v.noteIcon} size={13} />
                  {v.note}
                </span>
                {a.credits > 0 && <span style={{ fontSize: 11.5, color: "var(--fg2)" }}>{plural(a.credits, "crédito gasto", "créditos gastos")} nesta consulta.</span>}
              </div>
            )}
          </div>
        );
      })}

      {s.next && !s.failed && (
        <button className="au-outline" style={{ alignSelf: "flex-start" }} onClick={() => load(s.next)} disabled={s.loading}>
          {spinIcon(s.loading, "chevron-down")}
          Carregar mais consultas
        </button>
      )}
    </div>
  );
}
