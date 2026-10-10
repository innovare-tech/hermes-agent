import type { ReactNode } from "react";
import type { AutonomyMode } from "../adapter";
import { Icon } from "../Icon";
import { plural } from "../chat/sources";
import { whenLabel } from "../live";
import { channelSubtitle, ChannelAvatar } from "./Row";
import { channelActions, notListened, windowAppliesNote, type ChannelRow } from "./model";
import { ModeSegment, SuggestionBar, useEscape } from "./parts";
import { Participants } from "./Participants";
import { ChannelWindow } from "./Window";

type Pair = { silenceMin: number; maxMin: number };
export type DrawerActions = {
  onMode: (m: AutonomyMode) => void;
  onConfirmSuggestion: () => void;
  onChoose: () => void;
  onNotClient: () => void;
  onUnlink: () => void;
  onSaveWindow: (patch: { useDefault: true } | Pair) => Promise<void>;
  onListen: (on: boolean) => void;
};

function Sec({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="au-ch-sec">
      <span className="au-label">{title}</span>
      {children}
    </section>
  );
}

const when = (ts: number) => {
  const d = whenLabel(ts);
  return /^\d/.test(d) ? `hoje às ${d}` : d;
};

/** Gaveta de detalhes (460 px, à direita): problema, modo, cliente, janela de análise e atividade. */
export function ChannelDrawer({ row, def, busy, canListen, actions, onTeamChanged, onClose }: { row: ChannelRow; def: Pair | null; busy: boolean; canListen: boolean; actions: DrawerActions; onTeamChanged: () => void; onClose: () => void }) {
  useEscape(onClose);
  const note = windowAppliesNote(row.mode);
  const isTeam = row.section === "team";
  const act = channelActions(row, canListen);
  const off = notListened(row);
  return (
    <>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 59 }} onMouseDown={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={`Detalhes de ${row.name}`} className="au-ch-drawer">
        <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", borderBottom: "1px solid var(--line)" }}>
          <ChannelAvatar row={row} size={40} />
          <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
            <span className="au-ch-clip" style={{ fontSize: 16, fontWeight: 600 }} title={row.name}>
              {row.name}
            </span>
            <span className="au-ch-clip" style={{ fontSize: 12, color: "var(--fg3)" }}>
              {channelSubtitle(row)}
            </span>
          </span>
          <button autoFocus className="au-iconbtn" aria-label="Fechar detalhes" onClick={onClose}>
            <Icon name="x" size={15} />
          </button>
        </header>

        <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          {row.problem && (
            <Sec title="Problema">
              <p role="alert" style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, lineHeight: 1.5, color: "var(--err)" }}>
                <Icon name="triangle-alert" size={15} />
                {row.problem.message}
              </p>
            </Sec>
          )}

          {act.listen && (
            <Sec title="Escuta do grupo">
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--fg2)" }}>
                {off ? "Não escutado: o Hermes não recebe as mensagens deste grupo." : "O Hermes recebe e lê as mensagens deste grupo."}
                {row.discovered && " Este grupo ainda não falou com o Hermes; ao escutar, ele passa a aparecer como canal em Escutar."}
              </p>
              <div>
                {off ? (
                  <button className="au-primary" disabled={busy} onClick={() => actions.onListen(true)}>
                    Escutar este grupo
                  </button>
                ) : (
                  <button className="au-outline danger" disabled={busy} onClick={() => actions.onListen(false)}>
                    Parar de escutar
                  </button>
                )}
              </div>
            </Sec>
          )}

          {act.mode && (
          <Sec title="Modo">
            <ModeSegment row={row} onPick={actions.onMode} />
          </Sec>
          )}

          {act.link || isTeam ? (
          <Sec title="Cliente vinculado">
            {isTeam ? (
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--fg2)" }}>{row.receivesAlerts ? "Este canal recebe os avisos do Escutar. Canal da equipe: não tem cliente." : "Canal da equipe: não tem cliente."}</p>
            ) : row.clientId ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{row.clientName}</span>
                  <span style={{ fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg3)" }}>{row.clientId}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="au-outline" disabled={busy} onClick={actions.onChoose}>
                    Trocar
                  </button>
                  <button className="au-outline danger" disabled={busy} onClick={actions.onUnlink}>
                    Desvincular
                  </button>
                </div>
              </>
            ) : row.notClient ? (
              <>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--fg2)" }}>Marcado como “não é cliente”: o Hermes não procura cliente para este canal.</p>
                <div>
                  <button className="au-outline" disabled={busy} onClick={actions.onChoose}>
                    Vincular a um cliente
                  </button>
                </div>
              </>
            ) : (
              <SuggestionBar row={row} busy={busy} onConfirm={actions.onConfirmSuggestion} onChoose={actions.onChoose} onNotClient={actions.onNotClient} />
            )}
            {!isTeam && <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: "var(--fg3)" }}>systemClientId é o código do cliente no sistema da empresa.</p>}
          </Sec>
          ) : null}

          {act.window && row.window && (
          <Sec title="Janela de análise">
            {note ? <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--fg2)" }}>{note}</p> : <ChannelWindow key={`${row.id}:${row.window.useDefault}:${row.window.silenceMin}:${row.window.maxMin}`} window={row.window} def={def} onSave={actions.onSaveWindow} />}
            {row.mode === 1 && <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: "var(--fg3)" }}>Hoje só o Escutar analisa em lote; no Rascunhar a janela fica guardada para quando isso for ligado.</p>}
          </Sec>
          )}

          {act.participants && (
            <Sec title="Participantes">
              <Participants key={row.id} channelId={row.id} onTeamChanged={onTeamChanged} />
            </Sec>
          )}

          {!row.discovered && (
          <Sec title="Atividade">
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: "8px 16px", fontSize: 13 }}>
              <dt style={{ color: "var(--fg3)" }}>Última mensagem</dt>
              <dd style={{ margin: 0, minWidth: 0 }}>
                {row.last ? (
                  <>
                    <span style={{ fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg3)" }}>{when(row.last.at)}</span>
                    {row.last.from && <> · {row.last.from}</>}
                    <div style={{ marginTop: 3, color: "var(--fg2)", lineHeight: 1.45, overflowWrap: "anywhere" }}>{row.last.text}</div>
                  </>
                ) : (
                  <span style={{ color: "var(--fg3)" }}>Nenhuma mensagem ainda.</span>
                )}
              </dd>
              <dt style={{ color: "var(--fg3)" }}>Último aviso à equipe</dt>
              <dd style={{ margin: 0 }}>{row.lastAlert ? `${when(row.lastAlert.at)} · análise A-${row.lastAlert.analysisId}` : <span style={{ color: "var(--fg3)" }}>Nenhum aviso ainda.</span>}</dd>
              <dt style={{ color: "var(--fg3)" }}>Hoje</dt>
              <dd style={{ margin: 0 }}>{plural(row.todayCount, "mensagem", "mensagens")}</dd>
            </dl>
          </Sec>
          )}
        </div>
      </aside>
    </>
  );
}
