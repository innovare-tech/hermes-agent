// Detalhe de uma análise: identificação, ações, status, evidências (áudio, imagens), checagens, hipótese e resposta sugerida.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CATEGORIES, URGENCIES, colorOf, hhmm, initial, mediaBlob, periodLabel, plural, platformLabel, reasonLabel, viewOf, type Analysis, type AudioEvidence, type MediaEvidence } from "./api";
import { AIcon } from "./icons";

const soft = (c: string, p: number) => `color-mix(in oklab,${c} ${p}%,transparent)`;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const BARS = Array.from({ length: 44 }, (_, i) => Math.round(30 + 60 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45))));
const SECTION: CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };

const Label = ({ children }: { children: string }) => <span className="au-label">{children}</span>;

function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span style={{ width: size, height: size, flex: "none", borderRadius: "50%", background: colorOf(name), color: "var(--accFg)", display: "grid", placeItems: "center", fontSize: size * 0.43, fontWeight: 700 }}>
      {initial(name)}
    </span>
  );
}

// ---------- áudio ----------

function AudioPlayer({ au, retrying, onRetry }: { au: AudioEvidence; retrying: boolean; onRetry: () => void }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  useEffect(() => () => ref.current?.pause(), []);

  // O arquivo só é baixado quando a pessoa pede para ouvir.
  const ensure = async (): Promise<HTMLAudioElement | null> => {
    if (ref.current) return ref.current;
    setLoading(true);
    try {
      const el = new Audio(await mediaBlob(au.url));
      el.onloadedmetadata = () => setDur(Number.isFinite(el.duration) ? el.duration : 0);
      el.ontimeupdate = () => setPos(el.currentTime);
      el.onplay = () => setPlaying(true);
      el.onpause = () => setPlaying(false);
      el.onended = () => {
        setPlaying(false);
        setPos(0);
      };
      el.onerror = () => setFailed(true);
      ref.current = el;
      return el;
    } catch {
      setFailed(true);
      return null;
    } finally {
      setLoading(false);
    }
  };
  const toggle = async () => {
    const el = await ensure();
    if (!el) return;
    if (el.paused) await el.play().catch(() => setFailed(true));
    else el.pause();
  };
  const seek = async (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const el = await ensure();
    if (el && Number.isFinite(el.duration)) el.currentTime = frac * el.duration;
  };

  const pct = dur ? pos / dur : 0;
  const label = playing ? "Pausar" : "Ouvir";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: "var(--r2)", border: "1px solid var(--line2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button title={label} aria-label={label} onClick={toggle} disabled={failed} style={{ width: 36, height: 36, flex: "none", borderRadius: "50%", border: 0, background: "var(--fg)", color: "var(--bg)", display: "grid", placeItems: "center", cursor: "pointer", opacity: failed ? 0.4 : 1 }}>
          <AIcon name={loading ? "loader-circle" : playing ? "pause" : "play"} size={15} className={loading ? "au-spin" : undefined} />
        </button>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: "var(--fg2)" }}>
            Áudio{au.author ? ` de ${au.author}` : ""}
            {au.at && <> · <span style={{ fontFamily: "var(--fm)" }}>{au.at}</span></>}
          </span>
          <div className="an-wave" onClick={seek} role="slider" aria-label="Posição do áudio" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(pos)}>
            {BARS.map((h, i) => (
              <span key={i} data-done={i / BARS.length < pct} style={{ height: h + "%" }} />
            ))}
          </div>
        </div>
        <span style={{ fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg2)" }}>{dur ? `${fmt(pos)} / ${fmt(dur)}` : fmt(pos)}</span>
      </div>
      {failed && <span style={{ fontSize: 12.5, color: "var(--warn)" }}>Não consegui abrir o arquivo de áudio.</span>}
      {au.transcript && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 12px", borderRadius: 9, background: "var(--panel2)" }}>
          <span style={{ fontSize: 11, color: "var(--fg3)" }}>Transcrição feita pelo Hermes</span>
          <span style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{au.transcript}</span>
        </div>
      )}
      {!au.transcript && au.transcriptError && (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9, background: soft("var(--warn)", 10), fontSize: 12.5, lineHeight: 1.5 }}>
          <AIcon name="audio-lines" size={15} color="var(--warn)" />
          <span style={{ flex: 1 }}>Não consegui transcrever: {au.transcriptError.replace(/\.$/, "")}. Ouça o áudio original.</span>
          <button className="an-chip-btn" onClick={onRetry} disabled={retrying} style={{ flex: "none" }}>
            <AIcon name={retrying ? "loader-circle" : "rotate-cw"} size={12} className={retrying ? "au-spin" : undefined} />
            Tentar de novo
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- imagem / vídeo ----------

function MediaThumb({ m }: { m: MediaEvidence }) {
  const isImage = !!m.thumbUrl;
  const isVideo = m.type === "video";
  const [src, setSrc] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!isImage) return;
    let alive = true;
    mediaBlob(m.thumbUrl!).then((u) => alive && setSrc(u), () => alive && setBad(true));
    return () => {
      alive = false;
    };
  }, [isImage, m.thumbUrl]);

  const open = async () => {
    try {
      const u = await mediaBlob(m.url);
      if (isVideo) {
        setSrc(u);
        setPlaying(true);
      } else window.open(u, "_blank", "noopener");
    } catch {
      setBad(true);
    }
  };
  const box: CSSProperties = { position: "relative", height: 100, borderRadius: 10, border: "1px solid var(--line2)", overflow: "hidden", display: "grid", placeItems: "center", color: "var(--fg3)", background: "repeating-linear-gradient(135deg,var(--panel2) 0 10px,transparent 10px 20px)" };
  return (
    <div title={m.caption} style={{ width: 150, display: "flex", flexDirection: "column", gap: 6 }}>
      {playing && src ? (
        <video src={src} controls autoPlay style={{ ...box, width: "100%", background: "#000", display: "block" }} />
      ) : (
        <button onClick={open} aria-label={isVideo ? "Abrir vídeo" : "Abrir arquivo"} style={{ ...box, padding: 0, cursor: "pointer" }}>
          {isImage && src ? <img src={src} alt={m.caption || "Imagem enviada no grupo"} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <AIcon name={bad ? "cloud-off" : isVideo ? "video" : isImage ? "image" : "file-text"} size={22} />}
          {isVideo && !bad && <AIcon name="play" size={20} color="#fff" />}
        </button>
      )}
      {m.caption && <span style={{ fontSize: 11.5, color: "var(--fg2)", lineHeight: 1.35 }}>{m.caption}</span>}
    </div>
  );
}

// ---------- detalhe ----------

export type DetailProps = {
  a: Analysis;
  copied: boolean;
  retrying: boolean;
  onResolve: () => void;
  onReopen: () => void;
  onCopy: () => void;
  onChat: () => void;
  onIrrelevant: () => void;
  onRetryTranscript: () => void;
};

export function Detail({ a, copied, retrying, onResolve, onReopen, onCopy, onChat, onIrrelevant, onRetryTranscript }: DetailProps) {
  const view = viewOf(a);
  const cat = a.category ? CATEGORIES[a.category] : null;
  const urg = a.urgency ? URGENCIES[a.urgency] : null;
  const failed = a.status === "failed" || (!!a.error && !a.summary);
  const conf = a.confidence != null ? Math.round(a.confidence * 100) : null;
  const ev = a.evidence;

  const chip = (c: string, bg: number, bold: boolean): CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: soft(c, bg), color: c, fontSize: 12, fontWeight: bold ? 700 : 600 });
  const btn: CSSProperties = { whiteSpace: "nowrap" };

  const statusCards = [
    a.telegram
      ? { icon: "send", color: "var(--ok)", title: "Enviado ao Telegram", sub: a.telegram.sentAt ? `Equipe · ${hhmm(a.telegram.sentAt)}` : "Equipe", link: a.telegram.url }
      : { icon: "send", color: "var(--fg3)", title: "Não enviado ao Telegram", sub: "Nenhum destino de aviso configurado ou o envio falhou." },
    a.seenBy.length
      ? { icon: "eye", color: "var(--fg)", title: `Visto por ${a.seenBy.length}`, sub: a.seenBy.map((p) => `${p.name} ${hhmm(p.at)}`).join(" · ") }
      : { icon: "eye", color: "var(--fg3)", title: "Ninguém viu ainda", sub: "Ainda não foi aberto aqui." },
    view === "resolved" && a.resolved
      ? { icon: "circle-check", color: "var(--ok)", title: "Resolvido", sub: `por ${a.resolved.by} às ${hhmm(a.resolved.at)}`, border: soft("var(--ok)", 40), bg: soft("var(--ok)", 8) }
      : view === "irrelevant" && a.irrelevant
        ? { icon: "thumbs-down", color: "var(--fg2)", title: "Não era relevante", sub: [reasonLabel(a.irrelevant.reason), a.irrelevant.note].filter(Boolean).join(" · "), bg: "var(--panel2)" }
        : { icon: "circle-dashed", color: "var(--fg3)", title: "Não resolvido", sub: "Marque quando o cliente estiver atendido" },
  ];

  return (
    <article style={{ display: "flex", flexDirection: "column", animation: "hblurin .4s both" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "22px 24px 18px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          {urg && <span style={chip(urg.color, 16, true)}><AIcon name={urg.icon} size={12} />Urgência {urg.label.toLowerCase()}</span>}
          {cat && <span style={chip(cat.color, 15, false)}><AIcon name={cat.icon} size={12} />{cat.label}</span>}
          {failed && <span style={chip("var(--err)", 15, true)}><AIcon name="circle-alert" size={12} />Falhou na análise</span>}
          {conf != null && (
            <span title="Quanto o Hermes tem certeza da categoria e da urgência" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--line2)", fontSize: 12, color: "var(--fg2)" }}>
              <span style={{ width: 36, height: 4, borderRadius: 4, background: "var(--panel2)", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: conf + "%", background: "var(--fg2)" }} />
              </span>
              {conf}% de confiança
            </span>
          )}
          <span style={{ marginLeft: "auto", fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>{a.code}</span>
        </div>
        <h2 className="au-display" style={{ margin: 0, fontSize: 22, lineHeight: 1.3, textWrap: "pretty" }}>
          {a.summary || `Não consegui analisar ${plural(a.messageCount, "mensagem", "mensagens")} deste grupo.`}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
          <Field label="Cliente" value={a.clientName || "Sem cliente vinculado"} bold sub={a.clientId ? `systemClientId ${a.clientId}` : undefined} mono />
          <Field label="Grupo" value={a.groupName} sub={platformLabel(a.platform) || undefined} />
          <Field label="Período" value={periodLabel(a)} sub={a.messageCount === 1 ? "1 mensagem analisada" : `${a.messageCount} mensagens analisadas juntas`} />
        </div>
        {a.participants.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--fg3)" }}>Quem falou</span>
            {a.participants.map((p) => (
              <span key={p.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 9px 2px 2px", borderRadius: 999, background: "var(--panel2)", fontSize: 12 }}>
                <Avatar name={p.name} size={20} />
                {p.name}
                {p.role && <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>{p.role}</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 24px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
        {view === "open" ? (
          <button className="au-primary" onClick={onResolve} style={btn}><AIcon name="check" size={14} />Marcar resolvido</button>
        ) : (
          <button className="an-btn" onClick={onReopen} style={btn}><AIcon name="rotate-ccw" size={14} />Reabrir</button>
        )}
        <button className="an-btn" onClick={onCopy} disabled={!a.suggestedReply} style={btn}><AIcon name={copied ? "check" : "copy"} size={14} />{copied ? "Copiada" : "Copiar resposta sugerida"}</button>
        <button className="an-btn" onClick={onChat} style={btn}><AIcon name="messages-square" size={14} />Conversar com o Hermes sobre isto</button>
        {view === "open" && (
          <button className="an-ghost" onClick={onIrrelevant} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "8px 6px", textDecoration: "none" }}>
            <AIcon name="thumbs-down" size={13} />Não era relevante
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22, padding: "20px 24px 32px" }}>
        {failed && (
          <div role="alert" style={{ display: "flex", gap: 11, padding: "12px 14px", borderRadius: "var(--r2)", border: `1px solid ${soft("var(--err)", 35)}`, background: soft("var(--err)", 8) }}>
            <AIcon name="circle-alert" size={16} color="var(--err)" />
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>O Hermes não conseguiu analisar este lote</span>
              <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5 }}>
                {a.error ? `Motivo: ${a.error}. ` : ""}A equipe foi avisada com as mensagens cruas; elas estão abaixo, em Evidências.
              </span>
            </div>
          </div>
        )}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
          {statusCards.map((s) => (
            <div key={s.title} style={{ display: "flex", gap: 10, padding: "11px 12px", borderRadius: "var(--r2)", border: `1px solid ${"border" in s && s.border ? s.border : "var(--line)"}`, background: "bg" in s && s.bg ? s.bg : "transparent" }}>
              <AIcon name={s.icon} size={15} color={s.color} className="au-mt3" />
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{s.title}</span>
                <span style={{ fontSize: 11.5, color: "var(--fg2)", lineHeight: 1.4, overflowWrap: "anywhere" }}>{s.sub}</span>
                {"link" in s && s.link && (
                  <a href={s.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                    Abrir no Telegram<AIcon name="arrow-up-right" size={11} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </section>

        {(ev.quotes.length > 0 || ev.audios.length > 0 || ev.media.length > 0) && (
          <section style={SECTION}>
            <Label>Evidências</Label>
            {ev.quotes.map((q, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: "var(--r2)", background: "var(--panel2)" }}>
                <Avatar name={q.author} />
                <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>{q.author} · <span style={{ fontFamily: "var(--fm)" }}>{q.at}</span></span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.5, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>“{q.text}”</span>
                </div>
              </div>
            ))}
            {ev.audios.map((au) => (
              <AudioPlayer key={au.url} au={au} retrying={retrying} onRetry={onRetryTranscript} />
            ))}
            {ev.media.length > 0 && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {ev.media.map((m) => (
                  <MediaThumb key={m.url} m={m} />
                ))}
              </div>
            )}
          </section>
        )}

        {(a.checks.length > 0 || a.hypothesis) && (
          <section style={SECTION}>
            <Label>O que o Hermes checou</Label>
            <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--line)", borderRadius: "var(--r2)", overflow: "hidden" }}>
              {a.checks.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 11, padding: "11px 13px", borderBottom: a.hypothesis || i < a.checks.length - 1 ? "1px solid var(--line)" : 0 }}>
                  <AIcon name={CHECK[c.result]?.[0] ?? "info"} size={15} color={CHECK[c.result]?.[1] ?? "var(--fg2)"} className="au-mt3" />
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 13, lineHeight: 1.5 }}>{c.text}</span>
                    {c.explain && <span style={{ fontSize: 11.5, color: "var(--fg3)", lineHeight: 1.4 }}>{c.explain}</span>}
                  </div>
                </div>
              ))}
              {a.hypothesis && (
                <div style={{ display: "flex", gap: 11, padding: "12px 13px", background: "var(--accSoft)" }}>
                  <AIcon name="lightbulb" size={15} color="var(--acc)" className="au-mt3" />
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--fg2)" }}>Hipótese</span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{a.hypothesis}</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {a.suggestedReply && (
          <section style={SECTION}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Label>Resposta sugerida</Label>
              <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>· o Hermes não envia, você copia e manda no grupo</span>
            </div>
            <div style={{ padding: "14px 16px", borderRadius: "var(--r2)", border: "1px solid var(--line2)", background: "var(--panel2)", fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{a.suggestedReply}</div>
            <button className="an-chip-btn" onClick={onCopy} style={{ alignSelf: "flex-start", padding: "7px 12px", fontSize: 12.5 }}>
              <AIcon name={copied ? "check" : "copy"} size={13} />
              {copied ? "Copiada" : "Copiar resposta sugerida"}
            </button>
          </section>
        )}
      </div>
    </article>
  );
}

const CHECK: Record<string, [string, string]> = {
  problem: ["circle-alert", "var(--err)"],
  ok: ["circle-check", "var(--ok)"],
  info: ["info", "var(--fg2)"],
};

function Field({ label, value, sub, bold, mono }: { label: string; value: string; sub?: string; bold?: boolean; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: "var(--fg3)" }}>{label}</span>
      <span title={value} style={{ fontSize: 13, fontWeight: bold ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
      {sub && <span style={{ fontFamily: mono ? "var(--fm)" : undefined, fontSize: mono ? 10.5 : 11, color: "var(--fg3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>}
    </div>
  );
}

/** Esqueleto do detalhe (troca de análise). */
export function DetailSkeleton() {
  return (
    <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 24 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ height: 22, width: 80, borderRadius: 999, background: "var(--panel2)" }} />
        <div style={{ height: 22, width: 70, borderRadius: 999, background: "var(--panel2)" }} />
      </div>
      <div className="an-skel" style={{ height: 22, width: "80%", borderRadius: 8 }} />
      <div style={{ height: 120, borderRadius: "var(--r2)", background: "var(--panel2)" }} />
      <div style={{ height: 160, borderRadius: "var(--r2)", background: "var(--panel2)" }} />
    </div>
  );
}
