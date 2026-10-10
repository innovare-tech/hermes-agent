// Destaque do termo buscado dentro do trecho (Sessões), sem diferenciar maiúsculas nem acentos.
export type Part = { t: string; hit: boolean };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function hitParts(text: string, term: string): Part[] {
  const words = [...new Set(fold(term).split(/\s+/).filter((w) => w.length >= 2))];
  if (!words.length || !text) return [{ t: text, hit: false }];
  let hay = fold(text);
  // Letras que mudam de tamanho ao tirar o acento desalinham os índices: cai para minúsculas simples.
  if (hay.length !== text.length) hay = text.toLowerCase();
  const mark = new Array<boolean>(text.length).fill(false);
  for (const w of words) for (let i = hay.indexOf(w); i >= 0; i = hay.indexOf(w, i + w.length)) mark.fill(true, i, i + w.length);
  const out: Part[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === mark[i]) last.t += text[i];
    else out.push({ t: text[i], hit: mark[i] });
  }
  return out;
}

const MESES: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

/** Título de agendamento termina em "Oct 09 11:56" (data em inglês do backend): vira "09/10 11:56". */
export const cronTitle = (title: string) => title.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}) (\d{2}:\d{2})$/, (_, m: string, d: string, h: string) => `${d.padStart(2, "0")}/${MESES[m]} ${h}`);

/** Prévia sem as instruções de sistema ("[IMPORTANT: …]" do agendamento, "[SYSTEM …]") que o backend põe na frente do prompt.
 *  Bloco sem fechamento (prévia cortada) conta como instrução inteira. Sobrou nada: "Execução agendada". */
export function previewText(raw: string): string {
  const BLOCK = /^\[(?:IMPORTANT|SYSTEM)[\s\S]*?\](?=\s*(?:\n|$))\s*/i;
  let t = raw.trim();
  if (!/^\[(?:IMPORTANT|SYSTEM)/i.test(t)) return raw;
  while (/^\[(?:IMPORTANT|SYSTEM)/i.test(t)) t = BLOCK.test(t) ? t.replace(BLOCK, "") : "";
  return t || "Execução agendada";
}
