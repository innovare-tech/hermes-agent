import { describe, expect, it } from "vitest";
import { argBlock, fmtElapsed, limitOutput, summarizeArgs, toolLabel } from "./toolLabels";

describe("toolLabel", () => {
  it("rótulos em português para as ferramentas comuns, no gerúndio enquanto rodam", () => {
    expect(toolLabel("search_files", true)).toBe("Buscando arquivos");
    expect(toolLabel("execute_code", true)).toBe("Executando código");
    expect(toolLabel("terminal")).toBe("Comando no terminal");
    expect(toolLabel("read_file", true)).toBe("Lendo arquivo");
    expect(toolLabel("web_search", true)).toBe("Pesquisando na web");
  });
  it("ferramenta desconhecida vira texto legível, nunca snake_case", () => {
    expect(toolLabel("browser_click")).toBe("Navegador");
    expect(toolLabel("mcp_github_list_issues")).toBe("Github list issues");
    expect(toolLabel("")).toBe("Ferramenta");
  });
});

describe("summarizeArgs", () => {
  it("resumo de uma linha do que a ferramenta está fazendo", () => {
    expect(summarizeArgs("terminal", { command: "ls -la\n  *.md" })).toBe("ls -la *.md");
    expect(summarizeArgs("search_files", { pattern: "*.md", path: "C:\\x\\web" })).toBe("texto “*.md” em C:\\x\\web");
    expect(summarizeArgs("execute_code", { code: "print(1)\nprint(2)" })).toBe("print(1) print(2)");
    expect(summarizeArgs("web_extract", { urls: ["https://a.dev/x"] })).toBe("https://a.dev/x");
    expect(summarizeArgs("memory", { action: "add" })).toBe("add");
    expect(summarizeArgs("terminal", null)).toBe("");
  });
  it("search_files: padrão e pasta claros, nunca '* em .'", () => {
    expect(summarizeArgs("search_files", { pattern: "*.py", target: "files", path: "./src" })).toBe("arquivos com *.py em ./src");
    expect(summarizeArgs("search_files", { pattern: "*", target: "files", path: "." })).toBe("todos os arquivos na pasta atual");
    expect(summarizeArgs("search_files", { pattern: "TODO", target: "content" })).toBe("texto “TODO” na pasta atual");
  });
  it("argBlock: código e comando completos, com as quebras de linha", () => {
    expect(argBlock("execute_code", { code: "a = 1\nprint(a)\n" })).toBe("a = 1\nprint(a)");
    expect(argBlock("terminal", { command: "ls\npwd" })).toBe("ls\npwd");
    expect(argBlock("read_file", { path: "/x" })).toBe("");
    expect(argBlock("terminal", null)).toBe("");
  });
  it("corta texto longo e caminho comprido", () => {
    expect(summarizeArgs("terminal", { command: "x".repeat(300) })).toHaveLength(120);
    expect(summarizeArgs("read_file", { path: "/a/".repeat(40) + "arquivo.ts" }).startsWith("…")).toBe(true);
  });
});

describe("tempo e saída", () => {
  it("fmtElapsed", () => {
    expect([fmtElapsed(1234), fmtElapsed(14000), fmtElapsed(65000)]).toEqual(["1,2s", "14s", "1min 05s"]);
  });
  it("saída longa é cortada, com 'mostrar tudo'", () => {
    const long = Array.from({ length: 100 }, (_, i) => "linha " + i).join("\n");
    const c = limitOutput(long);
    expect(c.cut).toBe(true);
    expect(c.text.split("\n")).toHaveLength(40);
    expect(limitOutput(long, true)).toEqual({ text: long, cut: false });
    expect(limitOutput("curta").cut).toBe(false);
  });
});
