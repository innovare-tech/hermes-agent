import { describe, expect, it } from "vitest";
import { cronTitle, hitParts, previewText } from "./snippet";

describe("hitParts", () => {
  it("destaca o termo sem diferenciar maiúsculas nem acentos", () => {
    expect(hitParts("Configuração do Hermes", "configuracao")).toEqual([
      { t: "Configuração", hit: true },
      { t: " do Hermes", hit: false },
    ]);
  });
  it("várias palavras; sem termo devolve o texto inteiro", () => {
    expect(hitParts("um dois três", "dois um").map((p) => p.hit)).toEqual([true, false, true, false]);
    expect(hitParts("texto", "")).toEqual([{ t: "texto", hit: false }]);
    expect(hitParts("texto", "x")).toEqual([{ t: "texto", hit: false }]);
  });
});

describe("cronTitle", () => {
  it("data em inglês no fim do título vira dd/mm hh:mm", () => {
    expect(cronTitle("Saúde · investigação · Oct 09 11:56")).toBe("Saúde · investigação · 09/10 11:56");
    expect(cronTitle("Resumo · Jan 5 08:00")).toBe("Resumo · 05/01 08:00");
  });
  it("título sem esse padrão fica como está", () => {
    expect(cronTitle("Revisar contrato de outubro")).toBe("Revisar contrato de outubro");
    expect(cronTitle("Oct 09 11:56 depois")).toBe("Oct 09 11:56 depois");
  });
});

describe("previewText", () => {
  const hint = '[IMPORTANT: You are running as a scheduled cron job. SILENT: respond with exactly "[SILENT]" (nothing else) to suppress. Never combine [SILENT] with content.]\n\n';
  it("tira o bloco de instrução do agendamento e fica o prompt de verdade", () => {
    expect(previewText(hint + "Investigue a saúde dos canais")).toBe("Investigue a saúde dos canais");
    expect(previewText("[SYSTEM: nota]\n[IMPORTANT: outra]\nTexto")).toBe("Texto");
  });
  it("prévia cortada dentro da instrução, ou só instrução: \"Execução agendada\"", () => {
    expect(previewText("[IMPORTANT: You are running as a scheduled cron job…")).toBe("Execução agendada");
    expect(previewText(hint)).toBe("Execução agendada");
  });
  it("texto comum não muda", () => {
    expect(previewText("Oi, tudo bem?")).toBe("Oi, tudo bem?");
    expect(previewText("")).toBe("");
  });
});
