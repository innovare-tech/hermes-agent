import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { spot } from "../Chrome";
import { Icon } from "../Icon";
import { chat } from "../chat";
import { Composer } from "../chat/Composer";
import { ContextPanel } from "../chat/ContextPanel";
import { ToolTimeline } from "../chat/ToolTimeline";
import { answered, applyEvent, interrupted } from "../chat/turn";
import type { AgentMessage, ApprovalChoice, Block, ChatMessage, SessionInfo, SlashCommand } from "../chat/types";
import { ApprovalCard } from "../ops/ApprovalCard";
import { actOnBehalf, loadSessions, toast, useStore } from "../store";

const BLANK: SessionInfo = { model: "", backend: "local", persona: "padrão", ctxUsed: 0, ctxMax: 0, cost: 0 };

const SUGGESTIONS = [
  { icon: "brain", t: "O que você sabe sobre mim?", d: "Mostra a memória e o perfil que o Hermes guardou" },
  { icon: "calendar-clock", t: "Toda sexta às 18h, resuma minha semana", d: "Cria um agendamento recorrente" },
  { icon: "search", t: "Do que conversamos na última semana?", d: "Busca no histórico de sessões" },
  { icon: "sparkles", t: "Quais skills você tem?", d: "Lista o que o Hermes sabe fazer" },
];

const wide = () => window.innerWidth >= 1280;

export function Chat() {
  const { sid: param } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const sessions = useStore((s) => s.sessions);
  const [sid, setSid] = useState<string | null>(param ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [info, setInfo] = useState<SessionInfo>(BLANK);
  const [running, setRunning] = useState(false);
  const [insp, setInsp] = useState(wide);
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  // Sidebar/URL trocou de sessão: recarrega o histórico. Sem id = conversa nova.
  useEffect(() => {
    setSid(param ?? null);
    setMessages([]);
    setInfo(BLANK);
    let alive = true;
    chat
      .history(param ?? null)
      .then((h) => {
        if (!alive) return;
        setMessages(h.messages);
        setInfo(h.info);
      })
      .catch(() => toast("Não consegui abrir essa sessão"));
    return () => {
      alive = false;
    };
  }, [param]);

  useEffect(() => {
    chat.slashCommands().then(setCommands, () => {});
    const onResize = () => !wide() && setInsp(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  const updateLive = (f: (m: AgentMessage) => AgentMessage) =>
    setMessages((list) => list.map((m) => (m.role === "agent" && m.live ? f(m) : m)));

  async function send(text: string) {
    if (running) return;
    setRunning(true);
    try {
      const id = sid ?? (await chat.create());
      setSid(id);
      const now = Date.now();
      setMessages((list) => [...list, { id: "u" + now, role: "user", text }, { id: "a" + now, role: "agent", steps: [], text: "", live: true }]);
      await chat.send(id, text, (e) => {
        updateLive((m) => applyEvent(m, e));
        if (e.type === "done") {
          if (e.info) setInfo((i) => ({ ...i, ...e.info }));
          if (e.learned) toast("Aprendi algo novo · memória salva");
        }
        if (e.type === "error") toast(e.message);
      });
      loadSessions().catch(() => {});
    } catch {
      updateLive((m) => applyEvent(m, { type: "error", message: "Não consegui falar com o agente" }));
      toast("Não consegui falar com o agente");
    } finally {
      setRunning(false);
    }
  }

  // Aprovar um comando pedido no meio do turno é agir em seu nome: passa pelo kill switch e vira Atividade.
  const answeredIds = useRef(new Set<string>());
  async function answer(m: AgentMessage, choice: ApprovalChoice) {
    const a = m.approval;
    if (!a || a.status !== "pending" || answeredIds.current.has(a.id)) return;
    if (choice !== "deny") {
      const ok = await actOnBehalf({
        business: "all",
        kind: "cmd",
        action: "Executou na Conversa: " + a.command,
        why: "aprovado por você" + (a.description ? " — " + a.description : "") + ".",
        reversible: false,
        done: "Aprovado · executando",
        target: { kind: "approval", id: a.id },
      });
      if (!ok) return;
    }
    answeredIds.current.add(a.id);
    a.respond(choice);
    setMessages((list) => list.map((x) => (x.role === "agent" && x.id === m.id ? answered(x, choice) : x)));
    if (choice === "deny") toast("Negado — o Hermes não vai fazer isso");
  }

  async function pickModel(provider: string, model: string) {
    if (model === info.model) return;
    try {
      await chat.setModel(sid, provider, model);
    } catch (e) {
      return toast(e instanceof Error ? e.message : "Não consegui trocar o modelo");
    }
    setInfo((i) => ({ ...i, model }));
    toast(sid ? "Modelo desta conversa: " + model : "Modelo padrão: " + model);
  }

  async function stop() {
    if (sid) await chat.interrupt(sid).catch(() => {});
    updateLive(interrupted);
    setRunning(false);
  }

  const cur = sessions.find((s) => s.id === sid);
  const hour = new Date().getHours();
  const greet = [...(hour < 12 ? "Bom dia." : hour < 18 ? "Boa tarde." : "Boa noite.").split(" "), ..."O que vamos resolver hoje?".split(" ")];

  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <header style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 26px", minHeight: 60, borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 14.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cur?.title ?? "Nova conversa"}</span>
            <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              sessão {sid ?? "nova"} · {(cur?.source ?? "web").toLowerCase()} · {messages.length} mensagens
            </span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span className="au-chip">
              <Icon name="box" size={12} />
              {info.backend}
            </span>
            <span className="au-chip">
              <Icon name="drama" size={12} />
              persona: {info.persona}
            </span>
            <button className="au-iconbtn" title="Contexto" aria-label="Contexto" aria-pressed={insp} onClick={() => setInsp(!insp)}>
              <Icon name="panel-right" size={15} />
            </button>
          </div>
        </header>

        <div ref={scroller} style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          {messages.length === 0 && (
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "8vh 26px 24px", display: "flex", flexDirection: "column", gap: 28, animation: "hup .6s cubic-bezier(.2,.7,.2,1) both" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Orbit />
                <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)", letterSpacing: ".08em", textTransform: "uppercase", animation: "hblurin .7s .1s both" }}>
                  {info.model ? `modelo ${info.model}` : "seu agente"}{sessions.length ? ` · ${sessions.length} conversas recentes` : ""}
                </span>
                <h1 className="au-display" style={{ margin: 0, fontSize: "calc(var(--h1) * 1.3)", lineHeight: 1.04, display: "flex", flexWrap: "wrap", columnGap: ".24em" }}>
                  {greet.map((w, i) => {
                    const it = i >= greet.length - 5;
                    return (
                      <span key={i} style={{ display: "inline-block", color: it ? "var(--acc)" : "var(--fg)", fontStyle: it ? "italic" : "normal", animation: "hblurin .9s cubic-bezier(.2,.7,.2,1) both", animationDelay: 150 + i * 85 + "ms" }}>
                        {w}
                      </span>
                    );
                  })}
                </h1>
                <p style={{ margin: 0, color: "var(--fg2)", fontSize: 15, lineHeight: 1.55, animation: "hblurin .8s .75s both" }}>
                  Peça algo, mande executar uma tarefa ou digite / para ver os comandos. Por onde começamos?
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 10 }}>
                {SUGGESTIONS.map((sg, i) => (
                  <button key={sg.t} className="au-card au-suggest" onMouseMove={spot} onClick={() => send(sg.t)} style={{ animationDelay: (i + 2) * 45 + "ms" }}>
                    <Icon name={sg.icon} size={16} color="var(--acc)" />
                    <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 500 }}>{sg.t}</span>
                      <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.45 }}>{sg.d}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ maxWidth: 780, margin: "0 auto", padding: "30px 26px 28px", display: "flex", flexDirection: "column", gap: 30 }}>
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} style={{ display: "flex", justifyContent: "flex-end", animation: "hblurin .6s cubic-bezier(.2,.7,.2,1) both" }}>
                  <div style={{ maxWidth: "80%", padding: "12px 16px", borderRadius: "var(--r) var(--r) 4px var(--r)", background: "var(--panel2)", fontSize: 14.5, lineHeight: 1.55, textWrap: "pretty", whiteSpace: "pre-wrap" }}>{m.text}</div>
                </div>
              ) : (
                <AgentBubble key={m.id} m={m} onSend={send} onCron={() => navigate("/cron")} onAnswer={(c) => answer(m, c)} />
              ),
            )}
          </div>
        </div>

        <Composer running={running} model={info.model || "sem modelo"} commands={commands} onSend={send} onStop={stop} onPickModel={pickModel} initialDraft={search.get("q") ?? ""} />
      </div>
      {insp && <ContextPanel info={info} onCompress={() => send("/compress")} />}
    </div>
  );
}

export function Orbit() {
  return (
    <div aria-hidden="true" style={{ position: "relative", width: 92, height: 92, marginBottom: 8, animation: "hpop .9s cubic-bezier(.3,1.4,.5,1) both" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1px solid var(--line2)" }} />
      <div style={{ position: "absolute", inset: 13, borderRadius: "50%", border: "1px dashed var(--line2)", animation: "hring 40s linear infinite reverse" }} />
      <div style={{ position: "absolute", inset: 0, animation: "hring 7s linear infinite" }}>
        <span style={{ position: "absolute", top: -3, left: "calc(50% - 3px)", width: 6, height: 6, borderRadius: "50%", background: "var(--acc)", boxShadow: "0 0 14px var(--acc)" }} />
      </div>
      <div style={{ position: "absolute", inset: 13, animation: "hring 11s linear infinite reverse" }}>
        <span style={{ position: "absolute", bottom: -2, left: "calc(50% - 2px)", width: 4, height: 4, borderRadius: "50%", background: "var(--acc)", opacity: 0.7 }} />
      </div>
      <div style={{ position: "absolute", inset: 29, borderRadius: "50%", background: "var(--acc)", color: "var(--accFg)", display: "grid", placeItems: "center", fontSize: 17, animation: "hglow 3.6s ease-in-out infinite" }}>☤</div>
    </div>
  );
}

function AgentBubble({ m, onSend, onCron, onAnswer }: { m: AgentMessage; onSend: (t: string) => void; onCron: () => void; onAnswer: (c: ApprovalChoice) => void }) {
  const running = m.steps.some((s) => s.status === "run");
  const paras = m.text ? m.text.split(/\n{2,}/) : [];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "30px minmax(0,1fr)", gap: 14, animation: "hblurin .7s cubic-bezier(.2,.7,.2,1) both" }}>
      <div aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "var(--r2)", background: "var(--accSoft)", color: "var(--acc)", display: "grid", placeItems: "center", fontSize: 15 }}>☤</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0, paddingTop: 4 }} aria-live={m.live ? "polite" : undefined}>
        {m.steps.length > 0 && <ToolTimeline steps={m.steps} meta={m.meta} />}
        {m.approval?.status === "pending" && (
          <ApprovalCard
            icon="square-terminal"
            title={m.approval.description || "Executar comando"}
            meta="comando · agora"
            preview={m.approval.command}
            source="pedido nesta conversa"
            onApprove={() => onAnswer("once")}
            onDeny={() => onAnswer("deny")}
            extra={
              m.approval.choices.includes("session") && (
                <button className="au-outline" onClick={() => onAnswer("session")}>
                  Nesta sessão
                </button>
              )
            }
          />
        )}
        {m.approval && m.approval.status !== "pending" && (
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--fm)", fontSize: 11.5, color: m.approval.status === "approved" ? "var(--ok)" : "var(--fg3)" }}>
            <Icon name={m.approval.status === "approved" ? "circle-check" : "circle"} size={12} />
            {m.approval.status === "approved" ? "aprovado por você" : m.approval.status === "denied" ? "negado por você" : "pedido expirou"} · {m.approval.command}
          </span>
        )}
        {m.live && !running && !m.text && m.approval?.status !== "pending" && (
          <div role="status" aria-label="Pensando" style={{ display: "flex", gap: 5, padding: "6px 0" }}>
            {[0, 1, 2].map((d) => (
              <span key={d} className="au-live-dot" />
            ))}
          </div>
        )}
        {/* ponytail: parágrafos com quebras preservadas; markdown completo quando o Markdown ganhar estilos Aurora */}
        {paras.map((p, i) => (
          <p key={i} style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: "var(--fg)", textWrap: "pretty", whiteSpace: "pre-wrap" }}>
            {p}
            {i === paras.length - 1 && m.live && !running && m.approval?.status !== "pending" && <span className="au-caret" aria-hidden="true" />}
          </p>
        ))}
        {m.blocks?.map((b, i) => <BlockView key={i} b={b} onCron={onCron} />)}
        {m.meta && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>
            <span>{m.meta}</span>
            <span style={{ display: "flex", gap: 4 }}>
              <button className="au-mini" title="Copiar" aria-label="Copiar" onClick={() => navigator.clipboard.writeText(m.text).then(() => toast("Copiado"), () => {})}>
                <Icon name="copy" size={12} />
              </button>
              <button className="au-mini" title="/retry" aria-label="Refazer" onClick={() => onSend("/retry")}>
                <Icon name="rotate-ccw" size={12} />
              </button>
              <button className="au-mini" title="/undo" aria-label="Desfazer" onClick={() => onSend("/undo")}>
                <Icon name="undo-2" size={12} />
              </button>
            </span>
            {m.learned && (
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, color: "var(--ok)", animation: "hpop .7s .2s cubic-bezier(.3,1.5,.5,1) both" }}>
                <Icon name="sparkles" size={11} />
                {m.learned}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BlockView({ b, onCron }: { b: Block; onCron: () => void }) {
  if (b.kind === "cron")
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: "var(--r)", background: "var(--accSoft)", border: "1px solid var(--line)" }}>
        <div style={{ width: 38, height: 38, borderRadius: "var(--r2)", background: "var(--acc)", color: "var(--accFg)", display: "grid", placeItems: "center" }}>
          <Icon name="calendar-clock" size={17} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{b.title}</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg2)" }}>{b.detail}</span>
        </div>
        <button className="au-btn" onClick={onCron} style={{ marginLeft: "auto" }}>
          Ver agendamento
        </button>
      </div>
    );
  return (
    <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--panel)", backdropFilter: "var(--blur)", overflow: "hidden" }}>
      {b.items.map((pr, i) => {
        const c = `var(--${pr.tone})`;
        return (
          <div key={pr.n} style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto", gap: 12, alignItems: "start", padding: "13px 16px", borderBottom: "1px solid var(--line)", animation: "hup .4s cubic-bezier(.2,.7,.2,1) both", animationDelay: i * 45 + "ms" }}>
            <span style={{ fontFamily: "var(--fm)", fontSize: 12, color: "var(--fg3)", paddingTop: 1 }}>#{pr.n}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{pr.title}</span>
              <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5 }}>{pr.note}</span>
            </div>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--fm)", fontSize: 10.5, padding: "3px 9px", borderRadius: 999, color: c, border: `1px solid ${c}`, whiteSpace: "nowrap" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: c }} />
              {pr.tag}
            </span>
          </div>
        );
      })}
    </div>
  );
}
