// @vitest-environment jsdom
// Configurações › Perfis: coluna "Situação", Copiloto revogado como "Revogado" e o link `?perfil=` do Copiloto.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../profileLogic";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mk = (id: string, o: Partial<Profile> = {}): Profile => ({
  id, name: id, desc: "", color: "violeta", icon: "user", isDefault: false, group: null, channels: [], model: "", provider: "", status: "ok", canPause: true, pausedBy: null, usageToday: { msgs: 0, costUsd: 0 }, ...o,
});
const LIST: Profile[] = [
  mk("default", { isDefault: true }),
  mk("cli-padaria", { name: "Padaria Sol", group: "copiloto", copilot: { status: "active", plan: "starter", systemClientId: "abc123" } }),
  mk("cli-doce", { name: "Doce Encanto", group: "copiloto", status: "paused", pausedBy: "copilot_revoked", copilot: { status: "revoked", plan: "pro", systemClientId: "de7731" } }),
];

vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), fetchJSON: vi.fn(async () => LIST), setManagementProfile: vi.fn() }));
const { ProfilesPanel } = await import("./Profiles");
const { setState } = await import("../store");

let root: Root;
let box: HTMLDivElement;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const mount = async (url: string) => {
  setState({ profiles: LIST, profilesStatus: "ready", profileId: "default" });
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
  Element.prototype.scrollIntoView = vi.fn();
  await act(async () => root.render(<MemoryRouter initialEntries={[url]}><ProfilesPanel /></MemoryRouter>));
  await flush();
};
afterEach(async () => {
  await act(async () => root?.unmount());
  box?.remove();
});

describe("Perfis do Copiloto", () => {
  it("cabeçalho 'Situação' e resumo do grupo sem 'Todos rodando' quando há revogado", async () => {
    await mount("/settings/perfis");
    expect(box.textContent).toContain("Situação");
    expect(box.textContent).not.toContain("Status");
    expect(box.textContent).toContain("1 revogado");
    expect(box.textContent).not.toContain("Todos rodando");
  });

  it("?perfil= abre o grupo, destaca e rola até o perfil; o revogado diz 'Revogado' e 'Copiloto revogado'", async () => {
    await mount("/settings/perfis?perfil=cli-doce");
    const row = box.querySelector<HTMLElement>('[data-pid="cli-doce"]')!;
    expect(row).toBeTruthy();
    expect(row.getAttribute("aria-current")).toBe("location");
    expect(row.textContent).toContain("Revogado");
    expect(row.textContent).toContain("Copiloto revogado");
    expect(row.textContent).not.toContain("Rodando");
    expect(row.textContent).not.toContain("Pausado");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(box.querySelector('[data-pid="cli-padaria"]')?.getAttribute("aria-current")).toBeNull();
  });
});
