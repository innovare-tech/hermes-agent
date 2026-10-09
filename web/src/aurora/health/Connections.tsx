// Conexões (S9): de onde o Hermes lê servidores, serviços, cluster e banco. Aqui só entram NOMES de variável;
// a chave, o token e a URI do banco ficam em Chaves deste perfil e nunca aparecem na tela.
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Modal } from "../channels/parts";
import { Icon } from "../Icon";
import { toast } from "../store";
import { errText, healthApi, type HealthSettings, type ServerCfg, type ServiceCfg, type SettingsPatch } from "./api";
import { serverSlug, SSH_KEY_ENV } from "./model";

type Draft = { mongo: HealthSettings["mongo"]; k8s: HealthSettings["k8s"]; servers: ServerCfg[]; services: ServiceCfg[] };

const toDraft = (s: HealthSettings): Draft => ({
  mongo: { uri_env: s.mongo.uri_env, db: s.mongo.db },
  k8s: { server: s.k8s.server, token_env: s.k8s.token_env, ca_env: s.k8s.ca_env, namespaces: s.k8s.namespaces },
  servers: s.servers.map((x) => ({ name: x.name, host: x.host, user: x.user, port: x.port })),
  services: s.services.map((x) => ({ name: x.name, url: x.url })),
});

/** O que vai para o PUT: textos aparados e porta numérica. */
function toPatch(d: Draft): SettingsPatch {
  const t = (v: string) => v.trim();
  return {
    mongo: { uri_env: t(d.mongo.uri_env), db: t(d.mongo.db) },
    k8s: { server: t(d.k8s.server), token_env: t(d.k8s.token_env), ca_env: t(d.k8s.ca_env), namespaces: t(d.k8s.namespaces) },
    servers: d.servers.map((s) => ({ name: serverSlug(s.name), host: t(s.host), user: t(s.user), port: Number(s.port) || 22 })),
    services: d.services.map((s) => ({ name: t(s.name), url: t(s.url) })),
  };
}

function State({ on, yes, no }: { on: boolean; yes: string; no: string }) {
  const c = on ? "var(--ok)" : "var(--fg3)";
  return (
    <span className="hl-state" style={{ background: `color-mix(in oklab,${c} 14%,transparent)`, color: c }}>
      <Icon name={on ? "circle-check" : "circle-pause"} size={12} />
      {on ? yes : no}
    </span>
  );
}

function Section({ icon, title, state, hint, children }: { icon: string; title: string; state?: ReactNode; hint: ReactNode; children: ReactNode }) {
  return (
    <section className="hl-conn" aria-label={title}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name={icon} size={16} color="var(--acc)" />
        <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{title}</span>
        {state}
      </div>
      <span style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.5 }}>{hint}</span>
      {children}
    </section>
  );
}

const Env = ({ name }: { name: string }) => <code className="hl-mono" style={{ padding: "1px 6px", borderRadius: 6, background: "var(--code)", fontSize: 11.5 }}>{name || "…"}</code>;

function Field({ label, value, onChange, mono, placeholder, type }: { label: string; value: string | number; onChange: (v: string) => void; mono?: boolean; placeholder?: string; type?: string }) {
  return (
    <label className="hl-field">
      <span>{label}</span>
      <input className={"hl-input" + (mono ? " mono" : "")} value={value} placeholder={placeholder} type={type} onChange={(e) => onChange(e.target.value)} spellCheck={false} autoComplete="off" />
    </label>
  );
}

export function Connections({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<HealthSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let alive = true;
    healthApi.settings().then(
      (s) => {
        if (!alive) return;
        setCfg(s);
        setDraft(toDraft(s));
      },
      () => alive && setError(true),
    );
    return () => {
      alive = false;
    };
  }, [tries]);

  const dirty = !!cfg && !!draft && JSON.stringify(toPatch(draft)) !== JSON.stringify(toPatch(toDraft(cfg)));
  const set = (f: (d: Draft) => Draft) => setDraft((d) => (d ? f(d) : d));

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const next = await healthApi.saveSettings(toPatch(draft));
      setCfg(next);
      setDraft(toDraft(next));
      toast("Conexões salvas", "Os segredos continuam só em Chaves. As verificações usam as novas conexões na próxima rodada.");
      onSaved();
    } catch (e) {
      toast(errText(e, "Não consegui salvar as conexões"));
    } finally {
      setSaving(false);
    }
  };

  const goKeys = () => {
    onClose();
    navigate("/settings");
  };

  return (
    <Modal title="Conexões" onClose={onClose} busy={saving} width={720}>
      <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5, marginTop: -8 }}>
        Onde o Hermes olha para checar a plataforma. Aqui você informa só <b>nomes</b>; as chaves, o token e a senha do banco ficam em{" "}
        <button className="au-ghost" onClick={goKeys} style={{ display: "inline", color: "var(--acc)", padding: 0, font: "inherit", textDecoration: "underline" }}>
          Chaves deste perfil
        </button>{" "}
        e nunca aparecem na tela.
      </span>

      {error && (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, borderRadius: "var(--r2)", border: `1px solid color-mix(in oklab,var(--err) 35%,transparent)`, fontSize: 13 }}>
          <Icon name="cloud-off" size={16} color="var(--err)" />
          <span style={{ flex: 1 }}>Não consegui ler as conexões.</span>
          <button className="au-outline" onClick={() => {
              setError(false);
              setTries((n) => n + 1);
            }}>
            Tentar de novo
          </button>
        </div>
      )}
      {!error && !draft && <div className="au-skel" aria-busy="true" aria-label="Carregando as conexões" style={{ height: 220 }} />}

      {cfg && draft && (
        <>
          <Section
            icon="server"
            title="Servidores"
            state={<State on={cfg.status.sshKey} yes="chave ligada" no="chave desligada" />}
            hint={
              <>
                O Hermes entra por SSH só para ler CPU, memória e disco. Chave SSH do monitor: em Chaves como <Env name={SSH_KEY_ENV} /> (o arquivo da chave privada em base64, numa linha). Vale para todos os servidores abaixo.
              </>
            }
          >
            {draft.servers.length === 0 && <span style={{ fontSize: 12.5, color: "var(--fg3)" }}>Nenhum servidor ainda.</span>}
            {draft.servers.map((s, i) => {
              const upd = (p: Partial<ServerCfg>) => set((d) => ({ ...d, servers: d.servers.map((x, j) => (j === i ? { ...x, ...p } : x)) }));
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1.6fr) minmax(0,1fr) 78px 32px", gap: 8, alignItems: "end" }}>
                    <Field label="Nome" value={s.name} onChange={(v) => upd({ name: serverSlug(v) })} placeholder="vps1" />
                    <Field label="Host" value={s.host} onChange={(v) => upd({ host: v })} mono placeholder="203.0.113.10" />
                    <Field label="Usuário" value={s.user} onChange={(v) => upd({ user: v })} placeholder="deploy" />
                    <Field label="Porta" value={s.port || ""} onChange={(v) => upd({ port: Number(v.replace(/\D/g, "")) || 0 })} type="text" placeholder="22" />
                    <button className="au-iconbtn" aria-label={`Remover o servidor ${s.name || i + 1}`} title="Remover" onClick={() => set((d) => ({ ...d, servers: d.servers.filter((_, j) => j !== i) }))} style={{ height: 34 }}>
                      <Icon name="trash-2" size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
            <button className="au-outline" style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6 }} onClick={() => set((d) => ({ ...d, servers: [...d.servers, { name: "", host: "", user: "", port: 22 }] }))}>
              <Icon name="plus" size={13} />
              Adicionar servidor
            </button>
          </Section>

          <Section icon="network" title="Serviços" hint={<>Endereços que respondem ao “você está bem?” (<code className="hl-mono">/health</code>). Comece com http:// ou https://.</>}>
            {draft.services.length === 0 && <span style={{ fontSize: 12.5, color: "var(--fg3)" }}>Nenhum serviço ainda.</span>}
            {draft.services.map((s, i) => {
              const upd = (p: Partial<ServiceCfg>) => set((d) => ({ ...d, services: d.services.map((x, j) => (j === i ? { ...x, ...p } : x)) }));
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr) 32px", gap: 8, alignItems: "end" }}>
                  <Field label="Nome" value={s.name} onChange={(v) => upd({ name: v })} placeholder="api-core" />
                  <Field label="Endereço" value={s.url} onChange={(v) => upd({ url: v })} mono placeholder="https://api.exemplo.com/health" />
                  <button className="au-iconbtn" aria-label={`Remover o serviço ${s.name || i + 1}`} title="Remover" onClick={() => set((d) => ({ ...d, services: d.services.filter((_, j) => j !== i) }))} style={{ height: 34 }}>
                    <Icon name="trash-2" size={14} />
                  </button>
                </div>
              );
            })}
            <button className="au-outline" style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6 }} onClick={() => set((d) => ({ ...d, services: [...d.services, { name: "", url: "" }] }))}>
              <Icon name="plus" size={13} />
              Adicionar serviço
            </button>
          </Section>

          <Section
            icon="container"
            title="Cluster (Kubernetes)"
            state={<State on={cfg.status.k8s} yes="ligado" no="desligado" />}
            hint={
              <>
                O Hermes consulta a API do cluster só para ler pods e reinícios. Coloque o token de leitura em Chaves como <Env name={draft.k8s.token_env} />
                {draft.k8s.ca_env.trim() && (
                  <>
                    {" "}e o certificado do cluster como <Env name={draft.k8s.ca_env} />
                  </>
                )}
                . Os dois podem ficar em base64, como saem do kubectl.
              </>
            }
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
              <Field label="Endereço da API (server)" value={draft.k8s.server} onChange={(v) => set((d) => ({ ...d, k8s: { ...d.k8s, server: v } }))} mono placeholder="https://k8s.exemplo.com:6443" />
              <Field label="Namespaces (separados por vírgula)" value={draft.k8s.namespaces} onChange={(v) => set((d) => ({ ...d, k8s: { ...d.k8s, namespaces: v } }))} placeholder="default" />
              <Field label="Variável do token" value={draft.k8s.token_env} onChange={(v) => set((d) => ({ ...d, k8s: { ...d.k8s, token_env: v } }))} mono placeholder="K8S_TOKEN" />
              <Field label="Variável do certificado (CA)" value={draft.k8s.ca_env} onChange={(v) => set((d) => ({ ...d, k8s: { ...d.k8s, ca_env: v } }))} mono placeholder="K8S_CA_CERT" />
            </div>
          </Section>

          <Section
            icon="database"
            title="Banco (MongoDB)"
            state={<State on={cfg.status.mongo} yes="ligado" no="desligado" />}
            hint={
              <>
                Leitura apenas. Coloque a URI de conexão em Chaves como <Env name={draft.mongo.uri_env} />; ela não é mostrada aqui.
              </>
            }
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
              <Field label="Variável da URI" value={draft.mongo.uri_env} onChange={(v) => set((d) => ({ ...d, mongo: { ...d.mongo, uri_env: v } }))} mono placeholder="AIBIZ_MONGO_URI" />
              <Field label="Nome do banco" value={draft.mongo.db} onChange={(v) => set((d) => ({ ...d, mongo: { ...d.mongo, db: v } }))} mono placeholder="aibiz_mrz" />
            </div>
          </Section>
        </>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        {dirty && <span role="status" style={{ marginRight: "auto", fontSize: 12, color: "var(--fg3)" }}>Alterações ainda não salvas</span>}
        <button className="au-outline" onClick={onClose} disabled={saving}>
          {dirty ? "Cancelar" : "Fechar"}
        </button>
        <button className="au-primary" disabled={!dirty || saving} onClick={save} style={{ opacity: dirty && !saving ? 1 : 0.4 }}>
          {saving && <Icon name="loader-circle" size={14} className="au-spin" />}
          Salvar conexões
        </button>
      </div>
    </Modal>
  );
}
