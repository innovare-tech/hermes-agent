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

describe("terminal com saída em texto (não JSON)", () => {
  it("saída curta: mostra tudo e diz como terminou quando o código aparece", () => {
    expect(summarizeOutput("terminal", "ok\nexit code: 0")).toEqual({ line: "Terminou sem erro", head: "ok\nexit code: 0" });
    expect(summarizeOutput("terminal", "boom\nProcess exited with code 2")).toMatchObject({ line: "Terminou com erro (código 2)", head: "boom\nProcess exited with code 2" });
    expect(summarizeOutput("terminal", "falhou\ncódigo de saída 127")?.line).toBe("Terminou com erro (código 127)");
  });
  it("sem código na saída: conta as linhas, sem inventar sucesso", () => {
    expect(summarizeOutput("terminal", "texto puro")).toEqual({ line: "1 linha de saída", head: "texto puro" });
    expect(summarizeOutput("terminal", "a\nb")?.line).toBe("2 linhas de saída");
    expect(summarizeOutput("terminal", "   ")).toBeUndefined();
  });
  it("saída longa: primeiras linhas à vista e o resto recolhido", () => {
    const text = Array.from({ length: 30 }, (_, i) => `linha ${i + 1}`).join("\n") + "\nexit_code=1";
    const s = summarizeOutput("terminal", text);
    expect(s?.line).toBe("Terminou com erro (código 1)");
    expect(s?.head).toBe("linha 1\nlinha 2\nlinha 3\nlinha 4\nlinha 5");
    expect(s?.more).toBe(text);
    expect(s?.moreLabel).toBe("Ver a saída completa (31 linhas)");
    expect(s?.open).toBeUndefined();
  });
  it("outras ferramentas com texto puro continuam sem resumo", () => {
    expect(summarizeOutput("read_file", "texto puro")).toBeUndefined();
  });
});
