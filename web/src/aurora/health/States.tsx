// Estados da tela: carregando (skeleton), erro do monitor, vazio (com as recomendadas) e o resultado de "Usar as recomendadas".
import { Icon } from "../Icon";
import type { RecommendedResult } from "./api";

export function HealthSkeleton() {
  return (
    <div aria-busy="true" role="status" aria-label="Carregando a saúde da plataforma" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="au-skel" style={{ height: 120 }} />
      {[1, 2, 3].map((k) => (
        <div key={k} className="au-skel" style={{ height: 170 }} />
      ))}
    </div>
  );
}

export function HealthError({ busy, onRetry }: { busy: boolean; onRetry: () => void }) {
  return (
    <div role="alert" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, padding: 28, border: "1px solid color-mix(in oklab,var(--err) 35%,transparent)", borderRadius: "var(--r)", background: "var(--panel)" }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "color-mix(in oklab,var(--err) 14%,transparent)", color: "var(--err)" }}>
        <Icon name="cloud-off" size={19} />
      </span>
      <span style={{ fontSize: 16, fontWeight: 600 }}>Não consegui falar com o monitor</span>
      <span style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.55, maxWidth: 600 }}>
        As verificações podem estar rodando normalmente, mas não sei dizer daqui. Se o problema for no próprio Hermes, os avisos no Telegram também podem ter parado: confira lá.
      </span>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button className="au-primary" onClick={onRetry} disabled={busy}>
          <Icon name={busy ? "loader-circle" : "rotate-cw"} size={14} className={busy ? "au-spin" : undefined} />
          Tentar de novo
        </button>
        <a href="https://t.me/" target="_blank" rel="noopener noreferrer" className="au-outline" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
          Abrir o Telegram
        </a>
      </div>
    </div>
  );
}

export function HealthEmpty({ busy, onUseDefaults, onCreate }: { busy: boolean; onUseDefaults: () => void; onCreate: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12, padding: "56px 28px", border: "1px dashed var(--line2)", borderRadius: "var(--r)", background: "var(--panel)" }}>
      <span style={{ width: 52, height: 52, borderRadius: 15, display: "grid", placeItems: "center", background: "color-mix(in oklab,var(--ok) 16%,transparent)", color: "var(--ok)" }}>
        <Icon name="heart-pulse" size={24} />
      </span>
      <span className="au-display" style={{ fontSize: 22 }}>Nenhuma verificação ainda</span>
      <span style={{ fontSize: 14, color: "var(--fg2)", lineHeight: 1.55, maxWidth: 480, textWrap: "pretty" }}>
        Comece pelas recomendadas (bots de canais em uso, filas de falha, MongoDB, servidores, serviços e Kubernetes, conforme o que já estiver configurado) ou descreva em português o que você quer que o Hermes vigie.
      </span>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button className="au-primary" style={{ padding: "10px 16px", fontSize: 13.5 }} disabled={busy} onClick={onUseDefaults}>
          <Icon name={busy ? "loader-circle" : "sparkles"} size={14} className={busy ? "au-spin" : undefined} />
          {busy ? "Criando…" : "Usar as recomendadas"}
        </button>
        <button className="au-outline" style={{ padding: "10px 16px", fontSize: 13.5 }} onClick={onCreate}>
          Criar uma do zero
        </button>
      </div>
    </div>
  );
}

/** O que "Usar as recomendadas" criou e o que ficou de fora por falta de configuração. */
export function RecommendedResultCard({ result, onConnections, onClose }: { result: RecommendedResult; onConnections: () => void; onClose: () => void }) {
  const n = result.created.length;
  return (
    <div role="status" style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 18px", borderRadius: "var(--r)", border: "1px solid var(--line2)", background: "var(--panel)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="sparkles" size={16} color="var(--acc)" />
        <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>
          {n === 0 ? "Nenhuma verificação nova foi criada" : n === 1 ? "1 verificação recomendada foi criada" : `${n} verificações recomendadas foram criadas`}
        </span>
        <button className="au-iconbtn" aria-label="Fechar este resumo" title="Fechar" onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      </div>
      {n > 0 && <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>Elas rodam sozinhas; a primeira execução aparece em instantes.</span>}
      {result.skipped.length > 0 && (
        <>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>O que falta configurar</span>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.45 }}>
            {result.skipped.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <button className="au-outline" style={{ alignSelf: "flex-start" }} onClick={onConnections}>
            Abrir as Conexões
          </button>
        </>
      )}
    </div>
  );
}
