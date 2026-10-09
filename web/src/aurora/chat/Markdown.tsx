// Markdown das respostas do agente (subconjunto que LLMs usam: títulos, listas aninhadas, código,
// tabelas, citações, regra, negrito/itálico/riscado/código/links). Gera elementos React — nunca HTML cru.
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Icon } from "../Icon";
import { highlight } from "./highlight";
import { texToParts, texToText } from "./mathLite";

export type MdBlock =
  | { t: "code"; lang: string; text: string }
  | { t: "math"; text: string }
  | { t: "h"; level: number; text: string }
  | { t: "hr" }
  | { t: "quote"; blocks: MdBlock[] }
  | { t: "list"; ordered: boolean; start: number; items: MdBlock[][] }
  | { t: "table"; head: string[]; align: ("left" | "center" | "right" | undefined)[]; rows: string[][] }
  | { t: "p"; text: string };

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const isSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function parseMd(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++; // fecha a cerca (ou acaba o texto, durante o streaming)
      out.push({ t: "code", lang: fence[2], text: body.join("\n") });
      continue;
    }
    // Fórmula em bloco: $$ … $$ (uma ou várias linhas) ou \[ … \].
    const mathOpen = line.match(/^\s*(\$\$|\\\[)(.*)$/);
    if (mathOpen) {
      const close = mathOpen[1] === "$$" ? "$$" : "\\]";
      const body: string[] = [];
      let rest = mathOpen[2];
      for (;;) {
        const end = rest.indexOf(close);
        if (end >= 0) {
          body.push(rest.slice(0, end));
          break;
        }
        body.push(rest);
        if (++i >= lines.length) break; // sem fechar (streaming)
        rest = lines[i];
      }
      i++;
      out.push({ t: "math", text: body.join(" ").trim() });
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      out.push({ t: "h", level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push({ t: "hr" });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push({ t: "quote", blocks: parseMd(body.join("\n")) });
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && isSep(lines[i + 1])) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : undefined));
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push({ t: "table", head, align, rows });
      continue;
    }
    const li = line.match(LIST);
    if (li) {
      // Itens no mesmo recuo; linhas mais recuadas (ou continuação) pertencem ao item atual.
      const indent = li[1].length;
      const ordered = /\d/.test(li[2]);
      const items: string[][] = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST);
        if (m && m[1].length === indent && /\d/.test(m[2]) === ordered) {
          items.push([m[3]]);
          i++;
        } else if (lines[i].trim() && (lines[i].match(/^\s*/)![0].length > indent || (!m && !/^\s*(#|>|```|~~~)/.test(lines[i])))) {
          items[items.length - 1].push(lines[i].slice(Math.min(indent + 2, lines[i].match(/^\s*/)![0].length)));
          i++;
        } else if (!lines[i].trim() && i + 1 < lines.length && (lines[i + 1].match(/^\s*/)![0].length > indent || lines[i + 1].match(LIST)?.[1].length === indent)) {
          i++; // linha em branco dentro da lista
        } else break;
      }
      out.push({ t: "list", ordered, start: ordered ? parseInt(li[2], 10) || 1 : 1, items: items.map((it) => parseMd(it.join("\n"))) });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|>|```|~~~|\$\$|\\\[)/.test(lines[i]) && !LIST.test(lines[i]) && !(lines[i].includes("|") && i + 1 < lines.length && isSep(lines[i + 1]))) para.push(lines[i++]);
    out.push({ t: "p", text: para.join("\n") });
  }
  return out;
}

const INLINE = /(`+)([\s\S]*?[^`])\1(?!`)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*([^*\s][\s\S]*?)\*|(?<![\w])_([^_\s][\s\S]*?)_(?![\w])|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|\$(?=[^$\n]*[\\^_][^$\n]*\$)([^\s$](?:[^$\n]*[^\s$])?)\$|\\\(([^\n]+?)\\\)|\$\$([\s\S]+?)\$\$/g;

/** Inline: código, negrito, itálico, riscado, links (só http/https/mailto), URLs soltas. */
export function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = `${key}${n++}`;
    if (m[1]) out.push(<code key={k} className="au-md-ic">{m[2]}</code>);
    else if (m[3] ?? m[4]) out.push(<strong key={k}>{inline(m[3] ?? m[4], k)}</strong>);
    else if (m[5]) out.push(<del key={k}>{inline(m[5], k)}</del>);
    else if (m[6] ?? m[7]) out.push(<em key={k}>{inline(m[6] ?? m[7], k)}</em>);
    else if (m[13]) out.push(<MathBlock key={k} tex={m[13]} inline />);
    else if (m[11] ?? m[12]) out.push(<span key={k} className="au-md-math">{texToText(m[11] ?? m[12])}</span>);
    else {
      const href = m[9] ?? m[10];
      const safe = /^(https?:|mailto:)/i.test(href);
      out.push(safe ? <a key={k} href={href} target="_blank" rel="noreferrer noopener">{m[8] ? inline(m[8], k) : href}</a> : <Fragment key={k}>{m[0]}</Fragment>);
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Fórmula em destaque: frações de nível de cima em duas linhas (numerador sobre denominador). */
function MathBlock({ tex, inline }: { tex: string; inline?: boolean }) {
  const body = texToParts(tex).map((p, i) =>
    typeof p === "string" ? (
      <Fragment key={i}>{p}</Fragment>
    ) : (
      <span key={i} className="au-frac">
        <span className="au-frac-n">{p.n}</span>
        <span className="au-frac-d">{p.d}</span>
      </span>
    ),
  );
  return inline ? <span className="au-md-mathblock au-md-mathinline">{body}</span> : <div className="au-md-mathblock">{body}</div>;
}

/** Bloco de código com destaque de sintaxe e botão Copiar. */
export function CodeBlock({ lang, text, tail }: { lang: string; text: string; tail?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => {}, // sem permissão de área de transferência: o botão só não confirma
    );
  return (
    <div className="au-md-code">
      <div className="au-md-codebar">
        <span className="au-md-lang">{lang || "código"}</span>
        <button className="au-md-copy" onClick={copy} aria-label={copied ? "Código copiado" : "Copiar código"}>
          <Icon name={copied ? "check" : "copy"} size={12} />
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre>
        <code>{highlight(text, lang).map((t, i) => (t.t ? <span key={i} className={"au-tk-" + t.t}>{t.v}</span> : <Fragment key={i}>{t.v}</Fragment>))}</code>
        {tail}
      </pre>
    </div>
  );
}

function Block({ b, tail }: { b: MdBlock; tail?: ReactNode }): ReactNode {
  switch (b.t) {
    case "code":
      return <CodeBlock lang={b.lang} text={b.text} tail={tail} />;
    case "math":
      return <MathBlock tex={b.text} />;
    case "h": {
      const H = `h${Math.min(b.level + 1, 6)}` as "h2";
      return (
        <H className={`au-md-h au-md-h${b.level}`}>
          {inline(b.text)}
          {tail}
        </H>
      );
    }
    case "hr":
      return <hr className="au-md-hr" />;
    case "quote":
      return (
        <blockquote className="au-md-quote">
          <Blocks blocks={b.blocks} tail={tail} />
        </blockquote>
      );
    case "list": {
      const L = b.ordered ? "ol" : "ul";
      return (
        <L className="au-md-list" start={b.ordered && b.start !== 1 ? b.start : undefined}>
          {b.items.map((it, i) => (
            <li key={i}>
              <Blocks blocks={it} tail={i === b.items.length - 1 ? tail : undefined} tight />
            </li>
          ))}
        </L>
      );
    }
    case "table":
      return (
        <div className="au-md-table">
          <table>
            <thead>
              <tr>
                {b.head.map((c, i) => (
                  <th key={i} style={{ textAlign: b.align[i] }}>{inline(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri}>
                  {b.head.map((_, ci) => (
                    <td key={ci} style={{ textAlign: b.align[ci] }}>{inline(r[ci] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {tail}
        </div>
      );
    case "p":
      return (
        <p className="au-md-p">
          {inline(b.text)}
          {tail}
        </p>
      );
  }
}

function Blocks({ blocks, tail, tight }: { blocks: MdBlock[]; tail?: ReactNode; tight?: boolean }) {
  return (
    <>
      {blocks.map((b, i) =>
        tight && b.t === "p" && i === 0 ? (
          <Fragment key={i}>
            {inline(b.text)}
            {i === blocks.length - 1 && tail}
          </Fragment>
        ) : (
          <Block key={i} b={b} tail={i === blocks.length - 1 ? tail : undefined} />
        ),
      )}
    </>
  );
}

/** ``tail`` (ex.: o cursor do streaming) fica colado no fim do último bloco. */
export function Markdown({ text, tail }: { text: string; tail?: ReactNode }) {
  const blocks = useMemo(() => parseMd(text), [text]);
  return (
    <div className="au-md">
      <Blocks blocks={blocks} tail={tail} />
      {blocks.length === 0 && tail}
    </div>
  );
}
