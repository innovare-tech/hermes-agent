// Filtros da tela de análises: seletor de clientes (escala: de 5 a milhares) e o seletor simples de categoria/urgência.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { clientsApi, clientsFrom, colorOf, highlight, matchesClient, type Analysis, type ClientRow } from "./api";
import { AIcon } from "./icons";

const nf = (n: number) => n.toLocaleString("pt-BR");
const soft = (c: string, p: number) => `color-mix(in oklab,${c} ${p}%,transparent)`;

// ---------- categoria / urgência (lista fixa, sem busca) ----------

export type Def = { label: string; icon: string; color: string };

export function FilterSelect<K extends string>({ label, all, many, fallbackIcon, defs, order, counts, value, onChange, open, onToggle }: {
  label: string;
  /** Texto sem seleção ("Categoria"). */
  all: string;
  /** Plural para 2+ ("categorias"). */
  many: string;
  fallbackIcon: string;
  defs: Record<K, Def>;
  order: K[];
  counts: Record<string, number>;
  value: K[];
  onChange: (v: K[]) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const toggle = (k: K) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  const text = !value.length ? all : value.length === 1 ? defs[value[0]].label : `${value.length} ${many}`;
  return (
    <div style={{ position: "relative", zIndex: open ? 30 : "auto" }}>
      <button className="an-trigger" data-on={value.length > 0} aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={onToggle} style={{ padding: "0 10px" }}>
        <span style={{ display: "flex", gap: 3 }}>
          {value.length ? value.slice(0, 3).map((k) => <AIcon key={k} name={defs[k].icon} size={13} color={defs[k].color} />) : <AIcon name={fallbackIcon} size={13} color="var(--fg3)" />}
        </span>
        <span style={{ whiteSpace: "nowrap" }}>{text}</span>
        <AIcon name="chevron-down" size={13} color="var(--fg3)" className={open ? "an-rot" : ""} />
      </button>
      {open && (
        <div className="an-pop" role="listbox" aria-multiselectable="true" aria-label={label} style={{ width: 240, padding: 6, gap: 1 }}>
          {order.map((k) => {
            const on = value.includes(k);
            return (
              <button key={k} className="an-opt" role="option" aria-selected={on} onClick={() => toggle(k)}>
                <span style={{ width: 26, height: 26, flex: "none", borderRadius: 8, background: soft(defs[k].color, 15), color: defs[k].color, display: "grid", placeItems: "center" }}>
                  <AIcon name={defs[k].icon} size={13} />
                </span>
                <span style={{ flex: 1 }}>{defs[k].label}</span>
                <span title="Abertas" style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>{counts[k] ?? 0}</span>
                <span style={{ width: 14, color: "var(--acc)", display: "grid" }}>{on && <AIcon name="check" size={14} />}</span>
              </button>
            );
          })}
          {value.length > 0 && (
            <button className="an-ghost" onClick={() => onChange([])} style={{ marginTop: 4, padding: "8px 10px", borderTop: "1px solid var(--line)", borderRadius: 0, textAlign: "left", textDecoration: "none", fontSize: 12 }}>
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- clientes ----------

type Page = { items: ClientRow[]; total: number; nextCursor: string | null; available: boolean };
const EMPTY_PAGE: Page = { items: [], total: 0, nextCursor: null, available: true };

export function ClientPicker({ rows, selected, onChange, open, onToggle, onClose }: {
  /** Todas as análises carregadas: dão a lista "Com análises" quando o diretório não responde. */
  rows: Analysis[];
  selected: string[];
  onChange: (ids: string[]) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState<Page>(EMPTY_PAGE);
  const [dirTotal, setDirTotal] = useState<number | null>(null);
  const [remote, setRemote] = useState<ClientRow[] | null>(null);
  const [act, setAct] = useState(0);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const known = useRef(new Map<string, ClientRow>());
  const seq = useRef(0);

  // "Com análises": o que o diretório diz (se existir) somado ao que as próprias análises mostram.
  const withRows = useMemo(() => {
    const own = new Map(clientsFrom(rows).map((c) => [c.systemClientId, c]));
    const m = new Map<string, ClientRow>();
    for (const c of remote ?? []) m.set(c.systemClientId, { ...c, openAnalyses: own.get(c.systemClientId)?.openAnalyses ?? 0 });
    for (const [id, c] of own) if (!m.has(id)) m.set(id, c);
    return [...m.values()].sort((a, b) => (b.openAnalyses ?? 0) - (a.openAnalyses ?? 0) || a.name.localeCompare(b.name, "pt-BR"));
  }, [rows, remote]);
  withRows.forEach((c) => known.current.set(c.systemClientId, c));
  page.items.forEach((c) => known.current.set(c.systemClientId, c));
  const nameOf = (id: string) => known.current.get(id)?.name ?? id;

  // Abrir: zera a busca e traz "Com análises".
  useEffect(() => {
    if (!open) return;
    setQ("");
    setQd("");
    setAct(0);
    clientsApi.withAnalyses().then(setRemote, () => setRemote(null));
  }, [open]);

  // Busca no servidor com atraso de ~280 ms.
  useEffect(() => {
    if (q === qd) return;
    const t = setTimeout(() => setQd(q), 280);
    return () => clearTimeout(t);
  }, [q, qd]);

  useEffect(() => {
    if (!open) return;
    const my = ++seq.current;
    setLoading(true);
    setError(false);
    clientsApi.page(qd, null).then(
      (p) => {
        if (my !== seq.current) return;
        setPage(p);
        if (!qd) setDirTotal(p.available ? p.total : null);
        setLoading(false);
      },
      () => {
        if (my !== seq.current) return;
        setError(true);
        setLoading(false);
      },
    );
  }, [open, qd, retry]);

  const loadMore = () => {
    if (!page.nextCursor || more) return;
    setMore(true);
    clientsApi.page(qd, page.nextCursor).then(
      (p) => setPage((cur) => ({ ...p, items: [...cur.items, ...p.items] })),
      () => setError(true),
    ).finally(() => setMore(false));
  };

  const busy = q !== qd || loading;
  const query = qd.trim();
  const withIds = new Set(withRows.map((c) => c.systemClientId));
  // Sem busca: "Com análises" + o resto do diretório. Com busca: o servidor responde; sem diretório, filtra o que há.
  const sections: { label: string; count: string; rows: ClientRow[] }[] = [];
  let footer = "";
  if (query) {
    const res = page.available ? page.items : withRows.filter((c) => matchesClient(c, query));
    const total = page.available ? page.total : res.length;
    if (res.length) sections.push({ label: "Resultados", count: nf(total), rows: res });
    footer = `${nf(total)} resultado${total === 1 ? "" : "s"}${total > res.length ? ` · mostrando ${res.length}` : ""}`;
  } else {
    if (withRows.length) sections.push({ label: "Com análises", count: String(withRows.length), rows: withRows });
    const rest = page.items.filter((c) => !withIds.has(c.systemClientId));
    if (rest.length) sections.push({ label: "Todos os clientes", count: nf(dirTotal ?? rest.length), rows: rest });
    const left = Math.max(0, (dirTotal ?? 0) - withRows.length);
    footer = !page.available && !loading ? "Diretório de clientes ainda vazio" : `Mostrando ${nf(rest.length)} de ${nf(Math.max(left, rest.length))} sem análises`;
  }
  const flat = sections.flatMap((s) => s.rows);
  const toggleId = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const canMore = !busy && page.available && !!page.nextCursor;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAct((a) => Math.min(flat.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAct((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && flat[act]) {
      e.preventDefault();
      toggleId(flat[act].systemClientId);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  const text = !selected.length ? "Todos os clientes" : selected.length === 1 ? nameOf(selected[0]) : `${selected.length} clientes`;
  let idx = -1;
  return (
    <div style={{ position: "relative", zIndex: open ? 30 : "auto" }}>
      <button className="an-trigger" data-on={selected.length > 0} aria-haspopup="listbox" aria-expanded={open} aria-label="Cliente" onClick={onToggle} style={{ padding: "0 10px 0 6px", maxWidth: 240 }}>
        <span style={{ display: "flex" }}>
          {selected.length ? (
            selected.slice(0, 3).map((id, i) => (
              <span key={id} style={{ width: 24, height: 24, marginLeft: i ? -8 : 0, borderRadius: 7, border: "2px solid var(--pop)", background: colorOf(id), color: "var(--accFg)", display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 700 }}>
                {nameOf(id)[0]?.toUpperCase()}
              </span>
            ))
          ) : (
            <span style={{ width: 24, height: 24, borderRadius: 7, border: "2px solid var(--pop)", background: "var(--panel2)", color: "var(--fg2)", display: "grid", placeItems: "center" }}>
              <AIcon name="building-2" size={12} />
            </span>
          )}
        </span>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</span>
        <AIcon name="chevron-down" size={13} color="var(--fg3)" />
      </button>
      {open && (
        <div className="an-pop" role="listbox" aria-multiselectable="true" aria-label="Clientes" onKeyDown={onKey} style={{ width: 380 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
            <AIcon name={busy ? "loader-circle" : "search"} size={15} color="var(--fg3)" className={busy ? "au-spin" : undefined} />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setAct(0);
              }}
              aria-label="Buscar cliente"
              placeholder={dirTotal ? `Buscar entre ${nf(dirTotal)} clientes ou systemClientId` : "Buscar cliente ou systemClientId"}
              style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 13.5 }}
            />
            <span className="au-kbd" style={{ marginLeft: 0 }}>Esc</span>
          </div>
          {selected.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
              {selected.map((id) => (
                <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: 3, borderRadius: 999, background: "var(--panel2)", fontSize: 12 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, background: colorOf(id), color: "var(--accFg)", display: "grid", placeItems: "center", fontSize: 9.5, fontWeight: 700 }}>{nameOf(id)[0]?.toUpperCase()}</span>
                  {nameOf(id)}
                  <button title="Remover" aria-label={`Remover ${nameOf(id)}`} onClick={() => toggleId(id)} style={{ width: 18, height: 18, display: "grid", placeItems: "center", border: 0, borderRadius: "50%", background: "transparent", color: "var(--fg3)", cursor: "pointer" }}>
                    <AIcon name="x" size={11} />
                  </button>
                </span>
              ))}
              <button className="an-ghost" onClick={() => onChange([])} style={{ marginLeft: "auto" }}>Limpar</button>
            </div>
          )}
          <div style={{ maxHeight: 340, overflow: "auto", padding: 6 }}>
            {q !== qd || (loading && !flat.length) ? (
              [60, 45, 70, 50].map((w) => (
                <div key={w} aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--panel2)" }} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div className="an-skel" style={{ height: 10, width: w + "%", borderRadius: 5 }} />
                    <div style={{ height: 8, width: "30%", borderRadius: 5, background: "var(--panel2)" }} />
                  </div>
                </div>
              ))
            ) : (
              sections.map((sec) => (
                <div key={sec.label}>
                  <div className="au-label" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 10px 6px" }}>
                    <span>{sec.label}</span>
                    <span style={{ marginLeft: "auto", letterSpacing: 0, textTransform: "none" }}>{sec.count}</span>
                  </div>
                  {sec.rows.map((c) => {
                    const my = ++idx;
                    const on = selected.includes(c.systemClientId);
                    const [pre, hit, post] = highlight(c.name, query);
                    return (
                      <button key={c.systemClientId} className="an-opt" role="option" aria-selected={on} data-active={my === act} onClick={() => { toggleId(c.systemClientId); setAct(my); }} onMouseEnter={() => setAct(my)} style={{ width: "100%", padding: "7px 10px" }}>
                        <span style={{ width: 18, height: 18, flex: "none", borderRadius: 5, border: `1.5px solid ${on ? "var(--acc)" : "var(--line2)"}`, background: on ? "var(--acc)" : "transparent", color: "var(--accFg)", display: "grid", placeItems: "center" }}>
                          {on && <AIcon name="check" size={12} />}
                        </span>
                        <span style={{ width: 28, height: 28, flex: "none", borderRadius: 8, background: colorOf(c.systemClientId), color: "var(--accFg)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>{c.name[0]?.toUpperCase()}</span>
                        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {pre}
                            {hit && <mark>{hit}</mark>}
                            {post}
                          </span>
                          <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>{c.systemClientId}{c.plan ? ` · ${c.plan}` : ""}</span>
                        </span>
                        {!!c.openAnalyses && <span title="Análises abertas" style={{ flex: "none", fontFamily: "var(--fm)", fontSize: 10.5, padding: "1px 7px", borderRadius: 999, background: "var(--acc)", color: "var(--accFg)" }}>{c.openAnalyses}</span>}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
            {!busy && !error && query && !flat.length && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: "16px 10px" }}>
                <span style={{ fontSize: 13, color: "var(--fg2)" }}>Nenhum cliente com “{query}”. Busque pelo nome ou pelo systemClientId.</span>
                <button className="an-chip-btn" onClick={() => { setQ(""); setQd(""); }}>Limpar busca</button>
              </div>
            )}
            {!busy && !error && !query && !flat.length && <div style={{ padding: "16px 10px", fontSize: 13, color: "var(--fg2)" }}>Nenhum cliente ainda. Eles aparecem aqui quando um grupo for vinculado a um cliente em Canais.</div>}
            {error && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: "16px 10px" }}>
                <span style={{ fontSize: 13, color: "var(--fg2)" }}>Não consegui buscar os clientes.</span>
                <button className="an-chip-btn" onClick={() => setRetry((n) => n + 1)}>Tentar de novo</button>
              </div>
            )}
            {canMore && (
              <button onClick={loadMore} disabled={more} style={{ width: "100%", marginTop: 4, padding: 9, border: "1px dashed var(--line2)", borderRadius: 9, background: "transparent", color: "var(--fg2)", fontSize: 12.5, cursor: "pointer" }}>
                {more ? "Carregando…" : "Carregar mais 30"}
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderTop: "1px solid var(--line)", fontSize: 11.5, color: "var(--fg3)" }}>
            <span>{busy ? "Buscando…" : footer}</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
              <span>↑↓ navegar</span>
              <span>Enter marcar</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
