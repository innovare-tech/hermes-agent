import { useState } from "react";
import { PageHeader, spot } from "../Chrome";
import { Icon } from "../Icon";
import { RadarCard } from "../ops/RadarCard";
import { draftRadarAlert, draftRadarGroup, inBiz, setWatches, toast, useStore } from "../store";

export function Radar() {
  const s = useStore((x) => x);
  const [word, setWord] = useState("");
  const groups = s.radar.filter(inBiz(s));
  const alerts = groups.filter((g) => g.alert);

  const add = async () => {
    const w = word.trim().toLowerCase();
    if (!w || s.watches.includes(w)) return setWord("");
    if (await setWatches([...s.watches, w])) {
      setWord("");
      toast(`Vou te avisar quando falarem de “${w}”`);
    }
  };

  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page">
        <PageHeader title="Radar de grupos" sub="O que está acontecendo em cada grupo, sem você precisar ler tudo: decisões, menções, perguntas sem resposta e o clima da conversa." noPanic />

        <div className="au-card" onMouseMove={spot} style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Icon name="bell-ring" size={16} color="var(--acc)" />
          <input
            aria-label="Palavra para vigiar"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Me avise se alguém falar de…"
            style={{ flex: 1, minWidth: 200, border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 14 }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {s.watches.map((w) => (
              <button key={w} className="au-watch" aria-label={`Parar de vigiar ${w}`} onClick={() => setWatches(s.watches.filter((y) => y !== w))}>
                {w}
                <Icon name="x" size={10} color="var(--fg3)" />
              </button>
            ))}
          </div>
        </div>

        {alerts.map((g, i) => (
          <div key={g.id} role="alert" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: "var(--r)", border: "1px solid var(--err)", background: "var(--panel)", backdropFilter: "var(--blur)", animation: "hblurin .5s both", animationDelay: i * 80 + "ms" }}>
            <span style={{ position: "relative", width: 10, height: 10, flex: "none" }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--err)" }} />
              <span style={{ position: "absolute", inset: -5, borderRadius: "50%", border: "2px solid var(--err)", animation: "hping 1.6s ease-out infinite" }} />
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{g.alert}</span>
              <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>
                {g.name} · {g.channel}
              </span>
            </span>
            <button className="au-outline" onClick={() => draftRadarAlert(g)}>
              Rascunhar resposta
            </button>
          </div>
        ))}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 14 }}>
          {groups.map((g, i) => (
            <RadarCard key={g.id} g={g} index={i} onDraft={() => draftRadarGroup(g)} />
          ))}
        </div>
      </div>
    </div>
  );
}
