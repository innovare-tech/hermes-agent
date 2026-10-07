import { NavLink, useNavigate } from "react-router";
import { Icon } from "./Icon";
import { served } from "./served";
import { inBiz, setPrefs, setState, useStore, type State } from "./store";

type NavItem = { to: string; label: string; icon: string; count?: string };

export const OPS: NavItem[] = [
  { to: "/", label: "Painel", icon: "layout-dashboard" },
  { to: "/inbox", label: "Caixa de entrada", icon: "inbox" },
  { to: "/approvals", label: "Aprovações", icon: "shield-check" },
  { to: "/radar", label: "Radar de grupos", icon: "radar" },
  { to: "/support", label: "Suporte", icon: "life-buoy" },
  { to: "/people", label: "Pessoas", icon: "users" },
  { to: "/playbooks", label: "Playbooks", icon: "workflow" },
  { to: "/activity", label: "Atividade", icon: "activity" },
];

// ponytail: contadores do agente são do protótipo; no modo real ficam ocultos até virem das APIs.
export const AGENT: NavItem[] = [
  { to: "/chat", label: "Conversa", icon: "message-square" },
  { to: "/sessions", label: "Sessões", icon: "history", count: "248" },
  { to: "/memory", label: "Memória", icon: "brain", count: "128" },
  { to: "/skills", label: "Skills", icon: "sparkles", count: "9" },
  { to: "/cron", label: "Agendamentos", icon: "calendar-clock", count: "5" },
  { to: "/agents", label: "Subagentes", icon: "git-fork", count: "3" },
  { to: "/gateways", label: "Gateways", icon: "radio-tower", count: "4" },
  { to: "/logs", label: "Logs", icon: "scroll-text" },
  { to: "/settings", label: "Configurações", icon: "settings-2" },
];

/** Contadores destacados da seção Operação, já filtrados pelo negócio. */
export function opsCounts(s: State): Record<string, number> {
  const f = inBiz(s);
  return {
    "/inbox": s.inbox.filter((x) => f(x) && (x.priority === "urgente" || x.priority === "voce")).length,
    "/approvals": s.approvals.filter(f).length,
    "/radar": s.radar.filter((x) => f(x) && x.alert).length,
    "/support": s.tickets.filter((x) => f(x) && x.status !== "resolvido").length,
  };
}

export function BusinessSwitcher() {
  const biz = useStore((s) => s.biz);
  const businesses = useStore((s) => s.businesses);
  const chips = [{ id: "all", name: "Todos", color: "var(--fg3)" }, ...businesses];
  return (
    <div role="radiogroup" aria-label="Negócio" style={{ display: "flex", gap: 3, margin: "0 12px 10px", padding: 3, borderRadius: 999, background: "var(--panel2)" }}>
      {chips.map((b) => (
        <button key={b.id} role="radio" aria-checked={biz === b.id} title={b.name} className="au-biz" onClick={() => setState({ biz: b.id })}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: b.color }} />
          {b.name}
        </button>
      ))}
    </div>
  );
}

function NavRow({ item, index, count, hot }: { item: NavItem; index: number; count: string; hot: boolean }) {
  return (
    <NavLink to={item.to} end={item.to === "/"} className={({ isActive }) => "au-nav" + (isActive ? " active" : "")} style={{ animationDelay: index * 30 + "ms" }}>
      <Icon name={item.icon} />
      <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>
      <span className={"au-count" + (hot && count ? " hot" : "")}>{count}</span>
    </NavLink>
  );
}

const GROUPS = ["Hoje", "Ontem", "Esta semana"] as const;

export function Sidebar() {
  const navigate = useNavigate();
  const s = useStore((x) => x);
  const counts = opsCounts(s);
  return (
    <aside className="au-side">
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "18px 18px 16px" }}>
        <div className="au-logo" aria-hidden="true">☤</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="au-display" style={{ fontSize: 19, lineHeight: 1 }}>Hermes</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>{s.account ? `${s.account.home} · ${s.account.version}` : " "}</span>
        </div>
        <span
          role="status"
          title={s.paused ? "Agente pausado" : "Agente rodando"}
          aria-label={s.paused ? "Agente pausado" : "Agente rodando"}
          style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: "50%", background: s.paused ? "var(--err)" : "var(--ok)", boxShadow: "0 0 0 4px var(--accSoft)", animation: "hpulse 2.4s ease-in-out infinite" }}
        />
      </div>

      <div style={{ padding: "0 12px 12px" }}>
        <button className="au-new" onClick={() => navigate("/chat")}>
          <Icon name="plus" size={15} color="var(--acc)" />
          Nova conversa
          <span className="au-kbd">⌘K</span>
        </button>
      </div>

      <BusinessSwitcher />

      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <nav aria-label="Navegação" style={{ display: "flex", flexDirection: "column", gap: 1, padding: "0 8px 8px" }}>
          <div className="au-label" style={{ padding: "12px 11px 6px" }}>Operação</div>
          {OPS.map((n, i) => (
            <NavRow key={n.to} item={n} index={i} hot count={counts[n.to] ? String(counts[n.to]) : ""} />
          ))}
          <div className="au-label" style={{ padding: "12px 11px 6px" }}>Agente</div>
          {AGENT.map((n, i) => (
            <NavRow key={n.to} item={n} index={i + 8} hot={false} count={served ? "" : (n.count ?? "")} />
          ))}
        </nav>

        <div style={{ padding: "0 8px 80px", borderTop: "1px solid var(--line)" }}>
          {GROUPS.filter((g) => s.sessions.some((x) => x.group === g)).map((g) => (
            <div key={g}>
              <div className="au-label" style={{ padding: "14px 11px 6px" }}>{g}</div>
              {s.sessions
                .filter((x) => x.group === g)
                .map((x, i) => (
                  <NavLink key={x.id} to={`/chat/${x.id}`} className="au-sess" style={({ isActive }) => ({ animationDelay: 300 + i * 50 + "ms", background: isActive ? "var(--panel)" : undefined })}>
                    {({ isActive }) => (
                      <>
                        <span style={{ fontSize: 13, color: isActive ? "var(--fg)" : "var(--fg2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>{x.title}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>
                          <Icon name={x.icon} size={11} />
                          {x.source} · {x.when}
                        </span>
                      </>
                    )}
                  </NavLink>
                ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderTop: "1px solid var(--line)" }}>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--panel2)", display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 600, color: "var(--fg2)" }}>EU</div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 1 }}>
          <span style={{ fontSize: 12.5, fontWeight: 500 }}>{s.account?.plan}</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>{s.account?.credits}</span>
        </div>
        <button className="au-theme" title="Alternar tema" aria-label="Alternar tema" onClick={() => setPrefs({ theme: s.theme === "dark" ? "light" : "dark" })}>
          <Icon name={s.theme === "dark" ? "sun" : "moon"} size={14} />
        </button>
      </div>
    </aside>
  );
}
