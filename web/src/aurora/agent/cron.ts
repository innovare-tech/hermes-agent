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
