// Peças globais do shell: fundo atmosférico, Toast, PanicButton, faixa de pausa e helpers de página.
import type { MouseEvent, ReactNode } from "react";
import { Icon } from "./Icon";
import { togglePause, useStore } from "./store";

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
  const name = b?.name ?? "Todos";
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)", whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: b?.color ?? "var(--fg3)" }} />
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
        <div className="au-orb" style={{ width: "60vw", height: "60vw", right: "-15vw", top: "-25vw", background: "radial-gradient(circle,rgba(140,120,255,.28),transparent 62%)", animation: "hdrift 22s ease-in-out infinite" }} />
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
  const t = useStore((s) => s.toast);
  return (
    <div role="status" aria-live="polite" style={{ position: "absolute", left: "50%", top: 20, transform: "translateX(-50%)", zIndex: 70, pointerEvents: "none" }}>
      {t && (
        <div key={t.id} className="au-toast">
          <span style={{ position: "relative", width: 26, height: 26, borderRadius: "50%", background: "var(--acc)", color: "var(--accFg)", display: "grid", placeItems: "center" }}>
            <Icon name="sparkles" size={13} />
            {BITS.map((b, i) => (
              <span key={i} className="au-bit" style={{ ["--bx" as string]: b.x, ["--by" as string]: b.y, animationDelay: b.d }} />
            ))}
          </span>
          <span>{t.text}</span>
        </div>
      )}
    </div>
  );
}

export function PanicButton() {
  const paused = useStore((s) => s.paused);
  return (
    <button className="au-panic" aria-pressed={paused} onClick={togglePause}>
      <Icon name={paused ? "play" : "octagon-pause"} size={15} />
      {paused ? "Retomar agente" : "Pausar tudo"}
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
