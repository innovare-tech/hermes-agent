// Criar verificação em português: o Hermes mostra o que entendeu ("Entendi assim:") antes de criar.
import { useMemo, useState } from "react";
import { Modal } from "../channels/parts";
import { Icon } from "../Icon";
import { toast } from "../store";
import { errText, healthApi, INTERVALS, INTERVAL_SHORT, type Check, type ParseResult } from "./api";
import { createExamples, freqLabel } from "./model";

const soft = (c: string, p: number) => `color-mix(in oklab,${c} ${p}%,transparent)`;

const SEVERITY = { critical: "Crítico", warning: "Atenção" } as const;

export function CreateDialog({ checks, onClose, onCreated }: { checks: Check[]; onClose: () => void; onCreated: (c: Check) => void }) {
  const examples = useMemo(() => createExamples(checks), [checks]);
  const [text, setText] = useState("");
  const [interval, setIntervalSec] = useState<number>(300);
  const [res, setRes] = useState<ParseResult | null>(null);
  // Frequência com que o cartão foi montado: se mudar depois, o cartão mostra a nova.
  const [parsedAt, setParsedAt] = useState(300);
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const canParse = text.trim().length > 0 && !parsing && !creating;

  const interpret = async () => {
    if (!canParse) return;
    setParsing(true);
    setRes(null);
    try {
      setRes(await healthApi.parse(text.trim(), interval));
      setParsedAt(interval);
    } catch (e) {
      setRes({ ok: false, reason: errText(e, "Não consegui falar com o Hermes agora. Tente de novo.") });
    } finally {
      setParsing(false);
    }
  };

  const create = async () => {
    if (!res?.ok || creating) return;
    setCreating(true);
    try {
      onCreated(await healthApi.create(text.trim(), interval, res.check));
    } catch (e) {
      toast(errText(e, "Não consegui criar a verificação. Tente de novo."));
      setCreating(false);
    }
  };

  const ok = res?.ok ? res.check : null;
  const rows: [string, string][] = ok
    ? [
        ["Vou checar", ok.target],
        ["Avisar quando", ok.condition],
        ["Só em", !ok.window || ok.window === "sempre" ? "qualquer horário" : ok.window],
        ["Frequência", parsedAt === interval ? ok.frequency || freqLabel(interval) : freqLabel(interval)],
        ["Grupo", ok.groupLabel],
        ...(ok.channel ? [["Canal", ok.channel] as [string, string]] : []),
        ["Avisa em", ok.notify],
        ["Importância", SEVERITY[ok.severity] ?? ok.severity],
      ]
    : [];

  return (
    <Modal title="Criar verificação" onClose={onClose} busy={parsing || creating} width={580}>
      <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5, marginTop: -8 }}>
        Descreva em português o que checar e quando avisar. O Hermes mostra o que entendeu antes de criar.
      </span>
      <textarea
        autoFocus
        className="hl-area"
        data-bad={res?.ok === false}
        value={text}
        rows={3}
        maxLength={1000}
        aria-label="O que o Hermes deve vigiar"
        placeholder={`Ex.: ${examples[0]}`}
        onChange={(e) => {
          setText(e.target.value);
          setRes(null);
        }}
      />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {examples.map((e) => (
          <button
            key={e}
            className="hl-ex"
            onClick={() => {
              setText(e);
              setRes(null);
            }}
          >
            {e}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span id="hl-freq" style={{ fontSize: 13, fontWeight: 600 }}>Com que frequência</span>
        <div className="hl-seg" role="group" aria-labelledby="hl-freq">
          {INTERVALS.map((s) => (
            <button key={s} aria-pressed={interval === s} onClick={() => setIntervalSec(s)}>
              {INTERVAL_SHORT[s]}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite" className="hl-parsed-slot">
        {res && (
          <div className="hl-parsed" style={{ border: `1px solid ${soft(res.ok ? "var(--ok)" : "var(--err)", 40)}`, background: soft(res.ok ? "var(--ok)" : "var(--err)", 7) }}>
            <span role={res.ok ? undefined : "alert"} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, fontWeight: 600, color: res.ok ? "var(--fg)" : "var(--err)", lineHeight: 1.4 }}>
              <Icon name={res.ok ? "sparkles" : "circle-help"} size={15} color={res.ok ? "var(--ok)" : "var(--err)"} />
              {res.ok ? "Entendi assim:" : res.reason}
            </span>
            {res.ok && (
              <dl>
                {rows.map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {res.ok && ok?.warning && (
              <div className="hl-warn" role="note">
                <Icon name="triangle-alert" size={14} />
                {ok.warning}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
        <button className="au-outline" disabled={!canParse} onClick={interpret} style={{ display: "flex", alignItems: "center", gap: 7, opacity: canParse ? 1 : 0.5, cursor: canParse ? "pointer" : "not-allowed" }}>
          <Icon name={parsing ? "loader-circle" : "sparkles"} size={14} className={parsing ? "au-spin" : undefined} />
          {parsing ? "Entendendo…" : res ? "Entender de novo" : "Ver o que o Hermes entendeu"}
        </button>
        <button className="au-outline" onClick={onClose} disabled={parsing || creating} style={{ marginLeft: "auto" }}>
          Cancelar
        </button>
        <button className="au-primary" disabled={!ok || creating} onClick={create} style={{ opacity: ok && !creating ? 1 : 0.4, cursor: ok && !creating ? "pointer" : "not-allowed" }}>
          {creating && <Icon name="loader-circle" size={14} className="au-spin" />}
          Criar verificação
        </button>
      </div>
    </Modal>
  );
}
