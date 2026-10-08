// Peças globais do shell: fundo atmosférico, Toast, PanicButton, faixa de pausa e helpers de página.
import { useEffect, type MouseEvent, type ReactNode } from "react";
import { Icon } from "./Icon";
import { answerAsk, ask, dismissToast, togglePause, useStore } from "./store";

/** Spotlight que segue o cursor dentro do cartão (`.au-card`). */
export const spot = (e: MouseEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", e.clientX - r.left + "px");
  e.currentTarget.style.setProperty("--my", e.clientY - r.top + "px");
};

export const CHANNEL_ICON: Record<string, string> = { WhatsApp: "phone", Telegram: "send", Email: "mail", Suporte: "life-buoy", Grupo: "users", Discord: "message-circle" };

/** Ponto colorido + nome do negócio. */
export function BizTag({ id }: { id: string }) {
  const b = useStore((s) => s.businesses.find((x) => x.id === id));
  if (!b) return null;
  const name = b.name;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)", whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: b.color }} />
      {name}
    </span>
  );
}

/** Cabeçalho padrão de página: label opcional, H1 com brilho, subtítulo e Pausar tudo. */
export function PageHeader({ label, title, sub, noPanic }: { label?: string; title: string; sub: ReactNode; noPanic?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        {label && <span className="au-label">{label}</span>}
        <h1 className="au-h1">{title}</h1>
        <p style={{ margin: 0, color: "var(--fg2)", fontSize: 14.5, maxWidth: 600, lineHeight: 1.55 }}>{sub}</p>
      </div>
      {!noPanic && <PanicButton />}
    </div>
  );
}

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function Background() {
  return (
    <>
      <div className="au-abs" style={{ background: "var(--atmo)" }} />
      <div className="au-abs" style={{ overflow: "hidden", opacity: "var(--wow)", transition: "opacity .6s" }}>
        <div className="au-orb" style={{ width: "48vw", height: "48vw", right: "-12vw", top: "-24vw", background: "radial-gradient(circle,var(--orbA),transparent 65%)", animation: "hdrift 24s ease-in-out infinite" }} />
        <div className="au-orb" style={{ width: "40vw", height: "40vw", left: "20vw", bottom: "-26vw", background: "radial-gradient(circle,var(--orbB),transparent 65%)", animation: "hdrift 31s ease-in-out infinite reverse" }} />
        <div className="au-abs" style={{ background: "radial-gradient(600px circle at var(--cx,62%) var(--cy,18%),var(--spot),transparent 60%)" }} />
        <div className="au-abs" style={{ opacity: 0.08, mixBlendMode: "overlay", backgroundImage: GRAIN }} />
      </div>
      <div className="au-abs" style={{ overflow: "hidden", opacity: "var(--blobO)", transition: "opacity .6s" }}>
        <div className="au-orb" style={{ width: "60vw", height: "60vw", right: "-15vw", top: "-25vw", background: "radial-gradient(circle,var(--accGlow,rgba(140,120,255,.28)),transparent 62%)", animation: "hdrift 22s ease-in-out infinite" }} />
        <div className="au-orb" style={{ width: "50vw", height: "50vw", left: "10vw", bottom: "-30vw", background: "radial-gradient(circle,rgba(70,210,190,.18),transparent 62%)", animation: "hdrift 28s ease-in-out infinite reverse" }} />
      </div>
    </>
  );
}

const BITS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  const r = 26 + (i % 3) * 8;
  return { x: Math.cos(a) * r + "px", y: Math.sin(a) * r + "px", d: (i % 3) * 40 + "ms" };
});

export function Toast() {
  const list = useStore((s) => s.toasts);
  return (
    <div role="status" aria-live="polite" style={{ position: "absolute", right: 24, bottom: 24, zIndex: 70, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      {list.map((t) => (
        <div key={t.id} className="au-toast" style={t.sub ? { alignItems: "flex-start", borderRadius: "var(--r2)", padding: "10px 10px 10px 10px", pointerEvents: "auto" } : { pointerEvents: "auto" }}>
          <span style={{ position: "relative", width: 26, height: 26, flex: "none", borderRadius: "50%", background: "var(--acc)", color: "var(--accFg)", display: "grid", placeItems: "center" }}>
            <Icon name="sparkles" size={13} />
            {BITS.map((b, i) => (
              <span key={i} className="au-bit" style={{ ["--bx" as string]: b.x, ["--by" as string]: b.y, animationDelay: b.d }} />
            ))}
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, paddingTop: t.sub ? 1 : 0 }}>
            <span style={t.sub ? { fontSize: 13.5, fontWeight: 600 } : undefined}>{t.text}</span>
            {t.sub && <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.4 }}>{t.sub}</span>}
          </span>
          {t.sub && (
            <button className="au-mini" title="Fechar" aria-label="Fechar aviso" onClick={() => dismissToast(t.id)} style={{ flex: "none", width: 24, height: 24 }}>
              <Icon name="x" size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Diálogo de confirmação (Esc cancela, Enter confirma; foco no botão principal). */
export function AskDialog() {
  const a = useStore((s) => s.ask);
  useEffect(() => {
    if (!a) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") answerAsk(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [a]);
  if (!a) return null;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 80, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 24, animation: "hin .2s ease both" }} onMouseDown={(e) => e.target === e.currentTarget && answerAsk(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="au-ask-title" className="au-card au-float" style={{ width: "min(440px,100%)", padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        <span id="au-ask-title" style={{ fontSize: 16, fontWeight: 600 }}>{a.title}</span>
        {a.body && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--fg2)" }}>{a.body}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
          <button className="au-outline" onClick={() => answerAsk(false)}>
            Cancelar
          </button>
          <button autoFocus className={a.danger ? "au-primary au-danger" : "au-primary"} onClick={() => answerAsk(true)}>
            {a.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Kill switch. Pausado, some daqui: o "Retomar" fica só na faixa do topo (um botão só). */
export function PanicButton() {
  const paused = useStore((s) => s.paused);
  if (paused) return null;
  const pause = async () => {
    if (await ask({ title: "Pausar tudo?", body: "Nada sai em seu nome — mensagens, comandos, playbooks — até você retomar. O Hermes continua lendo.", confirm: "Pausar", danger: true })) togglePause();
  };
  return (
    <button className="au-panic" aria-pressed={false} onClick={pause}>
      <Icon name="octagon-pause" size={15} />
      Pausar tudo
    </button>
  );
}

export function PauseBanner() {
  const paused = useStore((s) => s.paused);
  if (!paused) return null;
  return (
    <div className="au-pausebar" role="alert">
      <Icon name="octagon-pause" size={15} />
      Agente pausado. Nada sai em seu nome até você retomar.
      <button onClick={togglePause}>Retomar</button>
    </div>
  );
}

/** Cartão para telas que ainda não têm backend no Hermes: diz o que falta e oferece os dados de exemplo. */
export function NotConnected({ icon, what, needs, action }: { icon: string; what: string; needs: string; action?: ReactNode }) {
  return (
    <div className="au-card" onMouseMove={spot} style={{ padding: "36px 32px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, maxWidth: 640, animation: "hblurin .5s both" }}>
      <span style={{ width: 44, height: 44, borderRadius: "var(--r2)", background: "var(--accSoft)", color: "var(--acc)", display: "grid", placeItems: "center" }}>
        <Icon name={icon} size={20} />
      </span>
      <span className="au-label">Ainda não configurado</span>
      <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.35 }}>{what}</span>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--fg2)" }}>{needs}</p>
      {action}
    </div>
  );
}

/** Página inteira de uma tela de Operação sem backend. */
export function NotConnectedPage({ title, sub, icon, what, needs, action }: { title: string; sub: string; icon: string; what: string; needs: string; action?: ReactNode }) {
  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page">
        <PageHeader title={title} sub={sub} noPanic />
        <NotConnected icon={icon} what={what} needs={needs} action={action} />
      </div>
    </div>
  );
}
