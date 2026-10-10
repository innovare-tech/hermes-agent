import type { AutonomyMode } from "../adapter";
import { Icon } from "../Icon";
import { whenLabel } from "../live";
import { channelActions, needsLink, notListened, participantsLabel, platformLabel, type ChannelRow } from "./model";
import { ModeChip, ModeMenu, SuggestionBar } from "./parts";

const KIND_ICON = { group: "users", team: "send", direct: "user-round" } as const;
const KIND_LABEL = { group: "Grupo", team: "Equipe", direct: "Conversa direta" } as const;
const PLATFORM_ICON: Record<string, string> = { whatsapp: "phone", telegram: "send" };

export function channelSubtitle(c: ChannelRow): string {
  return [KIND_LABEL[c.section], platformLabel(c.platform), participantsLabel(c)].filter(Boolean).join(" · ");
}

/** Avatar do tipo de canal com o selo da plataforma no canto. */
export function ChannelAvatar({ row, size = 36 }: { row: ChannelRow; size?: number }) {
  return (
    <span className="au-avatar" style={{ position: "relative", width: size, height: size, flex: "none" }} aria-hidden="true">
      <Icon name={KIND_ICON[row.section]} size={Math.round(size * 0.44)} />
      <span style={{ position: "absolute", right: -3, bottom: -3, width: 16, height: 16, borderRadius: "50%", background: "var(--panel2)", border: "1.5px solid var(--bg)", display: "grid", placeItems: "center", color: "var(--fg2)" }}>
        <Icon name={PLATFORM_ICON[row.platform] ?? "message-circle"} size={9} />
      </span>
    </span>
  );
}

type Handlers = {
  onOpen: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onMode: (m: AutonomyMode) => void;
  onConfirmSuggestion: () => void;
  onChoose: () => void;
  onNotClient: () => void;
  onListen: (on: boolean) => void;
};

export function ChannelRowView({ row, menuOpen, canListen, busy, h }: { row: ChannelRow; menuOpen: boolean; canListen: boolean; busy: boolean; h: Handlers }) {
  const unlinked = needsLink(row);
  const act = channelActions(row, canListen);
  const off = notListened(row);
  return (
    <div role="listitem" className={"au-ch-row" + (unlinked ? " unlinked" : "") + (off ? " off" : "")} onClick={h.onOpen}>
      <div className="au-ch-cols">
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <ChannelAvatar row={row} />
          <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <button
              className="au-ch-name"
              title={row.name}
              onClick={(e) => {
                e.stopPropagation();
                h.onOpen();
              }}
            >
              {row.name}
            </button>
            <span className="au-ch-clip" style={{ fontSize: 11.5, color: "var(--fg3)" }}>
              {off && <span className="au-ch-tag au-ch-off">Não escutado</span>}
              {channelSubtitle(row)}
            </span>
            {row.problem && (
              <span className="au-ch-clip" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--err)" }}>
                <Icon name="triangle-alert" size={12} />
                {row.problem.message}
              </span>
            )}
          </span>
        </div>

        <div style={{ minWidth: 0, fontSize: 12.5 }}>
          {row.last ? (
            <>
              <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>{whenLabel(row.last.at)}</span>
              {row.last.from && <span style={{ color: "var(--fg2)" }}> · {row.last.from}</span>}
              <div className="au-ch-clip" style={{ color: "var(--fg3)", marginTop: 2 }}>
                {row.last.text}
              </div>
            </>
          ) : (
            <span style={{ color: "var(--fg3)" }}>Sem mensagens ainda</span>
          )}
        </div>

        <span style={{ fontFamily: "var(--fm)", fontSize: 13, textAlign: "right", color: row.todayCount ? "var(--fg)" : "var(--fg3)" }} aria-label={`${row.todayCount} mensagens hoje`}>
          {row.todayCount}
        </span>

        <div style={{ minWidth: 0 }}>
          {row.discovered ? (
            <span style={{ fontSize: 12, color: "var(--fg3)" }}>Ainda não falou com o Hermes</span>
          ) : row.section === "team" ? (
            <span className="au-ch-tag" style={{ color: "var(--fg2)" }}>
              Equipe interna
            </span>
          ) : row.notClient ? (
            <span className="au-ch-tag" style={{ color: "var(--fg2)" }}>
              Não é cliente
            </span>
          ) : row.clientId ? (
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span className="au-ch-clip" style={{ fontSize: 13 }}>
                {row.clientName}
              </span>
              <span className="au-ch-clip" style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>
                {row.clientId}
              </span>
            </span>
          ) : (
            <span className="au-ch-tag" style={{ color: "var(--warn)" }}>
              Sem vínculo
            </span>
          )}
        </div>

        <div style={{ position: "relative", display: "flex", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            {act.mode && <ModeChip mode={row.mode} open={menuOpen} onClick={h.onToggleMenu} />}
            {act.listen && off && (
              <button
                className="au-outline"
                style={{ padding: "5px 10px", fontSize: 12 }}
                disabled={busy}
                aria-label={`Escutar o grupo ${row.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  h.onListen(true);
                }}
              >
                Escutar este grupo
              </button>
            )}
          </div>
          {act.mode && menuOpen && <ModeMenu row={row} onPick={h.onMode} onClose={h.onCloseMenu} />}
        </div>
      </div>
      {unlinked && act.link && <SuggestionBar row={row} onConfirm={h.onConfirmSuggestion} onChoose={h.onChoose} onNotClient={h.onNotClient} />}
    </div>
  );
}
