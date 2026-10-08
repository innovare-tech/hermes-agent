// Avisos (A4): para qual tópico do grupo da equipe cada aviso vai, quando ficar em silêncio e quem é chamado.
// Dados reais de /api/notify (Telegram do perfil, rotas e teste); nada fixo. Fica em Configurações › Avisos.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ApiError } from "@/lib/api-error";
import { Icon } from "../Icon";
import { colorOf, initial } from "../analyses/api";
import {
  ANALYSIS_LEVELS,
  DAY_LETTERS,
  INFRA_LEVELS,
  changesLabel,
  countChanges,
  daysHint,
  matchPeople,
  mentionLine,
  missingDefaults,
  notifyApi,
  quietLabel,
  shiftTime,
  testLabel,
  topicInfo,
  topicOptions,
  type Kind,
  type Level,
  type Routes,
  type Row,
  type TestResult,
  type TgMember,
  type TgState,
  type TopicInfo,
  type TopicRef,
} from "../notify/api";
import { NIcon } from "../notify/icons";
import "../notify/notify.css";
import { ask, toast, useStore } from "../store";
import { useCurrentProfile } from "../ProfileChrome";

type Load = "loading" | "ready" | "error";
type Test = { st: "sending" } | { st: "done"; r: TestResult } | { st: "failed"; message: string };

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Fecha popovers com Esc ou clique fora de qualquer `[data-nt-dd]`. */
function useDropdowns(open: string | null, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    const down = (e: MouseEvent) => !(e.target as Element).closest?.("[data-nt-dd]") && close();
    window.addEventListener("keydown", key);
    document.addEventListener("mousedown", down);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", down);
    };
  }, [open, close]);
}

function Dot({ t, size }: { t: Pick<TopicInfo, "color" | "icon">; size: number }) {
  return (
    <span className="nt-dot" style={{ width: size, height: size, background: t.color }}>
      <NIcon name={t.icon} size={Math.round(size / 2)} />
    </span>
  );
}

// ---------------------------------------------------------------- estados

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando os avisos" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 380px", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="nt-skel" style={{ height: 74 }} />
        {[1, 2, 3].map((k) => (
          <div key={k} className="nt-skel" style={{ height: 150 }} />
        ))}
      </div>
      <div className="nt-skel" style={{ height: 460, animation: "none", background: "var(--panel)" }} />
    </div>
  );
}

function NoTelegram({ tg, onConnected }: { tg: TgState; onConnected: () => void }) {
  const navigate = useNavigate();
  const noChat = tg.status === "no_chat";
  const [chatId, setChatId] = useState("");
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    try {
      await notifyApi.setChat(chatId.trim());
      toast("Grupo conectado");
      onConnected();
    } catch (e) {
      toast(errText(e, "Não consegui conectar o grupo"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="au-card" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 28, alignItems: "center", padding: 36, border: "1px dashed var(--line2)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
        <span style={{ width: 52, height: 52, borderRadius: 15, display: "grid", placeItems: "center", background: "color-mix(in oklab,#2f8fd6 18%,transparent)", color: "#4aa3e8" }}>
          <Icon name="send" size={23} />
        </span>
        <span style={{ fontFamily: "var(--fd)", fontWeight: 600, letterSpacing: "-.02em", fontSize: 24 }}>{noChat ? "Falta escolher o grupo da equipe" : "O Telegram ainda não está conectado"}</span>
        <span style={{ fontSize: 14, color: "var(--fg2)", lineHeight: 1.6, maxWidth: 480, textWrap: "pretty" }}>
          {noChat
            ? "O bot está conectado, mas o Hermes ainda não sabe em qual supergrupo avisar. Informe o ID do grupo (começa com -100…); ele só é lido, nada é enviado agora."
            : "Sem ele, o Hermes analisa os grupos mas não tem onde avisar a equipe; os avisos ficam só em Análises dos grupos. Conecte o bot em Gateways e adicione-o ao supergrupo da equipe."}
        </span>
        {noChat ? (
          <>
            <div style={{ display: "flex", gap: 8, alignSelf: "stretch", maxWidth: 440 }}>
              <input className="nt-input" style={{ flex: 1 }} aria-label="ID do grupo" placeholder="-1001234567890" value={chatId} onChange={(e) => setChatId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && chatId.trim() && !busy && connect()} />
              <button className="au-primary" disabled={!chatId.trim() || busy} onClick={connect}>
                <Icon name={busy ? "loader-circle" : "plug"} size={14} className={busy ? "au-spin" : undefined} />
                {busy ? "Conectando…" : "Conectar grupo"}
              </button>
            </div>
            <span style={{ fontSize: 12.5, color: "var(--fg3)", lineHeight: 1.5, maxWidth: 440 }}>Dica: no Telegram Web, abra o grupo; o número depois do # na barra do endereço é o ID.</span>
          </>
        ) : (
          <>
            <ol style={{ margin: "4px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>
              <li>Em Gateways, conecte o Telegram com o código do bot.</li>
              <li>Adicione o bot ao supergrupo e dê permissão de administrador (para postar nos tópicos).</li>
              <li>Volte aqui: os tópicos aparecem sozinhos.</li>
            </ol>
            <button className="au-primary" style={{ marginTop: 8, padding: "10px 16px", fontSize: 13.5 }} onClick={() => navigate("/gateways")}>
              <Icon name="plug" size={14} />
              Conectar em Gateways
            </button>
          </>
        )}
      </div>
      <div aria-hidden="true" style={{ height: 240, borderRadius: "var(--r2)", background: "var(--tgBg)", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8, padding: 16, opacity: 0.55 }}>
        <div style={{ alignSelf: "flex-start", width: "70%", height: 42, borderRadius: 12, background: "var(--tgBub)" }} />
        <div style={{ alignSelf: "flex-start", width: "85%", height: 64, borderRadius: 12, background: "var(--tgBub)" }} />
        <div style={{ alignSelf: "center", fontSize: 12, color: "var(--tgFg2)" }}>Os avisos aparecem aqui</div>
      </div>
    </div>
  );
}

function ErrorCard({ detail, onRetry }: { detail?: string; onRetry: () => void }) {
  const navigate = useNavigate();
  return (
    <div role="alert" className="au-card" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, padding: 28, borderColor: "color-mix(in oklab,var(--err) 35%,transparent)" }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "color-mix(in oklab,var(--err) 14%,transparent)", color: "var(--err)" }}>
        <Icon name="cloud-off" size={19} />
      </span>
      <span style={{ fontSize: 16, fontWeight: 600 }}>Não consegui ler os tópicos do grupo</span>
      <span style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.55, maxWidth: 600 }}>O Telegram não respondeu. Os avisos continuam indo para os destinos que já estavam salvos; só não dá para mudar agora.</span>
      {detail && <span style={{ fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg3)", maxWidth: 600 }}>{detail}</span>}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button className="au-primary" onClick={onRetry}>
          <Icon name="rotate-cw" size={14} />
          Tentar de novo
        </button>
        <button className="au-outline" onClick={() => navigate("/gateways")}>
          Abrir Gateways
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- grupo conectado

function GroupCard({ tg, refreshing, onRefresh, onCreate }: { tg: TgState; refreshing: boolean; onRefresh: () => void; onCreate: () => void }) {
  const chat = tg.chat!;
  const missing = chat.isForum ? missingDefaults(tg.topics) : [];
  const words = chat.title.split(/\s+/).filter(Boolean);
  const initials = ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "G";
  const bot = tg.bot?.username ? "@" + tg.bot.username : "O bot";
  return (
    <div className="au-card" style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <span style={{ width: 42, height: 42, flex: "none", borderRadius: "50%", background: "linear-gradient(135deg,#ff9f7a,#f48fd0)", color: "#0c0e16", display: "grid", placeItems: "center", fontFamily: "var(--fd)", fontWeight: 600, fontSize: 17 }}>{initials}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 600 }}>
            {chat.title}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "1px 8px", borderRadius: 999, background: "color-mix(in oklab,var(--ok) 14%,transparent)", color: "var(--ok)", fontSize: 11, fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ok)" }} />
              Conectado
            </span>
          </span>
          <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>
            {chat.isForum ? "Supergrupo com tópicos" : "Grupo sem tópicos"} · {chat.members} {chat.members === 1 ? "pessoa" : "pessoas"} · <span style={{ fontFamily: "var(--fm)", fontSize: 11.5 }}>{bot}</span>{" "}
            {chat.botIsAdmin ? "é administrador" : <span style={{ color: "var(--warn)" }}>ainda não é administrador</span>}
          </span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
          {tg.topics.map((t) => (
            <span key={t.threadId} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, border: "1px solid var(--line2)", fontSize: 12 }}>
              <Dot t={{ color: t.color, icon: t.icon || "hash" }} size={16} />
              {t.name}
            </span>
          ))}
          <button className="nt-ibtn" title="Buscar tópicos de novo" aria-label="Buscar tópicos de novo" disabled={refreshing} onClick={onRefresh}>
            <NIcon name={refreshing ? "loader-circle" : "refresh-cw"} size={13} className={refreshing ? "au-spin" : undefined} />
          </button>
        </div>
      </div>
      {!chat.botIsAdmin && (
        <span role="status" style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: "var(--warn)", lineHeight: 1.5 }}>
          <Icon name="triangle-alert" size={14} className="nt-mt2" />
          Sem ser administrador, o bot não consegue postar nos tópicos. No Telegram, abra Gerenciar grupo › Administradores e adicione {bot}.
        </span>
      )}
      {!chat.isForum && (
        <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5 }}>Este grupo não tem tópicos: tudo chega em Geral. Para separar os avisos, ative Tópicos nas configurações do grupo no Telegram.</span>
      )}
      {chat.isForum && (
        <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12.5, color: "var(--fg3)", lineHeight: 1.5 }}>
          <span>O Telegram não deixa o bot listar os tópicos do grupo: aqui aparecem os que o Hermes criou.</span>
          {missing.length > 0 && (
            <button className="nt-link-btn" disabled={!chat.canManageTopics} title={chat.canManageTopics ? undefined : "O bot precisa da permissão de gerenciar tópicos"} onClick={onCreate}>
              Criar {missing.length === 1 ? "o tópico que falta" : `os ${missing.length} tópicos que faltam`} ({missing.join(", ")})
            </button>
          )}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- linhas, menções, resumo

function TopicSelect({ id, value, options, topics, open, setOpen, onPick }: { id: string; value: TopicRef; options: TopicInfo[]; topics: TgState["topics"]; open: boolean; setOpen: (k: string | null) => void; onPick: (v: TopicRef) => void }) {
  const cur = topicInfo(value, topics);
  return (
    <div data-nt-dd style={{ position: "relative", minWidth: 0 }}>
      <button className="nt-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(open ? null : id)}>
        <Dot t={cur} size={22} />
        <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: value === "off" ? "var(--fg3)" : "var(--fg)" }}>{cur.name}</span>
        <Icon name="chevron-down" size={13} color="var(--fg3)" />
      </button>
      {open && (
        <div role="listbox" aria-label="Tópico" className="nt-pop">
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button key={o.id} role="option" aria-selected={on} className="nt-opt" onClick={() => onPick(o.value)}>
                <Dot t={o} size={24} />
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{o.name}</span>
                  <span style={{ fontSize: 11, color: "var(--fg3)" }}>{o.sub}</span>
                </span>
                {on && <Icon name="check" size={14} color="var(--acc)" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LevelRow({ level, row, q, open, setOpen, options, topics, dd, onChange }: { level: Level; row: Row; q: Routes["quietHours"]; open: boolean; setOpen: (k: string | null) => void; options: TopicInfo[]; topics: TgState["topics"]; dd: string; onChange: (r: Row) => void }) {
  const critical = level.key === "critical";
  const off = row.topic === "off";
  const disabled = critical || off;
  return (
    <div className="nt-cols" style={{ position: "relative", zIndex: open ? 20 : undefined, padding: "10px 18px", borderTop: "1px solid var(--line)" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500 }}>
        <NIcon name={level.icon} size={14} color={level.color} />
        {level.label}
      </span>
      <TopicSelect id={dd} value={row.topic} options={options} topics={topics} open={open} setOpen={setOpen} onPick={(v) => { onChange({ ...row, topic: v }); setOpen(null); }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          className="nt-switch"
          role="switch"
          aria-checked={critical ? false : row.quiet}
          aria-label={`Horário de silêncio · ${level.label}`}
          disabled={disabled}
          title={critical ? "Crítico nunca fica em silêncio" : off ? "Este aviso não é enviado, então não há o que segurar" : undefined}
          onClick={() => onChange({ ...row, quiet: !row.quiet })}
        >
          <span />
        </button>
        <span style={{ fontSize: 11.5, lineHeight: 1.3, color: critical ? "var(--err)" : "var(--fg2)" }}>{quietLabel(row, critical, q)}</span>
      </div>
    </div>
  );
}

function Person({ m, onRemove }: { m: TgMember | { id: number; name: string; username: null }; onRemove: () => void }) {
  return (
    <span className="nt-chip">
      <span style={{ width: 22, height: 22, borderRadius: "50%", background: colorOf(m.name), color: "#0c0e16", display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 700 }}>{initial(m.name)}</span>
      {m.name}
      {m.username && <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>@{m.username}</span>}
      <button title="Remover" aria-label={`Remover ${m.name}`} onClick={onRemove}>
        <Icon name="x" size={11} />
      </button>
    </span>
  );
}

function Mentions({ head, ids, members, open, setOpen, dd, q, setQ, onChange }: { head: string; ids: number[]; members: TgMember[]; open: boolean; setOpen: (k: string | null) => void; dd: string; q: string; setQ: (q: string) => void; onChange: (ids: number[]) => void }) {
  const avail = matchPeople(members, ids, q);
  return (
    <div style={{ position: "relative", zIndex: open ? 20 : undefined, display: "flex", flexDirection: "column", gap: 10, padding: "14px 18px", borderTop: "1px solid var(--line)", background: "color-mix(in oklab,var(--err) 5%,transparent)", borderRadius: "0 0 var(--r) var(--r)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Icon name="at-sign" size={15} color="var(--err)" />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{head}</span>
        <span style={{ fontSize: 12, color: "var(--fg2)" }}>· eles recebem notificação mesmo com o grupo silenciado</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {ids.map((id) => {
          const m = members.find((x) => x.id === id) ?? { id, name: `Usuário ${id}`, username: null };
          return <Person key={id} m={m} onRemove={() => onChange(ids.filter((x) => x !== id))} />;
        })}
        {ids.length === 0 && <span style={{ fontSize: 12.5, color: "var(--warn)" }}>Ninguém será chamado. O aviso crítico chega sem notificação.</span>}
        <div data-nt-dd style={{ position: "relative" }}>
          <button className="nt-add" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setQ(""); setOpen(open ? null : dd); }}>
            <Icon name="plus" size={12} />
            Adicionar pessoa
          </button>
          {open && (
            <div className="nt-pop" style={{ top: 34, padding: 0, gap: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
                <Icon name="search" size={14} color="var(--fg3)" />
                <input autoFocus aria-label="Buscar pessoa" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou @usuário" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 13 }} />
              </div>
              <div style={{ maxHeight: 220, overflow: "auto", padding: 6, display: "flex", flexDirection: "column", gap: 1 }}>
                {avail.map((p) => (
                  <button key={p.id} className="nt-opt" style={{ padding: "7px 9px" }} onClick={() => { onChange([...ids, p.id]); setOpen(null); }}>
                    <span style={{ width: 26, height: 26, borderRadius: "50%", background: colorOf(p.name), color: "#0c0e16", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{initial(p.name)}</span>
                    <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                      <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>
                        {p.username ? "@" + p.username : "sem @usuário"} · {p.role}
                      </span>
                    </span>
                  </button>
                ))}
                {avail.length === 0 && <span style={{ padding: 10, fontSize: 12.5, color: "var(--fg2)" }}>{q.trim() ? `Ninguém no grupo com “${q}”.` : "Todo mundo que o Hermes enxerga já está marcado."}</span>}
              </div>
              <div style={{ padding: "8px 12px", borderTop: "1px solid var(--line)", fontSize: 11.5, color: "var(--fg3)", lineHeight: 1.45 }}>A lista mostra os administradores do grupo. O Telegram não deixa o bot ver os outros membros.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DigestBar({ d, onChange }: { d: Routes["digest"]; onChange: (d: Routes["digest"]) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
      <span style={{ fontSize: 13 }}>Enviar às</span>
      <div className="nt-step">
        <button title="30 min antes" aria-label="30 minutos antes" onClick={() => onChange({ ...d, time: shiftTime(d.time, -30) })}>
          <Icon name="minus" size={13} />
        </button>
        <span>{d.time}</span>
        <button title="30 min depois" aria-label="30 minutos depois" onClick={() => onChange({ ...d, time: shiftTime(d.time, 30) })}>
          <Icon name="plus" size={13} />
        </button>
      </div>
      <div role="group" aria-label="Dias da semana" style={{ display: "flex", gap: 3, padding: 3, borderRadius: 10, background: "var(--panel2)" }}>
        {DAY_LETTERS.map((l, i) => {
          const on = d.days.includes(i);
          return (
            <button key={i} className="nt-day" aria-pressed={on} onClick={() => onChange({ ...d, days: on ? d.days.filter((x) => x !== i) : [...d.days, i].sort() })}>
              {l}
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: 12, color: "var(--fg3)" }}>{daysHint(d.days)}</span>
    </div>
  );
}

function TestFooter({ t, hint, onTest }: { t?: Test; hint: string; onTest: () => void }) {
  const sending = t?.st === "sending";
  const ok = t?.st === "done" && t.r.ok;
  const label = t?.st === "done" ? testLabel(t.r) : t?.st === "failed" ? t.message : "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 18px", borderTop: "1px solid var(--line)" }}>
      <button className="nt-test" disabled={sending} onClick={onTest}>
        <NIcon name={sending ? "loader-circle" : "send"} size={13} className={sending ? "au-spin" : undefined} />
        {sending ? "Enviando…" : "Enviar teste"}
      </button>
      {label && (
        <>
          <span role="status" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: ok ? "var(--ok)" : "var(--err)", minWidth: 0 }}>
            <NIcon name={ok ? "circle-check" : "circle-x"} size={14} />
            <span style={{ minWidth: 0 }}>{label}</span>
          </span>
          {t?.st === "done" && t.r.ok && t.r.messageUrl && (
            <a href={t.r.messageUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
              Abrir no Telegram
            </a>
          )}
        </>
      )}
      <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--fg3)", whiteSpace: "nowrap" }}>{hint}</span>
    </div>
  );
}

// ---------------------------------------------------------------- pré-visualização

const PV: Record<Kind, { title: string; lines: { t: string; c: string }[]; link: string; time: string }> = {
  analyses: {
    title: "🔴 Urgência crítica · Bug",
    lines: [
      { t: "Auto Center Rota · Rota | Suporte Aibiz", c: "var(--tgFg2)" },
      { t: "Clientes pararam de receber a confirmação de agendamento desde as 8h. 37 mensagens recusadas pelo WhatsApp.", c: "var(--tgFg)" },
      { t: "Hipótese: modelo v2 reprovado pela Meta às 07:51.", c: "var(--tgFg)" },
    ],
    link: "A-2381 · veja em Análises no painel",
    time: "09:30",
  },
  infra: {
    title: "🔴 Infra crítica · Gateway WhatsApp",
    lines: [
      { t: "O gateway parou de responder às 09:12.", c: "var(--tgFg)" },
      { t: "23 mensagens de clientes esperando na fila. Reiniciei uma vez, sem sucesso.", c: "var(--tgFg)" },
    ],
    link: "Abrir registros no painel",
    time: "09:14",
  },
  digest: {
    title: "☀️ Resumo de ontem",
    lines: [
      { t: "• 23 análises (1 crítica, 4 altas), 19 resolvidas", c: "var(--tgFg)" },
      { t: "• Abertas (4): Padaria Sol, Pet Feliz, Studio Mova, Clínica Bem Viver", c: "var(--tgFg)" },
      { t: "• 142 mensagens sociais ignoradas", c: "var(--tgFg2)" },
    ],
    link: "Abrir o painel",
    time: "",
  },
};

function Preview({ kind, setKind, cfg, tg }: { kind: Kind; setKind: (k: Kind) => void; cfg: Routes; tg: TgState }) {
  const profile = useCurrentProfile();
  const topic = kind === "digest" ? cfg.digest.topic : kind === "analyses" ? cfg.analyses.critical.topic : cfg.infra.critical.topic;
  const t = topicInfo(topic, tg.topics);
  const off = topic === "off";
  const ids = kind === "digest" ? [] : cfg[kind].mentions;
  const p = PV[kind];
  const time = kind === "digest" ? cfg.digest.time : p.time;
  const title = kind === "digest" ? `${p.title} · ${cfg.digest.time}` : p.title;
  const note = off
    ? "Este aviso está como “Não enviar”: ele fica só no painel."
    : kind === "digest"
      ? `Chega no tópico ${t.name} às ${cfg.digest.time}${cfg.digest.days.length ? "" : " (nenhum dia marcado)"}.`
      : `Chega no tópico ${t.name}${ids.length ? `, chamando ${ids.length} ${ids.length === 1 ? "pessoa" : "pessoas"}` : " sem chamar ninguém"}.`;
  const tabs: [Kind, string][] = [["analyses", "Análise"], ["infra", "Infra"], ["digest", "Resumo"]];
  return (
    <aside style={{ position: "sticky", top: 0, display: "flex", flexDirection: "column", gap: 10 }} aria-label="Pré-visualização">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="au-label">Pré-visualização</span>
        <div role="tablist" aria-label="Tipo de aviso" style={{ marginLeft: "auto", display: "flex", gap: 3, padding: 3, borderRadius: 10, background: "var(--panel2)" }}>
          {tabs.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)} style={{ padding: "4px 9px", borderRadius: 7, border: 0, background: kind === k ? "var(--pop)" : "transparent", color: kind === k ? "var(--fg)" : "var(--fg2)", fontSize: 11.5, fontWeight: 500, cursor: "pointer", boxShadow: kind === k ? "0 2px 8px rgba(0,0,0,.15)" : "none" }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div style={{ borderRadius: "var(--r)", overflow: "hidden", border: "1px solid var(--line2)", boxShadow: "var(--shadow)", background: "var(--tgBg)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--tgBub)", borderBottom: "1px solid rgba(0,0,0,.15)" }}>
          <NIcon name="arrow-left" size={16} color="var(--tgFg2)" />
          <Dot t={off ? { color: "#555c70", icon: "bell-off" } : t} size={32} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--tgFg)" }}>{off ? "Não enviado" : t.name}</span>
            <span style={{ fontSize: 11.5, color: "var(--tgFg2)" }}>{tg.chat?.title}{tg.chat?.isForum ? " · tópico" : ""}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "16px 12px 14px", minHeight: 400, justifyContent: "flex-end" }}>
          <div style={{ alignSelf: "center", padding: "3px 10px", borderRadius: 999, background: "rgba(0,0,0,.25)", color: "#fff", fontSize: 11.5 }}>Hoje</div>
          <div key={kind + String(topic)} className="nt-bubble" style={{ alignSelf: "flex-start", maxWidth: "94%", display: "flex", gap: 8, alignItems: "flex-end" }}>
            <span style={{ width: 30, height: 30, flex: "none", borderRadius: "50%", background: "linear-gradient(135deg,#ff9f7a,#f48fd0)", display: "grid", placeItems: "center", color: "#0c0e16" }}>
              <Icon name="sparkles" size={14} />
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 11px 6px", borderRadius: "14px 14px 14px 4px", background: "var(--tgBub)", color: "var(--tgFg)", fontSize: 13.5, lineHeight: 1.45, boxShadow: "0 1px 1px rgba(0,0,0,.15)" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#e1834f" }}>Hermes{profile ? ` · ${profile.name}` : ""}</span>
              <span style={{ fontWeight: 600 }}>{title}</span>
              {p.lines.map((ln, i) => (
                <span key={i} style={{ color: ln.c }}>{ln.t}</span>
              ))}
              {ids.length > 0 && <span style={{ color: "var(--tgLink)" }}>{mentionLine(ids, tg.members)}</span>}
              <span style={{ color: "var(--tgLink)" }}>{p.link}</span>
              <span style={{ alignSelf: "flex-end", fontSize: 11, color: "var(--tgFg2)" }}>{time}</span>
            </div>
          </div>
        </div>
      </div>
      <span style={{ fontSize: 12, color: "var(--fg3)", lineHeight: 1.5 }}>{note} Exemplo ilustrativo do formato.</span>
    </aside>
  );
}

// ---------------------------------------------------------------- tela

const HINTS: Record<Kind, string> = { analyses: "Manda um exemplo de urgência crítica", infra: "Manda um exemplo de alerta crítico", digest: "Manda um exemplo do resumo" };

export function Notify() {
  const [tg, setTg] = useState<TgState | null>(null);
  const [saved, setSaved] = useState<Routes | null>(null);
  const [cfg, setCfg] = useState<Routes | null>(null);
  const [load, setLoad] = useState<Load>("loading");
  const [dd, setDd] = useState<string | null>(null);
  const [pq, setPq] = useState("");
  const [pv, setPv] = useState<Kind>("analyses");
  const [tests, setTests] = useState<Partial<Record<Kind, Test>>>({});
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  const profileId = useStore((s) => s.profileId);

  const closeDd = useCallback(() => setDd(null), []);
  useDropdowns(dd, closeDd);

  const fetchAll = useCallback(async () => {
    setLoad("loading");
    try {
      const [t, r] = await Promise.all([notifyApi.telegram(), notifyApi.routes()]);
      if (!alive.current) return;
      setTg(t);
      setSaved(r);
      setCfg(r);
      setLoad(t.status === "error" ? "error" : "ready");
    } catch (e) {
      if (!alive.current) return;
      setTg(null);
      setLoad("error");
      toast(errText(e, "Não consegui ler os avisos"));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    fetchAll();
    return () => {
      alive.current = false;
    };
    // o perfil é parte da identidade da tela (as rotas remontam ao trocar de perfil)
  }, [fetchAll, profileId]);

  const set = (fn: (c: Routes) => void) =>
    setCfg((cur) => {
      if (!cur) return cur;
      const c = structuredClone(cur);
      fn(c);
      return c;
    });

  if (load === "loading" || !cfg || !saved) {
    if (load === "error") return <ErrorCard detail={tg?.error?.message} onRetry={fetchAll} />;
    return <Skeleton />;
  }
  if (load === "error" || !tg) return <ErrorCard detail={tg?.error?.message} onRetry={fetchAll} />;
  if (tg.status !== "ok" || !tg.chat) return <NoTelegram tg={tg} onConnected={fetchAll} />;

  const chat = tg.chat;
  const options = topicOptions(tg.topics, chat.isForum);
  const changes = countChanges(cfg, saved);

  const refresh = async (create: boolean) => {
    setRefreshing(true);
    try {
      const next = await notifyApi.refreshTopics(create);
      setTg(next);
      toast(create ? "Tópicos criados" : "Tópicos atualizados", { sub: next.topics.length ? `${next.topics.length} ${next.topics.length === 1 ? "tópico conhecido" : "tópicos conhecidos"} no grupo.` : "Nenhum tópico criado pelo Hermes ainda." });
    } catch (e) {
      toast(errText(e, "Não consegui atualizar os tópicos"));
    } finally {
      setRefreshing(false);
    }
  };
  const createMissing = async () => {
    const miss = missingDefaults(tg.topics);
    if (await ask({ title: `Criar ${miss.length === 1 ? "1 tópico" : `${miss.length} tópicos`} no grupo?`, body: `O Hermes vai criar no Telegram: ${miss.join(", ")}.`, confirm: "Criar tópicos" })) refresh(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const next = await notifyApi.saveRoutes({ ...cfg, chatId: cfg.chatId ?? tg.chatId });
      setSaved(next);
      setCfg(next);
      toast("Destinos salvos", { sub: "Os próximos avisos já seguem a nova configuração." });
    } catch (e) {
      toast(errText(e, "Não consegui salvar os destinos"));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async (kind: Kind) => {
    if (tests[kind]?.st === "sending") return;
    setPv(kind);
    setTests((t) => ({ ...t, [kind]: { st: "sending" } }));
    try {
      const r = await notifyApi.test(kind, cfg);
      if (alive.current) setTests((t) => ({ ...t, [kind]: { st: "done", r } }));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Não consegui falar com o painel. Tente de novo.";
      if (alive.current) setTests((t) => ({ ...t, [kind]: { st: "failed", message: msg } }));
    }
  };

  const section = (kind: Kind, ico: string, color: string, soft: string, title: string, sub: string, body: ReactNode, levelHead: string, rows: ReactNode) => {
    const active = pv === kind;
    return (
      <section key={kind} className="nt-section" data-active={active} style={{ zIndex: dd && (dd.startsWith(kind + ":") || dd === "p:" + kind) ? 30 : undefined }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px 12px" }}>
          <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, background: soft, color, display: "grid", placeItems: "center" }}>
            <NIcon name={ico} size={16} />
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
            <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>{sub}</span>
          </div>
          <button onClick={() => setPv(kind)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 9, border: `1px solid ${active ? "var(--acc)" : "var(--line2)"}`, background: active ? "var(--accSoft)" : "transparent", color: "var(--fg)", fontSize: 12, cursor: "pointer" }}>
            <Icon name="eye" size={13} />
            {active ? "Na pré-visualização" : "Pré-visualizar"}
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--line)" }}>
          <div className="nt-cols au-label" style={{ padding: "9px 18px" }}>
            <span>{levelHead}</span>
            <span>Tópico</span>
            <span>Horário de silêncio</span>
          </div>
          {rows}
        </div>
        {body}
        <TestFooter t={tests[kind]} hint={HINTS[kind]} onTest={() => runTest(kind)} />
      </section>
    );
  };

  const levelRows = (kind: "analyses" | "infra", levels: Level[]) =>
    levels.map((lv) => {
      const key = `${kind}:${lv.key}`;
      const sec = cfg[kind] as unknown as Record<string, Row>;
      return (
        <LevelRow key={key} dd={key} level={lv} row={sec[lv.key]} q={cfg.quietHours} open={dd === key} setOpen={setDd} options={options} topics={tg.topics}
          onChange={(r) => set((c) => { (c[kind] as unknown as Record<string, Row>)[lv.key] = r; })} />
      );
    });

  const mentions = (kind: "analyses" | "infra", head: string) => (
    <Mentions head={head} ids={cfg[kind].mentions} members={tg.members} open={dd === "p:" + kind} setOpen={setDd} dd={"p:" + kind} q={pq} setQ={setPq} onChange={(ids) => set((c) => { c[kind].mentions = ids; })} />
  );

  const dgOpen = dd === "digest:x";
  const digestRows = (
    <div className="nt-cols" style={{ position: "relative", zIndex: dgOpen ? 20 : undefined, padding: "10px 18px", borderTop: "1px solid var(--line)" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500 }}>
        <NIcon name="calendar" size={14} color="var(--fg2)" />
        Todo dia
      </span>
      <TopicSelect id="digest:x" value={cfg.digest.topic} options={options} topics={tg.topics} open={dgOpen} setOpen={setDd} onPick={(v) => { set((c) => { c.digest.topic = v; }); setDd(null); setPv("digest"); }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button className="nt-switch" role="switch" aria-checked={false} aria-label="Horário de silêncio · resumo" disabled title="O resumo sai no horário escolhido">
          <span />
        </button>
        <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>Não se aplica</span>
      </div>
    </div>
  );

  const q = cfg.quietHours;
  const stepper = (label: string, value: string, onShift: (m: number) => void) => (
    <>
      <span style={{ fontSize: 13 }}>{label}</span>
      <div className="nt-step">
        <button title="Antes" aria-label={`${label} · 30 minutos antes`} onClick={() => onShift(-30)}>
          <Icon name="minus" size={13} />
        </button>
        <span>{value}</span>
        <button title="Depois" aria-label={`${label} · 30 minutos depois`} onClick={() => onShift(30)}>
          <Icon name="plus" size={13} />
        </button>
      </div>
    </>
  );

  return (
    <div className="nt-root" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <GroupCard tg={tg} refreshing={refreshing} onRefresh={() => refresh(false)} onCreate={createMissing} />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 380px", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          {section("analyses", "scan-search", "var(--acc)", "var(--accSoft)", "Análises dos grupos de clientes", "O que o Hermes entendeu nos grupos de WhatsApp, por urgência.", mentions("analyses", "Em urgência crítica, chamar"), "Urgência", levelRows("analyses", ANALYSIS_LEVELS))}
          {section("infra", "server", "var(--err)", "color-mix(in oklab,var(--err) 14%,transparent)", "Alertas de infra", "Servidores, filas de mensagens e gateways, por severidade.", mentions("infra", "Em infra crítica, chamar"), "Severidade", levelRows("infra", INFRA_LEVELS))}
          {section("digest", "sunrise", "var(--warn)", "color-mix(in oklab,var(--warn) 14%,transparent)", "Resumo diário", "Um balanço do dia anterior: análises, o que ficou aberto e mensagens ignoradas.", <DigestBar d={cfg.digest} onChange={(d) => set((c) => { c.digest = d; })} />, "Envio", digestRows)}

          <section className="au-card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, background: "var(--panel2)", color: "var(--fg2)", display: "grid", placeItems: "center" }}>
                <Icon name="moon" size={16} />
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Horário de silêncio</span>
                <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>Nos avisos marcados acima, o Hermes guarda tudo e manda um resumo quando o silêncio acaba.</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {stepper("Das", q.from, (m) => set((c) => { c.quietHours.from = shiftTime(c.quietHours.from, m); }))}
              {stepper("às", q.to, (m) => set((c) => { c.quietHours.to = shiftTime(c.quietHours.to, m); }))}
              <button role="switch" aria-checked={q.weekend} onClick={() => set((c) => { c.quietHours.weekend = !c.quietHours.weekend; })} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 999, border: "1px solid var(--line2)", background: "transparent", color: "var(--fg)", fontSize: 12.5, cursor: "pointer" }}>
                <span style={{ width: 30, height: 18, borderRadius: 999, background: q.weekend ? "var(--acc)" : "var(--line2)", position: "relative", transition: "background .2s" }}>
                  <span style={{ position: "absolute", top: 2, left: q.weekend ? 14 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                </span>
                Fim de semana inteiro
              </button>
              <span style={{ fontSize: 12, color: "var(--fg3)" }}>{q.tz === "America/Sao_Paulo" ? "Horário de Brasília" : q.tz}</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 12px", borderRadius: "var(--r2)", background: "color-mix(in oklab,var(--err) 7%,transparent)", fontSize: 12.5, lineHeight: 1.5, color: "var(--fg2)" }}>
              <NIcon name="shield-alert" size={14} color="var(--err)" className="nt-mt2" />
              <span>
                Urgência crítica e infra crítica <b style={{ color: "var(--fg)" }}>nunca ficam em silêncio</b>. Se acontecer de madrugada, quem está marcado é chamado.
              </span>
            </div>
          </section>
        </div>

        <Preview kind={pv} setKind={setPv} cfg={cfg} tg={tg} />
      </div>

      {changes > 0 && (
        <div className="nt-bar" role="region" aria-label="Alterações não salvas">
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warn)" }} />
          <span style={{ fontSize: 13 }}>{changesLabel(changes)}</span>
          <button className="au-outline" style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12.5 }} disabled={saving} onClick={() => setCfg(saved)}>
            Descartar
          </button>
          <button className="au-primary" style={{ padding: "7px 14px", borderRadius: 999, fontSize: 12.5 }} disabled={saving} onClick={save}>
            <Icon name={saving ? "loader-circle" : "check"} size={13} className={saving ? "au-spin" : undefined} />
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      )}
    </div>
  );
}
