import { NavLink, useNavigate } from "react-router";
import { Icon } from "./Icon";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { inBiz, setPrefs, setState, useStore, type State } from "./store";

type NavItem = { to: string; label: string; icon: string; count?: string; sub?: boolean };

export const OPS: NavItem[] = [
  { to: "/", label: "Painel", icon: "layout-dashboard" },
  { to: "/inbox", label: "Caixa de entrada", icon: "inbox" },
  { to: "/analises", label: "Análises dos grupos", icon: "scan-search", sub: true },
  { to: "/approvals", label: "Aprovações", icon: "shield-check" },
  { to: "/radar", label: "Radar de grupos", icon: "radar" },
  { to: "/channels", label: "Canais", icon: "messages-square" },
  { to: "/people", label: "Pessoas", icon: "users" },
  { to: "/playbooks", label: "Playbooks", icon: "workflow" },
  { to: "/activity", label: "Atividade", icon: "activity" },
];

export const AGENT: NavItem[] = [
  { to: "/chat", label: "Conversa", icon: "message-square" },
  { to: "/sessions", label: "Sessões", icon: "history" },
  { to: "/memory", label: "Memória", icon: "brain" },
  { to: "/skills", label: "Skills", icon: "sparkles" },
  { to: "/cron", label: "Agendamentos", icon: "calendar-clock" },
  { to: "/agents", label: "Subagentes", icon: "git-fork" },
  { to: "/gateways", label: "Gateways", icon: "radio-tower" },
  { to: "/logs", label: "Logs", icon: "scroll-text" },
  { to: "/settings", label: "Configurações", icon: "settings-2" },
  { to: "/settings/avisos", label: "Avisos", icon: "bell-ring", sub: true },
  { to: "/settings/perfis", label: "Perfis", icon: "layers", sub: true },
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
  if (businesses.length === 0) return null;
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
    <NavLink to={item.to} end={item.to === "/"} className={({ isActive }) => "au-nav" + (isActive ? " active" : "")} style={{ animationDelay: index * 30 + "ms", ...(item.sub ? { paddingLeft: 30 } : {}) }}>
      <Icon name={item.icon} />
      <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>
      <span className={"au-count" + (hot && count ? " hot" : "")}>{count}</span>
    </NavLink>
  );
}

const GROUPS = ["Hoje", "Ontem", "Esta semana", "Mais antigas"] as const;

export function Sidebar() {
  const navigate = useNavigate();
  const s = useStore((x) => x);
  const counts = opsCounts(s);
  return (
    <aside className="au-side">
      <ProfileSwitcher />

      <div style={{ padding: "0 12px 12px" }}>
        <button className="au-new" onClick={() => navigate("/chat")}>
          <Icon name="plus" size={15} color="var(--acc)" />
          Nova conversa
          <span className="au-kbd">{/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}</span>
        </button>
      </div>

      <BusinessSwitcher />

      {/* Tela alta: menu fixo e só as conversas rolam. Tela baixa (CSS .au-side-body): tudo rola junto. */}
      <div className="au-side-body">
      <nav aria-label="Navegação" className="au-side-nav" style={{ display: "flex", flexDirection: "column", gap: 1, padding: "0 8px 8px" }}>
          <div className="au-label" style={{ padding: "12px 11px 6px" }}>Operação</div>
          {OPS.map((n, i) => (
            <NavRow key={n.to} item={n} index={i} hot count={counts[n.to] ? String(counts[n.to]) : ""} />
          ))}
          <div className="au-label" style={{ padding: "12px 11px 6px" }}>Agente</div>
          {AGENT.map((n, i) => (
            <NavRow key={n.to} item={n} index={i + 8} hot={false} count="" />
          ))}
      </nav>

      <div className="au-side-list" style={{ borderTop: "1px solid var(--line)" }}>
        <div style={{ padding: "0 8px 16px" }}>
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
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderTop: "1px solid var(--line)" }}>
        <Icon name="key-round" size={15} color="var(--fg3)" />
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>Chaves deste perfil</span>
          <span title={s.keys.join(" · ")} style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.keys.length ? s.keys.join(" · ") : "Nenhuma chave ainda"}</span>
        </div>
        <button className="au-theme" title="Alternar tema" aria-label="Alternar tema" onClick={() => setPrefs({ theme: s.theme === "dark" ? "light" : "dark" })}>
          <Icon name={s.theme === "dark" ? "sun" : "moon"} size={14} />
        </button>
      </div>
    </aside>
  );
}
