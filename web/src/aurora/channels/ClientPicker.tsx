import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { plural } from "../chat/sources";
import { channelsApi, type ChannelRow, type ClientHit, type ClientPage } from "./model";
import { Modal } from "./parts";

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Tente de novo.");

/** "Escolher outro": busca no diretório (nome ou systemClientId, sem acento), com a sugestão em destaque. */
export function ClientPicker({ row, onPick, onNotClient, onClose }: { row: ChannelRow; onPick: (c: { systemClientId: string; name: string }) => void; onNotClient: () => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState<ClientPage | null>(null);
  const [items, setItems] = useState<ClientHit[]>([]);
  const [err, setErr] = useState("");
  const [more, setMore] = useState(false);
  const [sugHit, setSugHit] = useState<ClientHit | null>(null);
  const seq = useRef(0);

  const load = useCallback(async (query: string, cursor?: string | null) => {
    const me = ++seq.current;
    setErr("");
    setMore(!!cursor);
    try {
      const p = await channelsApi.clients(query, cursor);
      if (me !== seq.current) return; // resposta de uma busca antiga
      setPage(p);
      setItems((prev) => (cursor ? [...prev, ...p.items] : p.items));
    } catch (e) {
      if (me === seq.current) setErr(errMsg(e));
    }
    if (me === seq.current) setMore(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  const sug = row.suggestion;
  // A sugestão sobe para o topo mesmo quando não está na primeira página do diretório.
  useEffect(() => {
    if (!sug) return;
    let alive = true;
    channelsApi.clients(sug.clientId).then((p) => alive && setSugHit(p.items.find((c) => c.systemClientId === sug.clientId) ?? null), () => {});
    return () => {
      alive = false;
    };
  }, [sug]);
  const shown = !q.trim() && sug && sugHit ? [sugHit, ...items.filter((c) => c.systemClientId !== sug.clientId)] : items;
  const loading = !page && !err;
  const emptyDirectory = !!page && page.total === 0 && !q.trim();

  return (
    <Modal title={`De qual cliente é “${row.name}”?`} onClose={onClose} width={540}>
      <label className="au-ch-input">
        <Icon name="search" size={14} color="var(--fg3)" />
        <input autoFocus aria-label="Buscar cliente" placeholder="Buscar por nome ou systemClientId" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div role="listbox" aria-label="Clientes" style={{ display: "flex", flexDirection: "column", gap: 2, minHeight: 120, maxHeight: 340, overflow: "auto" }}>
        {loading && [0, 1, 2, 3].map((i) => <div key={i} className="au-ch-skel" style={{ height: 40, margin: "3px 0" }} />)}
        {err && (
          <div role="alert" style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start", padding: 12, fontSize: 13, lineHeight: 1.5, color: "var(--fg2)" }}>
            <span>Não consegui buscar os clientes. {err}</span>
            <button className="au-outline" onClick={() => load(q.trim())}>
              Tentar de novo
            </button>
          </div>
        )}
        {emptyDirectory && <p style={{ margin: 0, padding: 12, fontSize: 13, lineHeight: 1.55, color: "var(--fg2)" }}>O diretório de clientes está vazio. Ele é preenchido pela sincronização com o sistema da empresa, que ainda não rodou neste perfil.</p>}
        {page && !emptyDirectory && shown.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start", padding: 12, fontSize: 13, color: "var(--fg2)" }}>
            <span>Nenhum cliente com “{q.trim()}”.</span>
            <button className="au-outline" onClick={() => setQ("")}>
              Limpar busca
            </button>
          </div>
        )}
        {shown.map((c) => {
          const isSug = !q.trim() && sug?.clientId === c.systemClientId;
          return (
            <button key={c.systemClientId} role="option" aria-selected={row.clientId === c.systemClientId} className="au-ch-pick" onClick={() => onPick(c)}>
              <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 500 }}>
                  <span className="au-ch-clip">{c.name}</span>
                  {isSug && (
                    <span className="au-ch-tag" style={{ color: "var(--ok)" }}>
                      sugerido · {Math.round(sug!.confidence * 100)}%
                    </span>
                  )}
                </span>
                <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>
                  {c.systemClientId}
                  {c.plan && ` · plano ${c.plan}`}
                </span>
              </span>
              <span style={{ fontSize: 11.5, color: "var(--fg3)", whiteSpace: "nowrap" }}>{c.channelCount ? `já tem ${plural(c.channelCount, "canal", "canais")}` : "sem canais"}</span>
            </button>
          );
        })}
        {page?.nextCursor && (
          <button className="au-outline" style={{ alignSelf: "center", margin: "8px 0" }} disabled={more} onClick={() => load(q.trim(), page.nextCursor)}>
            {more ? "Buscando…" : `Mostrar mais (${page.total - items.length})`}
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <button className="au-outline" onClick={onNotClient}>
          Não é cliente
        </button>
        <button className="au-outline" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
