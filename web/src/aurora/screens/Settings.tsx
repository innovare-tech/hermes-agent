import { useNavigate, useParams } from "react-router";
import { Icon } from "../Icon";
import { agent, useAgentData } from "../agent";
import type { Settings as S } from "../agent/types";
import { setPrefs, setState, toast, useStore, type Direction } from "../store";
import { ModelsScreen } from "../models/ModelsScreen";
import { ApiKeysEditor } from "../ops/ApiKeysEditor";
import { BusinessesEditor } from "../ops/BusinessesEditor";
import { PermissionsPanel } from "../permissions/PermissionsPanel";
import { Notify } from "./Notify";
import { ProfilesPanel } from "./Profiles";
import { AgentHeader } from "./Sessions";

export const DIRECTIONS: { id: Direction; name: string; d: string; c: [string, string, string] }[] = [
  { id: "ambar", name: "Âmbar", d: "Editorial e quente. Serifa nos títulos, grafite e papel.", c: ["#131211", "#e8b04a", "#eee9e1"] },
  { id: "aurora", name: "Aurora", d: "Vidro, cantos macios e luz em movimento ao fundo.", c: ["#0c0e16", "#a395ff", "#5ee0c0"] },
  { id: "sinal", name: "Sinal", d: "Técnico e preciso. Monoespaçada, grade e cantos retos.", c: ["#0a0b0a", "#c6f24e", "#e6ebe3"] },
];

/** Aplica uma mudança de configuração no agente e no estado local. */
export async function applySetting(settings: S, setSettings: (s: S) => void, patch: Parameters<typeof agent.saveSettings>[0], done?: string) {
  try {
    await agent.saveSettings(patch);
  } catch (e) {
    toast(e instanceof Error ? e.message : "Não consegui salvar a configuração");
    return;
  }
  const { tool, ...rest } = patch;
  setSettings({ ...settings, ...rest, tools: tool ? settings.tools.map((t) => (t.id === tool.id ? { ...t, enabled: tool.enabled } : t)) : settings.tools });
  if (done) toast(done);
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 13, color: "var(--fg2)" }}>{sub}</span>
      </div>
      {children}
    </section>
  );
}

const TABS = [
  { id: "geral", label: "Geral", to: "/settings" },
  { id: "modelos", label: "Modelos", to: "/settings/modelos" },
  { id: "avisos", label: "Avisos", to: "/settings/avisos" },
  { id: "perfis", label: "Perfis", to: "/settings/perfis" },
  { id: "permissoes", label: "Permissões", to: "/settings/permissoes" },
  { id: "aparencia", label: "Aparência", to: "/settings/aparencia" },
] as const;

/** Geral · Modelos · Avisos · Perfis · Permissões · Aparência. */
function SettingsTabs({ tab }: { tab: string }) {
  const navigate = useNavigate();
  return (
    <div role="tablist" aria-label="Configurações" style={{ display: "flex", gap: 4, padding: 4, borderRadius: "var(--r)", background: "var(--panel2)", alignSelf: "flex-start" }}>
      {TABS.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === tab} className="au-seg au-seg-lg" onClick={() => t.id !== tab && navigate(t.to)} style={{ padding: "7px 16px" }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Settings() {
  const [s, setS, reload] = useAgentData(() => agent.settings(), []);
  const dir = useStore((x) => x.dir);
  const param = useParams().tab;
  const tab = param === "perfis" || param === "permissoes" || param === "aparencia" || param === "avisos" || param === "modelos" ? param : "geral";
  if (tab === "avisos") {
    return (
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <div className="au-page au-page-agent" style={{ gap: 22, maxWidth: 1180 }}>
          <SettingsTabs tab={tab} />
          <AgentHeader title="Para onde vão os avisos" sub="Escolha em qual tópico do grupo da equipe cada aviso chega, quando ficar em silêncio e quem é chamado no que é crítico." />
          <Notify />
        </div>
      </div>
    );
  }
  if (tab === "modelos") {
    return (
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <div className="au-page au-page-agent" style={{ gap: 22, maxWidth: 1120 }}>
          <SettingsTabs tab={tab} />
          <ModelsScreen />
        </div>
      </div>
    );
  }
  if (tab === "perfis") {
    return (
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <div className="au-page au-page-agent" style={{ gap: 22, maxWidth: 1060 }}>
          <SettingsTabs tab={tab} />
          <ProfilesPanel />
        </div>
      </div>
    );
  }
  if (tab === "permissoes") {
    return (
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <div className="au-page au-page-agent" style={{ gap: 22, maxWidth: 1140 }}>
          <SettingsTabs tab={tab} />
          <PermissionsPanel />
        </div>
      </div>
    );
  }
  if (!s) return <div style={{ flex: 1 }} />;
  const prov = s.providers.find((p) => p.id === s.provider) ?? s.providers[0];
  const apply = (patch: Parameters<typeof agent.saveSettings>[0], done?: string) => applySetting(s, setS, patch, done);

  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page au-page-agent" style={{ gap: 40 }}>
        <SettingsTabs tab={tab} />
        <AgentHeader title="Configurações" sub="Modelo, chaves, ambiente e aparência do Hermes.">
          <button className="au-outline" onClick={() => setState({ onboarding: 0 })} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, background: "var(--panel)" }}>
            <Icon name="rocket" size={14} color="var(--acc)" />
            Assistente de configuração
          </button>
        </AgentHeader>

        {tab === "geral" && (
          <>
        <Section title="Negócios" sub="Separe canais, contatos, playbooks e custos por negócio. O seletor da barra lateral filtra todas as telas.">
          <BusinessesEditor />
        </Section>

        <Section title="Chaves de API" sub="Credenciais dos provedores de modelo e das ferramentas, guardadas só neste servidor. O valor salvo nunca aparece de volta.">
          <ApiKeysEditor onChange={reload} />
        </Section>

        <Section title="Provedor de modelo" sub="Qual serviço de IA o Hermes usa para pensar. Dá para trocar quando quiser. Modelo por tarefa, provedores próprios e limites de gasto ficam na aba Modelos.">
          {s.modelError ? (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--warn)", lineHeight: 1.5 }}>
              Não consegui listar os modelos: {s.modelError}
            </p>
          ) : (
            s.providers.length === 0 && <p style={{ margin: 0, fontSize: 13, color: "var(--fg2)" }}>Nenhum provedor com credencial. Adicione uma chave em Chaves de API acima.</p>
          )}
          <div role="radiogroup" aria-label="Provedor" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10 }}>
            {s.providers.map((p) => (
              <button key={p.id} role="radio" aria-checked={p.id === s.provider} className="au-choice" onClick={() => p.id !== s.provider && apply({ provider: p.id, model: p.models[0] }, `${p.name} · ${p.models[0]}`)}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 500 }}>
                  {p.name}
                  <Icon name={p.id === s.provider ? "circle-check" : "circle"} size={14} color="var(--acc)" className="au-ml-auto" />
                </span>
                <span style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.4 }}>{p.description}</span>
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Modelo" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {prov?.models.map((m) => (
              <button key={m} role="radio" aria-checked={m === s.model} className="au-pill" aria-pressed={m === s.model} onClick={() => m !== s.model && apply({ provider: prov.id, model: m }, "Modelo: " + m)} style={{ fontFamily: "var(--fm)", fontSize: 11.5, padding: "7px 12px" }}>
                {m}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Onde os comandos rodam" sub="Onde o Hermes executa comandos e mexe em arquivos quando você pede.">
          <div role="radiogroup" aria-label="Onde os comandos rodam" style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 4, borderRadius: "var(--r)", background: "var(--panel2)", alignSelf: "flex-start" }}>
            {s.backends.map((b) => (
              <button key={b.id} role="radio" aria-checked={b.id === s.backend} className="au-seg au-seg-lg" onClick={() => b.id !== s.backend && apply({ backend: b.id }, "Comandos rodam em " + b.name)}>
                {b.name}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Personalidade" sub="O jeito das respostas: mais curtas, mais técnicas, mais didáticas…">
          <div role="radiogroup" aria-label="Personalidade" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {s.personas.map((p) => (
              <button key={p} role="radio" aria-checked={p === s.persona} className="au-pill" aria-pressed={p === s.persona} onClick={() => p !== s.persona && apply({ persona: p }, "Personalidade: " + p)} style={{ fontSize: 13, padding: "7px 14px" }}>
                {p}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Ferramentas" sub={`${s.tools.filter((t) => t.enabled).length} de ${s.tools.length} habilitadas.`}>
          <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--panel)", backdropFilter: "var(--blur)", overflow: "hidden" }}>
            {s.tools.map((t) => (
              <div key={t.id} style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr) 40px", gap: 14, alignItems: "center", padding: "13px 18px", borderBottom: "1px solid var(--line)" }}>
                <Icon name={t.icon} size={15} color="var(--fg2)" />
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{t.name}</span>
                  <span style={{ fontSize: 12, color: "var(--fg3)" }}>
                    {t.description}
                    {!t.available && <span style={{ color: "var(--warn)" }}> · indisponível: falta configurar</span>}
                  </span>
                </span>
                <button role="switch" aria-checked={t.enabled} aria-label={`${t.enabled ? "Desabilitar" : "Habilitar"} ${t.name}`} className="au-switch lg" onClick={() => apply({ tool: { id: t.id, enabled: !t.enabled } })}>
                  <span />
                </button>
              </div>
            ))}
          </div>
        </Section>
          </>
        )}

        {tab === "aparencia" && (
        <Section title="Aparência" sub="Três direções de design para a interface.">
          <div role="radiogroup" aria-label="Direção de design" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
            {DIRECTIONS.map((d) => (
              <button key={d.id} role="radio" aria-checked={d.id === dir} className="au-choice" onClick={() => setPrefs({ dir: d.id })} style={{ gap: 10 }}>
                <span style={{ display: "flex", gap: 5 }}>
                  {d.c.map((c) => (
                    <span key={c} style={{ width: 22, height: 22, borderRadius: "50%", background: c }} />
                  ))}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{d.name}</span>
                <span style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.45 }}>{d.d}</span>
              </button>
            ))}
          </div>
        </Section>
        )}
      </div>
    </div>
  );
}
