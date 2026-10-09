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

  it("fórmula em bloco $$…$$ é um bloco de matemática", () => {
    expect(parseMd("antes\n\n$$\n\\frac{1}{2}\n$$\n\ndepois").map((b) => b.t)).toEqual(["p", "math", "p"]);
  });
});

describe("KaTeX", () => {
  it("fórmula inline vira KaTeX (HTML + MathML), não texto cru", () => {
    const out = html("A conta $17 \\times 23$ dá 391 e $x^2$ também.");
    expect(out).toContain('class="au-md-math"');
    expect(out).toContain('class="katex"');
    expect(out).toContain("<math");
    expect(out).toContain("×");
    expect(out).not.toContain("$17");
    expect(out).not.toContain("$x^2$");
    expect(html("com \\(a_1 + a_2\\) aqui")).toContain('class="katex"');
  });

  it("bloco $$…$$ e \\[…\\] em modo display", () => {
    expect(html("$$ \\sqrt{16} $$")).toContain("katex-display");
    expect(html("\\[ \\sqrt{16} \\]")).toContain("katex-display");
    expect(html("texto \\[ y^2 \\] no meio")).toContain("katex-display");
  });

  it("matriz, fração em linha, somatório e integral saem com a estrutura tipográfica", () => {
    const mat = html("$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$");
    expect(mat).toContain("mtable");
    expect(mat).toContain("delimcenter");
    expect(mat).not.toContain("katex-error");
    const frac = html("vale $\\frac{a}{b}$ aqui");
    expect(frac).toContain("mfrac");
    expect(frac).toContain("frac-line");
    const sum = html("$\\sum_{i=1}^{n} i^2$");
    expect(sum).toContain("op-symbol");
    expect(sum).toContain("msupsub");
    const integral = html("$$\\int_0^1 x\\,dx$$");
    expect(integral).toContain("op-symbol");
    expect(integral).not.toContain("katex-error");
  });

  it("fórmula inválida não quebra a conversa: aparece como erro do KaTeX", () => {
    expect(html("veja \\(\\foo{\\) ok")).toContain("katex-error");
  });

  it("$$…$$ dentro de item de lista é renderizado, não sai cru", () => {
    const out = html("1. **Fórmula:**\n   $$x = \\frac{-b}{2a}$$\n2. Outra coisa $$y^2$$ no meio");
    expect(out).not.toContain("$$");
    expect(out).toContain("au-md-mathblock");
    expect(out).toContain("mfrac");
    expect(html("- item $$a + b$$ fim")).not.toContain("$$");
  });
});

describe("$ com conta numérica e dinheiro", () => {
  it("renderiza conta, mas não dinheiro", () => {
    expect(html("Dá $340 + 51 = 391$ ao todo.")).toContain('class="katex"');
    expect(html("O resultado é $23$.")).toContain('class="katex"');
    expect(html("A conta $(3 + 4) * 2$ fecha.")).toContain('class="katex"');
    expect(html("com $n$ itens")).toContain('class="katex"');
    for (const money of ["Custa $5 e depois $10.", "De $5 a $10 por mês", "Pague $ 5 + 3 $ hoje", "US$ 5 ou $20 reais", "Entre R$5-$10 e US$5=$6", "valia $5, ou $x e $y"]) {
      const out = html(money);
      expect(out).not.toContain("katex");
      expect(out).toContain("$");
    }
  });
});
