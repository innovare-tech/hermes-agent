import { describe, expect, it } from "vitest";
import {
  accentVars,
  clientSummary,
  createdSub,
  deleteItems,
  hexOf,
  matchProfile,
  menuReasons,
  nameError,
  nextColor,
  otherIssueLabel,
  otherIssues,
  pickInitialProfile,
  problemCopy,
  profilePath,
  rowSubtitle,
  slugify,
  splitProfiles,
  statusDetail,
  triggerStatus,
  uniqueId,
  usageBar,
  usageTotals,
  type Profile,
} from "./profileLogic";

const mk = (id: string, o: Partial<Profile> = {}): Profile => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  desc: "",
  color: "violeta",
  icon: "user",
  isDefault: false,
  group: null,
  channels: [],
  model: "",
  provider: "",
  status: "ok",
  canPause: true,
  pausedBy: null,
  usageToday: { msgs: 0, costUsd: 0 },
  ...o,
});

describe("id do perfil", () => {
  it("vem do nome, sem acento nem símbolo", () => {
    expect(slugify("Padaria do Zé!")).toBe("padaria-do-ze");
    expect(slugify("  Ótica   Visão ")).toBe("otica-visao");
    expect(slugify("Clínica Bem-Viver (SP)")).toBe("clinica-bem-viver-sp");
    expect(slugify("???")).toBe("perfil");
  });

  it("colisão vira -2, -3…", () => {
    expect(uniqueId("Aibiz", [])).toBe("aibiz");
    expect(uniqueId("Aibiz", ["aibiz"])).toBe("aibiz-2");
    expect(uniqueId("Aibiz", ["aibiz", "aibiz-2"])).toBe("aibiz-3");
    expect(uniqueId("Ótica Visão", ["otica-visao"])).toBe("otica-visao-2");
  });

  it("caminho mostrado no rodapé do diálogo", () => {
    expect(profilePath("Padaria Sol", ["padaria-sol"])).toBe("~/.hermes/profiles/padaria-sol-2");
    expect(profilePath("  ")).toBe("~/.hermes/profiles/…");
  });
});

describe("nome", () => {
  const list = [mk("default", { name: "Pessoal" }), mk("aibiz", { name: "Aibiz" })];
  it("obrigatório, único (sem diferenciar maiúsculas) e com limite", () => {
    expect(nameError("  ", list)).toMatch(/Dê um nome/);
    expect(nameError("aibiz", list)).toMatch(/Já existe/);
    expect(nameError("Aibiz 2", list)).toBe("");
    expect(nameError("x".repeat(41), list)).toMatch(/40/);
  });
  it("ao editar, o próprio nome não conflita", () => {
    expect(nameError("Aibiz", list, "aibiz")).toBe("");
    expect(nameError("Pessoal", list, "aibiz")).toMatch(/Já existe/);
  });
});

describe("busca e grupos", () => {
  const list = [mk("pessoal", { name: "Pessoal", desc: "Família e finanças" }), mk("cli-otica", { name: "Ótica Visão", group: "copiloto" }), mk("aibiz", { desc: "SaaS de atendimento" })];
  it("acha por nome, id e descrição, sem acento", () => {
    expect(matchProfile(list[1], "otica")).toBe(true);
    expect(matchProfile(list[1], "ÓTICA")).toBe(true);
    expect(matchProfile(list[0], "financas")).toBe(true);
    expect(matchProfile(list[2], "padaria")).toBe(false);
    expect(matchProfile(list[2], "")).toBe(true);
  });
  it("separa os clientes do Copiloto e respeita a busca", () => {
    expect(splitProfiles(list).clients.map((p) => p.id)).toEqual(["cli-otica"]);
    expect(splitProfiles(list).top.map((p) => p.id)).toEqual(["pessoal", "aibiz"]);
    const hit = splitProfiles(list, "visao");
    expect(hit.top).toEqual([]);
    expect(hit.clients).toHaveLength(1);
  });
});

describe("status", () => {
  it("gatilho: rodando pulsa, pausado e problema não", () => {
    expect(triggerStatus(mk("a"))).toMatchObject({ label: "Hermes · rodando", pulse: true });
    expect(triggerStatus(mk("a", { status: "paused" }))).toMatchObject({ label: "Pausado", pulse: false });
    expect(triggerStatus(mk("a", { status: "err" }))).toMatchObject({ label: "Com problema", pulse: false });
  });

  it("faixa de outro perfil: só os outros com problema; um ou vários", () => {
    const aibiz = mk("aibiz", { name: "Aibiz", status: "err", issueKind: "gateway", issue: "Gateway parado com 1 canal ligado" });
    const list = [mk("default"), aibiz, mk("innovare", { status: "err", issueKind: "channel", issue: "Telegram: token inválido" })];
    expect(otherIssues(list, "aibiz").map((p) => p.id)).toEqual(["innovare"]);
    expect(otherIssueLabel(otherIssues([mk("default"), aibiz], "default"))).toBe("Aibiz: gateway parado");
    expect(otherIssueLabel(otherIssues(list, "default"))).toBe("2 perfis com problema");
    expect(otherIssueLabel([])).toBe("");
  });

  it("linha do seletor e detalhe da lista", () => {
    expect(rowSubtitle(mk("a", { status: "err", issueKind: "gateway" }))).toEqual({ text: "Gateway parado", tone: "var(--err)" });
    expect(rowSubtitle(mk("a", { status: "paused" })).text).toBe("Pausado");
    expect(rowSubtitle(mk("cli-x", { group: "copiloto", desc: "Cliente" })).text).toBe("cli-x");
    expect(statusDetail(mk("a", { status: "paused", pausedBy: "all" }))).toMatch(/Pausar tudo/);
    expect(statusDetail(mk("a", { status: "paused", pausedBy: "profile" }))).toBe("Pausado por você");
    expect(statusDetail(mk("a"))).toBe("Sem canais conectados");
    expect(statusDetail(mk("a", { channels: ["telegram"] }))).toBe("Respondendo normalmente");
  });

  it("resumo do grupo e texto da faixa de problema", () => {
    expect(clientSummary([mk("a"), mk("b")])).toBe("Todos rodando");
    expect(clientSummary([mk("a", { status: "paused" }), mk("b", { status: "err" }), mk("c", { status: "paused" })])).toBe("1 com problema · 2 pausados");
    expect(problemCopy(mk("a", { issueKind: "gateway", channels: ["whatsapp"] })).text).toMatch(/1 canal ligado.*Gateway é o serviço/);
    expect(problemCopy(mk("a", { issueKind: "gateway", channels: ["a", "b"] })).text).toMatch(/2 canais ligados/);
    expect(problemCopy(mk("a", { issueKind: "channel", issue: "Telegram: token inválido" })).text).toMatch(/Telegram: token inválido/);
  });
});

describe("cores e uso", () => {
  it("a cor do perfil vira --acc, --accSoft (15% escuro / 10% claro) e brilho (26% / 22%)", () => {
    expect(accentVars("coral", "dark")).toMatchObject({ "--acc": "#ff9f7a", "--accSoft": "rgba(255,159,122,0.15)", "--accGlow": "rgba(255,159,122,0.26)" });
    expect(accentVars("coral", "light")).toMatchObject({ "--acc": "#c4532c", "--accSoft": "rgba(196,83,44,0.1)", "--accGlow": "rgba(196,83,44,0.22)" });
    expect(hexOf("não-existe", "dark")).toBe("#a395ff"); // cor desconhecida cai no violeta
  });

  it("próxima cor: a primeira da paleta que ninguém usa", () => {
    expect(nextColor([mk("a", { color: "violeta" }), mk("b", { color: "azul" })])).toBe("ciano");
    expect(nextColor([])).toBe("violeta");
  });

  it("barra de uso e totais", () => {
    expect(usageBar(50, 100)).toBe("50%");
    expect(usageBar(0, 0)).toBe("2%");
    const t = usageTotals([mk("a", { usageToday: { msgs: 3, costUsd: 0.5 } }), mk("b", { usageToday: { msgs: 4, costUsd: 0.25 } })]);
    expect(t).toEqual({ msgs: 7, costUsd: 0.75 });
  });
});

describe("perfil inicial", () => {
  const list = [mk("default"), mk("aibiz", { isDefault: true }), mk("innovare")];
  it("o último aberto, senão o padrão do Hermes, senão a raiz", () => {
    expect(pickInitialProfile(list, "innovare")).toBe("innovare");
    expect(pickInitialProfile(list, "apagado")).toBe("aibiz");
    expect(pickInitialProfile(list, "")).toBe("aibiz");
    expect(pickInitialProfile([mk("default"), mk("x")], "")).toBe("default");
    expect(pickInitialProfile([], "")).toBe("");
  });
});

describe("menu e apagar", () => {
  it("o padrão não apaga, a raiz nunca apaga e quem não pausa sozinho diz por quê", () => {
    expect(menuReasons(mk("aibiz", { isDefault: true })).remove).toMatch(/padrão/);
    expect(menuReasons(mk("default")).remove).toMatch(/principal/);
    expect(menuReasons(mk("aibiz")).remove).toBe("");
    expect(menuReasons(mk("default", { name: "Pessoal", canPause: false })).pause).toMatch(/Pessoal só pausa pelo/);
    expect(menuReasons(mk("a", { pausedBy: "all", status: "paused" })).pause).toMatch(/Retome por lá/);
    expect(menuReasons(mk("a")).pause).toBe("");
  });

  it("lista do que será apagado usa o que há de verdade, com plural certo", () => {
    const l = deleteItems({ memories: 1, skills: 14, tools: 1, convs: 0, keys: ["Nous Portal", "GitHub"] }, ["WhatsApp", "Telegram"]).map((x) => x.l);
    expect(l).toEqual(["1 memória", "14 skills e 1 ferramenta", "0 conversas", "2 canais desconectados: WhatsApp, Telegram", "Chaves: Nous Portal, GitHub"]);
    expect(deleteItems(null, []).map((x) => x.l)).toEqual(["Memórias", "Skills e ferramentas", "Conversas", "Nenhum canal conectado", "Chaves de API"]);
  });

  it("aviso de depois de criar diz o que foi copiado (canais e chaves nunca)", () => {
    const src = mk("pessoal", { name: "Pessoal" });
    expect(createdSub(src, { skills: true, memory: false, tools: true })).toBe("Copiei skills, ferramentas de Pessoal. Canais e chaves começam vazios.");
    expect(createdSub(undefined, { skills: true, memory: true, tools: true })).toBe("Começou do zero. Você já está nele.");
    expect(createdSub(src, { skills: false, memory: false, tools: false })).toMatch(/sem copiar nada de Pessoal/);
  });
});
