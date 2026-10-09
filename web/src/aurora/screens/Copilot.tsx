// Operação › Clientes do Copiloto (A8, Fase 3): um Copiloto de leitura por cliente da Aibiz, com chave, plano, consumo e auditoria.
// Dados reais de /api/copilot e /api/aibiz (por perfil). A chave da API só existe dentro do diálogo que a gerou.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { AddDialog } from "../copilot/AddDialog";
import { copilotApi, type Client, type ClientDetail, type ClientsPage, type Counts, type CopilotSettings, type Plan } from "../copilot/api";
import { ClientDetailView, type TabKey } from "../copilot/Detail";
import { NeedSettings, PlanDialog, ReactivateDialog, RevokeDialog, RotateDialog } from "../copilot/Dialogs";
import { ClientList, type Filters } from "../copilot/List";
import { fmtUsd, kpiRow, mergeClients, monthName, planName, replaceClient, sortClients } from "../copilot/model";
import { DetailSkeleton, EmptyState, ErrorState, Pick } from "../copilot/States";
import "../copilot/copilot.css";
import { nowSec } from "../health/model";
import { toast } from "../store";

type Dlg = { kind: "add" | "rotate" | "revoke" | "reactivate" } | { kind: "plan"; initial?: Plan } | null;

const NO_FILTERS: Filters = { q: "", status: "", plan: "" };

function useNow(ms: number) {
  const [n, setN] = useState(nowSec);
  useEffect(() => {
    const iv = setInterval(() => setN(nowSec()), ms);
    return () => clearInterval(iv);
  }, [ms]);
  return n;
}

export function Copilot() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [qd, setQd] = useState("");
  const [items, setItems] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [spend, setSpend] = useState<number | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [listBusy, setListBusy] = useState(true);
  const [listFailed, setListFailed] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [detailFailed, setDetailFailed] = useState(false);
  const [detailTick, setDetailTick] = useState(0);
  const [tab, setTab] = useState<TabKey>("tools");
  const [dlg, setDlg] = useState<Dlg>(null);
  const [settings, setSettings] = useState<CopilotSettings | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const now = useNow(30000);
  const listReq = useRef(0);
  const detReq = useRef(0);
  const pages = useRef(1);

  const unfiltered = !qd && !filters.status && !filters.plan;
  const query = useMemo(() => ({ q: qd, status: filters.status, plan: filters.plan }), [qd, filters.status, filters.plan]);

  // ---- carregar ----

  const loadSettings = useCallback(async () => {
    setSettingsBusy(true);
    try {
      setSettings(await copilotApi.settings());
    } catch {
      setSettings(null); // as telas que precisam dos planos avisam e deixam tentar de novo
    } finally {
      setSettingsBusy(false);
    }
  }, []);
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // A busca espera 250 ms de pausa; chips e planos valem na hora.
  useEffect(() => {
    const t = setTimeout(() => setQd(filters.q.trim()), filters.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [filters.q]);

  const take = useCallback((p: ClientsPage, isUnfiltered: boolean) => {
    setItems(p.items);
    setTotal(p.total);
    setCounts(p.counts);
    setNext(p.nextCursor);
    // O backend soma o gasto só dos itens filtrados: o número do mês vem da lista sem filtro.
    if (isUnfiltered) setSpend(p.kpis.spendUsd);
    pages.current = 1;
  }, []);

  useEffect(() => {
    const id = ++listReq.current;
    setListBusy(true);
    setListFailed(false);
    copilotApi.clients(query).then(
      (p) => {
        if (id !== listReq.current) return;
        take(p, !query.q && !query.status && !query.plan);
        setLoaded(true);
        setListBusy(false);
        setSel((cur) => cur ?? p.items[0]?.systemClientId ?? null);
      },
      () => {
        if (id !== listReq.current) return;
        setListFailed(true);
        setListBusy(false);
      },
    );
  }, [query, retryTick, take]);

  useEffect(() => {
    if (!sel) {
      setDetail(null);
      return;
    }
    const id = ++detReq.current;
    setDetail(null);
    setDetailFailed(false);
    copilotApi.client(sel).then(
      (d) => id === detReq.current && setDetail(d),
      () => id === detReq.current && setDetailFailed(true),
    );
  }, [sel, detailTick]);

  /** Atualiza contadores e total depois de uma ação, sem perder as páginas que a pessoa já abriu. */
  const refresh = useCallback(async () => {
    const id = listReq.current;
    try {
      const p = await copilotApi.clients(query);
      if (id !== listReq.current) return;
      setCounts(p.counts);
      setTotal(p.total);
      if (!query.q && !query.status && !query.plan) setSpend(p.kpis.spendUsd);
      if (pages.current === 1) {
        setItems(p.items);
        setNext(p.nextCursor);
      }
    } catch {
      /* a ação já deu certo; os números se acertam na próxima leitura */
    }
  }, [query]);

  const more = async () => {
    if (!next || moreBusy) return;
    const id = listReq.current;
    setMoreBusy(true);
    try {
      const p = await copilotApi.clients({ ...query, cursor: next });
      if (id !== listReq.current) return;
      setItems((l) => mergeClients(l, p.items));
      setNext(p.nextCursor);
      setTotal(p.total);
      pages.current++;
    } catch {
      toast("Não consegui carregar mais clientes", "Tente de novo em instantes.");
    } finally {
      setMoreBusy(false);
    }
  };

  const retry = () => {
    setRetryTick((t) => t + 1);
    if (!settings) loadSettings();
  };

  // ---- ações ----

  /** Guarda o cliente devolvido por uma ação: detalhe, item da lista (com a ordem refeita) e contadores. */
  const apply = (c: ClientDetail) => {
    setDetail(c);
    setItems((l) => sortClients(replaceClient(l, c), nowSec()));
    refresh();
  };
  const close = () => setDlg(null);

  const created = (c: ClientDetail) => {
    const hadFilters = !!(filters.q || filters.status || filters.plan);
    setFilters(NO_FILTERS);
    setQd("");
    setTab("tools");
    setSel(c.systemClientId);
    setDetail(c);
    if (!hadFilters) {
      // Sem filtro a lista não recarrega sozinha: o cliente novo entra no topo já.
      setItems((l) => sortClients([c, ...l.filter((x) => x.systemClientId !== c.systemClientId)], nowSec()));
      setCounts((k) => (k ? { ...k, all: k.all + 1, active: k.active + 1 } : k));
      setTotal((n) => n + 1);
    }
    refresh();
    toast(`${c.name} no Copiloto`, `Perfil ${c.profileId} criado no plano ${planName(c.plan, settings?.planLabels)}.`);
  };

  // ---- derivados ----

  const shown = useMemo(() => sortClients(items, now), [items, now]);
  const k = kpiRow(counts, spend);
  const filtered = !unfiltered || !!filters.q;
  const empty = loaded && !listFailed && counts?.all === 0 && !filtered;
  const fatal = listFailed && !loaded;
  const labels = settings?.planLabels;
  // Com filtro, o cliente aberto pode sair da lista: o detalhe dele deixa de aparecer até a escolha de outro (ou até voltar).
  const gone = !!sel && filtered && loaded && !listBusy && !listFailed && !next && !items.some((c) => c.systemClientId === sel);

  const needSettings = (title: string) => <NeedSettings title={title} busy={settingsBusy} onClose={close} onRetry={loadSettings} />;

  return (
    <div className="cp-root">
      <div className="cp-cq">
      <div className="cp-page">
        <div className="cp-head">
          <div className="cp-headl">
            <span className="au-label">Operação</span>
            <div className="cp-title">
              <h1 className="au-h1">Clientes do Copiloto</h1>
              <span className="cp-phase">Fase 3</span>
            </div>
            <p style={{ margin: 0, color: "var(--fg2)", fontSize: 14, lineHeight: 1.5 }}>
              O Copiloto do Gestor é um Hermes por cliente, aberto dentro do Aibiz Manager. Aqui a equipe libera, acompanha e corta o acesso.
            </p>
          </div>
          {!fatal && (
            <div className="cp-headr">
              {counts && (
                <div role="group" aria-label="Resumo do mês" className="cp-kpirow">
                  <div className="cp-kpi">
                    <b>{k.active}</b>
                    <span>ativos</span>
                  </div>
                  <div className="cp-kpi">
                    <b style={{ color: "var(--warn)" }}>{k.noCredit}</b>
                    <span>sem saldo</span>
                  </div>
                  <div className="cp-kpi">
                    <b>{fmtUsd(k.spendUsd)}</b>
                    <span>gasto em {monthName(now)}</span>
                  </div>
                </div>
              )}
              <button className="au-primary" style={{ padding: "10px 15px" }} onClick={() => setDlg({ kind: "add" })}>
                <Icon name="plus" size={14} />
                Adicionar cliente
              </button>
            </div>
          )}
        </div>

        <div className="cp-strip">
          <Icon name="shield-check" size={17} color="var(--ok)" />
          <span>
            <b>O Copiloto só lê dados daquele cliente.</b>{" "}
            <span style={{ color: "var(--fg2)" }}>
              Cada chave é presa a um systemClientId: toda consulta leva esse filtro, nada é escrito e outro cliente nunca aparece, nem se o gestor pedir.
            </span>
          </span>
        </div>

        {fatal && <ErrorState title="Não consegui carregar os clientes do Copiloto" text="Os Copilotos continuam funcionando para os gestores. Só esta lista não carregou." busy={listBusy} onRetry={retry} />}
        {empty && <EmptyState onAdd={() => setDlg({ kind: "add" })} />}

        {!fatal && !empty && (
          <div className="cp-split">
            <ClientList
              items={shown}
              total={total}
              counts={counts}
              now={now}
              selected={sel}
              filters={filters}
              loading={listBusy && (!loaded || items.length === 0 || filtered)}
              failed={listFailed}
              hasMore={!!next}
              moreBusy={moreBusy}
              planLabels={labels}
              onFilters={(f) => setFilters((x) => ({ ...x, ...f }))}
              onSelect={(id) => id !== sel && setSel(id)}
              onMore={more}
              onRetry={() => setRetryTick((t) => t + 1)}
            />
            <div className="cp-detail" aria-busy={!detail && !!sel && !detailFailed}>
              {((!sel && loaded) || gone) && <Pick text="Selecione um cliente na lista." />}
              {!gone && ((!sel && !loaded) || (sel && !detail && !detailFailed)) ? <DetailSkeleton /> : null}
              {sel && detailFailed && !gone && (
                <div style={{ padding: 24 }}>
                  <ErrorState title="Não consegui carregar este cliente" text="Os dados do Copiloto dele não foram alterados. Só esta tela não carregou." busy={false} onRetry={() => setDetailTick((t) => t + 1)} />
                </div>
              )}
              {detail && !gone && (
                <ClientDetailView
                  d={detail}
                  now={now}
                  tab={tab}
                  onTab={setTab}
                  planLabels={labels}
                  actions={{
                    onPlan: (initial) => setDlg({ kind: "plan", initial }),
                    onRotate: () => setDlg({ kind: "rotate" }),
                    onRevoke: () => setDlg({ kind: "revoke" }),
                    onReactivate: () => setDlg({ kind: "reactivate" }),
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
      </div>

      {dlg?.kind === "add" && (settings ? <AddDialog settings={settings} onClose={close} onCreated={created} /> : needSettings("Adicionar cliente ao Copiloto"))}
      {dlg?.kind === "plan" && detail && (settings ? (
        <PlanDialog
          client={detail}
          settings={settings}
          initial={dlg.initial}
          onClose={close}
          onDone={(c) => {
            apply(c);
            close();
            toast(`${c.name} agora no ${planName(c.plan, labels)}`, "Vale na hora para o gestor. A cobrança muda no financeiro do Aibiz.");
          }}
        />
      ) : (
        needSettings(`Mudar o plano de ${detail.name}`)
      ))}
      {dlg?.kind === "rotate" && detail && (
        <RotateDialog
          client={detail}
          onClose={close}
          onDone={(c) => {
            apply(c);
            toast(`Chave de ${c.name} rotacionada`, "Atualize no Aibiz Manager: a chave nova aparece só no diálogo.");
          }}
        />
      )}
      {dlg?.kind === "revoke" && detail && (
        <RevokeDialog
          client={detail}
          onClose={close}
          onDone={(c) => {
            apply(c);
            close();
            toast(`Acesso de ${c.name} revogado`, "A chave parou de funcionar. O gestor vê “Copiloto indisponível”.");
          }}
        />
      )}
      {dlg?.kind === "reactivate" && detail && (
        <ReactivateDialog
          client={detail}
          onClose={close}
          onDone={(c) => {
            apply(c);
            toast(`${c.name} reativado`, "A chave nova aparece só no diálogo. A antiga continua inválida.");
          }}
        />
      )}
    </div>
  );
}
