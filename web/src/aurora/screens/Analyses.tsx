// Caixa de entrada › Análises dos grupos (design A3): o que o Hermes entendeu das conversas nos grupos de clientes.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { errorMessage } from "@/lib/api-error";
import { copyTextToClipboard } from "@/lib/clipboard";
import { ChatDrawer, IgnoredDrawer, IrrelevantDialog } from "../analyses/Drawers";
import { Detail, DetailSkeleton } from "../analyses/Detail";
import { ClientPicker, FilterSelect } from "../analyses/Filters";
import {
  CATEGORIES, FILTER_CATEGORIES, NO_FILTERS, STATUS_TABS, URGENCIES, URGENCY_ORDER,
  analysesApi, chatPrompt, groupByUrgency, hasFilters, isUnseen, matches, plural, platformLabel, reasonLabel, tabPass, viewOf, whenLabel,
  type Analysis, type Filters, type IgnoredGroup, type IrrelevantReason, type StatusTab,
} from "../analyses/api";
import { AIcon } from "../analyses/icons";
import "../analyses/analyses.css";
import { toast } from "../store";

const POLL_MS = 20000;
const soft = (c: string, p: number) => `color-mix(in oklab,${c} ${p}%,transparent)`;
type Dd = "client" | "cat" | "urg" | null;

export function Analyses() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Analysis[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<StatusTab>("open");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [dd, setDd] = useState<Dd>(null);
  const [selId, setSelId] = useState<number | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [irrOpen, setIrrOpen] = useState(false);
  const [irrBusy, setIrrBusy] = useState(false);
  const [ignOpen, setIgnOpen] = useState(false);
  const [ignored, setIgnored] = useState<IgnoredGroup[] | null>(null);
  const [ignError, setIgnError] = useState(false);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [flagBusy, setFlagBusy] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const openSeq = useRef(0);

  const load = useCallback(async (silent: boolean) => {
    try {
      const r = await analysesApi.all();
      setRows(r);
      setLoadError(false);
    } catch {
      if (!silent) setLoadError(true);
    }
  }, []);
  const loadIgnored = useCallback(() => {
    analysesApi.ignored().then(
      (g) => {
        setIgnored(g);
        setIgnError(false);
      },
      () => setIgnError(true),
    );
  }, []);

  useEffect(() => {
    load(false);
    loadIgnored();
    const iv = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      load(true);
      loadIgnored();
    }, POLL_MS);
    return () => {
      clearInterval(iv);
      clearTimeout(copyTimer.current);
    };
  }, [load, loadIgnored]);

  const upsert = (next: Analysis) => setRows((r) => (r ? r.map((x) => (x.id === next.id ? next : x)) : r));

  // ---- derivados ----
  const all = rows ?? [];
  const list = useMemo(() => all.filter((a) => tabPass[tab](a) && matches(a, filters)), [all, tab, filters]);
  const groups = useMemo(() => groupByUrgency(list), [list]);
  const tabCount = (t: StatusTab) => all.filter((a) => tabPass[t](a) && matches(a, filters)).length;
  const openCount = (key: "category" | "urgency") => {
    const c: Record<string, number> = {};
    for (const a of all) if (viewOf(a) === "open" && a[key]) c[a[key]!] = (c[a[key]!] ?? 0) + 1;
    return c;
  };
  const sel = all.find((a) => a.id === selId) ?? list[0] ?? null;
  const filtering = hasFilters(filters);
  const loading = rows === null && !loadError;
  const ignTotal = (ignored ?? []).reduce((n, g) => n + g.count, 0);

  // Abrir = marcar como visto por mim; o retorno já traz a análise fresca.
  const open = (id: number) => {
    const seq = ++openSeq.current;
    setSelId(id);
    setCopied(false);
    setDetailBusy(true);
    analysesApi
      .seen(id)
      .then(upsert, () => {})
      .finally(() => seq === openSeq.current && setDetailBusy(false));
  };

  // A primeira análise aparece aberta sozinha ao carregar: conta como vista, igual ao clique (e fica selecionada,
  // para não passar para a próxima quando sair da aba "Não vistas").
  useEffect(() => {
    if (selId === null && sel) open(sel.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, sel?.id]);

  // ---- ações ----
  const act = async (fn: () => Promise<Analysis>, fail: string): Promise<Analysis | null> => {
    try {
      const next = await fn();
      upsert(next);
      return next;
    } catch (e) {
      toast(errorMessage(e) || fail);
      return null;
    }
  };
  const reopenCall = (a: Analysis) => (viewOf(a) === "irrelevant" ? analysesApi.undoIrrelevant(a.id) : analysesApi.reopen(a.id));

  const resolve = async (a: Analysis) => {
    setSelId(a.id); // mantém o detalhe aberto mesmo saindo da lista (o Desfazer precisa dele)
    const next = await act(() => analysesApi.resolve(a.id), "Não consegui marcar como resolvido");
    if (next) toast(`Marcado como resolvido · ${a.clientName || a.code} sai das abertas`, { label: "Desfazer", run: () => void act(() => analysesApi.reopen(a.id), "Não consegui desfazer") });
  };
  const reopen = async (a: Analysis) => {
    if (await act(() => reopenCall(a), "Não consegui reabrir")) toast("Análise reaberta · volta para as abertas");
  };
  const copy = async (a: Analysis) => {
    if (!a.suggestedReply) return;
    if (!(await copyTextToClipboard(a.suggestedReply))) return toast("Não consegui copiar — selecione o texto e copie à mão");
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2500);
    toast(`Resposta copiada · cole no grupo “${a.groupName}” do ${platformLabel(a.platform) || "grupo"}`);
  };
  const markIrrelevant = async (a: Analysis, reason: IrrelevantReason, note: string) => {
    setSelId(a.id);
    setIrrBusy(true);
    const next = await act(() => analysesApi.irrelevant(a.id, reason, note), "Não consegui enviar");
    setIrrBusy(false);
    if (!next) return;
    setIrrOpen(false);
    toast(`Obrigado, anotei: “${reasonLabel(reason)}”. Vai servir para calibrar a triagem dos grupos${a.clientName ? ` de ${a.clientName}` : ""}.`, {
      label: "Desfazer",
      run: () => void act(() => analysesApi.undoIrrelevant(a.id), "Não consegui desfazer"),
    });
  };
  const retryTranscript = async (a: Analysis) => {
    setRetrying(true);
    const next = await act(() => analysesApi.transcribe(a.id), "Não consegui tentar de novo");
    setRetrying(false);
    if (next) toast(next.evidence.audios.some((x) => x.transcriptError) ? "Ainda não consegui transcrever o áudio" : "Áudio transcrito");
  };
  const flag = async (g: IgnoredGroup) => {
    setFlagBusy(g.channelId);
    try {
      await analysesApi.reanalyze(g.channelId);
      setFlagged((s) => new Set(s).add(g.channelId));
      toast(`Lote enviado para análise · ${plural(g.count, "mensagem", "mensagens")} de “${g.groupName}”`);
      loadIgnored();
    } catch (e) {
      toast(errorMessage(e) || "Não consegui enviar para análise");
    } finally {
      setFlagBusy(null);
    }
  };
  // Hoje a conversa "sobre isto" abre na Conversa normal, com a análise e a pergunta no campo de texto.
  const askHermes = (a: Analysis, question: string) => navigate(`/chat?q=${encodeURIComponent(chatPrompt(a, question))}`);

  // ---- teclado: Esc fecha o que estiver aberto; ↑↓/j/k trocam de análise ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dd) setDd(null);
        else if (irrOpen) setIrrOpen(false);
        else if (chatOpen) setChatOpen(false);
        else if (ignOpen) setIgnOpen(false);
        return;
      }
      const tag = (e.target as HTMLElement).tagName;
      if (dd || irrOpen || chatOpen || ignOpen || tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      const flat = groups.flatMap((g) => g.items);
      const i = sel ? flat.findIndex((x) => x.id === sel.id) : -1;
      const go = (n: number) => {
        const t = flat[Math.max(0, Math.min(flat.length - 1, n))];
        if (t && t.id !== sel?.id) open(t.id);
      };
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        go(i + 1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        go(i - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const clearFilters = () => setFilters(NO_FILTERS);
  const empty = rows !== null && rows.length === 0;
  const listEmpty = !loading && !empty && groups.length === 0;
  const emptyCopy = filtering
    ? { icon: "search-x", title: "Nada com esses filtros", text: "Tente outro cliente, categoria ou urgência.", button: "Limpar filtros", run: clearFilters }
    : tab === "open"
      ? { icon: "party-popper", title: "Tudo em dia", text: "Nenhuma análise aberta. O Hermes avisa no Telegram quando algo novo chegar.", button: "Ver resolvidas", run: () => setTab("resolved") }
      : { icon: "inbox", title: "Nada aqui", text: "Nenhuma análise com este status.", button: "Ver abertas", run: () => setTab("open") };

  return (
    <div className="an-root" style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "auto", display: "flex" }}>
      <div style={{ flex: 1, minHeight: 0, minWidth: 900, display: "flex", flexDirection: "column", gap: 14, padding: "22px 32px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flex: "none", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <h1 className="au-h1" style={{ fontSize: "calc(var(--h1) * .9)" }}>Análises dos grupos</h1>
            <p style={{ margin: 0, color: "var(--fg2)", fontSize: 14, lineHeight: 1.5 }}>O que o Hermes entendeu das conversas nos grupos de clientes. Ele não responde ninguém: você decide o que fazer.</p>
          </div>
          <button className="an-trigger" onClick={() => setIgnOpen(true)} style={{ marginLeft: "auto", flex: "none", height: "auto", gap: 10, padding: "9px 14px", borderRadius: 999, background: "var(--panel)", color: "var(--fg2)" }}>
            <AIcon name="coffee" size={14} color="var(--fg3)" />
            <span>
              {ignored ? (
                <>
                  <b style={{ color: "var(--fg)", fontWeight: 600 }}>{ignTotal.toLocaleString("pt-BR")} {ignTotal === 1 ? "mensagem social" : "mensagens sociais"}</b> {ignTotal === 1 ? "ignorada" : "ignoradas"} hoje
                </>
              ) : (
                "Mensagens sociais ignoradas hoje"
              )}
            </span>
            <span style={{ color: "var(--acc)", fontWeight: 600 }}>ver</span>
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none", flexWrap: "wrap" }}>
          <div role="group" aria-label="Status" style={{ display: "flex", gap: 3, padding: 3, borderRadius: "var(--r2)", background: "var(--panel2)" }}>
            {STATUS_TABS.map((t) => (
              <button key={t.id} className="an-seg" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
                <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>{loading ? "–" : tabCount(t.id)}</span>
              </button>
            ))}
          </div>
          <ClientPicker rows={all} selected={filters.clients} onChange={(clients) => setFilters((f) => ({ ...f, clients }))} open={dd === "client"} onToggle={() => setDd(dd === "client" ? null : "client")} onClose={() => setDd(null)} />
          <FilterSelect label="Categoria" all="Categoria" many="categorias" fallbackIcon="tag" defs={CATEGORIES} order={FILTER_CATEGORIES} counts={openCount("category")} value={filters.categories} onChange={(categories) => setFilters((f) => ({ ...f, categories }))} open={dd === "cat"} onToggle={() => setDd(dd === "cat" ? null : "cat")} />
          <FilterSelect label="Urgência" all="Urgência" many="urgências" fallbackIcon="gauge" defs={URGENCIES} order={URGENCY_ORDER} counts={openCount("urgency")} value={filters.urgencies} onChange={(urgencies) => setFilters((f) => ({ ...f, urgencies }))} open={dd === "urg"} onToggle={() => setDd(dd === "urg" ? null : "urg")} />
          {dd && <div onClick={() => setDd(null)} style={{ position: "fixed", inset: 0, zIndex: 15 }} />}
          {filtering && <button className="an-ghost" onClick={clearFilters} style={{ height: 36, padding: "0 8px" }}>Limpar filtros</button>}
        </div>

        {loadError && (
          <div role="alert" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, padding: 28, border: `1px solid ${soft("var(--err)", 35)}`, borderRadius: "var(--r)", background: "var(--panel)" }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: soft("var(--err)", 14), color: "var(--err)" }}><AIcon name="cloud-off" size={19} /></span>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Não consegui carregar as análises</span>
            <span style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.55, maxWidth: 560 }}>O Hermes continua analisando os grupos e mandando os avisos no Telegram. Só esta tela não carregou.</span>
            <button className="au-primary" onClick={() => { setLoadError(false); load(false); }}><AIcon name="rotate-cw" size={14} />Tentar de novo</button>
          </div>
        )}

        {empty && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12, padding: "56px 28px", border: "1px dashed var(--line2)", borderRadius: "var(--r)", background: "var(--panel)" }}>
            <span style={{ width: 52, height: 52, borderRadius: 15, display: "grid", placeItems: "center", background: "var(--accSoft)", color: "var(--acc)" }}><AIcon name="ear" size={24} /></span>
            <span className="au-display" style={{ fontSize: 22 }}>Nenhuma análise ainda</span>
            <span style={{ fontSize: 14, color: "var(--fg2)", lineHeight: 1.55, maxWidth: 460, textWrap: "pretty" }}>O Hermes só analisa grupos que estão no modo Escutar ou Rascunhar. Escolha o modo dos grupos de clientes em Canais.</span>
            <button className="au-primary" onClick={() => navigate("/gateways")} style={{ marginTop: 6 }}><AIcon name="radio-tower" size={14} />Abrir Canais</button>
          </div>
        )}

        {!loadError && !empty && (
          <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "360px minmax(0,1fr)", gap: 14 }}>
            <div style={{ minHeight: 0, overflow: "auto", border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--panel)", backdropFilter: "var(--blur)", WebkitBackdropFilter: "var(--blur)" }}>
              {loading && (
                <div aria-busy="true" style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ padding: "12px 16px", fontSize: 12.5, color: "var(--fg3)", display: "flex", alignItems: "center", gap: 8 }}><AIcon name="loader-circle" size={14} className="au-spin" />Carregando análises…</div>
                  {["80%", "65%", "90%", "70%", "75%"].map((w) => (
                    <div key={w} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px", borderTop: "1px solid var(--line)" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <div style={{ height: 18, width: 60, borderRadius: 999, background: "var(--panel2)" }} />
                        <div style={{ height: 18, width: 50, borderRadius: 999, background: "var(--panel2)" }} />
                      </div>
                      <div className="an-skel" style={{ height: 11, width: w, borderRadius: 6 }} />
                      <div style={{ height: 9, width: "80%", borderRadius: 6, background: "var(--panel2)" }} />
                    </div>
                  ))}
                </div>
              )}
              {listEmpty && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, padding: "24px 18px" }}>
                  <AIcon name={emptyCopy.icon} size={22} color="var(--fg3)" />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{emptyCopy.title}</span>
                  <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5 }}>{emptyCopy.text}</span>
                  <button className="an-chip-btn" onClick={emptyCopy.run} style={{ padding: "7px 12px", fontSize: 12.5 }}>{emptyCopy.button}</button>
                </div>
              )}
              {groups.map((g) => (
                <div key={g.key}>
                  <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 8px", background: "var(--pop)", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: g.color }} />
                    <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--fg2)" }}>{g.label}</span>
                    <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>{g.items.length}</span>
                  </div>
                  {g.items.map((a) => (
                    <Row key={a.id} a={a} current={a.id === sel?.id} onOpen={() => open(a.id)} />
                  ))}
                </div>
              ))}
            </div>

            <div style={{ minHeight: 0, overflow: "auto", border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--panel)", backdropFilter: "var(--blur)", WebkitBackdropFilter: "var(--blur)" }}>
              {(loading || (detailBusy && !!sel)) && <DetailSkeleton />}
              {!loading && !sel && <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 40, textAlign: "center", color: "var(--fg2)", fontSize: 13.5 }}>Escolha uma análise na lista.</div>}
              {!loading && !detailBusy && sel && (
                <Detail
                  key={sel.id}
                  a={sel}
                  copied={copied}
                  retrying={retrying}
                  onResolve={() => resolve(sel)}
                  onReopen={() => reopen(sel)}
                  onCopy={() => copy(sel)}
                  onChat={() => setChatOpen(true)}
                  onIrrelevant={() => setIrrOpen(true)}
                  onRetryTranscript={() => retryTranscript(sel)}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {ignOpen && <IgnoredDrawer groups={ignored} error={ignError} flagged={flagged} busy={flagBusy} onClose={() => setIgnOpen(false)} onFlag={flag} onRetry={loadIgnored} />}
      {chatOpen && sel && <ChatDrawer a={sel} onClose={() => setChatOpen(false)} onAsk={(q) => askHermes(sel, q)} />}
      {irrOpen && sel && <IrrelevantDialog a={sel} busy={irrBusy} onClose={() => setIrrOpen(false)} onSubmit={(r, n) => markIrrelevant(sel, r, n)} />}
    </div>
  );
}

function Row({ a, current, onOpen }: { a: Analysis; current: boolean; onOpen: () => void }) {
  const view = viewOf(a);
  const cat = a.category ? CATEGORIES[a.category] : null;
  const unseen = isUnseen(a);
  const st =
    view === "resolved" ? { icon: "circle-check", color: "var(--ok)", title: "Resolvido" }
    : view === "irrelevant" ? { icon: "thumbs-down", color: "var(--fg3)", title: "Não relevante" }
    : a.seenBy.length ? { icon: "eye", color: "var(--fg3)", title: "Visto" }
    : a.telegram ? { icon: "send", color: "var(--fg3)", title: "Enviado ao Telegram" }
    : { icon: "circle-dashed", color: "var(--fg3)", title: "Aviso não enviado" };
  const chipColor = cat?.color ?? "var(--err)";
  return (
    <button className="an-row" aria-current={current} onClick={onOpen} style={{ opacity: view === "open" ? 1 : 0.65 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 999, background: soft(chipColor, 15), color: chipColor, fontSize: 11, fontWeight: 600 }}>
          <AIcon name={cat?.icon ?? "circle-alert"} size={11} />
          {cat?.label ?? "Falhou"}
        </span>
        {unseen && <span title="Ninguém viu ainda" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--acc)" }} />}
        <span style={{ marginLeft: "auto", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>{whenLabel(a)}</span>
      </span>
      <span style={{ fontSize: 13, fontWeight: unseen ? 600 : 500, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {a.summary || `Não consegui analisar ${plural(a.messageCount, "mensagem", "mensagens")}.`}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--fg3)", width: "100%" }}>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>{a.clientName || a.groupName} · {a.messageCount} msgs</span>
        {a.evidence.audios.length > 0 && <AIcon name="mic" size={12} />}
        {a.evidence.media.some((m) => m.type !== "video") && <AIcon name="image" size={12} />}
        {a.evidence.media.some((m) => m.type === "video") && <AIcon name="video" size={12} />}
        <span title={st.title}><AIcon name={st.icon} size={13} color={st.color} /></span>
      </span>
    </button>
  );
}
