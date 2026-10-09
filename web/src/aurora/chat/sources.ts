// Origem de uma sessão (campo `source` do banco) → rótulo e ícone para humanos.
const LABEL: Record<string, string> = {
  web: "Web",
  tui: "Terminal",
  cli: "Terminal",
  desktop: "Desktop",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  discord: "Discord",
  slack: "Slack",
  signal: "Signal",
  email: "E-mail",
  sms: "SMS",
  matrix: "Matrix",
  cron: "Agendamento",
  api_server: "API",
  webhook: "Webhook",
};
const ICON: Record<string, string> = { web: "globe", tui: "square-terminal", cli: "square-terminal", desktop: "app-window", telegram: "send", whatsapp: "phone", discord: "message-circle", slack: "hash", cron: "calendar-clock" };

export const sourceLabel = (src?: string | null) => {
  const s = (src ?? "web").toLowerCase();
  return LABEL[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
};
export const sourceIcon = (src?: string | null) => ICON[(src ?? "web").toLowerCase()] ?? "globe";

/** "1 mensagem", "4 mensagens". */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "07 out, 18:37" — numa linha. */
export function shortWhen(ts?: number | null) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const month = d.toLocaleString("pt-BR", { month: "short" }).replace(".", "");
  return `${String(d.getDate()).padStart(2, "0")} ${month}, ${d.toTimeString().slice(0, 5)}`;
}

/** Sessões internas do Escutar (análise em lote, rodam como cron): não são conversas, ficam fora da barra lateral. */
export const isListenSession = (x: { id: string; title: string }) => x.title.startsWith("Escutar ·") || x.id.startsWith("cron_ops-listen-");
