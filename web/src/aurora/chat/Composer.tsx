import { useState, type KeyboardEvent } from "react";
import { Icon } from "../Icon";
import { ModelPicker } from "./ModelPicker";
import type { SlashCommand } from "./types";

type Props = {
  running: boolean;
  model: string;
  commands: SlashCommand[];
  onSend: (text: string) => void;
  onStop: () => void;
  onPickModel: (provider: string, model: string) => void;
  /** Texto inicial (ex.: pedido vindo do Radar ou de Pessoas) — o usuário revisa e envia. */
  initialDraft?: string;
};

export function Composer({ running, model, commands, onSend, onStop, onPickModel, initialDraft = "" }: Props) {
  const [draft, setDraft] = useState(initialDraft);
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState(0);
  const hasDraft = draft.trim() !== "";
  const slash = draft.startsWith("/") && !draft.includes(" ") ? commands.filter((c) => c.cmd.startsWith(draft)) : [];
  const sel = Math.min(pick, Math.max(0, slash.length - 1));

  const send = () => {
    if (!hasDraft || running) return;
    onSend(draft.trim());
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slash.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setPick((sel + (e.key === "ArrowDown" ? 1 : slash.length - 1)) % slash.length);
    } else if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && slash.length) {
      e.preventDefault();
      setDraft(slash[sel].cmd + " ");
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div style={{ padding: "0 26px 22px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", position: "relative" }}>
        {picking && (
          <ModelPicker
            current={model}
            onClose={() => setPicking(false)}
            onPick={(p, m) => {
              setPicking(false);
              onPickModel(p, m);
            }}
          />
        )}
        {slash.length > 0 && (
          <div
            role="listbox"
            aria-label="Comandos"
            style={{ position: "absolute", left: 0, right: 0, bottom: "calc(100% + 10px)", border: "1px solid var(--line2)", borderRadius: "var(--r)", background: "var(--panel)", backdropFilter: "var(--blur)", WebkitBackdropFilter: "var(--blur)", boxShadow: "var(--shadow)", padding: 6, display: "flex", flexDirection: "column", gap: 1, maxHeight: "min(360px, 50vh)", overflow: "auto", animation: "hin .2s ease both", zIndex: 5 }}
          >
            {slash.map((c, i) => (
              <button key={c.cmd} role="option" aria-selected={i === sel} className="au-slash" ref={i === sel ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined} onClick={() => setDraft(c.cmd + " ")}>
                <span style={{ fontFamily: "var(--fm)", fontSize: 12.5, color: "var(--acc)" }}>{c.cmd}</span>
                <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>{c.desc}</span>
              </button>
            ))}
          </div>
        )}
        <div
          className="au-ring"
          style={{ inset: -16, borderRadius: "calc(var(--r) + 16px)", background: "conic-gradient(from var(--ang),transparent 0deg,var(--acc) 50deg,transparent 120deg,transparent 180deg,var(--acc) 230deg,transparent 300deg)", filter: "blur(24px)", opacity: running ? 0.5 : hasDraft ? 0.2 : 0 }}
        />
        <div
          className="au-ring"
          style={{ inset: 0, borderRadius: "var(--r)", background: "conic-gradient(from var(--ang),var(--line2) 0deg,var(--acc) 50deg,var(--line2) 120deg,var(--line2) 180deg,var(--acc) 230deg,var(--line2) 300deg)", opacity: running ? 1 : hasDraft ? 0.9 : 0 }}
        />
        <div
          style={{ position: "relative", zIndex: 1, backgroundClip: "padding-box", transition: "border-color .5s", border: `1px solid ${running || hasDraft ? "transparent" : "var(--line2)"}`, borderRadius: "var(--r)", backgroundColor: "var(--panel)", backdropFilter: "var(--blur)", WebkitBackdropFilter: "var(--blur)", padding: "14px 12px 10px 16px", display: "flex", flexDirection: "column", gap: 10, boxShadow: "var(--shadow)" }}
        >
          <textarea
            aria-label="Mensagem para o Hermes"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setPick(0);
            }}
            onKeyDown={onKey}
            rows={2}
            placeholder="Peça algo ao Hermes…   / para comandos"
            style={{ width: "100%", resize: "none", border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 15, lineHeight: 1.5 }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* ponytail: anexo e voz ficam visuais até o upload/transcrição entrarem na Conversa */}
            <button className="au-tool" title="Anexar" aria-label="Anexar">
              <Icon name="paperclip" size={15} />
            </button>
            <button className="au-tool" title="Voz" aria-label="Voz">
              <Icon name="mic" size={15} />
            </button>
            <button className="au-model" aria-haspopup="dialog" aria-expanded={picking} onClick={() => setPicking(!picking)}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--acc)" }} />
              {model}
              <Icon name="chevron-down" size={11} color="var(--fg3)" />
            </button>
            <span style={{ marginLeft: "auto", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>↵ enviar</span>
            {running ? (
              <button className="au-stop" title="/stop" aria-label="Parar" onClick={onStop}>
                <Icon name="square" size={12} />
              </button>
            ) : (
              <button className="au-send" aria-label="Enviar" onClick={send} style={{ opacity: hasDraft ? 1 : 0.45 }}>
                <Icon name="arrow-up" size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
