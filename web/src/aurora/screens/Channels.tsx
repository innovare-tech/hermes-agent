// Canais (A2): todos os grupos e conversas do Hermes, o modo de cada um, o vínculo com o cliente e a janela
// de análise. Dados reais de /api/ops/channels, /api/ops/listen e /api/clients; nada fixo.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { AutonomyMode } from "../adapter";
import { PageHeader, spot } from "../Chrome";
import { Icon } from "../Icon";
import { plural } from "../chat/sources";
import { ClientPicker } from "../channels/ClientPicker";
import { ChannelDrawer } from "../channels/Drawer";
import { ChannelRowView } from "../channels/Row";
import { DefaultWindowDialog } from "../channels/Window";
import { Modal } from "../channels/parts";
import {
  applyFilters,
  channelsApi,
  filtersActive,
  linkedClients,
  modeCounts,
  modeInfo,
  needsLink,
  NO_FILTERS,
  SECTIONS,
  sortSection,
  type ChannelPatch,
  type ChannelRow,
  type Filters,
} from "../channels/model";
import "../channels/channels.css";
import { setState, toast } from "../store";

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
type Pair = { silenceMin: number; maxMin: number };
type Load = "loading" | "ok" | "error";

/** O que desfaz uma troca de vínculo (volta a vincular, a "não é cliente" ou a sem vínculo). */
const relinkPatch = (c: ChannelRow): ChannelPatch => (c.notClient ? { notClient: true } : c.clientId ? { clientId: c.clientId } : { clientId: null, notClient: false });
const windowPatch = (c: ChannelRow): ChannelPatch => ({ window: c.window.useDefault ? null : { silenceMin: c.window.silenceMin, maxMin: c.window.maxMin } });

export function Channels() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [load, setLoad] = useState<Load>("loading");
  const [def, setDef] = useState<Pair | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [open, setOpen] = useState<string | null>(null); // gaveta
  const [menu, setMenu] = useState<string | null>(null); // menu de modo aberto (id do canal)
  const [picker, setPicker] = useState<string | null>(null);
  const [confirmAuto, setConfirmAuto] = useState<string | null>(null);
  const [defaultDialog, setDefaultDialog] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoad("loading");
    try {
      const [list, d] = await Promise.all([channelsApi.list(), channelsApi.defaultWindow().catch(() => null)]);
      setRows(list);
      if (d) setDef(d);
      setLoad("ok");
    } catch {
      if (!silent) setLoad("error"); // atualização em segundo plano que falha não derruba o que já está na tela
    }
  }, []);

  useEffect(() => {
    reload();
    const iv = setInterval(() => reload(true), 30000);
    return () => clearInterval(iv);
  }, [reload]);

  const byId = (id: string | null) => rows.find((r) => r.id === id) ?? null;
  const drawerRow = byId(open);
  const pickerRow = byId(picker);
  const confirmRow = byId(confirmAuto);

  const replace = (next: ChannelRow) => {
    setRows((rs) => rs.map((r) => (r.id === next.id ? next : r)));
    // As Aprovações e os Playbooks leem o modo da store global: mantém igual.
    setState((s) => ({ autonomy: s.autonomy.map((a) => (a.id === next.id ? { ...a, mode: next.mode, business: next.business_id ?? "" } : a)) }));
  };

  /** Aplica a mudança no backend; o aviso tem "Desfazer" (manda o `undo` e confirma de novo). */
  const change = async (row: ChannelRow, patch: ChannelPatch, done: string, undo: ChannelPatch) => {
    setBusy(true);
    try {
      replace(await channelsApi.patch(row.id, patch));
      toast(done, {
        undo: async () => {
          try {
            replace(await channelsApi.patch(row.id, { ...undo, confirm: true }));
            toast("Desfeito");
          } catch (e) {
            toast(errMsg(e, "Não consegui desfazer"));
          }
        },
      });
    } catch (e) {
      toast(errMsg(e, "Não consegui salvar. Nada mudou."));
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const safe = (p: Promise<void>) => p.catch(() => {});

  const setMode = (row: ChannelRow, mode: AutonomyMode) => {
    setMenu(null);
    if (mode === row.mode) return;
    if (mode === 2 && row.requiresConfirm) return setConfirmAuto(row.id);
    const i = modeInfo(mode);
    return safe(change(row, { mode }, `${row.name}: ${i.label}. ${i.guarantee}`, { mode: row.mode }));
  };
  const confirmSuggestion = (row: ChannelRow) => row.suggestion && safe(change(row, { clientId: row.suggestion.clientId }, `${row.name} vinculado a ${row.suggestion.name}.`, relinkPatch(row)));
  const notClient = (row: ChannelRow) => {
    setPicker(null);
    return safe(change(row, { notClient: true }, `${row.name} marcado como “não é cliente”.`, relinkPatch(row)));
  };
  const unlink = (row: ChannelRow) => safe(change(row, { clientId: null }, `${row.name} desvinculado de ${row.clientName}.`, relinkPatch(row)));
  const choose = (row: ChannelRow, c: { systemClientId: string; name: string }) => {
    setPicker(null);
    return safe(change(row, { clientId: c.systemClientId }, `${row.name} vinculado a ${c.name}.`, relinkPatch(row)));
  };
  const saveWindow = (row: ChannelRow, w: { useDefault: true } | Pair) => change(row, { window: w }, `Janela de ${row.name} salva.`, windowPatch(row));

  const saveDefault = async (v: Pair) => {
    const before = def;
    try {
      setDef(await channelsApi.setDefaultWindow(v));
    } catch (e) {
      toast(errMsg(e, "Não consegui salvar o padrão"));
      throw e;
    }
    reload(true); // quem usa o padrão ganha a janela nova
    toast(`Janela padrão: ${v.silenceMin} min de silêncio, no máximo a cada ${v.maxMin} min.`, {
      undo: before
        ? async () => {
            try {
              setDef(await channelsApi.setDefaultWindow(before));
              reload(true);
              toast("Desfeito");
            } catch (e) {
              toast(errMsg(e, "Não consegui desfazer"));
            }
          }
        : undefined,
    });
  };

  const handlers = (row: ChannelRow) => ({
    onOpen: () => {
      setMenu(null);
      setOpen(row.id);
    },
    onToggleMenu: () => setMenu(menu === row.id ? null : row.id),
    onCloseMenu: () => setMenu(null),
    onMode: (m: AutonomyMode) => setMode(row, m),
    onConfirmSuggestion: () => confirmSuggestion(row),
    onChoose: () => setPicker(row.id),
    onNotClient: () => notClient(row),
  });

  const visible = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const unlinkedCount = rows.filter(needsLink).length;
  const problemCount = rows.filter((r) => r.problem).length;
  const usingDefault = rows.filter((r) => r.window.useDefault && (r.mode === 1 || r.mode === 3)).length;
  const clients = useMemo(() => linkedClients(rows), [rows]);
  const set = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));
  const active = filtersActive(filters);

  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page">
        <PageHeader title="Canais" sub="Os grupos e conversas em que o Hermes está. Escolha o que ele faz em cada um e de qual cliente ele é." />

        {load === "loading" && <Skeleton />}
        {load === "error" && <ErrorState onRetry={() => reload()} onGateways={() => navigate("/gateways")} />}
        {load === "ok" && rows.length === 0 && <EmptyState onGateways={() => navigate("/gateways")} />}

        {load === "ok" && rows.length > 0 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14 }}>
              {modeCounts(rows).map((m) => (
                <button
                  key={m.mode}
                  className="au-card au-ch-modecard"
                  aria-pressed={filters.mode === m.mode}
                  onMouseMove={spot}
                  onClick={() => set({ mode: filters.mode === m.mode ? "all" : m.mode })}
                  style={{ borderColor: m.mode === 3 || filters.mode === m.mode ? m.color : undefined, ...(filters.mode === m.mode ? { boxShadow: `0 0 0 3px color-mix(in srgb, ${m.color} 18%, transparent)` } : null) }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8, color: m.color, fontSize: 14, fontWeight: 600 }}>
                    <Icon name={m.icon} size={16} />
                    {m.label}
                    <span style={{ marginLeft: "auto", fontFamily: "var(--fm)", fontSize: 12, color: "var(--fg2)" }} aria-label={`${plural(m.count, "canal", "canais")}`}>
                      {m.count}
                    </span>
                  </span>
                  <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--fg2)" }}>{m.line}</span>
                  {m.mode === 3 && (
                    <span style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--ok)" }}>
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <Icon name="shield-check" size={12} /> Nada é enviado ao grupo
                      </span>
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <Icon name="check" size={12} /> Recomendado para grupos de clientes
                      </span>
                    </span>
                  )}
                </button>
              ))}
            </div>

            {unlinkedCount > 0 && (
              <div className="au-card" role="status" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderColor: "color-mix(in srgb, var(--warn) 55%, transparent)", flexWrap: "wrap" }}>
                <Icon name="link-2" size={15} color="var(--warn)" />
                <span style={{ fontSize: 13.5 }}>{unlinkedCount === 1 ? "1 canal sem cliente vinculado" : `${unlinkedCount} canais sem cliente vinculado`}</span>
                <button className="au-outline" style={{ marginLeft: "auto" }} disabled={filters.unlinked} onClick={() => set({ unlinked: true })}>
                  Mostrar só esses
                </button>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <label className="au-ch-input" style={{ minWidth: 220, flex: "1 1 220px", maxWidth: 340 }}>
                <Icon name="search" size={14} color="var(--fg3)" />
                <input aria-label="Buscar canal" placeholder="Buscar por nome do grupo" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
              </label>
              <select className="au-ch-select" aria-label="Cliente" value={filters.client} onChange={(e) => set({ client: e.target.value })}>
                <option value="all">Todos os clientes</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select className="au-ch-select" aria-label="Modo" value={String(filters.mode)} onChange={(e) => set({ mode: e.target.value === "all" ? "all" : (Number(e.target.value) as AutonomyMode) })}>
                <option value="all">Todos os modos</option>
                {modeCounts(rows).map((m) => (
                  <option key={m.mode} value={m.mode}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button className="au-pill" aria-pressed={filters.unlinked} onClick={() => set({ unlinked: !filters.unlinked })}>
                Sem vínculo ({unlinkedCount})
              </button>
              <button className="au-pill" aria-pressed={filters.problem} onClick={() => set({ problem: !filters.problem })}>
                Com problema ({problemCount})
              </button>
              {active && (
                <button className="au-undo" onClick={() => setFilters(NO_FILTERS)}>
                  Limpar filtros
                </button>
              )}
              <button className="au-outline" style={{ marginLeft: "auto" }} onClick={() => setDefaultDialog(true)} disabled={!def}>
                <Icon name="clock" size={13} /> Janela de análise padrão
              </button>
            </div>

            {visible.length === 0 ? (
              <div className="au-card" onMouseMove={spot} style={{ padding: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>Nenhum canal com esses filtros.</span>
                <button className="au-outline" onClick={() => setFilters(NO_FILTERS)}>
                  Limpar filtros
                </button>
              </div>
            ) : (
              SECTIONS.map((sec) => {
                const list = sortSection(visible.filter((r) => r.section === sec.id));
                if (list.length === 0) return null; // cartão sem resultado some
                return (
                  <section key={sec.id} className="au-card" aria-label={sec.title} style={{ position: "relative", zIndex: list.some((r) => r.id === menu) ? 5 : undefined }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 12px" }}>
                      <Icon name={sec.icon} size={16} color="var(--fg2)" />
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{sec.title}</span>
                      <span style={{ fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg3)" }}>{list.length}</span>
                      <span style={{ fontSize: 12.5, color: "var(--fg3)", marginLeft: 6 }}>{sec.sub}</span>
                    </div>
                    <div className="au-ch-cols au-ch-head au-label" aria-hidden="true">
                      <span>Canal</span>
                      <span>Última mensagem</span>
                      <span style={{ textAlign: "right" }}>Hoje</span>
                      <span>Cliente</span>
                      <span style={{ textAlign: "right" }}>Modo</span>
                    </div>
                    <div role="list">
                      {list.map((row) => (
                        <ChannelRowView key={row.id} row={row} menuOpen={menu === row.id} h={handlers(row)} />
                      ))}
                    </div>
                  </section>
                );
              })
            )}
          </>
        )}
      </div>

      {drawerRow && (
        <ChannelDrawer
          row={drawerRow}
          def={def}
          busy={busy}
          onClose={() => setOpen(null)}
          actions={{
            onMode: (m) => setMode(drawerRow, m),
            onConfirmSuggestion: () => confirmSuggestion(drawerRow),
            onChoose: () => setPicker(drawerRow.id),
            onNotClient: () => notClient(drawerRow),
            onUnlink: () => unlink(drawerRow),
            onSaveWindow: (w) => saveWindow(drawerRow, w),
          }}
        />
      )}
      {pickerRow && <ClientPicker row={pickerRow} onClose={() => setPicker(null)} onPick={(c) => choose(pickerRow, c)} onNotClient={() => notClient(pickerRow)} />}
      {confirmRow && (
        <Modal title={`Deixar o Hermes responder sozinho em “${confirmRow.name}”?`} onClose={() => setConfirmAuto(null)}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--fg2)" }}>
            O Hermes vai responder sozinho neste grupo, para {confirmRow.members ? `as ${confirmRow.members} pessoas que já escreveram aqui e as demais` : "todas as pessoas"}, sem você revisar antes.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button
              className="au-outline"
              onClick={() => {
                setConfirmAuto(null);
                if (confirmRow.mode !== 1) safe(change(confirmRow, { mode: 1 }, `${confirmRow.name}: ${modeInfo(1).label}. ${modeInfo(1).guarantee}`, { mode: confirmRow.mode }));
              }}
            >
              Usar Rascunhar
            </button>
            <button
              autoFocus
              className="au-primary au-danger"
              onClick={() => {
                setConfirmAuto(null);
                safe(change(confirmRow, { mode: 2, confirm: true }, `${confirmRow.name}: Autônomo. ${modeInfo(2).guarantee}`, { mode: confirmRow.mode }));
              }}
            >
              Sim, responder sozinho
            </button>
          </div>
        </Modal>
      )}
      {defaultDialog && def && <DefaultWindowDialog current={def} using={usingDefault} onSave={saveDefault} onClose={() => setDefaultDialog(false)} />}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="au-card" role="status" aria-busy="true" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
      <span style={{ fontSize: 13, color: "var(--fg2)" }}>Buscando os grupos e conversas do Hermes…</span>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="au-ch-skel" style={{ width: 36, height: 36, borderRadius: "50%", flex: "none" }} />
          <span style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
            <span className="au-ch-skel" style={{ width: "34%" }} />
            <span className="au-ch-skel" style={{ width: "58%", height: 10 }} />
          </span>
          <span className="au-ch-skel" style={{ width: 96, height: 26, borderRadius: 999 }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onGateways }: { onGateways: () => void }) {
  return (
    <div className="au-card" onMouseMove={spot} style={{ padding: 48, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
      <Icon name="messages-square" size={30} color="var(--fg3)" />
      <span style={{ fontSize: 15, fontWeight: 600 }}>Nenhum grupo ainda</span>
      <span style={{ fontSize: 13, lineHeight: 1.55, color: "var(--fg2)", maxWidth: 440 }}>Conecte o número de suporte em Gateways. Cada grupo e conversa aparece aqui na primeira mensagem que chegar.</span>
      <button className="au-primary" onClick={onGateways}>
        Conectar em Gateways
      </button>
    </div>
  );
}

function ErrorState({ onRetry, onGateways }: { onRetry: () => void; onGateways: () => void }) {
  return (
    <div className="au-card" role="alert" onMouseMove={spot} style={{ padding: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", borderColor: "var(--err)" }}>
      <Icon name="triangle-alert" size={28} color="var(--err)" />
      <span style={{ fontSize: 15, fontWeight: 600 }}>Não consegui buscar os canais</span>
      <span style={{ fontSize: 13, lineHeight: 1.55, color: "var(--fg2)", maxWidth: 480 }}>O gateway (o programa que conversa com o WhatsApp e o Telegram) pode estar parado. Os modos que você já escolheu continuam valendo.</span>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="au-primary" onClick={onRetry}>
          Tentar de novo
        </button>
        <button className="au-outline" onClick={onGateways}>
          Abrir Gateways
        </button>
      </div>
    </div>
  );
}
