import { useState } from "react";
import { plural } from "../chat/sources";
import { WINDOW_LIMITS, windowError, windowExample, windowSentence, type Window } from "./model";
import { Modal, Stepper } from "./parts";

type Pair = { silenceMin: number; maxMin: number };

/** Os dois contadores (silêncio X, máximo Y) com o erro escrito quando Y não passa de X. */
export function WindowControls({ value, onChange, disabled }: { value: Pair; onChange: (v: Pair) => void; disabled?: boolean }) {
  const err = windowError(value);
  const [sMin, sMax] = WINDOW_LIMITS.silence;
  const [mMin, mMax] = WINDOW_LIMITS.max;
  const badMax = !!err && value.maxMin <= value.silenceMin;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div className="au-field">
          <span className="au-label">Silêncio</span>
          <Stepper label="minutos de silêncio" value={value.silenceMin} min={sMin} max={sMax} step={1} disabled={disabled} invalid={!!err && !badMax} onChange={(n) => onChange({ ...value, silenceMin: n })} />
        </div>
        <div className="au-field">
          <span className="au-label">No máximo a cada</span>
          <Stepper label="minutos no máximo" value={value.maxMin} min={mMin} max={mMax} step={5} disabled={disabled} invalid={!!err} onChange={(n) => onChange({ ...value, maxMin: n })} />
        </div>
      </div>
      {err ? (
        <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--err)" }}>
          {err}
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--fg2)" }}>{windowSentence(value)}</p>
      )}
    </div>
  );
}

/** Janela do canal na gaveta: usar o padrão ou valores próprios. Salvar/Descartar só aparecem com mudança. */
export function ChannelWindow({ window: w, def, onSave }: { window: Window; def: Pair | null; onSave: (patch: { useDefault: true } | Pair) => Promise<void> }) {
  const [useDefault, setUseDefault] = useState(w.useDefault);
  const [v, setV] = useState<Pair>({ silenceMin: w.silenceMin, maxMin: w.maxMin });
  const [busy, setBusy] = useState(false);
  const dirty = useDefault !== w.useDefault || (!useDefault && (v.silenceMin !== w.silenceMin || v.maxMin !== w.maxMin));
  const bad = !useDefault && windowError(v) !== null;
  const std = def ?? (w.useDefault ? w : null); // valores do padrão (null = ainda não carregou)
  const reset = () => {
    setUseDefault(w.useDefault);
    setV({ silenceMin: w.silenceMin, maxMin: w.maxMin });
  };
  const save = async () => {
    setBusy(true);
    await onSave(useDefault ? { useDefault: true } : v).catch(() => {});
    setBusy(false);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, cursor: "pointer" }}>
        <span>
          Usar o padrão{" "}
          <span style={{ fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg3)" }}>
            {std ? `(${std.silenceMin} min / ${std.maxMin} min)` : ""}
          </span>
        </span>
        <button type="button" role="switch" aria-checked={useDefault} aria-label="Usar a janela de análise padrão" className="au-switch lg" onClick={() => setUseDefault(!useDefault)}>
          <span />
        </button>
      </label>
      {useDefault ? <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--fg2)" }}>{std ? windowSentence(std) : "Usa a janela padrão."}</p> : <WindowControls value={v} onChange={setV} />}
      {dirty && (
        <div style={{ display: "flex", gap: 8 }}>
          <button className="au-primary" disabled={bad || busy} onClick={save}>
            {busy ? "Salvando…" : "Salvar janela"}
          </button>
          <button className="au-outline" disabled={busy} onClick={reset}>
            Descartar
          </button>
        </div>
      )}
    </div>
  );
}

/** "Janela de análise padrão": vale para todos os canais que não têm janela própria. */
export function DefaultWindowDialog({ current, using, onSave, onClose }: { current: Pair; using: number; onSave: (v: Pair) => Promise<void>; onClose: () => void }) {
  const [v, setV] = useState<Pair>(current);
  const [busy, setBusy] = useState(false);
  const bad = windowError(v) !== null;
  const dirty = v.silenceMin !== current.silenceMin || v.maxMin !== current.maxMin;
  const save = async () => {
    setBusy(true);
    try {
      await onSave(v);
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Modal title="Janela de análise padrão" onClose={onClose} busy={busy}>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--fg2)" }}>
        O Hermes junta as mensagens do grupo e analisa tudo de uma vez. Aqui você escolhe quando. {using === 0 ? "Nenhum canal usa o padrão agora." : `${plural(using, "canal usa", "canais usam")} o padrão.`}
      </p>
      <WindowControls value={v} onChange={setV} />
      {!bad && (
        <p style={{ margin: 0, padding: "10px 12px", borderRadius: "var(--r2)", background: "var(--panel2)", fontSize: 12.5, lineHeight: 1.5, color: "var(--fg2)" }}>
          Exemplo: {windowExample(v)}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="au-outline" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button className="au-primary" disabled={bad || !dirty || busy} onClick={save}>
          {busy ? "Salvando…" : "Salvar padrão"}
        </button>
      </div>
    </Modal>
  );
}
