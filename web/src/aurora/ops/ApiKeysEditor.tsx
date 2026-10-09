import { useState } from "react";
import { agent, useAgentData } from "../agent";
import type { ApiKey } from "../agent/types";
import { Icon } from "../Icon";
import { ask, toast } from "../store";

const TABS = [
  { id: "provider", label: "Modelos" },
  { id: "tool", label: "Ferramentas" },
  { id: "custom", label: "Outras" },
] as const;

/** Nomes para humanos; o nome da variável aparece em letra pequena. */
const KEY_NAME: Record<string, string> = {
  OPENROUTER_API_KEY: "OpenRouter", ANTHROPIC_API_KEY: "Anthropic (Claude)", ANTHROPIC_TOKEN: "Anthropic (token de login)", OPENAI_API_KEY: "OpenAI",
  GEMINI_API_KEY: "Google AI Studio (Gemini)", GOOGLE_API_KEY: "Google (Gemini)", DEEPSEEK_API_KEY: "DeepSeek", XAI_API_KEY: "xAI (Grok)",
  NVIDIA_API_KEY: "NVIDIA", HF_TOKEN: "Hugging Face", COPILOT_GITHUB_TOKEN: "GitHub Copilot", GH_TOKEN: "GitHub (Copilot)", FIREWORKS_API_KEY: "Fireworks",
  NOVITA_API_KEY: "Novita", DEEPINFRA_API_KEY: "DeepInfra", MINIMAX_API_KEY: "MiniMax", KIMI_API_KEY: "Kimi (Moonshot)", ZAI_API_KEY: "Z.ai (GLM)",
  DASHSCOPE_API_KEY: "Alibaba (Qwen)", OLLAMA_API_KEY: "Ollama Cloud", MISTRAL_API_KEY: "Mistral", AZURE_FOUNDRY_API_KEY: "Azure AI Foundry",
  BRAVE_SEARCH_API_KEY: "Busca Brave", TAVILY_API_KEY: "Busca Tavily", EXA_API_KEY: "Busca Exa", PERPLEXITY_API_KEY: "Perplexity", FIRECRAWL_API_KEY: "Firecrawl (leitura de sites)",
  GROQ_API_KEY: "Groq (transcrição de voz)", BROWSERBASE_API_KEY: "Browserbase (navegador na nuvem)", BROWSER_USE_API_KEY: "Browser Use", ELEVENLABS_API_KEY: "ElevenLabs (voz)", FAL_KEY: "fal.ai (imagens)",
  GITHUB_TOKEN: "GitHub", MEM0_API_KEY: "Mem0 (memória)", HONCHO_API_KEY: "Honcho (memória)", SUPERMEMORY_API_KEY: "Supermemory", VOICE_TOOLS_OPENAI_KEY: "OpenAI (voz)",
};
/** Descrições em pt-BR das chaves do próprio Hermes (Saúde, Copiloto, triagem). */
const KEY_DESC: Record<string, string> = {
  AIBIZ_MONGO_URI: "Conexão com o MongoDB da Aibiz (usuário só leitura): diretório de clientes e Saúde",
  HEALTH_SSH_KEY: "Chave SSH (privada, em base64) do usuário de monitoramento das VPS",
  K8S_TOKEN: "Token da conta de serviço de leitura do Kubernetes (Saúde)",
  K8S_CA_CERT: "Certificado (CA) do cluster Kubernetes, em base64",
  COPILOT_MCP_JWT_SECRET: "Segredo que assina os tokens do Copiloto do Gestor (o mesmo do MCP)",
  TYPESAFE_API_KEY: "Chave da TypeSafe (Jev), usada na triagem dos grupos",
  TELEGRAM_BOT_TOKEN: "Token do bot do Telegram (BotFather)",
};
/** Descrição em pt-BR: a própria, senão uma genérica pelo nome (o catálogo vem em inglês). */
export const keyDescription = (key: string) =>
  KEY_DESC[key] ?? (/_(BASE_)?URL$|_ENDPOINT$/.test(key) ? `Endereço (URL) de ${keyName(key.replace(/_(BASE_)?URL$|_ENDPOINT$/, "_KEY"))}`
    : /_(API_KEY|TOKEN|KEY)$/.test(key) ? `Chave de acesso de ${keyName(key)}` : `Configuração ${keyName(key)}`);
/** Provedor que pode estar conectado por outro meio (login/OAuth) sem a chave no .env. */
const KEY_PROVIDER: Record<string, string> = { ANTHROPIC_API_KEY: "anthropic", GEMINI_API_KEY: "gemini", COPILOT_GITHUB_TOKEN: "copilot", NVIDIA_API_KEY: "nvidia", OPENAI_API_KEY: "openai-api", OPENROUTER_API_KEY: "openrouter" };
export const keyName = (key: string) => KEY_NAME[key] ?? key.replace(/_(API_KEY|TOKEN|KEY)$/, "").split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
/** Relevante = chave conhecida (mesmo que o catálogo a marque avançada) ou credencial comum;
 *  URLs, IDs e ajustes internos ficam em "avançadas". */
export const isRelevantKey = (k: ApiKey) => k.key in KEY_NAME || (/(_API_KEY|_TOKEN|_KEY)$/.test(k.key) && !/^HERMES_|OAUTH/.test(k.key) && !k.advanced);
/** "«redacted:nvap…dSsA»" → "termina em dSsA". */
export const savedHint = (preview: string) => {
  const tail = preview.replace(/[«»]/g, "").match(/([A-Za-z0-9_-]{2,6})\W*$/)?.[1];
  return tail ? `salva · termina em ${tail}` : "salva";
};

function Row({ k, onChange, viaLogin }: { k: ApiKey; onChange: () => void; viaLogin?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const save = async () => {
    if (!value.trim()) return;
    try {
      await agent.setApiKey(k.key, value.trim());
      toast(`${k.key} salva`);
      setEditing(false);
      setValue("");
      onChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui salvar");
    }
  };
  const remove = async () => {
    if (!(await ask({ title: `Remover ${k.key}?`, body: "O que usa essa chave para de funcionar até você cadastrar outra.", confirm: "Remover", danger: true }))) return;
    try {
      await agent.deleteApiKey(k.key);
      toast(`${k.key} removida`);
      onChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui remover");
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "11px 16px", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: k.isSet || viaLogin ? "var(--ok)" : "var(--line2)" }} />
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>
            {keyName(k.key)} <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, fontWeight: 400, color: "var(--fg3)" }}>{k.key}</span>
          </span>
          <span style={{ fontSize: 12, color: k.isSet || viaLogin ? "var(--ok)" : "var(--fg3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {k.isSet ? savedHint(k.preview) : viaLogin ? "conectado por login (sem chave aqui)" : k.key in KEY_NAME ? "não configurada" : keyDescription(k.key)}
          </span>
        </span>
        {k.url && !k.isSet && (
          <a href={k.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--acc)", flex: "none" }}>
            obter
          </a>
        )}
        <button className="au-mini" aria-label={`${k.isSet ? "Trocar" : "Definir"} ${k.key}`} title={k.isSet ? "Trocar" : "Definir"} onClick={() => setEditing(!editing)}>
          <Icon name={k.isSet ? "pencil" : "plus"} size={13} />
        </button>
        {k.isSet && (
          <button className="au-mini danger" aria-label={`Remover ${k.key}`} title="Remover" onClick={remove}>
            <Icon name="trash-2" size={13} />
          </button>
        )}
      </div>
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          style={{ display: "flex", gap: 8 }}
        >
          <input aria-label={`Valor de ${k.key}`} type="password" autoComplete="off" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="cole a chave" className="au-inline" style={{ flex: 1 }} />
          <button type="submit" className="au-primary" style={{ opacity: value.trim() ? 1 : 0.5 }}>
            Salvar
          </button>
        </form>
      )}
    </div>
  );
}

/** Chaves do .env desta máquina (provedores de modelo e ferramentas). O valor salvo nunca volta para a tela. */
export function ApiKeysEditor({ onChange }: { onChange?: () => void }) {
  const [keys, , reload] = useAgentData(() => agent.apiKeys(), []);
  const [connected] = useAgentData(() => agent.providerCatalog().then((c) => new Set(c.filter((p) => p.connected).map((p) => p.id))), []);
  const [advanced, setAdvanced] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("provider");
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const inTab = (keys ?? []).filter((k) => k.category === tab);
  const hidden = inTab.filter((k) => !isRelevantKey(k) && !k.isSet).length;
  const list = inTab
    .filter((k) => (needle ? k.key.toLowerCase().includes(needle) || keyName(k.key).toLowerCase().includes(needle) || k.description.toLowerCase().includes(needle) : advanced || k.isSet || isRelevantKey(k)))
    .sort((a, b) => Number(b.isSet) - Number(a.isSet) || Number(a.advanced) - Number(b.advanced) || a.key.localeCompare(b.key));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div role="tablist" aria-label="Tipo de chave" style={{ display: "flex", gap: 4, padding: 4, borderRadius: "var(--r)", background: "var(--panel2)" }}>
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className="au-seg au-seg-lg" onClick={() => setTab(t.id)}>
              {t.label} {keys ? (() => { const n = keys.filter((k) => k.category === t.id && k.isSet).length; return `· ${n} ${n === 1 ? "salva" : "salvas"}`; })() : ""}
            </button>
          ))}
        </div>
        <input aria-label="Buscar chave" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar (OpenRouter, Anthropic…)" className="au-inline" style={{ flex: 1, minWidth: 180, padding: "8px 12px", border: "1px solid var(--line2)", borderRadius: "var(--r2)", background: "var(--panel)" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--panel)" }}>
        {list.map((k) => (
          <Row
            key={k.key}
            k={k}
            viaLogin={!k.isSet && !!KEY_PROVIDER[k.key] && !!connected?.has(KEY_PROVIDER[k.key])}
            onChange={() => {
              reload();
              onChange?.();
            }}
          />
        ))}
        {keys && list.length === 0 && <p style={{ margin: 0, padding: 16, fontSize: 13, color: "var(--fg3)" }}>Nada aqui{needle ? " com esse nome" : ""}.</p>}
      </div>
      {!needle && hidden > 0 && (
        <button className="au-chip" onClick={() => setAdvanced(!advanced)} style={{ alignSelf: "flex-start", cursor: "pointer", background: "transparent" }}>
          {advanced ? "Esconder avançadas" : `Mostrar avançadas (${hidden}: endereços, IDs e ajustes)`}
        </button>
      )}
    </div>
  );
}
