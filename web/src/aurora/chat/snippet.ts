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
