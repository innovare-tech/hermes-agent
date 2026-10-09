// Estados da tela: esqueletos da lista e do detalhe, vazio (primeiro cliente) e erro ao carregar.
import { Icon } from "../Icon";
import { spinIcon } from "./parts";

const W = ["60%", "45%", "70%", "55%", "65%", "50%"];

export function ListSkeleton() {
  return (
    <div aria-busy="true" role="status" aria-label="Carregando os clientes">
      {W.map((w) => (
        <div key={w} className="cp-skel-row">
          <div className="cp-skel" style={{ width: 34, height: 34, borderRadius: 10 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
            <div className="cp-skel" style={{ height: 11, width: w }} />
            <div className="cp-skel" style={{ height: 9, width: "50%", opacity: 0.6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div aria-busy="true" role="status" aria-label="Carregando o cliente" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 24 }}>
      <div className="cp-skel" style={{ height: 46, width: "60%", borderRadius: 10 }} />
      <div className="cp-skel" style={{ height: 90, borderRadius: "var(--r2)", animation: "none", background: "var(--panel2)" }} />
      <div className="cp-skel" style={{ height: 220, borderRadius: "var(--r2)", animation: "none", background: "var(--panel2)" }} />
    </div>
  );
}

export function Pick({ text }: { text: string }) {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%", minHeight: 240, padding: 24, fontSize: 13.5, color: "var(--fg2)", textAlign: "center" }}>{text}</div>
  );
}

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12, padding: "56px 28px", border: "1px dashed var(--line2)", borderRadius: "var(--r)", background: "var(--panel)" }}>
      <span style={{ width: 52, height: 52, borderRadius: 15, display: "grid", placeItems: "center", background: "var(--accSoft)", color: "var(--acc)" }}>
        <Icon name="users-round" size={24} />
      </span>
      <span className="au-display" style={{ fontSize: 22 }}>Nenhum cliente no Copiloto ainda</span>
      <span style={{ fontSize: 14, color: "var(--fg2)", lineHeight: 1.55, maxWidth: 470, textWrap: "pretty" }}>
        Escolha um cliente do banco da Aibiz e um plano. O Hermes cria um perfil só para ele, com uma chave que só enxerga os dados dele.
      </span>
      <button className="au-primary" style={{ marginTop: 6, padding: "10px 16px", fontSize: 13.5 }} onClick={onAdd}>
        <Icon name="plus" size={14} />
        Adicionar o primeiro cliente
      </button>
    </div>
  );
}

export function ErrorState({ title, text, busy, onRetry }: { title: string; text: string; busy: boolean; onRetry: () => void }) {
  return (
    <div role="alert" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, padding: 28, border: "1px solid color-mix(in oklab,var(--err) 35%,transparent)", borderRadius: "var(--r)", background: "var(--panel)" }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "color-mix(in oklab,var(--err) 14%,transparent)", color: "var(--err)" }}>
        <Icon name="cloud-off" size={19} />
      </span>
      <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
      <span style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.55, maxWidth: 600 }}>{text}</span>
      <button className="au-primary" onClick={onRetry} disabled={busy}>
        {spinIcon(busy, "rotate-cw")}
        Tentar de novo
      </button>
    </div>
  );
}
