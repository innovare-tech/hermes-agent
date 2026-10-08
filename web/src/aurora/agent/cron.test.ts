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

describe("horário em português", async () => {
  const { toSchedule, humanizeSchedule } = await import("./cron");
  it("frase em português vira formato do agendador; formato já pronto fica igual", () => {
    expect(toSchedule("dias úteis às 9h")).toBe("0 9 * * 1-5");
    expect(toSchedule("toda sexta às 18h")).toBe("0 18 * * 5");
    expect(toSchedule("a cada 2 horas")).toBe("every 2h");
    expect(toSchedule("every weekday 9am")).toBe("every weekday 9am");
    expect(toSchedule("0 9 * * 1-5")).toBe("0 9 * * 1-5");
  });
  it("formato do agendador volta em português", () => {
    expect(humanizeSchedule("30 7 * * 1-5")).toBe("dias úteis às 07:30");
    expect(humanizeSchedule("0 18 * * 5")).toBe("toda sexta às 18:00");
    expect(humanizeSchedule("every 60m")).toBe("a cada hora");
    expect(humanizeSchedule("every 2h")).toBe("a cada 2 horas");
    expect(humanizeSchedule("every weekday 9am")).toBe("dias úteis às 09:00");
    expect(humanizeSchedule("every day 6pm")).toBe("todo dia às 18:00");
  });
});
