import type { CronPreview } from "./types";

// ponytail: cobre os padrões comuns em pt-BR ("toda sexta às 18h", "todo dia 7:30", "dias úteis às 9h",
// "todo dia 1 às 10h"). Frases fora disso não geram prévia; aí o usuário cai na tela antiga de cron.
const DOW: [RegExp, number, string][] = [
  [/domingo/, 0, "todo domingo"],
  [/segunda/, 1, "toda segunda"],
  [/ter[cç]a/, 2, "toda terça"],
  [/quarta/, 3, "toda quarta"],
  [/quinta/, 4, "toda quinta"],
  [/sexta/, 5, "toda sexta"],
  [/s[aá]bado/, 6, "todo sábado"],
];

const DEST: [RegExp, string][] = [
  [/discord/, "Discord"],
  [/telegram/, "Telegram"],
  [/whats ?app/, "WhatsApp"],
  [/e-?mail/, "Email"],
  [/slack/, "Slack"],
];

const pad = (n: number) => String(n).padStart(2, "0");

export type CronParse = CronPreview & { prompt: string };

/** Frase em português → cron de 5 campos + descrição + destino + o que fazer. */
export function parseCronPt(text: string): CronParse | null {
  const t = text.toLowerCase();
  const time = t.match(/(?:[àa]s?\s+)?(\d{1,2})\s*(?:h|:)\s*(\d{2})?\b/);
  const hour = time ? Math.min(23, Number(time[1])) : 9;
  const min = time?.[2] ? Math.min(59, Number(time[2])) : 0;
  const at = `${pad(hour)}:${pad(min)}`;

  let dom = "*";
  let dow = "*";
  let human: string;
  const monthDay = t.match(/todo dia (\d{1,2})\b(?!\s*(?:h|:))/);
  const weekday = DOW.find(([re]) => new RegExp(`(?:tod[ao]s?|cada|às|as)\\s+(?:as\\s+|os\\s+)?${re.source}`).test(t));
  if (/dias [úu]teis/.test(t)) {
    dow = "1-5";
    human = "dias úteis";
  } else if (weekday) {
    dow = String(weekday[1]);
    human = weekday[2];
  } else if (monthDay) {
    dom = String(Math.min(31, Number(monthDay[1])));
    human = `todo dia ${dom}`;
  } else if (/todo dia|todos os dias|diariamente/.test(t)) {
    human = "todo dia";
  } else return null;

  const dest = DEST.find(([re]) => re.test(t))?.[1] ?? "Conversa";
  const comma = text.indexOf(",");
  const prompt = (comma >= 0 ? text.slice(comma + 1) : text).trim();
  return { human: `${human}, ${at}`, expr: `${min} ${hour} ${dom} * ${dow}`, dest, prompt: prompt.charAt(0).toUpperCase() + prompt.slice(1) };
}

const DOW_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const EN_DAY: Record<string, string> = { weekday: "dias úteis", day: "todo dia", sunday: "todo domingo", monday: "toda segunda", tuesday: "toda terça", wednesday: "toda quarta", thursday: "toda quinta", friday: "toda sexta", saturday: "todo sábado" };

/** "9am" / "6:30pm" / "18:00" → "09:00". */
function clock(t: string): string {
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return t;
  let h = Number(m[1]) % 24;
  if (m[3]?.toLowerCase() === "pm" && h < 12) h += 12;
  if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
  return `${pad(h)}:${m[2] ?? "00"}`;
}

/** Frase em português ("dias úteis às 9h", "a cada 2 horas") → formato do agendador. Já no formato? Mantém. */
export function toSchedule(text: string): string {
  const t = text.trim();
  if (!t || /^(every\b|\d+[mhd]$|[\d*])/i.test(t)) return t;
  const every = t.toLowerCase().match(/a cada (\d+)\s*(h|horas?|min|minutos?)\b/);
  if (every) return `every ${every[1]}${every[2].startsWith("h") ? "h" : "m"}`;
  return parseCronPt(t)?.expr ?? t;
}

/** Formato do agendador → português, para mostrar ("0 9 * * 1-5" → "dias úteis às 09:00"). */
export function humanizeSchedule(s: string): string {
  const t = s.trim();
  const cron = t.match(/^(\d+) (\d+) (\*|\d+) \* (\*|[\d,-]+)$/);
  if (cron) {
    const at = `${pad(Number(cron[2]))}:${pad(Number(cron[1]))}`;
    if (cron[3] !== "*") return `todo dia ${cron[3]} às ${at}`;
    if (cron[4] === "*") return `todo dia às ${at}`;
    if (cron[4] === "1-5") return `dias úteis às ${at}`;
    if (/^\d$/.test(cron[4])) return `${Number(cron[4]) === 0 || Number(cron[4]) === 6 ? "todo" : "toda"} ${DOW_PT[Number(cron[4])]} às ${at}`;
    return t;
  }
  const iv = t.match(/^(?:every\s+)?(\d+)\s*([mhd])$/i);
  if (iv) {
    const n = Number(iv[1]);
    const unit = iv[2].toLowerCase();
    if (unit === "m" && n % 60 === 0) return n === 60 ? "a cada hora" : `a cada ${n / 60} horas`;
    return unit === "m" ? `a cada ${n} min` : unit === "h" ? (n === 1 ? "a cada hora" : `a cada ${n} horas`) : n === 1 ? "todo dia" : `a cada ${n} dias`;
  }
  const en = t.match(/^every\s+(\w+)\s+(?:at\s+)?([\d:]+\s*(?:am|pm)?)$/i);
  if (en && EN_DAY[en[1].toLowerCase()]) return `${EN_DAY[en[1].toLowerCase()]} às ${clock(en[2])}`;
  return t;
}
