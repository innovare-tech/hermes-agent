// Fórmulas LaTeX → HTML do KaTeX (o CSS e as fontes vêm de `katex/dist/katex.min.css`, importado em Markdown.tsx).
import katex from "katex";

const cache = new Map<string, string>();
const MAX_CACHE = 300;

/** `throwOnError: false` mostra a fórmula inválida em vermelho em vez de quebrar; `trust` desligado (sem \href/\includegraphics). O Markdown re-renderiza a cada pedaço do streaming, daí o cache. */
export function renderTex(tex: string, display: boolean): string {
  const key = (display ? "D" : "I") + tex;
  let html = cache.get(key);
  if (html === undefined) {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore", trust: false, output: "htmlAndMathml" });
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, html);
  }
  return html;
}
