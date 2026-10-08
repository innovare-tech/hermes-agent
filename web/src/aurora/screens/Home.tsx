import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { PageHeader, spot } from "../Chrome";
import { Icon } from "../Icon";
import { PRIORITY } from "../ops/InboxList";
import { inBiz, useStore } from "../store";

const WAVE = [40, 70, 55, 90, 35, 80, 60, 95, 45, 75, 50, 85, 40, 65];
const STATUS_COLOR = { ok: "var(--ok)", warn: "var(--warn)", err: "var(--err)" };
const money = (v: number) => "US$ " + v.toFixed(2).replace(".", ",");

/** Lê o briefing em voz alta com a síntese de voz do navegador (pt-BR). */
function useSpeech(text: string) {
  const [playing, setPlaying] = useState(false);
  const can = typeof window !== "undefined" && "speechSynthesis" in window;
  useEffect(() => () => {
    if (can) speechSynthesis.cancel();
  }, [can]);
  const toggle = () => {
    if (!can) return;
    speechSynthesis.cancel();
    if (playing) return setPlaying(false);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    u.onend = u.onerror = () => setPlaying(false);
    speechSynthesis.speak(u);
    setPlaying(true);
  };
  const secs = Math.round(text.split(/\s+/).length / 2.5);
  return { can, playing, toggle, dur: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` };
}

export function Home() {
  const s = useStore((x) => x);
  const navigate = useNavigate();
  const f = inBiz(s);
  const needs = s.inbox.filter((x) => f(x) && (x.priority === "urgente" || x.priority === "voce"));
  const approvals = s.approvals.filter(f).length;
  const alerts = s.radar.filter((x) => f(x) && x.alert).length;
  const brief = s.briefing.filter(f);
  const biz = (id: string) => s.businesses.find((b) => b.id === id);
  const speech = useSpeech(brief.map((b) => `${biz(b.business)?.name}. ${b.text}`).join(" "));
  const hr = new Date().getHours();
  const health = [
    ...s.health.items,
    { name: "Fila de mensagens", status: s.paused ? "warn" : "ok", value: s.paused ? "retida (pausado)" : "0 pendentes" } as const,
  ];
  const online = s.health.online && !s.paused;
  const attention = online && s.health.level === "warn";
  const hColor = s.paused ? "var(--err)" : !online ? "var(--err)" : attention ? "var(--warn)" : "var(--ok)";
  const c = s.costs;
  const costMax = Math.max(30, ...c.byBusiness.map((x) => x.value));

  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page">
        <PageHeader
          label={new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          title={(hr < 12 ? "Bom dia" : hr < 18 ? "Boa tarde" : "Boa noite") + ". Aqui está o seu dia."}
          sub={
            s.paused
              ? "O agente está pausado. Ele continua lendo tudo, mas não envia nada nem executa ações até você retomar."
              : `Hoje o Hermes respondeu ${s.last24h.autoReplies} ${s.last24h.autoReplies === 1 ? "mensagem" : "mensagens"} sozinho e separou ${needs.length + approvals} ${needs.length + approvals === 1 ? "decisão" : "decisões"} para você${s.health.problems.length ? ". Atenção: " + s.health.problems[0].text.charAt(0).toLowerCase() + s.health.problems[0].text.slice(1) : ""}.`
          }
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 }}>
          <div className="au-card" onMouseMove={spot} style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="au-label">Resumo da manhã{brief[0]?.at ? ` · ${brief[0].at}` : ""}</span>
              {speech.can && brief.length > 0 && (
                <button
                  onClick={speech.toggle}
                  aria-pressed={speech.playing}
                  aria-label={speech.playing ? "Parar o briefing" : "Ouvir o briefing"}
                  style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9, padding: "5px 12px 5px 5px", borderRadius: 999, border: "1px solid var(--line2)", background: "var(--panel2)", color: "var(--fg)", cursor: "pointer" }}
                >
                  <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--acc)", color: "var(--accFg)", display: "grid", placeItems: "center" }}>
                    <Icon name={speech.playing ? "pause" : "play"} size={11} />
                  </span>
                  <span aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 2, height: 16 }}>
                    {WAVE.map((h, i) => (
                      <span key={i} style={{ width: 2, height: h + "%", borderRadius: 2, background: "var(--acc)", animation: speech.playing ? "heq .8s ease-in-out infinite" : "none", animationDelay: i * 70 + "ms" }} />
                    ))}
                  </span>
                  <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg2)" }}>{speech.playing ? "parar" : "ouvir"} · {speech.dur}</span>
                </button>
              )}
            </div>
            {brief.length === 0 && (
              <div style={{ paddingTop: 14, borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--fg2)" }}>Receba toda manhã um resumo das mensagens e pendências.</p>
                <button className="au-outline" onClick={() => navigate("/cron?q=" + encodeURIComponent("dias úteis às 7h30, resuma minhas mensagens e pendências"))}>
                  <Icon name="calendar-plus" size={13} /> Criar agendamento
                </button>
              </div>
            )}
            {brief.map((b, i) => (
              <div key={b.business} style={{ display: "grid", gridTemplateColumns: "92px minmax(0,1fr)", gap: 14, paddingTop: 14, borderTop: "1px solid var(--line)", animation: "hblurin .6s both", animationDelay: 150 + i * 120 + "ms" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, alignSelf: "start", paddingTop: 2 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: biz(b.business)?.color, boxShadow: `0 0 10px ${biz(b.business)?.color}` }} />
                  {biz(b.business)?.name}
                </span>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, textWrap: "pretty" }}>{b.text}</p>
              </div>
            ))}
          </div>

          <div className="au-card" onMouseMove={spot} style={{ padding: 22, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "22px 16px", alignContent: "start" }}>
            <span className="au-label" style={{ gridColumn: "1/-1" }}>Hoje</span>
            {[
              { v: String(s.activity.filter((a) => /^\d\d:\d\d$/.test(a.at)).length), l: "ações registradas", c: "var(--acc)" },
              { v: String(s.last24h.autoReplies), l: "respostas enviadas", c: "var(--fg)" },
              { v: String(needs.length + approvals), l: "decisões esperando você", c: "var(--fg)" },
              { v: String(alerts), l: "alertas nos grupos", c: alerts ? "var(--err)" : "var(--fg)" },
            ].map((r, i) => (
              <div key={r.l} style={{ display: "flex", flexDirection: "column", gap: 6, animation: "hpop .7s cubic-bezier(.3,1.4,.5,1) both", animationDelay: 200 + i * 90 + "ms" }}>
                <span className="au-display" style={{ lineHeight: 1, fontSize: 36, color: r.c }}>{r.v}</span>
                <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.4 }}>{r.l}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
          <div className="au-card" onMouseMove={spot} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
              <span className="au-label">Precisa de você</span>
              <button onClick={() => navigate("/inbox")} style={{ marginLeft: "auto", padding: 0, border: 0, background: "transparent", color: "var(--acc)", fontSize: 12.5, cursor: "pointer" }}>
                Abrir caixa →
              </button>
            </div>
            {needs.slice(0, 4).map((x) => (
              <button key={x.id} className="au-need" onClick={() => navigate(`/inbox?sel=${x.id}`)}>
                <span className="au-avatar" style={{ width: 34, height: 34, fontSize: 12 }}>{x.initials}</span>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{x.from}</span>
                  <span style={{ fontSize: 12, color: "var(--fg2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.summary}</span>
                </span>
                <span title={PRIORITY[x.priority].label} style={{ width: 8, height: 8, borderRadius: "50%", background: PRIORITY[x.priority].color, flex: "none", boxShadow: `0 0 8px ${PRIORITY[x.priority].color}` }} />
              </button>
            ))}
            {needs.length === 0 && <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>Nada esperando por você.</span>}
          </div>

          <div className="au-card" onMouseMove={spot} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="au-label">Saúde do agente</span>
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "4px 0 6px" }}>
              <span style={{ position: "relative", width: 12, height: 12, flex: "none" }}>
                <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: hColor }} />
                <span style={{ position: "absolute", inset: -6, borderRadius: "50%", border: `2px solid ${hColor}`, animation: "hping 2s ease-out infinite" }} />
              </span>
              <span className="au-display" style={{ lineHeight: 1, fontSize: 28 }}>{s.paused ? "Pausado" : !online ? "Offline" : attention ? "Atenção" : "Online"}</span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>{s.health.uptime && (s.health.online && /^\d/.test(s.health.uptime) ? "uptime " : "") + s.health.uptime}</span>
            </div>
            {s.health.problems.map((p) => (
              <button key={p.text} className="au-need" onClick={() => navigate(p.to)} style={{ alignItems: "center", gap: 10, fontSize: 13, color: "var(--warn)", textAlign: "left" }}>
                <Icon name="octagon-pause" size={14} color="var(--warn)" />
                <span style={{ flex: 1 }}>{p.text}</span>
                <span style={{ color: "var(--acc)", fontSize: 12.5 }}>Resolver →</span>
              </button>
            ))}
            {health.map((x) => (
              <div key={x.name} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[x.status] }} />
                {x.name}
                <span style={{ marginLeft: "auto", fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg2)" }}>{x.value}</span>
              </div>
            ))}
          </div>

          <div className="au-card" onMouseMove={spot} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <span className="au-label">Custos · {c.month}{s.biz !== "all" ? " · todos os negócios" : ""}</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="au-display" style={{ lineHeight: 1, fontSize: 36 }}>{money(c.total)}</span>
              {c.limit != null && <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>de ${c.limit} · limite mensal</span>}
            </div>
            {c.limit != null && (
              <>
                <div style={{ position: "relative", height: 8, borderRadius: 8, background: "var(--panel2)" }}>
                  <div style={{ height: "100%", width: Math.min(100, (c.total / c.limit) * 100) + "%", borderRadius: 8, background: "linear-gradient(90deg,var(--acc),var(--ok))", animation: "hgrow 1.4s cubic-bezier(.2,.7,.2,1) both" }} />
                  <div title="alerta em 80%" style={{ position: "absolute", left: "80%", top: -4, bottom: -4, width: 2, borderRadius: 2, background: "var(--warn)" }} />
                </div>
                <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>
                  Alerta em 80%{c.projection != null && (
                    <>
                      {" "}· projeção para o fim do mês: <b style={{ color: "var(--fg)", fontWeight: 600 }}>${Math.round(c.projection)}</b>
                    </>
                  )}
                </span>
              </>
            )}
            {c.byBusiness.filter(f).map((x) => (
              <div key={x.business} style={{ display: "grid", gridTemplateColumns: "78px minmax(0,1fr) 54px", gap: 10, alignItems: "center", fontSize: 12.5 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: biz(x.business)?.color }} />
                  {biz(x.business)?.name}
                </span>
                <div style={{ height: 5, borderRadius: 5, background: "var(--panel2)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: (x.value / costMax) * 100 + "%", background: biz(x.business)?.color, borderRadius: 5, animation: "hgrow 1.2s cubic-bezier(.2,.7,.2,1) both" }} />
                </div>
                <span style={{ fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg2)", textAlign: "right" }}>{money(x.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
