// Contrato das telas do agente (Sessões, Memória, Skills, Agendamentos, Subagentes, Gateways, Logs,
// Configurações). Mesmo padrão do OpsAdapter: mock do protótipo + adapter real por cima.

export type SessionRow = { id: string; title: string; source: string; icon: string; snippet: string; msgs: number; when: string };

export type MemoryEntry = { id: string; text: string; kind: string; source: string; pinned: boolean };
export type MemoryData = { entries: MemoryEntry[]; profile: { k: string; v: string }[]; note: string };

export type Skill = { name: string; origin: "aprendida" | "hub" | "sua"; description: string; uses: number; version: string; updated: string };

export type CronJob = { id: string; title: string; human: string; expr: string; next: string; dest: string; destIcon: string; enabled: boolean; profile?: string };
export type CronPreview = { human: string; expr: string; dest: string };

export type Subagent = { id: string; name: string; task: string; pct: number; now: string; elapsed: string; backend: string; tools: number; parent: string };
export type SubagentDone = { task: string; name: string; tokens: string; dur: string };

export type Gateway = { id: string; name: string; mono: string; account: string; enabled: boolean; status: "conectado" | "pareando" | "desligado" | "erro"; stat: string };
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
  tools: { id: string; name: string; description: string; icon: string; enabled: boolean }[];
};

export interface AgentAdapter {
  sessions(query: string, source: string): Promise<SessionRow[]>;
  memory(): Promise<MemoryData>;
  setMemory(entries: MemoryEntry[]): Promise<void>;
  skills(): Promise<Skill[]>;
  crons(): Promise<CronJob[]>;
  toggleCron(job: CronJob): Promise<void>;
  /** Linguagem natural → prévia (null enquanto não reconhece). */
  previewCron(text: string): CronPreview | null;
  createCron(text: string): Promise<CronJob>;
  subagents(): Promise<{ running: Subagent[]; done: SubagentDone[] }>;
  gateways(): Promise<{ summary: GatewaySummary; items: Gateway[] }>;
  toggleGateway(g: Gateway): Promise<void>;
  logs(): Promise<LogLine[]>;
  settings(): Promise<Settings>;
  saveSettings(patch: Partial<Pick<Settings, "provider" | "model" | "backend" | "persona">> & { tool?: { id: string; enabled: boolean } }): Promise<void>;
}
