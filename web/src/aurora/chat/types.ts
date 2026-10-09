import type { Session } from "../adapter";

/** `denied`: o usuário negou a aprovação — a ferramenta não rodou (não é falha). */
export type StepStatus = "run" | "ok" | "err" | "denied";

/** Resumo em português da saída da ferramenta; o texto/JSON original fica no detalhe. */
export type ToolSummary = { line: string; /** Primeiras linhas da saída, sempre à vista. */ head?: string; /** Conteúdo recolhido (lista de arquivos, texto lido…). */ more?: string; moreLabel?: string; /** Mostra `more` já aberto. */ open?: boolean };

export type ToolStep = {
  id: string;
  /** Família da ferramenta — escolhe o ícone (skill, terminal, delegate, memory, cron, web, file). */
  kind: string;
  name: string;
  target: string;
  dur: string;
  status: StepStatus;
  output: string;
  /** Argumentos como o gateway mandou (para o resumo "enquanto roda"). */
  args?: Record<string, unknown> | null;
  /** Quando começou (ms), para o tempo correndo. */
  startedAt?: number;
  summary?: ToolSummary;
};

export type Block =
  | { kind: "prs"; items: { n: number; title: string; note: string; tag: string; tone: "ok" | "err" | "warn" }[] }
  | { kind: "cron"; title: string; detail: string };

export type ApprovalChoice = "once" | "session" | "always" | "deny";

/** Pedido de aprovação que chegou no meio do turno (comando perigoso etc.). */
export type ChatApproval = {
  id: string;
  command: string;
  description: string;
  choices: ApprovalChoice[];
  /** Ferramenta que pediu (ex.: execute_code), quando o gateway informa. */
  tool?: string;
  status: "pending" | "approved" | "denied" | "cancelled";
  respond: (choice: ApprovalChoice) => void;
};

export type AttachmentKind = "image" | "pdf" | "file";

/** Anexo já enviado ao gateway (ou em envio) que vai junto da próxima mensagem. */
export type Attachment = {
  id: string;
  name: string;
  kind: AttachmentKind;
  size: number;
  /** Prévia (URL do navegador) — só imagens. */
  preview?: string;
  status: "sending" | "ready" | "error";
  error?: string;
  /** Caminhos no servidor: para desanexar (imagens/páginas de PDF). */
  paths?: string[];
  /** Referência `@file:…` que entra no texto do pedido (arquivos comuns). */
  ref?: string;
};

export type SentAttachment = { name: string; kind: AttachmentKind; preview?: string; /** Referência (`@image:caminho`) que o texto do pedido leva: é o que a edição recoloca. */ ref?: string; /** Caminhos no servidor: depois de recarregar o texto só tem esses, e o nome original se perde. */ paths?: string[] };

export type UserMessage = {
  id: string;
  role: "user";
  text: string;
  /** Linha no histórico do gateway — necessária para editar e refazer a partir daqui. */
  rowId?: number;
  attachments?: SentAttachment[];
};

/** Cartão curto de resposta a um comando "/" (ou bloco de sistema discreto). */
export type CommandCard = {
  kind: "card" | "system" | "error";
  icon: string;
  title: string;
  lines?: string[];
  /** Aviso âmbar (markdown curto, ex.: modelo fora do catálogo). */
  warn?: string;
  /** Saída original, recolhida. */
  raw?: string;
};

export type SystemMessage = {
  id: string;
  role: "system";
  cmd: string;
  pending?: boolean;
  card?: CommandCard;
};

export type ErrorKind = "model" | "limit" | "key" | "billing" | "network" | "context" | "policy" | "other";

export type ChatError = {
  kind: ErrorKind;
  title: string;
  body: string;
  /** Detalhe técnico original (recolhido). */
  detail: string;
  retryable: boolean;
  /** Oferece "Trocar modelo". */
  switchModel: boolean;
};

export type TurnStat = { model?: string; secs?: number; tokens?: number; cost?: number | null };

/** Resumo do turno que o gateway grava (`display_metadata.turn` da linha do usuário e `turn_summary` do `message.complete`). Tokens e custo são DESTE turno. */
export type TurnSummary = {
  status: "complete" | "interrupted" | "error";
  model?: string;
  tokens?: { input?: number; output?: number; reasoning?: number; total?: number };
  duration_s?: number;
  /** null = o provedor não informa custo. */
  cost_usd?: number | null;
  cost_status?: string | null;
  error?: string;
};

export type AgentMessage = {
  id: string;
  role: "agent";
  steps: ToolStep[];
  text: string;
  live: boolean;
  blocks?: Block[];
  approval?: ChatApproval;
  /** Rodapé da resposta: modelo, tempo e tokens. */
  stat?: TurnStat;
  learned?: string;
  /** Raciocínio do modelo ("Pensamento"), recolhido por padrão. */
  reasoning?: string;
  /** Quanto o modelo pensou (ms) — "pensou por Ns". */
  thinkMs?: number;
  /** Início do primeiro trecho de raciocínio (ms), para calcular thinkMs ao vivo. */
  thinkStart?: number;
  error?: ChatError;
  /** Turno que parou no meio (Parar, queda ou recarregou antes de terminar). */
  interrupted?: boolean;
  /** Rodapé, "interrompido" e erro vieram do resumo do turno do backend: valem mais que o que o navegador guardou. */
  fromTurn?: boolean;
};
export type ChatMessage = UserMessage | AgentMessage | SystemMessage;

/** O que chega durante um turno — mesmo formato para o mock e para o gateway real. */
export type ChatEvent =
  | { type: "step"; step: ToolStep }
  | { type: "delta"; text: string }
  | { type: "reasoning"; text: string; full?: boolean }
  | { type: "done"; stat?: TurnStat; learned?: string; info?: Partial<SessionInfo> }
  | { type: "error"; message: string; code?: string; retryable?: boolean; provider?: string; model?: string }
  | { type: "approval"; approval: Omit<ChatApproval, "status"> }
  | { type: "approval.cancel"; id: string }
  | { type: "interrupted"; stat?: TurnStat }
  /** Linha do gateway da mensagem do usuário que acabou de ser enviada. */
  | { type: "submitted"; rowId: number };

export type SessionUsage = {
  input: number;
  output: number;
  reasoning: number;
  total: number;
  calls: number;
  /** null = o provedor não informa custo. */
  cost: number | null;
};

export type SessionInfo = {
  model: string;
  /** Provedor escolhido aqui (o backend só informa o modelo). */
  provider?: string;
  backend: string;
  persona: string;
  /** null = ainda não informado (conversa reaberta, antes do 1º turno). */
  ctxUsed: number | null;
  ctxMax: number;
  /** null = o provedor não informa custo (nunca mostrar "$0,00" como se fosse grátis). */
  cost: number | null;
  /** Esforço de raciocínio da sessão ("" = padrão do provedor / ainda não informado). */
  effort?: string;
  /** Modo rápido ligado. */
  fast?: boolean;
  /** O modelo atual tem modo rápido (mostra o interruptor). */
  fastSupported?: boolean;
  /** Título que o gateway conhece (pode vir antes da lista de sessões). */
  title?: string;
  usage?: SessionUsage | null;
  /** Só aparecem no painel quando o backend expõe. */
  memories?: string[];
  skill?: { name: string; version: string };
  subagents?: { name: string; dur: string }[];
};

export type ContextPart = { id: string; label: string; tokens: number };
export type ContextBreakdown = { parts: ContextPart[]; used: number; max: number; estimated: boolean };

export type SlashCommand = { cmd: string; desc: string; skill?: boolean; group?: string };

/** Resultado de `/comando`: texto para mostrar, ou um pedido que segue como turno normal. */
export type SlashResult =
  | { type: "output"; output: string; warning?: string }
  | { type: "send"; message: string }
  | { type: "prefill"; message: string; notice: string }
  | { type: "error"; message: string };

/** Eventos da sessão fora de um turno (o gateway empurra quando algo muda: `/model`, `/reasoning`, título…). */
export type WatchEvent = { type: "info"; info: Partial<SessionInfo> } | { type: "title"; title: string } | { type: "error"; message: string } | { type: "usage"; usage: SessionUsage; ctxUsed: number | null; ctxMax: number };

export interface ChatAdapter {
  sessions(): Promise<Session[]>;
  /** Cria uma sessão nova e devolve o id persistido. */
  create(): Promise<string>;
  /** `null` = conversa nova: sem mensagens, com os padrões do agente (modelo, contexto…). */
  history(sessionId: string | null): Promise<{ messages: ChatMessage[]; info: SessionInfo }>;
  /** Envia o prompt e chama `on` a cada evento até `done`/`error`. `raw`: texto já resolvido (sem tratar "/"). */
  send(sessionId: string, text: string, on: (e: ChatEvent) => void, opts?: SendOpts): Promise<void>;
  /** Roda um `/comando` e devolve o que mostrar. */
  slash(sessionId: string, text: string): Promise<SlashResult>;
  interrupt(sessionId: string): Promise<void>;
  slashCommands(): Promise<SlashCommand[]>;
  /** Troca o modelo da sessão viva; sem sessão (conversa nova), vale como padrão do agente. */
  setModel(sessionId: string | null, provider: string, model: string): Promise<ModelSwitch>;
  /** Esforço de raciocínio da sessão (`config.set reasoning`); sem sessão, vale como padrão. */
  setReasoning(sessionId: string | null, effort: string): Promise<void>;
  setFast(sessionId: string, on: boolean): Promise<boolean>;
  /** Mostrar/ocultar o pensamento nas respostas (vale para todo o Hermes). */
  setShowReasoning(sessionId: string | null, show: boolean): Promise<void>;
  /** Padrão do agente (esforço) para conversa nova / sessão reaberta sem informação. */
  defaults(): Promise<{ effort: string; showReasoning: boolean | null }>;
  watch(sessionId: string, on: (e: WatchEvent) => void): () => void;
  rename(sessionId: string, title: string): Promise<string>;
  /** Volta a última pergunta (o texto devolvido volta ao campo). */
  undo(sessionId: string): Promise<{ removed: number; text: string }>;
  usage(sessionId: string): Promise<{ usage: SessionUsage; ctxUsed: number | null; ctxMax: number } | null>;
  breakdown(sessionId: string): Promise<ContextBreakdown | null>;
  attach(sessionId: string, file: File, kind: AttachmentKind): Promise<{ paths: string[]; ref?: string }>;
  detach(sessionId: string, paths: string[]): Promise<void>;
  /** Solta a sessão viva no gateway (necessário para apagar a conversa que está aberta). */
  release(sessionId: string): Promise<void>;
  /** Relê o que o gateway sabe da sessão agora (modelo real, esforço, modo rápido, título). */
  info(sessionId: string): Promise<Partial<SessionInfo>>;
}

export type SendOpts = {
  raw?: boolean;
  /** Referências `@file:` a anexar ao texto. */
  refs?: string[];
  /** Linha do histórico onde o turno recomeça (editar uma mensagem antiga). */
  truncateFrom?: number;
};

/** Resultado de trocar o modelo: aplicado agora, agendado para o próximo turno, ou só o padrão do agente. */
export type ModelSwitch = { state: "applied" | "pending" | "default"; model: string; provider?: string; warning?: string };
