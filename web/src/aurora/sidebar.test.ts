import { describe, expect, it } from "vitest";
import { isListenSession } from "./chat/sources";
import { AGENT, approvalsCount } from "./Sidebar";
import type { ApprovalRow } from "./permissions/model";
import type { Approval } from "./adapter";

const draft = (id: string, business: string) => ({ id, business }) as Approval;
const req = (id: number) => ({ id }) as ApprovalRow;

describe("approvalsCount", () => {
  it("soma rascunhos e pedidos de ação pendentes", () => {
    expect(approvalsCount({ biz: "all", approvals: [draft("a", "x"), draft("b", "")], actionRequests: [req(1), req(2)] })).toBe(4);
  });
  it("o filtro de negócio vale só para os rascunhos; os pedidos de ação contam sempre", () => {
    expect(approvalsCount({ biz: "x", approvals: [draft("a", "x"), draft("b", "y")], actionRequests: [req(1)] })).toBe(2);
  });
  it("sem nada, zero", () => {
    expect(approvalsCount({ biz: "all", approvals: [], actionRequests: [] })).toBe(0);
  });
});

describe("isListenSession", () => {
  it("esconde as sessões internas do Escutar", () => {
    expect(isListenSession({ id: "20261009_x", title: "Escutar · Padaria Sol" })).toBe(true);
    expect(isListenSession({ id: "cron_ops-listen-abc_2026", title: "Sem título" })).toBe(true);
  });
  it("mantém as conversas de verdade", () => {
    expect(isListenSession({ id: "20261009_y", title: "Resumo do dia" })).toBe(false);
    expect(isListenSession({ id: "cron_resumo-diario_1", title: "Resumo diário" })).toBe(false);
  });
});

describe("menu lateral", () => {
  it("Configurações tem os subitens na ordem das abas", () => {
    expect(AGENT.filter((n) => n.sub).map((n) => n.label)).toEqual(["Modelos", "Avisos", "Perfis", "Permissões"]);
    expect(AGENT.find((n) => n.label === "Permissões")?.to).toBe("/settings/permissoes");
  });
});
