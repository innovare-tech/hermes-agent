import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, parseMd } from "./Markdown";

const html = (md: string) => renderToStaticMarkup(<Markdown text={md} />);

describe("parseMd", () => {
  it("título, lista, código, tabela e parágrafo", () => {
    const md = "# Plano\n\n- um\n- **dois**\n\n```python\nprint(1)\n```\n\n| a | b |\n|---|--:|\n| 1 | 2 |\n\nfim";
    expect(parseMd(md).map((b) => b.t)).toEqual(["h", "list", "code", "table", "p"]);
  });

  it("lista aninhada e numerada com início", () => {
    const [l] = parseMd("3. três\n   - filho\n4. quatro");
    expect(l).toMatchObject({ t: "list", ordered: true, start: 3 });
    expect(l.t === "list" && l.items[0].map((b) => b.t)).toEqual(["p", "list"]);
  });

  it("código sem fechar (streaming) não engole nem quebra", () => {
    expect(parseMd("antes\n\n```js\nconst a = 1")).toEqual([{ t: "p", text: "antes" }, { t: "code", lang: "js", text: "const a = 1" }]);
  });
});

describe("render", () => {
  it("inline: negrito, itálico, código, link seguro", () => {
    const out = html("**n** *i* `c` [site](https://x.dev) e https://y.dev/a.");
    expect(out).toContain("<strong>n</strong>");
    expect(out).toContain("<em>i</em>");
    expect(out).toContain('<code class="au-md-ic">c</code>');
    expect(out).toContain('href="https://x.dev"');
    expect(out).toContain('href="https://y.dev/a"');
  });

  it("nunca vira HTML cru nem link javascript:", () => {
    const out = html("<img src=x onerror=alert(1)> [x](javascript:alert(1))");
    expect(out).not.toContain("<img");
    expect(out).not.toContain('href="javascript');
  });

  it("snake_case não vira itálico", () => {
    expect(html("use search_files_now")).not.toContain("<em>");
  });
});

describe("código e fórmulas", () => {
  it("bloco de código tem destaque de sintaxe, nome da linguagem e botão Copiar", () => {
    const out = html("```python\ndef f():\n    return 'a'  # x\n```");
    expect(out).toContain('class="au-tk-k">def</span>');
    expect(out).toContain("au-tk-s");
    expect(out).toContain("au-tk-c");
    expect(out).toContain(">python</span>");
    expect(out).toContain('aria-label="Copiar código"');
  });

  it("fórmula inline com barra, ^ ou _ vira símbolos; dinheiro fica como está", () => {
    expect(html("A conta $17 \\times 23$ dá 391.")).toContain('<span class="au-md-math">17 × 23</span>');
    expect(html("Custa $5 e depois $10.")).not.toContain("au-md-math");
    expect(html("x vale $x^2$")).toContain("x²");
  });

  it("fórmula em bloco $$…$$", () => {
    expect(parseMd("antes\n\n$$\n\\frac{1}{2}\n$$\n\ndepois").map((b) => b.t)).toEqual(["p", "math", "p"]);
    expect(html("$$ \\sqrt{16} $$")).toContain('class="au-md-mathblock">√16');
  });
});
