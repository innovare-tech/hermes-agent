import { describe, expect, it } from "vitest";
import { applyFilters, linkedClients, modeBlocked, needsLink, NO_FILTERS, sortSection, windowError, windowExample, windowSentence, type ChannelRow } from "./model";

const base: ChannelRow = {
  id: "whatsapp:1",
  platform: "whatsapp",
  name: "Padaria Sol",
  kind: "group",
  mode: 3,
  business_id: null,
  last_seen: null,
  section: "group",
  clientId: null,
  clientName: null,
  notClient: false,
  suggestion: null,
  members: null,
  todayCount: 0,
  last: null,
  lastAlert: null,
  window: { useDefault: true, silenceMin: 5, maxMin: 30 },
  problem: null,
  receivesAlerts: false,
  requiresConfirm: true,
};
const ch = (p: Partial<ChannelRow>): ChannelRow => ({ ...base, ...p });

describe("canais", () => {
  it("precisa de vínculo só fora da equipe, sem cliente e sem 'não é cliente'", () => {
    expect(needsLink(ch({}))).toBe(true);
    expect(needsLink(ch({ clientId: "c1" }))).toBe(false);
    expect(needsLink(ch({ notClient: true }))).toBe(false);
    expect(needsLink(ch({ section: "team" }))).toBe(false);
  });

  it("ordena sem vínculo, depois com problema, depois o resto, mantendo a ordem original", () => {
    const rows = [
      ch({ id: "a", clientId: "x" }),
      ch({ id: "b", clientId: "x", problem: { message: "p" } }),
      ch({ id: "c" }),
      ch({ id: "d", clientId: "x" }),
      ch({ id: "e" }),
    ];
    expect(sortSection(rows).map((r) => r.id)).toEqual(["c", "e", "b", "a", "d"]);
  });

  it("filtra por nome sem acento, cliente, modo, sem vínculo e problema", () => {
    const rows = [ch({ id: "a", name: "Clínica Bem Viver", clientId: "c1", clientName: "Clínica", mode: 1 }), ch({ id: "b", name: "Lumen" }), ch({ id: "c", name: "Outro", clientId: "c2", clientName: "Z", problem: { message: "x" } })];
    const ids = (f: Partial<typeof NO_FILTERS>) => applyFilters(rows, { ...NO_FILTERS, ...f }).map((r) => r.id);
    expect(ids({ q: "clinica" })).toEqual(["a"]);
    expect(ids({ client: "c2" })).toEqual(["c"]);
    expect(ids({ mode: 1 })).toEqual(["a"]);
    expect(ids({ unlinked: true })).toEqual(["b"]);
    expect(ids({ problem: true })).toEqual(["c"]);
    expect(ids({})).toEqual(["a", "b", "c"]);
    expect(linkedClients(rows)).toEqual([{ id: "c1", name: "Clínica" }, { id: "c2", name: "Z" }]);
  });

  it("Escutar fica bloqueado só no canal que recebe os avisos", () => {
    expect(modeBlocked(ch({ receivesAlerts: true }), 3)).toMatch(/recebe os avisos/);
    expect(modeBlocked(ch({ receivesAlerts: true }), 2)).toBeNull();
    expect(modeBlocked(ch({}), 3)).toBeNull();
  });

  it("valida a janela como o backend (1–60, 5–240, máximo maior que o silêncio)", () => {
    expect(windowError({ silenceMin: 5, maxMin: 30 })).toBeNull();
    expect(windowError({ silenceMin: 0, maxMin: 30 })).toMatch(/1 a 60/);
    expect(windowError({ silenceMin: 5, maxMin: 241 })).toMatch(/5 a 240/);
    expect(windowError({ silenceMin: 10, maxMin: 10 })).toMatch(/maior/);
    expect(windowError({ silenceMin: NaN, maxMin: 30 })).not.toBeNull();
  });

  it("escreve a frase e o exemplo da janela com horários", () => {
    expect(windowSentence({ silenceMin: 5, maxMin: 30 })).toBe("Analisar quando o grupo ficar 5 min em silêncio, ou no máximo a cada 30 min.");
    expect(windowExample({ silenceMin: 5, maxMin: 30 })).toBe("Se a conversa para às 10:00, o Hermes analisa às 10:05. Se ela não para, analisa às 10:30.");
  });
});
