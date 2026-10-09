// "Como chega no Telegram": ilustração do design, NÃO é um pedido real. Os botões do desenho são estáticos
// (no teste real, clicar neles parecia aprovar e não aprovava nada): os pedidos de verdade ficam em "Pendentes".
import { Icon } from "../Icon";

export function TelegramExample({ ttlMin }: { ttlMin: number }) {
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
            <span style={{ color: "var(--tgFg2)" }}>{`Expira em ${ttlMin} min (sem resposta = negado)`}</span>
            <span style={{ alignSelf: "flex-end", fontSize: 11, color: "var(--tgFg2)" }}>10:41</span>
          </div>
        </div>
        <div aria-hidden="true" style={{ marginLeft: 38, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, opacity: 0.75, pointerEvents: "none" }}>
          <span className="pm-tgbtn" style={{ textAlign: "center" }}>✅ Aprovar</span>
          <span className="pm-tgbtn" style={{ textAlign: "center" }}>❌ Negar</span>
        </div>
      </div>
      <div style={{ padding: "8px 14px 10px", fontSize: 11.5, lineHeight: 1.45, color: "var(--tgFg2)", borderTop: "1px solid rgba(0,0,0,.15)" }}>Só ilustração: nomes, comando e horário são inventados e os botões não funcionam aqui. Pedidos de verdade: em Pendentes, acima, ou nos botões da mensagem no Telegram.</div>
    </div>
  );
}
