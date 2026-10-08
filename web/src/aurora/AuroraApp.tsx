import { useEffect, useRef, type MouseEvent } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router";
import { AskDialog, Background, PauseBanner, Toast } from "./Chrome";
import { agent } from "./agent";
import { ONBOARDED_KEY, Onboarding } from "./Onboarding";
import { Activity } from "./screens/Activity";
import { Agents } from "./screens/Agents";
import { Channels } from "./screens/Channels";
import { Cron } from "./screens/Cron";
import { Gateways } from "./screens/Gateways";
import { Logs } from "./screens/Logs";
import { Memory } from "./screens/Memory";
import { Sessions } from "./screens/Sessions";
import { Settings } from "./screens/Settings";
import { Skills } from "./screens/Skills";
import { Approvals } from "./screens/Approvals";
import { Chat } from "./screens/Chat";
import { Home } from "./screens/Home";
import { Inbox } from "./screens/Inbox";
import { People } from "./screens/People";
import { Playbooks } from "./screens/Playbooks";
import { Radar } from "./screens/Radar";
import { Support } from "./screens/Support";
import { AGENT, OPS, Sidebar } from "./Sidebar";
import { loadOps, loadSessions, refreshPaused, setState, toast, useStore } from "./store";

// Spotlight que segue o cursor: escreve direto no style, sem re-render.
const onMove = (e: MouseEvent<HTMLDivElement>) => {
  e.currentTarget.style.setProperty("--cx", e.clientX + "px");
  e.currentTarget.style.setProperty("--cy", e.clientY + "px");
};

// Remonta a cada navegação: "Nova conversa" (ou ⌘K) já em /chat começa do zero.
/** Cada navegação abre uma Conversa nova (ex.: "Nova conversa" estando em /chat) — exceto quando a própria
 *  Conversa troca a URL para /chat/<id> ao criar a sessão: remontar ali apagaria a resposta em andamento. */
function ChatRoute() {
  const loc = useLocation();
  const keep = useRef(loc.key);
  if (!(loc.state as { created?: boolean } | null)?.created) keep.current = loc.key;
  return <Chat key={keep.current} />;
}

function NotFound() {
  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page">
        <span className="au-label">404</span>
        <h1 className="au-h1">Página não encontrada</h1>
        <p style={{ margin: 0, color: "var(--fg2)", fontSize: 14.5, lineHeight: 1.55 }}>
          Esse endereço não existe. Use o menu ao lado para voltar.
        </p>
      </div>
    </div>
  );
}

export function AuroraApp() {
  const dir = useStore((s) => s.dir);
  const theme = useStore((s) => s.theme);
  const navigate = useNavigate();

  // Título da aba: "Hermes · <tela>".
  const { pathname } = useLocation();
  useEffect(() => {
    const item = [...OPS, ...AGENT].find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));
    document.title = item ? `Hermes · ${item.label}` : pathname.startsWith("/support") ? "Hermes · Suporte" : "Hermes";
  }, [pathname]);

  useEffect(() => {
    document.documentElement.dataset.hv = dir;
    document.documentElement.dataset.ht = theme;
  }, [dir, theme]);

  // Carrega uma vez só: recarregar a cada navegação descartaria o que mudou na sessão (pausa, rascunhos…).
  useEffect(() => {
    loadOps().catch(() => toast("Não consegui carregar os dados do agente"));
    // Primeira vez sem modelo configurado: abre o assistente sozinho (uma vez; reabre por Configurações).
    agent.settings().then(
      (st) => {
        let seen = false;
        try {
          seen = localStorage.getItem(ONBOARDED_KEY) === "1";
        } catch {
          /* sem storage: decide só pelo modelo */
        }
        if (!seen && !(st.model && st.providers.some((p) => p.id === st.provider))) setState({ onboarding: 0 });
      },
      () => {},
    );
    loadSessions().catch(() => toast("Não consegui carregar as sessões"));
    const poll = setInterval(() => refreshPaused().catch(() => {}), 15000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        navigate("/chat");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="au-root" onMouseMove={onMove}>
      <Background />
      <div className="au-grid">
        <Sidebar />
        <div style={{ display: "flex", minWidth: 0, minHeight: 0 }}>
          <main className="au-main">
            <PauseBanner />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/approvals" element={<Approvals />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/radar" element={<Radar />} />
              <Route path="/channels" element={<Channels />} />
              <Route path="/support" element={<Support />} />
              <Route path="/people" element={<People />} />
              <Route path="/playbooks" element={<Playbooks />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/memory" element={<Memory />} />
              <Route path="/skills" element={<Skills />} />
              <Route path="/cron" element={<Cron />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/gateways" element={<Gateways />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/chat/:sid?" element={<ChatRoute />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </div>
      <Onboarding />
      <Toast />
      <AskDialog />
    </div>
  );
}
