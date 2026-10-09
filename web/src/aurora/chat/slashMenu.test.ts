import { describe, expect, it } from "vitest";
import { buildSlashMenu, filterSlash } from "./slashMenu";

const catalog = {
  pairs: [
    ["/retry", "Retry the last message (resend to agent)"],
    ["/status", "Show session, model, token, and context info"],
    ["/redraw", "Force a full UI repaint"],
    ["/yolo", "Toggle YOLO mode"],
    ["/curator", "Background skill maintenance (usage: /curator [subcommand])"],
    ["/arxiv", "Search arXiv papers"],
    ["/airtable", "Airtable via REST"],
    ["/model", "Switch model (usage: /model [model])"],
    ["/footer", "Toggle footer"],
  ],
  skills: { "/arxiv": { usage: 5, origin: "bundled" }, "/airtable": { usage: 0, origin: "bundled" } },
  commands: { "/redraw": { desktop: "terminal" }, "/footer": { desktop: "terminal" }, "/model": { desktop: "hidden" }, "/status": {}, "/retry": {}, "/curator": { desktop: "advanced" } },
} as Parameters<typeof buildSlashMenu>[0];

describe("buildSlashMenu", () => {
  const menu = buildSlashMenu(catalog);
  it("grupos Comandos e Skills; comandos de terminal ficam de fora", () => {
    expect(menu.filter((c) => c.group === "Comandos").map((c) => c.cmd)).toEqual(["/retry", "/model", "/status", "/curator"]);
    expect(menu.filter((c) => c.group === "Skills").map((c) => c.cmd)).toEqual(["/arxiv", "/airtable"]);
    for (const hidden of ["/redraw", "/yolo", "/footer"]) expect(menu.map((c) => c.cmd)).not.toContain(hidden);
  });
  it("principais em português; o resto como vem, sem o '(usage: …)'", () => {
    expect(menu.find((c) => c.cmd === "/retry")?.desc).toBe("Gera a última resposta de novo");
    expect(menu.find((c) => c.cmd === "/curator")?.desc).toBe("Manutenção de skills em segundo plano (status, executar, fixar, arquivar)");
    expect(menu.find((c) => c.cmd === "/arxiv")?.skill).toBe(true);
  });
  it("skills mais usadas primeiro", () => {
    expect(menu.filter((c) => c.skill)[0].cmd).toBe("/arxiv");
  });
});

describe("filterSlash", () => {
  const menu = buildSlashMenu(catalog);
  it("busca por nome e por descrição, sem acento", () => {
    expect(filterSlash(menu, "/st").map((c) => c.cmd)).toEqual(["/status"]);
    expect(filterSlash(menu, "/ultima").map((c) => c.cmd)).toEqual(["/retry"]);
    expect(filterSlash(menu, "/").length).toBe(menu.length);
    expect(filterSlash(menu, "/zzzz")).toEqual([]);
  });
  it("nome que começa com o termo vem antes; Comandos antes de Skills", () => {
    const r = filterSlash(menu, "/a");
    expect(r.map((c) => c.cmd)).toEqual(["/status", "/curator", "/arxiv", "/airtable"]);
    expect(r.findIndex((c) => c.skill)).toBeGreaterThan(r.findIndex((c) => !c.skill));
  });
});

describe("descrições em português", () => {
  const names = ["agents", "approvals", "bg", "blueprint", "branch", "bundles", "focus", "heartbeat", "journey", "moa", "profile", "refine", "rollback", "save"];
  const menu = buildSlashMenu({ pairs: names.map((n) => ["/" + n, "English description of " + n]), skills: {}, commands: {} } as Parameters<typeof buildSlashMenu>[0]);
  it("todos os comandos pedidos saem em português, nenhum com o texto em inglês", () => {
    expect(menu.map((c) => c.cmd).sort()).toEqual(names.map((n) => "/" + n).sort());
    for (const c of menu) expect(c.desc).not.toMatch(/English|\b(the|and|Show|Run)\b/);
    expect(menu.find((c) => c.cmd === "/bg")?.desc).toBe("Roda um pedido numa conversa separada, em segundo plano");
  });
});
