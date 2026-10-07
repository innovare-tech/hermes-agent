import type { RadarGroup } from "../adapter";
import { BizTag, CHANNEL_ICON, spot } from "../Chrome";
import { Icon } from "../Icon";

const moodColor = (v: number) => (v < 0.4 ? "var(--err)" : v < 0.6 ? "var(--warn)" : "var(--ok)");

/** Um grupo: clima em 12 barras, decisões, menções e perguntas sem resposta. */
export function RadarCard({ g, index, onDraft }: { g: RadarGroup; index: number; onDraft: () => void }) {
  const recent = g.sentiment.slice(-3);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const secs = [
    { label: "Decidido", icon: "circle-check", color: "var(--ok)", items: g.decisions },
    { label: "Te citaram", icon: "at-sign", color: "var(--acc)", items: g.mentions },
    { label: "Sem resposta", icon: "circle-help", color: "var(--warn)", items: g.unanswered },
  ].filter((s) => s.items.length);
  return (
    <div className="au-card" onMouseMove={spot} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, animation: "hblurin .55s both", animationDelay: index * 70 + "ms" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 38, height: 38, flex: "none", borderRadius: "var(--r2)", background: "var(--panel2)", display: "grid", placeItems: "center", color: "var(--fg2)" }}>
          <Icon name={CHANNEL_ICON[g.channel] ?? "users"} size={16} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>{g.name}</span>
          <span style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>
            <BizTag id={g.business} />
            {g.members} pessoas · {g.msgsToday} msgs hoje
          </span>
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div role="img" aria-label={`Clima do grupo ao longo do dia: ${avg < 0.4 ? "tenso" : avg < 0.6 ? "neutro" : "bom"}`} style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 34 }}>
          {g.sentiment.map((v, j) => (
            <span key={j} style={{ flex: 1, height: Math.max(12, v * 100) + "%", borderRadius: 3, background: moodColor(v), transformOrigin: "bottom", animation: "hgrowY .7s cubic-bezier(.2,.7,.2,1) both", animationDelay: index * 70 + j * 25 + "ms" }} />
          ))}
        </div>
        <span style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--fm)", fontSize: 10, color: "var(--fg3)" }}>
          <span>
            clima hoje · <b style={{ color: moodColor(avg), fontWeight: 500 }}>{avg < 0.4 ? "tenso" : avg < 0.6 ? "neutro" : "bom"}</b>
          </span>
          <span>06h → agora</span>
        </span>
      </div>
      {secs.map((sec) => (
        <div key={sec.label} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="au-label">{sec.label}</span>
          {sec.items.map((it) => (
            <div key={it} style={{ display: "flex", gap: 9, minHeight: 21, fontSize: 13, lineHeight: 1.45 }}>
              <Icon name={sec.icon} size={13} color={sec.color} className="au-mt2" />
              <span>{it}</span>
            </div>
          ))}
        </div>
      ))}
      {g.unanswered.length > 0 && (
        <button className="au-outline" onClick={onDraft} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="pen-line" size={13} color="var(--acc)" />
          Rascunhar respostas
        </button>
      )}
    </div>
  );
}
