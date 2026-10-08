// A matriz de permissões: colunas por origem (cabeçalho fixo, barrinha de proporção, menu de ações em massa),
// linhas agrupadas (um grupo recolhível por conector MCP) e a célula com o popover das três opções.
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { useEscape, useOutside } from "../channels/parts";
import {
  allowBlocked,
  BULK,
  columnCounts,
  levelInfo,
  LEVELS,
  originMeta,
  rowHelp,
  WHATSAPP_WHY,
  type Action,
  type BulkMode,
  type Draft,
  type Group,
  type Level,
  type Permissions,
} from "./model";

type Props = {
  perms: Permissions;
  groups: Group[];
  saved: Draft;
  draft: Draft;
  onPick: (a: Action, origin: string, level: Level) => void;
  onBulk: (origin: string, mode: BulkMode) => void;
};

const cellId = (key: string, origin: string) => `pm-cell-${key}-${origin}`;

export function PermissionsMatrix({ perms, groups, saved, draft, onPick, onBulk }: Props) {
  const [cell, setCell] = useState<string | null>(null); // "chave|origem" com o popover aberto
  const [menu, setMenu] = useState<string | null>(null); // origem com o menu ⋯ aberto
  const [closed, setClosed] = useState<Record<string, boolean>>({}); // grupos MCP recolhidos (os 1º começa aberto)
  const firstMcp = groups.find((g) => g.mcp)?.id;
  const isOpen = (g: Group) => !g.mcp || (g.id in closed ? !closed[g.id] : g.id === firstMcp);
  const changedIn = (g: Group) => g.rows.reduce((n, a) => n + perms.origins.filter((o) => draft[a.key]?.[o] !== saved[a.key]?.[o]).length, 0);

  const closeCell = (back = true) => {
    const was = cell;
    setCell(null);
    if (back && was) {
      const [key, origin] = was.split("|");
      requestAnimationFrame(() => document.getElementById(cellId(key, origin))?.focus());
    }
  };

  return (
    <section className="au-card" role="table" aria-label="O que o Hermes pode fazer, por origem do pedido" style={{ position: "relative", zIndex: cell || menu ? 30 : undefined, ["--pm-n" as string]: perms.origins.length }}>
      <div role="row" className="pm-grid pm-head">
        <span role="columnheader" className="au-label" style={{ alignSelf: "end" }}>
          O que o Hermes faz
        </span>
        {perms.origins.map((o) => {
          const m = originMeta(o, perms.originLabels);
          const n = columnCounts(perms, draft, o);
          const total = n.allow + n.approve + n.deny;
          return (
            <div key={o} role="columnheader" className="pm-col">
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 24, height: 24, flex: "none", borderRadius: 7, background: m.color, color: "#fff", display: "grid", placeItems: "center" }}>
                  <Icon name={m.icon} size={12} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{m.label}</span>
                <button
                  className="pm-colbtn"
                  data-ch-chip
                  aria-haspopup="menu"
                  aria-expanded={menu === o}
                  aria-label={`Ações em massa da coluna ${m.label}`}
                  title="Ações da coluna"
                  onClick={() => {
                    setCell(null);
                    setMenu(menu === o ? null : o);
                  }}
                >
                  <Icon name="ellipsis" size={14} />
                </button>
              </div>
              <span style={{ fontSize: 11, color: "var(--fg2)" }}>{m.sub || perms.originLabels[o]}</span>
              <span className="pm-bar" role="img" aria-label={`${n.allow} permitidas, ${n.approve} pedem aprovação, ${n.deny} bloqueadas`}>
                {LEVELS.map((l) => n[l.id] > 0 && <span key={l.id} style={{ flex: n[l.id] / (total || 1), background: l.id === "deny" ? "var(--fg3)" : l.color }} />)}
              </span>
              {menu === o && (
                <ColumnMenu
                  label={m.label}
                  onClose={() => setMenu(null)}
                  onRun={(mode) => {
                    setMenu(null);
                    onBulk(o, mode);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {groups.map((g) => {
        const open = isOpen(g);
        const changed = changedIn(g);
        const hasCell = !!cell && g.rows.some((a) => cell.startsWith(a.key + "|"));
        const bodyId = "pm-g-" + g.id.replace(/\W/g, "-");
        const title = (
          <>
            <Icon name={g.icon} size={14} color="var(--fg3)" />
            <span className="pm-grouplabel">{g.label}</span>
            {g.mcp && (
              <span style={{ fontSize: 11, color: "var(--fg3)" }}>
                · conector MCP{g.server && g.server.discovered ? ` · ${g.rows.length} ${g.rows.length === 1 ? "ferramenta" : "ferramentas"}` : ""}
              </span>
            )}
            {g.mcp && !open && changed > 0 && <span style={{ fontSize: 11, color: "var(--acc)" }}>· {changed} {changed === 1 ? "alterada" : "alteradas"}</span>}
            {g.mcp && <Icon name={open ? "chevron-up" : "chevron-down"} size={14} color="var(--fg3)" className="au-ml-auto" />}
          </>
        );
        return (
          <div key={g.id} role="rowgroup" style={{ position: "relative", zIndex: hasCell ? 20 : undefined }}>
            {g.mcp ? (
              <button className="pm-group" aria-expanded={open} aria-controls={bodyId} onClick={() => setClosed((c) => ({ ...c, [g.id]: open }))}>
                {title}
              </button>
            ) : (
              <div className="pm-group" role="row">
                <span role="rowheader" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  {title}
                </span>
              </div>
            )}
            <div id={bodyId} hidden={!open}>
              {open && g.mcp && g.rows.length === 0 && (
                <div role="row" className="pm-row" style={{ paddingLeft: 39 }}>
                  <div role="rowheader" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>Ferramentas deste conector</span>
                    <span style={{ fontSize: 11.5, color: "var(--fg2)", lineHeight: 1.45, maxWidth: 560 }}>
                      {g.server?.discovered === false
                        ? "O Hermes ainda não se conectou a este conector, então não sabe quais ferramentas ele tem. Elas aparecem aqui depois da primeira conexão e entram como “Pede aprovação” se alterarem algo."
                        : "Nenhuma ferramenta liberada para este perfil."}
                    </span>
                  </div>
                </div>
              )}
              {open &&
                g.rows.map((a) => (
                  <div key={a.key} role="row" className="pm-grid pm-row" style={{ zIndex: cell?.startsWith(a.key + "|") ? 20 : undefined }}>
                    <div role="rowheader" style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, paddingLeft: 23 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 500, minWidth: 0 }}>
                        <span className="pm-clip" title={a.label}>
                          {a.label}
                        </span>
                        {a.writes && (
                          <span className="pm-badge" title="Muda alguma coisa">
                            altera
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: 11.5, color: "var(--fg2)", lineHeight: 1.4 }}>{rowHelp(a)}</span>
                    </div>
                    {perms.origins.map((o) => {
                      const v = draft[a.key][o];
                      const info = levelInfo(v);
                      const changedCell = v !== saved[a.key]?.[o];
                      const m = originMeta(o, perms.originLabels);
                      const id = `${a.key}|${o}`;
                      return (
                        <div key={o} role="cell" style={{ position: "relative" }}>
                          <button
                            id={cellId(a.key, o)}
                            className="pm-cell"
                            data-ch-chip
                            data-lv={v}
                            style={{ ["--lv" as string]: info.color }}
                            aria-haspopup="listbox"
                            aria-expanded={cell === id}
                            aria-label={`${a.label} vindo de ${m.label}: ${info.label}${changedCell ? ". Alterado, não salvo" : ""}`}
                            onClick={() => {
                              setMenu(null);
                              setCell(cell === id ? null : id);
                            }}
                          >
                            <Icon name={info.icon} size={14} />
                            <span style={{ flex: 1, textAlign: "left", whiteSpace: "nowrap" }}>{info.label}</span>
                            {changedCell && <span className="pm-dot" title="Alterado, não salvo" />}
                          </button>
                          {cell === id && (
                            <CellPopover
                              action={a}
                              origin={o}
                              originLabel={m.label}
                              value={v}
                              onClose={() => closeCell()}
                              onPick={(l) => {
                                onPick(a, o, l);
                                closeCell();
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
          </div>
        );
      })}

      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "12px 16px", borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--fg2)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Icon name="info" size={13} color="var(--fg3)" />
          Pedidos que chegam de grupos de clientes nunca alteram nada sem um humano: lá, “permitido” só existe para leitura.
        </span>
        {groups.some((g) => g.mcp) && (
          <span style={{ paddingLeft: 22 }}>Ferramenta nova de um conector que altera algo começa em “Pede aprovação” até alguém decidir. As que só leem começam em “Permitido”.</span>
        )}
      </div>
    </section>
  );
}

function ColumnMenu({ label, onRun, onClose }: { label: string; onRun: (m: BulkMode) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useOutside(ref, onClose);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);
  const move = (e: React.KeyboardEvent, step: number) => {
    e.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    items[(items.indexOf(document.activeElement as HTMLElement) + step + items.length) % items.length]?.focus();
  };
  return (
    <div ref={ref} role="menu" aria-label={`Aplicar a toda a coluna ${label}`} className="au-float pm-menu" onKeyDown={(e) => (e.key === "ArrowDown" ? move(e, 1) : e.key === "ArrowUp" ? move(e, -1) : undefined)}>
      <span style={{ padding: "6px 10px", fontSize: 11, color: "var(--fg3)" }}>Aplicar a toda a coluna {label}</span>
      {BULK.map((b) => (
        <button key={b.id} role="menuitem" className="pm-mitem" onClick={() => onRun(b.id)}>
          <Icon name={b.icon} size={14} color={b.color} />
          {b.label}
        </button>
      ))}
    </div>
  );
}

function CellPopover({ action, origin, originLabel, value, onPick, onClose }: { action: Action; origin: string; originLabel: string; value: Level; onPick: (l: Level) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useOutside(ref, () => onClose());
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, []);
  const move = (e: React.KeyboardEvent, step: number) => {
    e.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])') ?? [])];
    items[(items.indexOf(document.activeElement as HTMLElement) + step + items.length) % items.length]?.focus();
  };
  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={`${action.label} · pedido vindo de ${originLabel}`}
      className="au-float pm-pop"
      onKeyDown={(e) => (e.key === "ArrowDown" ? move(e, 1) : e.key === "ArrowUp" ? move(e, -1) : undefined)}
    >
      <span style={{ padding: "6px 10px 4px", fontSize: 11, color: "var(--fg3)" }}>
        {action.label} · pedido vindo de {originLabel}
      </span>
      {LEVELS.map((l) => {
        const blocked = l.id === "allow" && allowBlocked(action, origin);
        return (
          <button key={l.id} role="option" aria-selected={value === l.id} aria-disabled={blocked} className="pm-opt" onClick={() => !blocked && onPick(l.id)}>
            <span style={{ color: l.color, marginTop: 1 }}>
              <Icon name={l.icon} size={15} />
            </span>
            <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{l.label}</span>
              <span style={{ fontSize: 11.5, lineHeight: 1.4, color: blocked ? "var(--warn)" : "var(--fg2)" }}>{blocked ? WHATSAPP_WHY : l.line}</span>
            </span>
            {value === l.id && <Icon name="check" size={14} color="var(--acc)" />}
          </button>
        );
      })}
    </div>
  );
}
