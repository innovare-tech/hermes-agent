// Peças do perfil que ficam no shell: cabeçalho (migalha + barra de 2px na troca + pílula do perfil), faixa de problema
// do perfil atual, e os estados do Início (esqueleto na troca, perfil pausado, perfil novo sem canais).
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Icon } from "./Icon";
import { problemCopy, type Profile } from "./profileLogic";
import { restartCurrentGateway, setProfilePaused } from "./profiles";
import { AGENT, OPS } from "./Sidebar";
import { setState, useStore } from "./store";

export const useCurrentProfile = (): Profile | undefined => {
  const profiles = useStore((s) => s.profiles);
  const id = useStore((s) => s.profileId);
  return profiles.find((p) => p.id === id);
};

/** Migalha do topo: "Configurações  /  Perfis", "Caixa de entrada"… */
export function crumbFor(pathname: string) {
  if (pathname.startsWith("/settings/perfis")) return "Configurações  /  Perfis";
  if (pathname.startsWith("/settings/aparencia")) return "Configurações  /  Aparência";
  if (pathname.startsWith("/chat")) return "Conversa";
  if (pathname.startsWith("/support")) return "Suporte";
  const item = [...OPS, ...AGENT].find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));
  return item?.label ?? "";
}

export function ProfileHeader() {
  const { pathname } = useLocation();
  const cur = useCurrentProfile();
  const switching = useStore((s) => s.switching);
  return (
    <header className="au-phead">
      {switching && (
        <div className="au-pbar" role="progressbar" aria-label="Carregando o perfil">
          <div />
        </div>
      )}
      <span style={{ fontSize: 13, color: "var(--fg2)", whiteSpace: "pre" }}>{crumbFor(pathname)}</span>
      {cur && (
        <div className="au-pill-prof" title={`Você está no perfil ${cur.name}`}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--acc)", color: "var(--accFg)", display: "grid", placeItems: "center" }}>
            <Icon name={cur.icon} size={11} />
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>Perfil {cur.name}</span>
        </div>
      )}
    </header>
  );
}

/** Perfil atual com problema: o que houve, em uma linha, com o termo técnico explicado — e como resolver. */
export function ProblemBar() {
  const cur = useCurrentProfile();
  const navigate = useNavigate();
  const [fixing, setFixing] = useState(false);
  if (!cur || cur.status !== "err") return null;
  const { title, text } = problemCopy(cur);
  const fix = async () => {
    setFixing(true);
    await restartCurrentGateway();
    setFixing(false);
  };
  return (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 32px", background: "color-mix(in oklab,var(--err) 12%,transparent)", borderBottom: "1px solid color-mix(in oklab,var(--err) 30%,transparent)", animation: "hblurin .4s both" }}>
      <Icon name="triangle-alert" size={18} color="var(--err)" />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>{text}</span>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: 8, flex: "none" }}>
        <button className="au-outline" style={{ padding: "7px 12px", fontSize: 12.5, background: "var(--panel)" }} onClick={() => navigate("/logs")}>
          Ver registros
        </button>
        <button className="au-primary au-danger" style={{ padding: "7px 13px", fontSize: 12.5 }} disabled={fixing} onClick={fix}>
          <Icon name={fixing ? "loader-circle" : "rotate-cw"} size={13} className={fixing ? "au-spin" : undefined} />
          {fixing ? "Reiniciando…" : "Reiniciar gateway"}
        </button>
      </div>
    </div>
  );
}

/** Início enquanto os dados do perfil novo chegam: esqueleto de KPIs e do feed. */
export function HomeSkeleton() {
  const cur = useCurrentProfile();
  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page" aria-busy="true">
        {cur && (
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <span style={{ width: 56, height: 56, flex: "none", borderRadius: 16, background: "var(--acc)", color: "var(--accFg)", display: "grid", placeItems: "center", boxShadow: "0 0 0 6px var(--accSoft)", transition: "background .4s" }}>
              <Icon name={cur.icon} size={26} />
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
              <span className="au-label">perfil {cur.id}</span>
              <h1 className="au-display" style={{ margin: 0, fontSize: 38, lineHeight: 1.05 }}>{cur.name}</h1>
              <span style={{ fontSize: 14, color: "var(--fg2)" }}>{cur.desc}</span>
            </div>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className="au-skel" style={{ height: 96 }} />
          ))}
        </div>
        <div className="au-skel" style={{ height: 220 }} />
      </div>
    </div>
  );
}

/** Perfil pausado ou recém-criado, sem canais: o que dizer e qual o próximo passo. */
export function ProfileNotice() {
  const cur = useCurrentProfile();
  const switching = useStore((s) => s.switching);
  if (!cur || switching) return null;
  const pausedHere = cur.status === "paused" && cur.pausedBy === "profile";
  if (!pausedHere && cur.channels.length > 0) return null;
  return (
    <div className="au-card" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, padding: 28, borderStyle: "dashed", borderColor: "var(--line2)", animation: "hblurin .6s both" }}>
      <span style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: pausedHere ? "var(--panel2)" : "var(--accSoft)", color: pausedHere ? "var(--fg2)" : "var(--acc)" }}>
        <Icon name={pausedHere ? "circle-pause" : "plug"} size={19} />
      </span>
      <span style={{ fontSize: 15.5, fontWeight: 600 }}>{pausedHere ? "Perfil pausado" : "Este perfil ainda não conversa com ninguém"}</span>
      <span style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.55, maxWidth: 540 }}>
        {pausedHere ? "O Hermes não responde ninguém neste perfil até você retomar. As mensagens que chegarem ficam guardadas." : "Conecte um canal (WhatsApp, Telegram, e-mail…) para o Hermes começar a trabalhar neste perfil. O assistente leva uns 3 minutos."}
      </span>
      {pausedHere ? (
        <button className="au-primary" onClick={() => setProfilePaused(cur, false)}>
          <Icon name="play" size={14} />
          Retomar perfil
        </button>
      ) : (
        <button className="au-primary" onClick={() => setState({ wizard: true })}>
          <Icon name="rocket" size={14} />
          Abrir assistente de configuração
        </button>
      )}
    </div>
  );
}
