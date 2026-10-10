import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { agent } from "./agent";
import { chat } from "./chat";
import { useDismiss } from "./chat/useDismiss";
import { Icon } from "./Icon";
import { refreshHealthBadge, resetHealthBadge, useHealthBadge } from "./health/badge";
import { healthCount } from "./health/model";
import "./health/health.css";
import { refreshModelsHealth, useModelsProblem } from "./models/health";
import { isListenSession } from "./chat/sources";
import { keyDescription, keyName } from "./ops/ApiKeysEditor";
import { ProfileSwitcher } from "./ProfileSwitcher";
import type { Session } from "./adapter";
import { ask, inBiz, loadSessions, setPrefs, setState, toast, useStore, type State } from "./store";

type NavItem = { to: string; label: string; icon: string; count?: string; sub?: boolean; dot?: boolean };

export const OPS: NavItem[] = [
  { to: "/", label: "Painel", icon: "layout-dashboard" },
  { to: "/saude", label: "Saúde", icon: "heart-pulse" },
  { to: "/copiloto", label: "Clientes do Copiloto", icon: "users-round" },
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
  { to: "/settings/modelos", label: "Modelos", icon: "cpu", sub: true, dot: true },
  { to: "/settings/avisos", label: "Avisos", icon: "bell-ring", sub: true },
  { to: "/settings/perfis", label: "Perfis", icon: "layers", sub: true },
  { to: "/settings/permissoes", label: "Permissões", icon: "lock", sub: true },
];

/** Aprovações = rascunhos de resposta (filtrados pelo negócio) + pedidos de ação pendentes (sem negócio, valem sempre). */
export const approvalsCount = (s: Pick<State, "approvals" | "actionRequests" | "biz">) => s.approvals.filter(inBiz(s as State)).length + s.actionRequests.length;

/** Contadores destacados da seção Operação, já filtrados pelo negócio. */
export function opsCounts(s: State): Record<string, number> {
  const f = inBiz(s);
  return {
    "/inbox": s.inbox.filter((x) => f(x) && (x.priority === "urgente" || x.priority === "voce")).length,
    "/approvals": approvalsCount(s),
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
  const problem = useModelsProblem();
  const hb = healthCount(useHealthBadge());
  const isHealth = item.to === "/saude";
  if (isHealth) count = hb.text;
  return (
    <NavLink to={item.to} end={item.to === "/"} className={({ isActive }) => "au-nav" + (isActive ? " active" : "")} style={{ animationDelay: index * 30 + "ms", ...(item.sub ? { paddingLeft: 30 } : {}) }}>
      <Icon name={item.icon} />
      <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>
      <span className={"au-count" + (isHealth ? (hb.tone ? " " + hb.tone : "") : hot && count ? " hot" : "")} {...(isHealth && hb.text ? { role: "img", "aria-label": hb.tone === "hl-crit" ? `${hb.text} incidente(s) crítico(s) aberto(s)` : `${hb.text} incidente(s) em atenção` } : {})}>{count}</span>
      {item.dot && problem && <span role="img" aria-label="Algum provedor com problema" title="Algum provedor com problema" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--err)", flex: "none" }} />}
    </NavLink>
  );
}

/** Conversa na barra lateral, com menu (⋯ ou botão direito): Renomear e Apagar. */
function SessionItem({ x, i }: { x: Session; i: number }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  useDismiss(box, () => menu && setMenu(false));
  useEffect(() => {
    if (menu) box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [menu]);

  const close = () => {
    setMenu(false);
    more.current?.focus();
  };
  const rename = async (raw: string) => {
    setEditing(false);
    const t = raw.trim();
    if (!t || t === x.title) return;
    try {
      await agent.renameSession(x.id, t);
      await loadSessions();
      toast("Conversa renomeada");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui renomear");
    }
  };
  const remove = async () => {
    setMenu(false);
    if (!(await ask({ title: `Apagar “${x.title}”?`, body: "A conversa e o histórico dela somem para sempre. O que o Hermes guardou na memória continua.", confirm: "Apagar", danger: true }))) return;
    try {
      // A conversa aberta está viva no gateway, que recusa apagar sessão ativa: solta antes.
      if (pathname.endsWith("/chat/" + x.id)) {
        await chat.release(x.id);
        navigate("/chat");
      }
      await agent.deleteSession(x.id);
      await loadSessions();
      toast("Conversa apagada");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui apagar");
    }
  };

  return (
    <div className="au-sesswrap" ref={box} onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}>
      {editing ? (
        <input
          autoFocus
          aria-label={`Novo título de “${x.title}”`}
          className="au-inline"
          defaultValue={x.title}
          maxLength={120}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter") rename((e.target as HTMLInputElement).value);
          }}
          onBlur={(e) => rename(e.target.value)}
          style={{ width: "100%", margin: "4px 0", border: "1px solid var(--acc)" }}
        />
      ) : (
        <>
          <NavLink to={`/chat/${x.id}`} className="au-sess" style={({ isActive }) => ({ animationDelay: 300 + i * 50 + "ms", background: isActive ? "var(--panel)" : undefined, paddingRight: 34 })}>
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
          <button ref={more} className="au-mini au-sessmore" aria-label={`Opções de “${x.title}”`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <Icon name="ellipsis" size={14} />
          </button>
        </>
      )}
      {menu && (
        <div className="au-ctxmenu" role="menu" aria-label={`Opções de “${x.title}”`} onKeyDown={(e) => e.key === "Escape" && close()}>
          <button role="menuitem" className="au-mitem" onClick={() => { setMenu(false); setEditing(true); }}>
            <Icon name="pencil" size={13} />
            Renomear
          </button>
          <button role="menuitem" className="au-mitem danger" onClick={remove}>
            <Icon name="trash-2" size={13} />
            Apagar
          </button>
        </div>
      )}
    </div>
  );
}

const GROUPS = ["Hoje", "Ontem", "Esta semana", "Mais antigas"] as const;

export function Sidebar() {
  const navigate = useNavigate();
  const s = useStore((x) => x);
  const counts = opsCounts(s);
  const sessions = s.sessions.filter((x) => !isListenSession(x));
  const profileId = s.profileId;
  // Ponto vermelho em Modelos: lê o estado guardado dos provedores ao entrar e a cada troca de perfil.
  useEffect(() => {
    refreshModelsHealth();
  }, [profileId]);
  // Badge de Saúde: incidentes abertos do perfil, a cada 60 s com a aba à vista (a tela de Saúde atualiza mais rápido).
  useEffect(() => {
    resetHealthBadge();
    refreshHealthBadge();
    const iv = setInterval(() => document.visibilityState === "visible" && refreshHealthBadge(), 60000);
    return () => clearInterval(iv);
  }, [profileId]);
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
          {GROUPS.filter((g) => sessions.some((x) => x.group === g)).map((g) => (
            <div key={g}>
              <div className="au-label" style={{ padding: "14px 11px 6px" }}>{g}</div>
              {sessions
                .filter((x) => x.group === g)
                .map((x, i) => (
                  <SessionItem key={x.id} x={x} i={i} />
                ))}
            </div>
          ))}
        </div>
      </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderTop: "1px solid var(--line)" }}>
        <NavLink to="/settings" title="Abrir Configurações › Chaves de API" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1, color: "inherit", textDecoration: "none" }}>
          <Icon name="key-round" size={15} color="var(--fg3)" />
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Chaves deste perfil</span>
            <span title={s.keys.map((k) => `${keyName(k)} — ${keyDescription(k)}`).join("\n")} style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.keys.length ? s.keys.map(keyName).join(" · ") : "Nenhuma chave ainda"}</span>
          </div>
        </NavLink>
        <button className="au-theme" title="Alternar tema" aria-label="Alternar tema" onClick={() => setPrefs({ theme: s.theme === "dark" ? "light" : "dark" })}>
          <Icon name={s.theme === "dark" ? "sun" : "moon"} size={14} />
        </button>
      </div>
    </aside>
  );
}
