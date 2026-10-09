import { useRef } from "react";
import { REASONING_EFFORT_VALUES } from "@hermes/shared";
import { Icon } from "../Icon";
import { EFFORT_PT } from "./commandOutput";
import { useDismiss } from "./useDismiss";

const HINT: Record<string, string> = {
  none: "Responde direto, sem pensar antes",
  minimal: "Quase sem pensar — o mais rápido",
  low: "Pensa pouco",
  medium: "Equilíbrio entre rapidez e qualidade",
  high: "Pensa bastante antes de responder",
  xhigh: "Pensa muito — mais lento e mais caro",
  max: "O máximo que o modelo permite",
  ultra: "Esforço extra, quando o provedor aceita",
};

export const effortLabel = (e?: string) => (e === undefined ? "…" : e === "" ? "padrão" : EFFORT_PT[e] ?? e);

type Props = {
  effort?: string;
  onPick: (effort: string) => void;
  onClose: () => void;
  /** Mostrar o pensamento nas respostas (null = não sabemos). */
  showThinking: boolean | null;
  onToggleThinking: (show: boolean) => void;
  /** Só aparece com o modo rápido ligado (o gateway não diz quais modelos suportam). */
  fast?: boolean;
  onToggleFast: (on: boolean) => void;
};

/** Esforço de raciocínio da conversa (e, quando houver, o modo rápido), ancorado no campo de mensagem. */
export function EffortMenu({ effort, onPick, onClose, showThinking, onToggleThinking, fast, onToggleFast }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, onClose);
  return (
    <div ref={box} role="dialog" aria-label="Esforço de raciocínio" className="au-picker" style={{ width: "min(380px,100%)" }}>
      <div className="au-label" style={{ padding: "10px 10px 4px" }} title="Quanto o modelo pensa antes de responder. Mais esforço costuma dar respostas melhores, mais lentas e mais caras.">
        Quanto o Hermes pensa antes de responder
      </div>
      <div role="radiogroup" aria-label="Esforço de raciocínio" style={{ padding: 4, overflow: "auto", maxHeight: "min(320px,50vh)" }}>
        {REASONING_EFFORT_VALUES.map((v) => (
          <button key={v} role="radio" aria-checked={effort === v} className="au-slash" style={{ gridTemplateColumns: "92px minmax(0,1fr) 16px" }} onClick={() => onPick(v)}>
            <span style={{ fontSize: 13, fontWeight: 500, textTransform: "capitalize" }}>{EFFORT_PT[v] ?? v}</span>
            <span style={{ fontSize: 12, color: "var(--fg2)" }}>{HINT[v]}</span>
            {effort === v && <Icon name="check" size={13} color="var(--acc)" />}
          </button>
        ))}
      </div>
      <div style={{ borderTop: "1px solid var(--line)", padding: "8px 6px 4px", display: "flex", flexDirection: "column", gap: 2 }}>
        {showThinking !== null && (
          <div className="au-menurow">
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13 }}>Mostrar o pensamento nas respostas</span>
              <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>Vale para todo o Hermes, não só esta conversa.</span>
            </span>
            <button role="switch" aria-checked={showThinking} aria-label="Mostrar o pensamento nas respostas" className="au-switch" onClick={() => onToggleThinking(!showThinking)}>
              <span />
            </button>
          </div>
        )}
        {fast && (
          <div className="au-menurow">
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13 }}>Modo rápido ligado</span>
              <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>Respostas mais rápidas, com custo maior.</span>
            </span>
            <button role="switch" aria-checked={true} aria-label="Desligar o modo rápido" className="au-switch" onClick={() => onToggleFast(false)}>
              <span />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
