import { describe, expect, it } from "vitest";
import type { Check, Incident, Status } from "./api";
import {
  agoLabel, badgeOf, BOT_LIMIT, checksSummary, clock, countStatuses, fixState, fmtDuration, freqLabel, groupBorder, groupPills, healthCount, heroIncident, meters, meterTone,
  createExamples, incidentSpan, isEnvName, plural, runToast, sentences, serverSlug, shortDetail, SSH_KEY_ENV, sinceLabel, sortChecks, sparkPoints, targetLabel, visibleRows, whenLabel, worstStatus,
} from "./model";

const chk = (name: string, status: Status): Check => ({ id: name, group: "whatsapp_bots", name, detail: "", kind: "bot", status, severity: "critical", result: {}, intervalSec: 60, lastRunAt: 0, history: [], historyLabel: "", clientId: null, sourceText: null, createdAt: 0 });
const inc = (p: Partial<Incident>): Incident => ({ id: 1, code: "INC-1", checkId: null, severity: "critical", title: "t", impact: "", status: "open", startedAt: 100, ackBy: null, ackAt: null, resolvedAt: null, resolvedBy: null, note: null, timeline: [], hypothesis: null, investigating: false, suggestedAction: null, approval: null, ...p });

describe("ordem e pior status", () => {
  it("problemas primeiro: erro, atenção, aguardando, ok; empate mantém a ordem original", () => {
    const rows = [chk("a", "ok"), chk("b", "warn"), chk("c", "pending"), chk("d", "error"), chk("e", "ok"), chk("f", "error")];
    expect(sortChecks(rows).map((r) => r.name)).toEqual(["d", "f", "b", "c", "a", "e"]);
  });
  it("pior status do grupo", () => {
    expect(worstStatus(["ok", "ok"])).toBe("ok");
    expect(worstStatus(["ok", "pending"])).toBe("pending");
    expect(worstStatus(["ok", "warn", "pending"])).toBe("warn");
    expect(worstStatus(["warn", "error", "ok"])).toBe("error");
    expect(worstStatus([])).toBe("ok");
  });
  it("borda do grupo: vermelho, âmbar ou neutra", () => {
    expect(groupBorder("error")).toContain("--err");
    expect(groupBorder("warn")).toContain("--warn");
    expect(groupBorder("pending")).toBe("var(--line)");
    expect(groupBorder("ok")).toBe("var(--line)");
  });
  it("pílulas só com quem existe, e resumo em texto", () => {
    const c = countStatuses([chk("a", "error"), chk("b", "warn"), chk("c", "ok"), chk("d", "ok")]);
    expect(groupPills(c).map((p) => p.label)).toEqual(["1 com problema", "1 atenção", "2 ok"]);
    expect(groupPills(countStatuses([chk("a", "ok")])).map((p) => p.label)).toEqual(["1 ok"]);
    const p = countStatuses([chk("a", "paused"), chk("b", "paused"), chk("c", "error")]);
    expect(groupPills(p).map((x) => x.label)).toEqual(["1 com problema", "2 pausadas"]);
    expect(worstStatus(["paused", "ok"])).toBe("ok"); // pausada nunca pinta o grupo
    expect(checksSummary(c)).toBe("1 com problema · 1 em atenção · 2 normais");
    expect(checksSummary(countStatuses([chk("a", "ok"), chk("b", "ok")]))).toBe("2 normais");
  });
});

describe("bots: 6 linhas, sempre todas as com problema", () => {
  const ok = (n: number) => Array.from({ length: n }, (_, i) => chk(`ok${i}`, "ok"));
  const bad = (n: number) => Array.from({ length: n }, (_, i) => chk(`bad${i}`, "error"));

  it("sem problema: corta em 6 e oferece 'Ver todos'", () => {
    const r = visibleRows(sortChecks(ok(18)), BOT_LIMIT, false);
    expect(r.shown).toHaveLength(6);
    expect(r.hidden).toBe(12);
    expect(r.toggle).toBe(true);
  });
  it("com 3 problemas: eles vêm primeiro e ainda são 6 linhas", () => {
    const r = visibleRows(sortChecks([...ok(15), ...bad(3)]), BOT_LIMIT, false);
    expect(r.shown).toHaveLength(6);
    expect(r.shown.slice(0, 3).every((x) => x.status === "error")).toBe(true);
  });
  it("com 9 problemas: mostra os 9 (nunca esconde problema)", () => {
    const r = visibleRows(sortChecks([...ok(10), ...bad(9)]), BOT_LIMIT, false);
    expect(r.shown).toHaveLength(9);
    expect(r.shown.every((x) => x.status === "error")).toBe(true);
    expect(r.hidden).toBe(10);
  });
  it("atenção também conta como problema", () => {
    const rows = sortChecks([...ok(10), chk("w", "warn"), chk("w2", "warn")]);
    expect(visibleRows(rows, BOT_LIMIT, false).shown.slice(0, 2).map((x) => x.name)).toEqual(["w", "w2"]);
  });
  it("pausadas ficam sempre visíveis, mesmo depois do corte", () => {
    const p = chk("pausada", "paused");
    const r = visibleRows(sortChecks([...ok(10), p]), BOT_LIMIT, false);
    expect(r.shown).toHaveLength(7);
    expect(r.shown).toContain(p);
    expect(r.hidden).toBe(4);
  });
  it("expandido mostra todos e o botão continua para 'Mostrar menos'", () => {
    const r = visibleRows(sortChecks(ok(18)), BOT_LIMIT, true);
    expect(r.shown).toHaveLength(18);
    expect(r.toggle).toBe(true);
  });
  it("até 6 bots, ou grupo sem limite: sem botão", () => {
    expect(visibleRows(ok(6), BOT_LIMIT, false).toggle).toBe(false);
    expect(visibleRows(ok(3), BOT_LIMIT, false).shown).toHaveLength(3);
    const free = visibleRows(ok(30), undefined, false);
    expect(free.shown).toHaveLength(30);
    expect(free.toggle).toBe(false);
  });
});

describe("medidores", () => {
  it("≥ 80 âmbar, ≥ 90 vermelho, abaixo neutro", () => {
    expect([0, 79.9, 80, 89.9, 90, 100].map(meterTone)).toEqual(["ok", "ok", "warn", "warn", "error", "error"]);
  });
  it("só os números que vieram, limitados a 0–100", () => {
    expect(meters(undefined)).toEqual([]);
    expect(meters({})).toEqual([]);
    expect(meters({ cpu: 34, disk: 86 })).toEqual([
      { label: "CPU", value: 34, tone: "ok" },
      { label: "Disco", value: 86, tone: "warn" },
    ]);
    expect(meters({ cpu: 120, ram: -3 }).map((m) => m.value)).toEqual([100, 0]);
  });
});

describe("tempo e frequência", () => {
  it("duração", () => {
    expect(fmtDuration(-5)).toBe("menos de 1 min");
    expect(fmtDuration(59)).toBe("menos de 1 min");
    expect(fmtDuration(60)).toBe("1 min");
    expect(fmtDuration(14 * 60 + 20)).toBe("14 min");
    expect(fmtDuration(3600)).toBe("1 h");
    expect(fmtDuration(2 * 3600 + 15 * 60)).toBe("2 h 15 min");
    expect(fmtDuration(86400)).toBe("1 d");
    expect(fmtDuration(3 * 86400 + 4 * 3600 + 59)).toBe("3 d 4 h");
  });
  it("frequência aceita pelo backend", () => {
    expect([60, 300, 900, 3600, 86400, 7200, 172800, 30].map(freqLabel)).toEqual(["a cada 1 min", "a cada 5 min", "a cada 15 min", "a cada 1 hora", "a cada 1 dia", "a cada 2 horas", "a cada 2 dias", "a cada 30 s"]);
  });
  it("há quanto tempo", () => {
    expect([0, 4, 20, 90, 7200, 3 * 86400].map(agoLabel)).toEqual(["agora", "agora", "há 20 s", "há 1 min", "há 2 h", "há 3 d"]);
  });
  it("relógio, 'desde' e 'quando' (hoje, ontem, outro dia)", () => {
    const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).getTime() / 1000;
    const now = at(9, 12, 0);
    expect(clock(at(9, 9, 5))).toBe("09:05");
    expect(sinceLabel(at(9, 9, 28), now)).toBe("09:28");
    expect(sinceLabel(at(8, 22, 10), now)).toBe("ontem 22:10");
    expect(sinceLabel(at(5, 22, 10), now)).toBe("05/10 22:10");
    expect(whenLabel(at(9, 9, 28), now)).toBe("hoje às 09:28");
    expect(whenLabel(at(8, 18, 20), now)).toBe("ontem às 18:20");
    expect(whenLabel(at(5, 18, 20), now)).toBe("05/10 às 18:20");
  });
  it("sparkline: menos de 2 pontos não desenha; série constante fica no meio; extremos tocam as bordas", () => {
    expect(sparkPoints([])).toBeNull();
    expect(sparkPoints([5])).toBeNull();
    expect(sparkPoints([3, 3, 3])).toBe("1.0,12.0 50.0,12.0 99.0,12.0");
    expect(sparkPoints([0, 10])).toBe("1.0,22.0 99.0,2.0");
  });
});

describe("incidentes", () => {
  it("herói = crítico aberto mais antigo; sem crítico, nenhum", () => {
    const list = [inc({ id: 3, severity: "warning", startedAt: 10 }), inc({ id: 2, startedAt: 300 }), inc({ id: 1, startedAt: 200 })];
    expect(heroIncident(list)?.id).toBe(1);
    expect(heroIncident([inc({ severity: "warning" })])).toBeNull();
    expect(heroIncident([])).toBeNull();
  });
  it("badge: críticos em vermelho; só atenção, os abertos em âmbar; nada, nada", () => {
    const b = badgeOf([inc({}), inc({ id: 2, severity: "warning" }), inc({ id: 3, status: "resolved" })]);
    expect(b).toEqual({ critical: 1, open: 2 });
    expect(healthCount(b)).toEqual({ text: "1", tone: "hl-crit" });
    expect(healthCount({ critical: 0, open: 2 })).toEqual({ text: "2", tone: "hl-warn" });
    expect(healthCount({ critical: 0, open: 0 })).toEqual({ text: "", tone: "" });
  });
  it("correção: sem sugestão, pronta, aguardando (com destino e expiração), aprovada, negada, vencida", () => {
    const sa = { label: "Reiniciar o wa-gateway", command: "kubectl rollout restart deploy/wa-gateway", needsApproval: true };
    const ap = (status: string, extra = {}) => ({ id: 7, status, target: "telegram:-1001:12", expiresAt: 1000 + 15 * 60, decidedBy: null, result: null, ...extra });
    expect(fixState({ suggestedAction: null, approval: null }, 1000)).toEqual({ kind: "none" });
    expect(fixState({ suggestedAction: sa, approval: null }, 1000)).toEqual({ kind: "ready" });
    expect(fixState({ suggestedAction: sa, approval: ap("pending") }, 1000)).toEqual({ kind: "pending", target: "Telegram · tópico 12", expiresAt: 1900, minutesLeft: 15 });
    expect(fixState({ suggestedAction: sa, approval: ap("pending") }, 1000 + 14 * 60 + 1)).toMatchObject({ kind: "pending", minutesLeft: 1 });
    expect(fixState({ suggestedAction: sa, approval: ap("approved", { decidedBy: "Rafael", result: "ok" }) }, 1000)).toEqual({ kind: "approved", by: "Rafael", result: "ok" });
    expect(fixState({ suggestedAction: sa, approval: ap("denied", { decidedBy: "Rafael" }) }, 1000)).toEqual({ kind: "denied", by: "Rafael" });
    expect(fixState({ suggestedAction: sa, approval: ap("expired") }, 1000)).toEqual({ kind: "expired" });
    expect(fixState({ suggestedAction: sa, approval: ap("blocked") }, 1000)).toEqual({ kind: "blocked" });
  });
  it("destino da aprovação não mostra o ID do chat", () => {
    expect(targetLabel("telegram:-1001234:12")).toBe("Telegram · tópico 12");
    expect(targetLabel("telegram:-1001234")).toBe("Telegram");
    expect(targetLabel(null)).toBe("Telegram");
    expect(targetLabel("telegram:-1001234:12")).not.toContain("1001234");
  });
});

describe("conexões", () => {
  it("uma chave SSH só e o nome do servidor como o backend grava", () => {
    expect(SSH_KEY_ENV).toBe("HEALTH_SSH_KEY");
    expect(serverSlug("VPS Innovare_2")).toBe("vpsinnovare2");
    expect(serverSlug("vps-2")).toBe("vps-2");
  });
});

describe("toast do 'Rodar agora' (só o que o servidor devolveu)", () => {
  const next = (status: Status, text = "") => ({ name: "wa-gateway", status, result: { text } });
  it("primeira execução", () => {
    expect(runToast({ name: "x", status: "pending" }, next("ok", "Tudo certo"), false)).toEqual({ text: "Primeira execução feita", sub: "Tudo certo" });
  });
  it("continua com problema: diz se o incidente segue aberto", () => {
    expect(runToast({ name: "x", status: "error" }, next("error", "2 de 3 prontos"), true)).toEqual({ text: "wa-gateway: continua com problema", sub: "2 de 3 prontos. O incidente segue aberto." });
    expect(runToast({ name: "x", status: "error" }, next("error", "fora"), false).sub).toContain("abre um incidente");
  });
  it("voltou ao normal, atenção e ok", () => {
    expect(runToast({ name: "x", status: "error" }, next("ok", "3 de 3"), true).text).toBe("wa-gateway: voltou ao normal");
    expect(runToast({ name: "x", status: "ok" }, next("warn", "lento"), false).text).toBe("wa-gateway: em atenção");
    expect(runToast({ name: "x", status: "ok" }, next("ok"), false)).toEqual({ text: "wa-gateway: ok", sub: "Rodei agora, sem mudança." });
  });
});

describe("fmtDuration com dias", () => {
  it("1 d 12 h, 2 d e dias sem horas", () => {
    expect(fmtDuration(36 * 3600)).toBe("1 d 12 h");
    expect(fmtDuration(2 * 86400 + 59 * 60)).toBe("2 d");
  });
});

describe("concordância", () => {
  it("1 normal / N normais", () => {
    expect(plural(1, "normal", "normais")).toBe("1 normal");
    expect(plural(3, "normal", "normais")).toBe("3 normais");
    expect(checksSummary(countStatuses([chk("a", "ok")]))).toBe("1 normal");
    expect(checksSummary(countStatuses([chk("a", "ok"), chk("b", "paused")]))).toBe("1 normal · 1 pausada");
  });
});

describe("pontuação dos toasts", () => {
  it("põe o ponto que falta entre as frases", () => {
    expect(sentences("Caído desde 07/10 23:11", "O incidente segue aberto.")).toBe("Caído desde 07/10 23:11. O incidente segue aberto.");
    expect(sentences("Já tem ponto.", "Outra.")).toBe("Já tem ponto. Outra.");
    expect(sentences("", false, "Só esta.")).toBe("Só esta.");
  });
});

describe("nome de variável (Conexões)", () => {
  it("aceita só MAIÚSCULAS, dígitos e _ (sem começar por dígito)", () => {
    expect(isEnvName("AIBIZ_MONGO_URI")).toBe(true);
    expect(isEnvName("_K8S_TOKEN2")).toBe(true);
    expect(isEnvName("mongodb://user:senha@host/db")).toBe(false);
    expect(isEnvName("eyJhbGciOi.token")).toBe(false);
    expect(isEnvName("2TOKEN")).toBe(false);
    expect(isEnvName("")).toBe(false);
  });
});

describe("duração do incidente", () => {
  const now = new Date(2026, 9, 9, 12, 0).getTime() / 1000;
  const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).getTime() / 1000;
  it("com problemSince antes da detecção: mostra a duração do problema e quando foi detectado", () => {
    const r = incidentSpan({ startedAt: at(9, 10, 54), problemSince: at(7, 23, 11) }, now);
    expect(r.dur).toBe("1 d 12 h");
    expect(r.since).toBe("com problema desde 07/10 23:11 · detectado às 10:54");
  });
  it("sem problemSince (ou igual à detecção): só desde quando o incidente abriu", () => {
    expect(incidentSpan({ startedAt: at(9, 10, 54) }, now)).toEqual({ dur: "1 h 6 min", since: "desde 10:54" });
    expect(incidentSpan({ startedAt: at(9, 10, 54), problemSince: at(9, 10, 54) }, now).since).toBe("desde 10:54");
  });
});

describe("Kubernetes e detalhes", () => {
  it("esconde o UUID: 8 caracteres + …", () => {
    expect(shortDetail("default · bot-b89f1c2e-1a2b-4c3d-8e9f-0123456789ab")).toBe("default · bot-b89f…");
    expect(shortDetail("default · wa-gateway")).toBe("default · wa-gateway");
  });
  it("exemplos do diálogo vêm dos dados reais; sem dados, genéricos", () => {
    const ex = createExamples([{ group: "whatsapp_bots", name: "Padaria Sol" }, { group: "servers", name: "vps1" }, { group: "dead_letters", name: "ignoradas pelo socket" }]);
    expect(ex[0]).toContain("Padaria Sol");
    expect(ex[1]).toContain("vps1");
    expect(ex[2]).toContain("ignoradas pelo socket");
    expect(createExamples([]).join(" ")).not.toMatch(/Padaria|vps1/);
  });
});
