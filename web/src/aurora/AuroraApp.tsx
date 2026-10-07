import { useEffect, type MouseEvent } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router";
import { Background, PauseBanner, Toast } from "./Chrome";
import { Home } from "./screens/Home";
import { AGENT, OPS, Sidebar } from "./Sidebar";
import { loadOps, toast, useStore } from "./store";

// Spotlight que segue o cursor: escreve direto no style, sem re-render.
const onMove = (e: MouseEvent<HTMLDivElement>) => {
  e.currentTarget.style.setProperty("--cx", e.clientX + "px");
  e.currentTarget.style.setProperty("--cy", e.clientY + "px");
};

function Placeholder() {
  const { pathname } = useLocation();
  const item = [...OPS, ...AGENT].find((n) => n.to !== "/" && pathname.startsWith(n.to));
  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page">
        <span className="au-label">Em construção</span>
        <h1 className="au-h1">{item?.label ?? "Página não encontrada"}</h1>
        <p style={{ margin: 0, color: "var(--fg2)", fontSize: 14.5, lineHeight: 1.55 }}>
          Esta tela chega numa próxima fase. Enquanto isso, ela está na <a href="?ui=legacy">interface antiga</a>.
        </p>
      </div>
    </div>
  );
}

export function AuroraApp() {
  const dir = useStore((s) => s.dir);
  const theme = useStore((s) => s.theme);
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.dataset.hv = dir;
    document.documentElement.dataset.ht = theme;
  }, [dir, theme]);

  useEffect(() => {
    loadOps().catch(() => toast("Não consegui carregar os dados do agente"));
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
              <Route path="*" element={<Placeholder />} />
            </Routes>
          </main>
        </div>
      </div>
      <Toast />
    </div>
  );
}
