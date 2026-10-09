// Coluna da esquerda (380 px, rolagem própria): busca, chips de situação e de plano, clientes e "carregar mais".
import { Icon } from "../Icon";
import type { Client, Counts, Plan, Status } from "./api";
import { countOf, fmtUsd, pageLabel, planName, PLANS, plural, rowLast, STATUS_FILTERS } from "./model";
import { Avatar, PlanTag, StatusPill, spinIcon } from "./parts";
import { ListSkeleton } from "./States";

export type Filters = { q: string; status: "" | Status; plan: "" | Plan };

export function ClientList({
  items,
  total,
  counts,
  now,
  selected,
  filters,
  loading,
  failed,
  hasMore,
  moreBusy,
  planLabels,
  onFilters,
  onSelect,
  onMore,
  onRetry,
}: {
  items: Client[];
  total: number;
  counts: Counts | null;
  now: number;
  selected: string | null;
  filters: Filters;
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  moreBusy: boolean;
  planLabels?: Record<string, string>;
  onFilters: (f: Partial<Filters>) => void;
  onSelect: (id: string) => void;
  onMore: () => void;
  onRetry: () => void;
}) {
  const filtered = !!(filters.q.trim() || filters.status || filters.plan);
  return (
    <section className="cp-pane" aria-label="Clientes do Copiloto">
      <div className="cp-filters">
        <div className="cp-search">
          <Icon name="search" size={14} color="var(--fg3)" />
          <input type="search" aria-label="Buscar cliente por nome ou systemClientId" placeholder="Nome ou código" value={filters.q} onChange={(e) => onFilters({ q: e.target.value })} />
        </div>
        <div className="cp-chips">
          <div className="cp-chips" role="group" aria-label="Situação">
            {STATUS_FILTERS.map((f) => (
              <button key={f.key || "all"} className="cp-chip" aria-pressed={filters.status === f.key} onClick={() => onFilters({ status: f.key })}>
                {f.label}
                <small>{countOf(counts, f.key)}</small>
              </button>
            ))}
          </div>
          <div className="cp-chips" role="group" aria-label="Plano">
            {PLANS.map((p) => (
              <button key={p} className="cp-chip" aria-pressed={filters.plan === p} onClick={() => onFilters({ plan: filters.plan === p ? "" : p })}>
                {planName(p, planLabels)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="cp-scroll">
        {loading && <ListSkeleton />}

        {!loading && failed && (
          <div role="alert" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: "22px 16px" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Não consegui atualizar a lista</span>
            <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>Os Copilotos continuam funcionando. Só esta lista não carregou.</span>
            <button className="au-outline" style={{ padding: "6px 11px", fontSize: 12.5 }} onClick={onRetry}>
              Tentar de novo
            </button>
          </div>
        )}

        {!loading && !failed && items.length === 0 && filtered && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: "22px 16px" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Nenhum cliente com esses filtros</span>
            {filters.q.trim() && <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>Busque pelo nome ou pelo systemClientId.</span>}
            <button className="au-outline" style={{ padding: "6px 11px", fontSize: 12.5 }} onClick={() => onFilters({ q: "", status: "", plan: "" })}>
              Limpar filtros
            </button>
          </div>
        )}

        {!loading &&
          !failed &&
          items.map((c) => (
            <button key={c.systemClientId} className="cp-item" aria-current={c.systemClientId === selected ? "true" : undefined} data-revoked={c.status === "revoked"} onClick={() => onSelect(c.systemClientId)}>
              <Avatar id={c.systemClientId} name={c.name} />
              <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span className="cp-ellip" style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</span>
                  <PlanTag plan={c.plan} labels={planLabels} />
                </span>
                <span style={{ display: "flex", gap: 8, fontSize: 11.5, color: "var(--fg2)", whiteSpace: "nowrap" }}>
                  <span className="cp-mono cp-ellip" style={{ maxWidth: 90 }} title={c.systemClientId}>{c.systemClientId}</span>
                  <span>{plural(c.month.conversations, "conversa", "conversas")}</span>
                  <span>{fmtUsd(c.month.spendUsd)}</span>
                </span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                <StatusPill status={c.status} />
                <span style={{ fontSize: 11.5, color: "var(--fg2)", whiteSpace: "nowrap" }}>{rowLast(c, now)}</span>
              </span>
            </button>
          ))}

        {!loading && !failed && items.length > 0 && (
          hasMore ? (
            <button className="cp-more" onClick={onMore} disabled={moreBusy}>
              {moreBusy ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{spinIcon(true, "")} Carregando…</span> : pageLabel(items.length, total, true)}
            </button>
          ) : (
            total > 0 && <div className="cp-foot">{pageLabel(items.length, total, false)}</div>
          )
        )}
      </div>
    </section>
  );
}
