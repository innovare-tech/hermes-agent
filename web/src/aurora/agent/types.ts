// Contrato das telas do agente (Sessões, Memória, Skills, Agendamentos, Subagentes, Gateways, Logs,
// Configurações). Mesmo padrão do OpsAdapter: mock do protótipo + adapter real por cima.

export type SessionRow = { id: string; title: string; source: string; icon: string; snippet: string; msgs: number; when: string };

export type MemoryTarget = "memory" | "user";
/** MEMORY.md (notas do agente) e USER.md (perfil de você), entrada por entrada. */
export type MemoryData = { memory: string[]; user: string[]; limits: Record<MemoryTarget, number>; enabled: Record<MemoryTarget, boolean> };

/** origin: incluída no Hermes, instalada do Hub, ou criada nesta máquina (pelo agente ou por você). */
export type Skill = { name: string; origin: "incluida" | "hub" | "local"; description: string; uses: number; category: string; enabled: boolean };

export type CronJob = { id: string; title: string; human: string; expr: string; next: string; dest: string; destIcon: string; enabled: boolean; profile?: string };
export type CronPreview = { human: string; expr: string; dest: string };

export type Subagent = { id: string; name: string; task: string; pct: number; now: string; elapsed: string; backend: string; tools: number; parent: string };
export type SubagentDone = { task: string; name: string; tokens: string; dur: string };

/** Credencial/ajuste de um canal (vem do catálogo do backend, gravado no .env). */
export type GatewayField = { key: string; label: string; help: string; url: string | null; secret: boolean; list: boolean; advanced: boolean; isSet: boolean; value: string; example?: string };
export type Gateway = {
  id: string;
  name: string;
  mono: string;
  account: string;
  enabled: boolean;
  configured: boolean;
  status: "conectado" | "pareando" | "desligado" | "erro";
  stat: string;
  description: string;
  docsUrl: string;
  fields: GatewayField[];
  /** Canal principal (aparece antes); os demais ficam em "Outros canais". */
  main: boolean;
};
/** Provedor de modelo no assistente: com chave (lista modelos) ou sem (pede a chave, ou o terminal). */
export type ProviderOption = {
  id: string;
  name: string;
  connected: boolean;
  /** Variável do .env para colar a chave; null = autenticação que só o terminal faz (OAuth, nuvem). */
  keyEnv: string | null;
  models: string[];
  current: boolean;
};
/** Chave de API do .env (provedores de modelo e ferramentas). */
export type ApiKey = { key: string; description: string; url: string | null; category: string; isSet: boolean; preview: string; advanced: boolean };
export type GatewaySummary = { running: boolean; label: string };

export type LogLevel = "INFO" | "TOOL" | "WARN" | "ERRO";
export type LogLine = { id: string; t: string; level: LogLevel; src: string; msg: string };

export type Provider = { id: string; name: string; description: string; models: string[] };
export type Settings = {
  providers: Provider[];
  provider: string;
  model: string;
  backends: { id: string; name: string; description: string }[];
  backend: string;
  personas: string[];
  persona: string;
  tools: { id: string; name: string; description: string; icon: string; enabled: boolean; available: boolean }[];
  /** Opções de modelo indisponíveis (o resto da tela segue funcionando). */
  modelError?: string;
};

export interface AgentAdapter {
  sessions(query: string, source: string): Promise<SessionRow[]>;
  renameSession(id: string, title: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  memory(): Promise<MemoryData>;
  addMemory(target: MemoryTarget, content: string): Promise<MemoryData>;
  editMemory(target: MemoryTarget, entry: string, content: string): Promise<MemoryData>;
  removeMemory(target: MemoryTarget, entry: string): Promise<MemoryData>;
  skills(): Promise<Skill[]>;
  toggleSkill(name: string, enabled: boolean): Promise<void>;
  skillContent(name: string): Promise<string>;
  crons(): Promise<CronJob[]>;
  toggleCron(job: CronJob): Promise<void>;
  /** Linguagem natural → prévia (null enquanto não reconhece). */
  previewCron(text: string): CronPreview | null;
  createCron(text: string): Promise<CronJob>;
  subagents(): Promise<{ running: Subagent[]; done: SubagentDone[] }>;
  gateways(): Promise<{ summary: GatewaySummary; items: Gateway[] }>;
  toggleGateway(g: Gateway): Promise<void>;
  /** Grava credenciais (só as preenchidas) e/ou apaga as listadas em ``clear``. ``restart``: precisa reiniciar o gateway. */
  saveGateway(id: string, env: Record<string, string>, clear?: string[]): Promise<{ restart: boolean }>;
  testGateway(id: string): Promise<{ ok: boolean; message: string }>;
  gatewayAction(action: "start" | "stop" | "restart"): Promise<void>;
  apiKeys(): Promise<ApiKey[]>;
  providerCatalog(refresh?: boolean): Promise<ProviderOption[]>;
  setApiKey(key: string, value: string): Promise<void>;
  deleteApiKey(key: string): Promise<void>;
  logs(): Promise<LogLine[]>;
  settings(): Promise<Settings>;
  saveSettings(patch: Partial<Pick<Settings, "provider" | "model" | "backend" | "persona">> & { tool?: { id: string; enabled: boolean } }): Promise<void>;
}
