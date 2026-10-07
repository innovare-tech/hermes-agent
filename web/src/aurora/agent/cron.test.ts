import { describe, expect, it } from "vitest";
import { parseCronPt } from "./cron";

describe("parseCronPt", () => {
  it("toda sexta às 18h → 0 18 * * 5, destino e tarefa", () => {
    expect(parseCronPt("toda sexta às 18h, resuma meus commits da semana e mande no Discord")).toEqual({
      human: "toda sexta, 18:00",
      expr: "0 18 * * 5",
      dest: "Discord",
      prompt: "Resuma meus commits da semana e mande no Discord",
    });
  });

  it("outros padrões", () => {
    expect(parseCronPt("dias úteis às 7h30, briefing no Telegram")).toMatchObject({ expr: "30 7 * * 1-5", human: "dias úteis, 07:30", dest: "Telegram" });
    expect(parseCronPt("todo dia às 3h, backup do Postgres")).toMatchObject({ expr: "0 3 * * *", dest: "Conversa" });
    expect(parseCronPt("todo dia 1 às 10h, auditoria de dependências")).toMatchObject({ expr: "0 10 1 * *", human: "todo dia 1, 10:00" });
    expect(parseCronPt("toda segunda-feira às 9:15, resumo de PRs")).toMatchObject({ expr: "15 9 * * 1" });
  });

  it("sem padrão de recorrência não gera prévia", () => {
    expect(parseCronPt("resuma meus commits")).toBeNull();
  });
});
