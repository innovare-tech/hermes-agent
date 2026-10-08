// "Como chega no Telegram": ilustração do design, NÃO é um pedido real. Os botões só mexem no próprio desenho
// (nada vai ao histórico nem ao backend). Os dados do exemplo são fictícios e a tela avisa isso.
import { useState } from "react";
import { Icon } from "../Icon";

type Step = "pending" | "ok" | "no";

export function TelegramExample({ ttlMin }: { ttlMin: number }) {
  const [step, setStep] = useState<Step>("pending");
  return (
    <div className="pm-tg" role="group" aria-label="Exemplo ilustrativo de pedido de aprovação no Telegram">
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--tgBub)", borderBottom: "1px solid rgba(0,0,0,.15)" }}>
        <Icon name="arrow-left" size={16} color="var(--tgFg2)" />
        <span style={{ width: 32, height: 32, borderRadius: "50%", background: "#e5584f", display: "grid", placeItems: "center", color: "#fff" }}>
          <Icon name="server" size={15} />
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--tgFg)" }}>Alertas de infra</span>
          <span style={{ fontSize: 11.5, color: "var(--tgFg2)" }}>Exemplo · tópico da equipe</span>
        </div>
        <span style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 999, border: "1px solid var(--tgFg2)", color: "var(--tgFg2)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase" }}>Exemplo</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "16px 12px 14px" }}>
        <div style={{ alignSelf: "flex-start", maxWidth: "96%", display: "flex", gap: 8, alignItems: "flex-end" }}>
          <span style={{ width: 30, height: 30, flex: "none", borderRadius: "50%", background: "linear-gradient(135deg,#ff9f7a,#f48fd0)", display: "grid", placeItems: "center", color: "#0c0e16" }}>
            <Icon name="sparkles" size={14} />
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "8px 11px 6px", borderRadius: "14px 14px 14px 4px", background: "var(--tgBub)", color: "var(--tgFg)", fontSize: 13.5, lineHeight: 1.45, boxShadow: "0 1px 1px rgba(0,0,0,.15)" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#e1834f" }}>Hermes</span>
            <span style={{ fontWeight: 600 }}>🟡 Pedido de aprovação · mudar cluster</span>
            <span>
              Origem: <b>Diego no Telegram</b>
            </span>
            <span>“O atendimento tá lento, sobe mais duas cópias.”</span>
            <span style={{ padding: "7px 9px", borderRadius: 7, background: "rgba(0,0,0,.25)", fontFamily: "var(--fm)", fontSize: 12, lineHeight: 1.5, wordBreak: "break-all" }}>kubectl scale deploy/attendant --replicas=4 -n exemplo</span>
            <span style={{ fontSize: 12.5, color: "var(--tgFg2)" }}>Hoje: 2 cópias. Depois: 4.</span>
            <span style={{ color: step === "pending" ? "var(--tgFg2)" : step === "ok" ? "#4fbf7f" : "#e5584f", fontWeight: step === "pending" ? 400 : 600 }}>
              {step === "pending" ? `Expira em ${ttlMin} min (sem resposta = negado)` : step === "ok" ? "✅ Aprovado. Executado (exemplo)." : "❌ Negado. Quem pediu foi avisado (exemplo)."}
            </span>
            <span style={{ alignSelf: "flex-end", fontSize: 11, color: "var(--tgFg2)" }}>10:41</span>
          </div>
        </div>
        {step === "pending" ? (
          <div style={{ marginLeft: 38, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <button className="pm-tgbtn" onClick={() => setStep("ok")}>
              ✅ Aprovar
            </button>
            <button className="pm-tgbtn" onClick={() => setStep("no")}>
              ❌ Negar
            </button>
          </div>
        ) : (
          <button onClick={() => setStep("pending")} className="pm-tgbtn" style={{ marginLeft: 38, alignSelf: "flex-start", padding: "5px 10px", borderRadius: 999, background: "rgba(0,0,0,.25)", color: "var(--tgFg2)", fontSize: 11.5 }}>
            ↺ Ver o exemplo de novo
          </button>
        )}
      </div>
      <div style={{ padding: "8px 14px 10px", fontSize: 11.5, lineHeight: 1.45, color: "var(--tgFg2)", borderTop: "1px solid rgba(0,0,0,.15)" }}>Ilustração: nomes, comando e horário são inventados. Os botões deste desenho não decidem nada de verdade.</div>
    </div>
  );
}
