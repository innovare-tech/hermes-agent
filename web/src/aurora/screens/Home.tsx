import { PanicButton } from "../Chrome";
import { inBiz, useStore } from "../store";

// Fase 1: só o cabeçalho. Briefing, 24h, Precisa de você, Saúde e Custos chegam na Fase 4.
export function Home() {
  const s = useStore((x) => x);
  const f = inBiz(s);
  const decisions = s.inbox.filter((x) => f(x) && (x.priority === "urgente" || x.priority === "voce")).length + s.approvals.filter(f).length;
  const hr = new Date().getHours();
  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <span className="au-label">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</span>
            <h1 className="au-h1">{(hr < 12 ? "Bom dia" : hr < 18 ? "Boa tarde" : "Boa noite") + ". Aqui está o seu dia."}</h1>
            <p style={{ margin: 0, color: "var(--fg2)", fontSize: 14.5, maxWidth: 600, lineHeight: 1.55 }}>
              {s.paused
                ? "O agente está pausado. Ele continua lendo tudo, mas não envia nada nem executa ações até você retomar."
                : `Enquanto você estava fora, o Hermes respondeu 37 mensagens, resolveu 11 tickets e separou ${decisions} decisões para você.`}
            </p>
          </div>
          <PanicButton />
        </div>
      </div>
    </div>
  );
}
