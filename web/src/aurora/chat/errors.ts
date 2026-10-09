import type { ChatError, ErrorKind } from "./types";

/** `error_surface.code` do gateway (FailoverReason) → tipo de erro. */
const BY_CODE: Record<string, ErrorKind> = {
  auth: "key",
  auth_permanent: "key",
  billing: "billing",
  billing_unverified: "billing",
  rate_limit: "limit",
  upstream_rate_limit: "limit",
  overloaded: "limit",
  server_error: "other",
  timeout: "network",
  ssl_cert_verification: "network",
  stream_drop: "network",
  context_overflow: "context",
  payload_too_large: "context",
  model_not_found: "model",
  model_entitlement: "model",
  content_policy_blocked: "policy",
  provider_policy_blocked: "policy",
};

/** Quando o gateway não manda o código: reconhece pelo texto do provedor (inglês). */
const BY_TEXT: [RegExp, ErrorKind][] = [
  [/\b404\b|not[ _]found|does not exist|unknown model|invalid model/i, "model"],
  [/\b429\b|rate.?limit|quota|resource_exhausted|too many requests|overloaded|\b503\b|\b529\b/i, "limit"],
  [/\b401\b|\b403\b|api[ _-]?key|unauthori[sz]ed|unauthenticated|permission_denied|invalid.*(key|token|credential)/i, "key"],
  [/\b402\b|billing|insufficient|credit|payment/i, "billing"],
  [/context.{0,20}(length|window|limit|exceed)|too many tokens|maximum context|prompt is too long/i, "context"],
  [/timed? ?out|timeout|econn|enotfound|network|connection|fetch failed|socket|dns|stream/i, "network"],
  [/safety|policy|blocked|content filter/i, "policy"],
];

const COPY: Record<ErrorKind, { title: (model: string) => string; body: string; retryable: boolean; switchModel: boolean }> = {
  model: { title: (m) => (m ? `O modelo ${m} não existe neste provedor` : "Esse modelo não existe neste provedor"), body: "Escolha outro modelo para continuar.", retryable: false, switchModel: true },
  limit: { title: () => "O provedor atingiu o limite de uso", body: "Pedidos demais ou cota esgotada. Espere um pouco e tente de novo, ou troque de modelo.", retryable: true, switchModel: true },
  key: { title: () => "Chave de API inválida ou sem permissão", body: "Confira a chave deste provedor em Configurações → Chaves de API.", retryable: false, switchModel: true },
  billing: { title: () => "Sem saldo no provedor", body: "A conta do provedor está sem crédito ou com cobrança pendente. Recarregue ou use outro provedor.", retryable: false, switchModel: true },
  network: { title: () => "Não consegui falar com o provedor", body: "Falha de rede ou o provedor não respondeu a tempo. Tente de novo em instantes.", retryable: true, switchModel: false },
  context: { title: () => "A conversa ficou grande demais para este modelo", body: "Use Compactar no painel ao lado, ou troque para um modelo com janela de contexto maior.", retryable: false, switchModel: true },
  policy: { title: () => "O provedor bloqueou este pedido", body: "O filtro de segurança do provedor recusou a mensagem. Reescreva o pedido ou troque de modelo.", retryable: false, switchModel: true },
  other: { title: () => "O provedor devolveu um erro", body: "Tente de novo. Se repetir, abra o detalhe técnico abaixo.", retryable: true, switchModel: true },
};

/** "models/gemini-9" ou "model `x`" dentro do texto do provedor. */
export function modelFromText(t: string): string {
  const m = t.match(/models\/([\w.\-:/]+)/i) ?? t.match(/model[ :=`'"]+([\w.\-:/]+)/i);
  return m ? m[1].replace(/[.,;:]+$/, "") : "";
}

export const isErrorText = (t: string) => /^\s*⚠/.test(t);

/** Erro do provedor → cartão em português, com o detalhe técnico guardado. */
export function classifyError(message: string, o: { code?: string; retryable?: boolean; model?: string } = {}): ChatError {
  const detail = message.replace(/^\s*⚠️?\s*/, "").trim();
  const kind: ErrorKind = (o.code && BY_CODE[o.code]) || BY_TEXT.find(([re]) => re.test(detail))?.[1] || "other";
  const c = COPY[kind];
  // O modelo que falhou: o que o gateway diz, senão o que aparece no texto, senão o do chip.
  const model = (kind === "model" && modelFromText(detail)) || o.model || "";
  return { kind, title: c.title(model), body: c.body, detail, retryable: o.retryable ?? c.retryable, switchModel: c.switchModel };
}

/** Linha de transição que o backend grava quando o turno acaba sem resposta ("Your request was not processed…"). */
const FAILED_NOTICE = /^\s*(?:your (?:request|message) (?:was|were) not (?:processed|completed|answered)|this turn did not complete)\b/i;
const PARTIAL_NOTICE = /^\s*this turn did not complete\b/i;
const NOTICE_FULL = /(?:your (?:request|message) (?:was|were) not (?:processed|completed|answered)\.?(?:\s+send it again[^.]*\.)?|this turn did not complete\.?(?:\s+some actions may already have run[^.]*\.)?)/gi;

export const isFailedTurnText = (t: string) => FAILED_NOTICE.test(t);

/** Texto do aviso do backend tirado da resposta (sobra o que o agente tenha escrito antes dele). */
export const stripFailedTurn = (t: string) => t.replace(NOTICE_FULL, "").trim();

/** Turno sem resposta no histórico (o backend grava só o aviso em inglês) → cartão em português. */
export function failedTurnError(notice: string): ChatError {
  const partial = PARTIAL_NOTICE.test(notice);
  return {
    kind: "other",
    title: partial ? "Este turno não terminou" : "Esta pergunta não foi respondida",
    body: partial ? "Algumas ações podem já ter sido feitas. Confira o resultado antes de enviar de novo." : "Envie de novo se ainda quiser.",
    detail: notice.trim(),
    retryable: true,
    switchModel: false,
  };
}
