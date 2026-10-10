import { describe, expect, it } from "vitest";
import type { CatalogTool, Client, ClientDetail } from "./api";
import {
  askedBy, auditView, avatarColor, bannerOf, byLabel, canRevoke, countOf, creditBand, dayBars, directoryInfo, fmtTokens, fmtUsd, initial, isNewClient, kpiRow, lastLabel, lastParts, mergeClients, nextPlan, pageLabel,
  planDiff, planName, profilePreview, purgeDays, purgeLabel, queryText, replaceClient, rowLast, sortClients, toolUsage, toolsOf,
} from "./model";

const NOW = Date.UTC(2026, 9, 9, 15, 0, 0) / 1000; // 09/10/2026 12:00 em Brasília
const DAY = 86400;
const cl = (p: Partial<Client> & { systemClientId: string }): Client => ({
  name: p.systemClientId,
  plan: "starter",
  profileId: "cli-" + p.systemClientId,
  status: "active",
  createdAt: NOW - 90 * DAY,
  month: { conversations: 0, credits: 0, creditsLimit: 1000, tokens: 0, toolCalls: 0, spendUsd: 0 },
  lastActivityAt: NOW - 3600,
  keyRotatedAt: null,
  revoked: null,
  ...p,
});

const CATALOG: CatalogTool[] = [
  { key: "a", label: "Status dos canais", plans: ["starter", "pro"], weight: 1 },
  { key: "b", label: "Auditar atendente", plans: ["pro"], weight: 5 },
  { key: "c", label: "Consulta livre", plans: ["pro"], weight: 1 },
];
const CREDITS = { starter: { credits: 1000 }, pro: { credits: 5000 } };

describe("ordem da lista", () => {
  it("novos, sem saldo, ativos, revogados; dentro do grupo, o mais recente primeiro", () => {
    const items = [
      cl({ systemClientId: "rev", status: "revoked", revoked: { at: NOW - DAY, by: "painel", reason: null, purgeAt: NOW + 29 * DAY } }),
      cl({ systemClientId: "ativo-velho", lastActivityAt: NOW - 5 * DAY }),
      cl({ systemClientId: "sem-saldo", status: "no_credit" }),
      cl({ systemClientId: "ativo-novo", lastActivityAt: NOW - 60 }),
      cl({ systemClientId: "novo", lastActivityAt: null, createdAt: NOW - DAY }),
    ];
    expect(sortClients(items, NOW).map((c) => c.systemClientId)).toEqual(["novo", "sem-saldo", "ativo-novo", "ativo-velho", "rev"]);
    expect(items[0].systemClientId).toBe("rev"); // não mexe na entrada
  });

  it("cliente novo: o backend manda isNew; sem isso vale ativo, sem uso e criado há menos de 7 dias", () => {
    expect(isNewClient(cl({ systemClientId: "x", lastActivityAt: null, createdAt: NOW - 2 * DAY }), NOW)).toBe(true);
    expect(isNewClient(cl({ systemClientId: "x", lastActivityAt: null, createdAt: NOW - 8 * DAY }), NOW)).toBe(false);
    expect(isNewClient(cl({ systemClientId: "x", lastActivityAt: null, createdAt: NOW - 2 * DAY, status: "revoked" }), NOW)).toBe(false);
    expect(isNewClient(cl({ systemClientId: "x", lastActivityAt: NOW - 1, createdAt: NOW - DAY }), NOW)).toBe(false);
    expect(isNewClient(cl({ systemClientId: "x", isNew: true, lastActivityAt: NOW }), NOW)).toBe(true);
  });

  it("mergeClients não repete quem já estava; replaceClient troca só o mesmo id", () => {
    const a = [cl({ systemClientId: "1" }), cl({ systemClientId: "2" })];
    expect(mergeClients(a, [cl({ systemClientId: "2" }), cl({ systemClientId: "3" })]).map((c) => c.systemClientId)).toEqual(["1", "2", "3"]);
    const r = replaceClient(a, cl({ systemClientId: "2", status: "revoked" }));
    expect(r.map((c) => c.status)).toEqual(["active", "revoked"]);
  });
});

describe("avatar", () => {
  it("a cor é estável por id e sempre uma da paleta", () => {
    expect(avatarColor("abc123")).toBe(avatarColor("abc123"));
    expect(avatarColor("abc123")).toBe("#f5c26b"); // soma dos códigos 444, 444 % 8 = 4
    const ids = ["a", "b", "c", "ac2214", "k82f1q", "x".repeat(40)];
    for (const id of ids) expect(avatarColor(id)).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("a inicial pula símbolos e vira maiúscula", () => {
    expect(initial("padaria sol")).toBe("P");
    expect(initial("  “Óptica”")).toBe("Ó");
    expect(initial("")).toBe("?");
  });
});

describe("barra de créditos", () => {
  it("âmbar a partir de 80%, vermelha em 100%; 79,9% ainda não é âmbar", () => {
    expect(creditBand(0, 1000)).toMatchObject({ pct: 0, tone: "ok", color: "var(--acc)" });
    expect(creditBand(799, 1000)).toMatchObject({ pct: 79, tone: "ok" });
    expect(creditBand(800, 1000)).toMatchObject({ pct: 80, tone: "warn", color: "var(--warn)" });
    expect(creditBand(999, 1000)).toMatchObject({ pct: 99, tone: "warn" });
    expect(creditBand(1000, 1000)).toMatchObject({ pct: 100, tone: "err", color: "var(--err)" });
    expect(creditBand(1300, 1000)).toMatchObject({ pct: 100, tone: "err" });
  });
  it("limite zero não divide por zero", () => {
    expect(creditBand(10, 0)).toMatchObject({ pct: 0, tone: "ok" });
  });
});

describe("rótulos e números", () => {
  it("contadores dos chips e rótulo da paginação", () => {
    const counts = { all: 48, active: 40, no_credit: 5, revoked: 3 };
    expect(countOf(counts, "")).toBe(48);
    expect(countOf(counts, "no_credit")).toBe(5);
    expect(countOf(null, "active")).toBe(0);
    expect(pageLabel(20, 48, true)).toBe("Mostrando 20 de 48 · carregar mais");
    expect(pageLabel(1, 1, false)).toBe("1 cliente");
    expect(pageLabel(48, 48, false)).toBe("48 clientes");
  });
  it("plano, dinheiro e tokens", () => {
    expect(planName("pro", { pro: "Pro" })).toBe("Pro");
    expect(planName("starter")).toBe("Starter");
    expect(fmtUsd(11.2)).toBe("US$ 11,20");
    expect(fmtUsd(null)).toBe("—");
    expect(fmtTokens(850)).toBe("850");
    expect(fmtTokens(1800)).toBe("1,8 mil");
    expect(fmtTokens(5_900_000)).toBe("5,9 mi");
  });
  it("última atividade", () => {
    expect(lastLabel(null, NOW)).toBe("nunca usou");
    expect(lastLabel(NOW - 120, NOW)).toBe("há 2 min");
    expect(lastParts(NOW - 7200, NOW)).toEqual({ v: "2 h", s: "atrás" });
    expect(lastParts(null, NOW)).toEqual({ v: "—", s: "nunca usou" });
    const rev = cl({ systemClientId: "r", status: "revoked", revoked: { at: NOW - 7 * DAY, by: "painel", reason: null, purgeAt: NOW } });
    expect(rowLast(rev, NOW)).toMatch(/^revogado em \d\d\/\d\d$/);
  });
  it("resumo do topo: gasto vem da lista sem filtro", () => {
    expect(kpiRow({ all: 3, active: 2, no_credit: 1, revoked: 0 }, 12.5)).toEqual({ active: 2, noCredit: 1, spendUsd: 12.5 });
    expect(kpiRow(null, null)).toEqual({ active: 0, noCredit: 0, spendUsd: null });
  });
});

describe("plano", () => {
  it("diff Starter → Pro: o que entra e os créditos", () => {
    expect(planDiff(CATALOG, "starter", "pro", CREDITS)).toEqual([
      { kind: "in", label: "Entra: Auditar atendente" },
      { kind: "in", label: "Entra: Consulta livre" },
      { kind: "credits", label: "Créditos: 1.000 → 5.000 por mês" },
    ]);
  });
  it("diff Pro → Starter: o que sai", () => {
    const d = planDiff(CATALOG, "pro", "starter", CREDITS);
    expect(d.map((x) => x.kind)).toEqual(["out", "out", "credits"]);
    expect(d[2].label).toBe("Créditos: 5.000 → 1.000 por mês");
  });
  it("mesmo plano: sem diferença; ferramentas do plano e próximo plano", () => {
    expect(planDiff(CATALOG, "pro", "pro", CREDITS)).toEqual([]);
    expect(toolsOf(CATALOG, "starter")).toHaveLength(1);
    expect(toolsOf(CATALOG, "pro")).toHaveLength(3);
    expect(nextPlan("starter")).toBe("pro");
    expect(nextPlan("pro")).toBeNull();
  });
});

describe("consumo", () => {
  it("barras por dia preenchem os dias sem uso com zero, do dia 1 até hoje", () => {
    const bars = dayBars([{ day: "2026-10-03", credits: 40 }, { day: "2026-10-05", credits: 10 }], NOW);
    expect(bars.map((b) => b.label)).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09"]);
    expect(bars.map((b) => b.credits)).toEqual([0, 0, 40, 0, 10, 0, 0, 0, 0]);
    expect(bars[2].title).toBe("03/10: 40 créditos");
    expect(dayBars([], NOW)).toEqual([]);
  });
  it("tabela por ferramenta: nome do catálogo, tokens numa linha própria e partes que fecham 100%", () => {
    const rows = toolUsage(
      { daily: [], byTool: [{ key: "a", uses: 12, credits: 30 }, { key: "zzz", uses: 1, credits: 10 }], tokens: 80000, tokenCredits: 40 },
      CATALOG,
    );
    expect(rows.map((r) => [r.label, r.uses, r.credits, r.pct])).toEqual([
      ["Status dos canais", 12, 30, 38],
      ["zzz", 1, 10, 13],
      ["Texto lido e escrito pela IA", null, 40, 50],
    ]);
  });
  it("usos que não gastaram crédito (recusados, com erro, teste da equipe) aparecem como 'sem custo'", () => {
    const rows = toolUsage({ daily: [], byTool: [{ key: "a", uses: 5, credits: 6 }, { key: "b", uses: 3, credits: 3 }, { key: "c", uses: 2, credits: 0 }], tokens: 0, tokenCredits: 0 }, [
      { key: "a", label: "A", weight: 2 },
      { key: "b", label: "B", weight: 1 },
      { key: "c", label: "C" },
    ]);
    expect(rows.map((r) => r.free)).toEqual([2, 0, 0]);
  });
  it("sem consumo nenhum: lista vazia e 0%", () => {
    expect(toolUsage({ daily: [], byTool: [], tokens: 0, tokenCredits: 0 }, CATALOG)).toEqual([]);
  });
});

describe("auditoria", () => {
  const base = { toolLabel: "Consultar conversas", ms: 120, error: null };
  it("recusa de outro cliente: vermelho, 'Recusado: outro cliente'", () => {
    const v = auditView({ ...base, result: "blocked_scope" }, "abc123");
    expect(v).toMatchObject({ tool: "Recusado: outro cliente", tone: "err", scope: true });
    expect(v.note).toContain("Nada foi lido");
  });
  it("consulta não permitida, erro e ok", () => {
    expect(auditView({ ...base, result: "blocked_query" }, "x")).toMatchObject({ tool: "Consulta não permitida", tone: "warn", scope: false });
    expect(auditView({ ...base, result: "error", error: "timeout" }, "x").note).toBe("A consulta deu erro: timeout");
    const ok = auditView({ ...base, result: "ok" }, "abc123");
    expect(ok).toMatchObject({ tool: "Consultar conversas", tone: "ok" });
    expect(ok.note).toBe('Só leitura · filtro systemClientId = "abc123" · 120 ms');
  });
  it("texto da consulta: JSON formatado, texto puro ou, sem consulta, os argumentos", () => {
    expect(queryText({ query: { filter: { systemClientId: "abc123" } }, args: null })).toBe('{\n  "filter": {\n    "systemClientId": "abc123"\n  }\n}');
    expect(queryText({ query: "db.conversations.find({})", args: null })).toBe("db.conversations.find({})");
    expect(queryText({ query: null, args: { days: 7 } })).toContain('"days": 7');
    expect(queryText({ query: null, args: null })).toBe("Nenhuma consulta foi registrada.");
  });
  it("quem perguntou", () => {
    expect(askedBy({ name: "Cláudio", role: "dono", via: "Aibiz Manager" })).toBe("Cláudio (dono) · Aibiz Manager");
    expect(askedBy({ name: "Gestor", role: "", via: "API" })).toBe("Gestor · API");
    expect(askedBy({ name: "Equipe", role: "teste", via: "Painel" })).toBe("Equipe · teste · Painel");
  });
});

describe("faixa de contexto do detalhe", () => {
  const d = (p: Partial<ClientDetail>) => ({ ...cl({ systemClientId: "x" }), ...p }) as ClientDetail;
  it("revogado: quando, por quem, motivo e quando a memória some", () => {
    const b = bannerOf(d({ status: "revoked", revoked: { at: NOW - 3 * DAY, by: "Carla", reason: "Contrato encerrado", purgeAt: NOW + 27 * DAY } }), NOW);
    expect(b?.tone).toBe("muted");
    expect(b?.text).toContain("por Carla (Contrato encerrado)");
    expect(b?.text).toContain("em 27 dias");
  });
  it("sem saldo: oferece o plano de cima; no último plano não oferece", () => {
    const starter = bannerOf(d({ status: "no_credit", plan: "starter" }), NOW);
    expect(starter?.action).toEqual({ label: "Mudar para Pro", plan: "pro" });
    expect(starter?.text).toContain("renovar (dia 1º de novembro)");
    expect(bannerOf(d({ status: "no_credit", plan: "pro" }), NOW)?.action).toBeUndefined();
  });
  it("novo, normal e revogado sem dados de revogação", () => {
    expect(bannerOf(d({ lastActivityAt: null, createdAt: NOW - DAY }), NOW)?.text).toContain("Cliente novo");
    expect(bannerOf(d({}), NOW)).toBeNull();
  });
  it("prazo da memória: dias por data, estável ao longo do dia, igual aos 30 dias do diálogo", () => {
    const noon = new Date(2026, 9, 9, 12, 0, 0).getTime() / 1000; // meio-dia local
    const purge = noon + 30 * DAY;
    expect(purgeLabel(purge, noon)).toMatch(/^em 30 dias \(\d\d\/\d\d\)$/);
    expect(purgeLabel(purge, noon + 5 * 3600)).toMatch(/^em 30 dias/); // 5 horas depois: o mesmo número
    expect(purgeLabel(purge, noon - 3 * 3600)).toMatch(/^em 30 dias/);
    expect(purgeLabel(purge, noon + DAY)).toMatch(/^em 29 dias/);
    expect(purgeLabel(noon + 3600, noon)).toBe("na próxima limpeza"); // hoje mesmo
    expect(purgeLabel(noon - 10, noon)).toBe("na próxima limpeza");
    expect(purgeDays(noon + 3 * DAY + 600, noon)).toBe(3);
    const b = bannerOf(d({ status: "revoked", revoked: { at: noon, by: "painel", reason: null, purgeAt: purge } }), noon);
    expect(b?.text).toContain("em 30 dias");
  });
  it("quem revogou, com a preposição: o painel é a equipe", () => {
    expect(byLabel("painel")).toBe("pela equipe (painel)");
    expect(byLabel(null)).toBe("pela equipe (painel)");
    expect(byLabel("Carla")).toBe("por Carla");
    const b = bannerOf(d({ status: "revoked", revoked: { at: NOW, by: "painel", reason: null, purgeAt: NOW + 30 * DAY } }), NOW);
    expect(b?.text).toContain("pela equipe (painel)");
    expect(b?.text).not.toContain("por a equipe");
  });
});

describe("revogar e criar", () => {
  it("só libera quando digita o systemClientId certo (espaços nas pontas não contam)", () => {
    expect(canRevoke("abc123", "abc123")).toBe(true);
    expect(canRevoke("  abc123 ", "abc123")).toBe(true);
    expect(canRevoke("abc12", "abc123")).toBe(false);
    expect(canRevoke("ABC123", "abc123")).toBe(false);
    expect(canRevoke("", "abc123")).toBe(false);
  });
  it("perfil previsto segue a regra do backend", () => {
    expect(profilePreview("Padaria Sol")).toBe("cli-padaria-sol");
    expect(profilePreview("Ótica Visão & Cia")).toBe("cli-otica-visao-cia");
    expect(profilePreview("Imobiliária Horizonte do Brasil Central Ltda")).toBe("cli-imobiliaria-horizonte-do");
    expect(profilePreview("???")).toBe("cli-cliente");
  });
  it("informação do cliente do banco", () => {
    expect(directoryInfo({ plan: "Pro", channelCount: 3 })).toBe("Pro do Aibiz · 3 canais");
    expect(directoryInfo({ channelCount: 1 })).toBe("1 canal");
    expect(directoryInfo({})).toBe("cliente do banco da Aibiz");
  });
});
