import { describe, expect, it } from "vitest";
import { summarizeOutput, toolDenied } from "./toolSummary";

describe("summarizeOutput", () => {
  it("search_files com lista de arquivos vira '102 arquivos encontrados', lista recolhida", () => {
    const files = Array.from({ length: 3 }, (_, i) => `src/a${i}.py`);
    const s = summarizeOutput("search_files", JSON.stringify({ total_count: 102, files }));
    expect(s?.line).toBe("102 arquivos encontrados (mostrando 3)");
    expect(s?.more).toBe(files.join("\n"));
    expect(s?.moreLabel).toBe("Ver a lista (3)");
    expect(summarizeOutput("search_files", '{"total_count":1,"files":["a.py"]}')?.line).toBe("1 arquivo encontrado");
    expect(summarizeOutput("search_files", '{"total_count":0,"files":[]}')?.line).toBe("Nenhum arquivo encontrado");
  });
  it("search_files de conteúdo: ocorrências com caminho e linha", () => {
    const s = summarizeOutput("search_files", JSON.stringify({ total_count: 2, matches: [{ path: "a.py", line: 3, content: " x = 1 " }, { path: "b.py", line: 9, content: "y" }] }));
    expect(s?.line).toBe("2 ocorrências encontradas");
    expect(s?.more).toBe("a.py:3  x = 1\nb.py:9  y");
  });
  it("read_file, terminal e web_search", () => {
    expect(summarizeOutput("read_file", JSON.stringify({ content: "1|a\n2|b", total_lines: 2 }))).toMatchObject({ line: "Leu 2 linhas", more: "1|a\n2|b" });
    expect(summarizeOutput("terminal", '{"output":"ok","exit_code":0}')?.line).toBe("Terminou sem erro");
    expect(summarizeOutput("terminal", '{"output":"x","exit_code":2}')?.line).toBe("Terminou com erro (código 2)");
    const web = summarizeOutput("web_search", JSON.stringify({ success: true, data: { web: [{ title: "A", url: "https://a.dev" }, { title: "B", url: "https://b.dev" }] } }));
    expect(web).toMatchObject({ line: "2 resultados", more: "A — https://a.dev\nB — https://b.dev" });
  });
  it("sem resumo: erro da ferramenta, texto puro, JSON desconhecido", () => {
    expect(summarizeOutput("search_files", '{"error":"sem permissão"}')).toBeUndefined();
    expect(summarizeOutput("terminal", "texto puro")).toBeUndefined();
    expect(summarizeOutput("memory", '{"a":1}')).toBeUndefined();
  });
});

describe("toolDenied", () => {
  it("reconhece o pedido negado pelo usuário", () => {
    expect(toolDenied('{"error":"BLOCKED: User denied execute_code script execution (matched x)."}')).toBe(true);
    expect(toolDenied("BLOCKED: User denied this command.")).toBe(true);
    expect(toolDenied("BLOCKED: Command timed out without user response.")).toBe(false);
    expect(toolDenied('{"output":"ok"}')).toBe(false);
  });
});
