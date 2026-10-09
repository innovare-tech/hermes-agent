import { Fragment, useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Icon } from "../Icon";
import { fmtSize } from "./attachments";
import { EffortMenu, effortLabel } from "./EffortMenu";
import { ModelPicker } from "./ModelPicker";
import { filterSlash } from "./slashMenu";
import type { Attachment, SlashCommand } from "./types";

type Props = {
  running: boolean;
  model: string;
  provider?: string;
  /** Troca de modelo pedida durante um turno: só vale a partir do próximo. */
  pendingModel?: string;
  effort?: string;
  fast?: boolean;
  /** null = o gateway não informou (esconde o interruptor). */
  showThinking: boolean | null;
  commands: SlashCommand[];
  attachments: Attachment[];
  onSend: (text: string) => void;
  onStop: () => void;
  onPickModel: (provider: string, model: string) => void;
  onPickEffort: (effort: string) => void;
  onToggleThinking: (show: boolean) => void;
  onToggleFast: (on: boolean) => void;
  onAttach: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  /** Texto inicial (ex.: pedido vindo do Radar ou de Pessoas) — o usuário revisa e envia. */
  initialDraft?: string;
  /** Devolve texto ao campo (Desfazer, Editar): `id` muda a cada pedido. */
  prefill?: { text: string; id: number } | null;
  /** Sobe a cada pedido de "Trocar modelo" (cartão de erro) para abrir o seletor. */
  openModel?: number;
};

export function Composer({ running, model, provider, pendingModel, effort, fast, showThinking, commands, attachments, onSend, onStop, onPickModel, onPickEffort, onToggleThinking, onToggleFast, onAttach, onRemoveAttachment, initialDraft = "", prefill, openModel = 0 }: Props) {
  const [draft, setDraft] = useState(initialDraft);
  const [menu, setMenu] = useState<null | "model" | "effort">(null);
  const [pick, setPick] = useState(0);
  // Menu "/" fechado por Esc/clique fora até o texto mudar.
  const [hidden, setHidden] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!prefill) return;
    setDraft(prefill.text);
    setHidden(true);
    area.current?.focus();
  }, [prefill]);

  useEffect(() => {
    if (openModel > 0) setMenu("model");
  }, [openModel]);

  const sending = attachments.some((a) => a.status === "sending");
  const hasDraft = draft.trim() !== "" || attachments.some((a) => a.status === "ready");
  const slash = useMemo(() => (!hidden && draft.startsWith("/") && !draft.includes(" ") ? filterSlash(commands, draft) : []), [hidden, draft, commands]);
  const sel = Math.min(pick, Math.max(0, slash.length - 1));

  const send = () => {
    if (!hasDraft || running || sending) return;
    onSend(draft.trim());
    setDraft("");
  };

  const choose = (cmd: string) => {
    setDraft(cmd + " ");
    area.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slash.length && e.key === "Escape") {
      e.preventDefault();
      setHidden(true);
    } else if (slash.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setPick((sel + (e.key === "ArrowDown" ? 1 : slash.length - 1)) % slash.length);
    } else if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && slash.length && draft.trim() !== slash[sel].cmd) {
      e.preventDefault();
      choose(slash[sel].cmd);
    } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  // Colar arquivo (imagem do clipboard ou arquivo copiado) anexa em vez de inserir texto.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const fs = [...(e.clipboardData?.files ?? [])];
    if (!fs.length) return;
    e.preventDefault();
    onAttach(fs);
  };

  return (
    <div style={{ padding: "0 26px 22px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", position: "relative" }}>
        {menu === "model" && (
          <ModelPicker
            current={model}
            currentProvider={provider}
            onClose={() => setMenu(null)}
            onPick={(p, m) => {
              setMenu(null);
              onPickModel(p, m);
            }}
          />
        )}
        {menu === "effort" && (
          <EffortMenu
            effort={effort}
            fast={fast}
            showThinking={showThinking}
            onClose={() => setMenu(null)}
            onPick={(v) => {
              setMenu(null);
              onPickEffort(v);
            }}
            onToggleThinking={onToggleThinking}
            onToggleFast={(on) => {
              setMenu(null);
              onToggleFast(on);
            }}
          />
        )}
        {slash.length > 0 && (
          <div
            id={listId}
            role="listbox"
            aria-label="Comandos"
            className="au-float"
            style={{ position: "absolute", left: 0, right: 0, bottom: "calc(100% + 10px)", border: "1px solid var(--line2)", borderRadius: "var(--r)", boxShadow: "var(--shadow)", padding: 6, display: "flex", flexDirection: "column", gap: 1, maxHeight: "min(360px, 50vh)", overflow: "auto", animation: "hin .2s ease both", zIndex: 5 }}
          >
            {slash.map((c, i) => (
              <Fragment key={c.cmd}>
                {c.group && c.group !== slash[i - 1]?.group && (
                  <div role="presentation" className="au-label" style={{ padding: "8px 11px 4px" }}>
                    {c.group}
                  </div>
                )}
                <button id={`${listId}-${i}`} role="option" aria-selected={i === sel} className="au-slash" ref={i === sel ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(c.cmd)}>
                  <span style={{ fontFamily: "var(--fm)", fontSize: 12.5, color: "var(--acc)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.cmd}</span>
                  <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>{c.desc}</span>
                </button>
              </Fragment>
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
          {attachments.length > 0 && (
            <ul className="au-chips" aria-label="Anexos">
              {attachments.map((a) => (
                <li key={a.id} className={"au-achip" + (a.status === "error" ? " err" : "")} title={a.status === "error" ? a.error : `${a.name} · ${fmtSize(a.size)}`}>
                  {a.preview ? <img src={a.preview} alt="" /> : <Icon name={a.kind === "pdf" ? "file-text" : "paperclip"} size={14} />}
                  <span className="au-achip-name">{a.name}</span>
                  <span className="au-achip-sub">{a.status === "sending" ? "enviando…" : a.status === "error" ? (a.error ?? "falhou") : fmtSize(a.size)}</span>
                  {a.status === "sending" && <Icon name="loader-circle" size={12} className="au-spin" />}
                  <button className="au-achip-x" aria-label={`Remover anexo ${a.name}`} onClick={() => onRemoveAttachment(a.id)}>
                    <Icon name="x" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            ref={area}
            aria-label="Mensagem para o Hermes"
            role="combobox"
            aria-expanded={slash.length > 0}
            aria-controls={slash.length ? listId : undefined}
            aria-activedescendant={slash.length ? `${listId}-${sel}` : undefined}
            aria-autocomplete="list"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setPick(0);
              setHidden(false);
            }}
            onKeyDown={onKey}
            onPaste={onPaste}
            onBlur={() => setHidden(true)}
            onFocus={() => setHidden(false)}
            rows={2}
            placeholder="Peça algo ao Hermes…   / para comandos"
            style={{ width: "100%", resize: "none", border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 15, lineHeight: 1.5 }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <input
              ref={files}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) onAttach([...e.target.files]);
                e.target.value = ""; // permite escolher o mesmo arquivo de novo
              }}
            />
            <button className="au-tool" title="Anexar imagem, PDF ou arquivo (ou arraste para a conversa)" aria-label="Anexar arquivo" onClick={() => files.current?.click()}>
              <Icon name="paperclip" size={16} />
            </button>
            <button className="au-model" aria-haspopup="dialog" aria-expanded={menu === "model"} title={provider ? `${model} · ${provider}` : model} onClick={() => setMenu(menu === "model" ? null : "model")}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: pendingModel ? "var(--warn)" : "var(--acc)" }} />
              {model}
              <Icon name="chevron-down" size={11} color="var(--fg3)" />
            </button>
            {pendingModel && pendingModel !== model && (
              <span className="au-chip" role="status" title="O Hermes está respondendo. A troca vale a partir da próxima mensagem." style={{ borderColor: "var(--warn)", color: "var(--warn)" }}>
                <Icon name="clock" size={11} />
                troca para {pendingModel} no próximo turno
              </span>
            )}
            <button className="au-model" aria-haspopup="dialog" aria-expanded={menu === "effort"} title="Quanto o Hermes pensa antes de responder" onClick={() => setMenu(menu === "effort" ? null : "effort")}>
              <Icon name="brain" size={12} color="var(--fg3)" />
              Raciocínio: {effortLabel(effort)}
              <Icon name="chevron-down" size={11} color="var(--fg3)" />
            </button>
            {fast && (
              <button className="au-chip" title="Modo rápido ligado — clique para desligar" onClick={() => onToggleFast(false)} style={{ cursor: "pointer", color: "var(--warn)", borderColor: "var(--warn)", background: "transparent" }}>
                <Icon name="zap" size={11} />
                Rápido
              </button>
            )}
            <span style={{ marginLeft: "auto", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>↵ enviar</span>
            {running ? (
              <button className="au-stop" title="Parar a resposta" aria-label="Parar" onClick={onStop}>
                <Icon name="square" size={12} />
              </button>
            ) : (
              <button className="au-send" aria-label="Enviar" disabled={!hasDraft || sending} onClick={send} style={{ opacity: hasDraft && !sending ? 1 : 0.45 }}>
                <Icon name="arrow-up" size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
