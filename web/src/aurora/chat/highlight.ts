// Destaque de sintaxe mínimo para os blocos de código das respostas. O projeto não tem biblioteca de
// destaque (shiki/highlight.js/prism) e não vale uma dependência só para isso: este cobre o que os
// modelos mais escrevem (comentário, texto, número, palavra-chave, literal) em ~40 linhas.
// ponytail: tokenizador por regex, uma passada; sem gramática por linguagem. Troque por shiki/highlight.js se precisar de fidelidade.

export type Tok = { t: "" | "k" | "s" | "c" | "n" | "l"; v: string };

const C_LIKE = "const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this super static public private protected interface type enum implements package void int float double char long short struct impl fn pub use mod mut match loop where trait func go defer chan select range readonly namespace using abstract final override fun val object when is as yield get set";
const PY_LIKE = "def class return if elif else for while in not and or is import from as try except finally raise with lambda pass break continue yield global nonlocal del assert async await self cls print";
const SH_LIKE = "if then else elif fi for while do done case esac function in echo export local return source cd ls cat grep sed awk set unset exit shift test";
const SQL = "select from where group by order limit insert into values update set delete create table alter drop join left right inner outer on and or not null as distinct having union all index primary key foreign references default count sum avg min max";
const LITERALS = "true false null undefined nil None True False NaN Infinity";

const set = (s: string, lower = false) => new Set(s.split(" ").map((w) => (lower ? w.toLowerCase() : w)));
const KW = { c: set(C_LIKE), py: set(PY_LIKE), sh: set(SH_LIKE), sql: set(SQL, true) };
const LIT = set(LITERALS);

type Family = "c" | "py" | "sh" | "sql" | "json" | "markup" | "css" | null;
const FAMILY: Record<string, Family> = {
  js: "c", jsx: "c", ts: "c", tsx: "c", javascript: "c", typescript: "c", java: "c", c: "c", cpp: "c", "c++": "c", cs: "c", csharp: "c", go: "c", rust: "c", rs: "c", kotlin: "c", swift: "c", php: "c", dart: "c", scala: "c",
  py: "py", python: "py", rb: "py", ruby: "py", yaml: "py", yml: "py", toml: "py", r: "py", dockerfile: "py", ini: "py",
  sh: "sh", bash: "sh", zsh: "sh", shell: "sh", console: "sh", powershell: "sh", ps1: "sh", bat: "sh",
  sql: "sql", json: "json", jsonc: "json", html: "markup", xml: "markup", svg: "markup", css: "css", scss: "css",
};

// Um alternador só: comentário | texto | número | palavra. A ordem decide quem ganha.
const RE: Record<Exclude<Family, null>, RegExp> = {
  c: /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b0x[\da-f]+\b|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|([A-Za-z_$][\w$]*)/gi,
  py: /(#[^\n]*)|("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|(\b0x[\da-f]+\b|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|([A-Za-z_][\w]*)/gi,
  sh: /(#[^\n]*)|("(?:[^"\\\n]|\\.)*"?|'[^'\n]*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w-]*)/g,
  sql: /(--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:[^'\\\n]|\\.|'')*'?|"(?:[^"\n])*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w]*)/g,
  json: /()("(?:[^"\\\n]|\\.)*"?)|(-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|(true|false|null)/g,
  markup: /(<!--[\s\S]*?(?:-->|$))|("[^"\n]*"?|'[^'\n]*'?)|()(<\/?[A-Za-z][\w:-]*|\/?>)/g,
  css: /(\/\*[\s\S]*?(?:\*\/|$))|("[^"\n]*"?|'[^'\n]*'?)|(#[\da-f]{3,8}\b|-?\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms)?\b)|(@[\w-]+)/gi,
};

export function highlight(code: string, lang: string): Tok[] {
  const fam = FAMILY[lang.trim().toLowerCase()] ?? null;
  if (!fam || code.length > 20000) return [{ t: "", v: code }];
  const out: Tok[] = [];
  let last = 0;
  const push = (t: Tok["t"], v: string) => {
    if (!v) return;
    const prev = out[out.length - 1];
    if (prev && prev.t === t) prev.v += v;
    else out.push({ t, v });
  };
  for (const m of code.matchAll(RE[fam])) {
    push("", code.slice(last, m.index));
    last = m.index! + m[0].length;
    const [all, com, str, num, word] = m;
    if (com) push("c", all);
    else if (str) push("s", all);
    else if (num) push("n", all);
    else if (word) {
      const w = fam === "sql" ? word.toLowerCase() : word;
      const k = fam === "json" || fam === "markup" || fam === "css" ? undefined : KW[fam];
      push(fam === "json" ? "l" : fam === "markup" || fam === "css" ? "k" : LIT.has(word) ? "l" : k?.has(w) ? "k" : "", all);
    } else push("", all);
  }
  push("", code.slice(last));
  return out;
}
