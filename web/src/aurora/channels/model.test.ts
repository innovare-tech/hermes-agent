import { describe, expect, it } from "vitest";
import { agoLabel, applyFilters, channelActions, chatIdOf, groupsSummary, linkedClients, modeBlocked, needsLink, NO_FILTERS, participantsLabel, sortSection, windowError, windowExample, windowSentence, type ChannelRow } from "./model";

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

  it("grupos não escutados vão depois, por nome, sem mexer na ordem dos escutados", () => {
    const rows = [
      ch({ id: "z", name: "Zeta", listening: false }),
      ch({ id: "a", clientId: "x", listening: true }),
      ch({ id: "d", name: "Árvore", listening: false, discovered: true, window: null }),
      ch({ id: "b", clientId: "x", problem: { message: "p" }, listening: true }),
      ch({ id: "c", listening: true }),
    ];
    expect(sortSection(rows).map((r) => r.id)).toEqual(["c", "b", "a", "d", "z"]);
  });

  it("rotula participantes: size do WhatsApp primeiro, senão quem já escreveu", () => {
    expect(participantsLabel(ch({ size: 12, members: 3 }))).toBe("12 participantes");
    expect(participantsLabel(ch({ size: 1 }))).toBe("1 participante");
    expect(participantsLabel(ch({ size: null, members: 3 }))).toBe("3 pessoas escreveram");
    expect(participantsLabel(ch({ members: 1 }))).toBe("1 pessoa escreveu");
    expect(participantsLabel(ch({}))).toBe("");
  });

  it("grupo descoberto só oferece escutar; nunca pede vínculo", () => {
    const d = ch({ discovered: true, listening: false, window: null });
    expect(channelActions(d, true)).toEqual({ mode: false, link: false, window: false, participants: false, listen: true });
    expect(channelActions(d, false).listen).toBe(false);
    expect(needsLink(d)).toBe(false);
    expect(channelActions(ch({ listening: true }), true)).toEqual({ mode: true, link: true, window: true, participants: true, listen: true });
    expect(channelActions(ch({ platform: "telegram" }), true).listen).toBe(false);
    expect(chatIdOf(ch({ id: "whatsapp:123@g.us" }))).toBe("123@g.us");
    expect(chatIdOf(ch({ chat_id: "9@g.us" }))).toBe("9@g.us");
    expect(applyFilters([d], { ...NO_FILTERS, mode: 3 })).toEqual([]);
  });

  it("resume a descoberta e avisa quando a política não é allowlist", () => {
    const now = 10_000_000;
    const rows = [ch({ id: "a", listening: true }), ch({ id: "b", listening: false })];
    expect(groupsSummary({ policy: "allowlist", updatedAt: now - 3 * 60000, count: 5 }, rows, now).text).toBe("5 grupos no WhatsApp · 1 escutado · atualizado há 3 min");
    expect(groupsSummary({ policy: "allowlist", updatedAt: null, count: 0 }, rows, now).text).toMatch(/alguns segundos depois que o WhatsApp conecta/);
    expect(groupsSummary({ policy: "open", updatedAt: null, count: 0 }, rows, now).warn).toBe("Todos os grupos chegam ao Hermes (sem lista)");
    expect(groupsSummary({ policy: "pairing", updatedAt: 1, count: 2 }, rows, now).warn).toBe("Grupos desligados neste perfil");
    expect(agoLabel(now - 2 * 3600000, now)).toBe("há 2 h");
    expect(agoLabel(now - 30000, now)).toBe("agora há pouco");
  });
});
