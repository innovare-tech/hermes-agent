// LaTeX simples → texto com símbolos Unicode. O projeto não tem katex/mathjax: isto cobre o que o modelo
// escreve em respostas comuns (contas, frações, potências, letras gregas). Fórmula complexa fica legível, não tipografada.
// ponytail: sem matrizes, somatórios com limites empilhados nem alinhamento. Troque por katex se precisar.

const SYM: Record<string, string> = {
  times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", equiv: "≡", sim: "∼", infty: "∞", partial: "∂", nabla: "∇",
  sum: "∑", prod: "∏", int: "∫", sqrt: "√", rightarrow: "→", to: "→", leftarrow: "←", Rightarrow: "⇒", Leftarrow: "⇐", leftrightarrow: "↔", Leftrightarrow: "⇔", in: "∈", notin: "∉", subset: "⊂", cup: "∪", cap: "∩", forall: "∀", exists: "∃", ldots: "…", cdots: "⋯", degree: "°", circ: "∘", angle: "∠", therefore: "∴",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};
const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "n": "ⁿ", "i": "ⁱ", "(": "⁽", ")": "⁾" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "(": "₍", ")": "₎" };

const script = (s: string, map: Record<string, string>, mark: string) => (s && [...s].every((c) => map[c]) ? [...s].map((c) => map[c]).join("") : mark + (s.length > 1 ? `(${s})` : s));

/** Primeiro argumento `{...}` (com chaves aninhadas) a partir de `i`; devolve [conteúdo, próximo índice]. */
function group(s: string, i: number): [string, number] {
  while (s[i] === " ") i++;
  if (s[i] !== "{") return [s[i] ?? "", i + 1];
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "{") d++;
    else if (s[j] === "}" && --d === 0) return [s.slice(i + 1, j), j + 1];
  }
  return [s.slice(i + 1), s.length];
}

export function texToText(tex: string): string {
  let out = "";
  const s = tex.trim();
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === "\\") {
      const m = s.slice(i + 1).match(/^[A-Za-z]+/);
      if (!m) {
        // \, \; \! \  → espaço fino; \{ \} \% \$ → o próprio caractere
        const n = s[i + 1];
        out += /[,;:! ]/.test(n ?? "") ? " " : (n ?? "");
        i += 2;
        continue;
      }
      const cmd = m[0];
      i += 1 + cmd.length;
      if (cmd === "frac" || cmd === "dfrac" || cmd === "tfrac") {
        const [a, j] = group(s, i);
        const [b, k] = group(s, j);
        // Sem parênteses só número ou uma letra ("a/b"); "2b", "a+1" e afins levam parênteses para não mudar o sentido.
        const wrap = (t: string) => (/^(?:\d+(?:[.,]\d+)?|\p{L})$/u.test(t) ? t : `(${t})`);
        out += `${wrap(texToText(a))}/${wrap(texToText(b))}`;
        i = k;
      } else if (cmd === "sqrt") {
        const [a, j] = group(s, i);
        const t = texToText(a);
        out += /^[\w.]+$/.test(t) ? `√${t}` : `√(${t})`;
        i = j;
      } else if (cmd === "text" || cmd === "mathrm" || cmd === "mathbf" || cmd === "textbf" || cmd === "operatorname" || cmd === "mathit") {
        const [a, j] = group(s, i);
        out += a;
        i = j;
      } else if (cmd === "left" || cmd === "right" || cmd === "displaystyle" || cmd === "quad" || cmd === "qquad") {
        out += cmd === "quad" || cmd === "qquad" ? "  " : "";
      } else out += SYM[cmd] ?? cmd; // sin, cos, log, lim… ficam como nome
    } else if (c === "^" || c === "_") {
      const [a, j] = group(s, i + 1);
      out += script(texToText(a), c === "^" ? SUP : SUB, c);
      i = j;
    } else if (c === "{" || c === "}") i++;
    else {
      out += c;
      i++;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

export type MathPart = string | { n: string; d: string };

/**
 * Fórmula em bloco: texto + frações de nível de cima separadas (numerador sobre denominador, desenhadas em CSS).
 * Fração dentro de raiz/potência e frações aninhadas continuam "a/b" em linha (texToText).
 */
export function texToParts(tex: string): MathPart[] {
  const s = tex.trim();
  const out: MathPart[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === "\\" && depth === 0) {
      const m = s.slice(i + 1).match(/^[dt]?frac(?![A-Za-z])/);
      if (m) {
        const [a, j] = group(s, i + 1 + m[0].length);
        const [b, k] = group(s, j);
        if (i > from) out.push(texToText(s.slice(from, i)));
        out.push({ n: texToText(a), d: texToText(b) });
        i = from = k;
        continue;
      }
      i += 2; // \{ \} \ …
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth = Math.max(0, depth - 1);
    i++;
  }
  if (from < s.length) out.push(texToText(s.slice(from)));
  return out.filter((p) => typeof p !== "string" || p);
}
