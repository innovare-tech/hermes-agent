// @vitest-environment jsdom
// Bolhas da Conversa: Pensamento em Markdown, passo negado sem linha repetida e edição com anexos como chips.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentBubble, UserBubble } from "./Bubbles";
import { Reasoning } from "./Reasoning";
import type { AgentMessage, ToolStep } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let box: HTMLDivElement;
const mount = async (el: React.ReactElement) => {
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
  await act(async () => root.render(el));
};
const click = (el: Element | null) => act(async () => void (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })));
const byLabel = (label: string) => box.querySelector(`[aria-label="${label}"]`);
afterEach(async () => {
  await act(async () => root?.unmount());
  box?.remove();
});

describe("Pensamento", () => {
  it("abre e renderiza Markdown (negrito, lista, código), não texto cru", async () => {
    await mount(<Reasoning text={"Vou **somar** primeiro:\n\n- 17 x 23\n- conferir com `391`"} ms={3000} live={false} />);
    expect(box.querySelector(".au-think-body")).toBeNull(); // recolhido por padrão
    await click(box.querySelector("button"));
    const body = box.querySelector(".au-think-body")!;
    expect(body.querySelector("strong")?.textContent).toBe("somar");
    expect(body.querySelectorAll("li")).toHaveLength(2);
    expect(body.querySelector("code.au-md-ic")?.textContent).toBe("391");
    expect(body.textContent).not.toContain("**");
  });
});

const denied: ToolStep = { id: "t1", kind: "terminal", name: "terminal", target: "rm -rf build", dur: "", status: "denied", output: "", args: { command: "rm -rf build" } };
const agent = (o: Partial<AgentMessage>): AgentMessage => ({ id: "a", role: "agent", steps: [], text: "", live: false, ...o });
const noop = () => {};
const approval = (status: "denied" | "approved") => ({ id: "r1", command: "rm -rf build", description: "apagar build", choices: ["once" as const, "deny" as const], status, respond: noop });
const bubble = (m: AgentMessage) => <AgentBubble m={m} isLast busy={false} onRetry={noop} onUndo={noop} onSwitchModel={noop} onCron={noop} onAnswer={noop} />;
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("passo negado", () => {
  it("diz 'negado por você' uma vez só: o passo cobre, a linha do pedido some", async () => {
    await mount(bubble(agent({ steps: [denied], approval: approval("denied"), text: "Entendi, não vou apagar." })));
    expect(count(box.textContent!, "negado por você")).toBe(1);
    expect(box.textContent).toContain("Não executado (negado por você)");
  });
  it("negado sem passo correspondente (pedido expirou ou o passo não veio): a linha do pedido continua", async () => {
    await mount(bubble(agent({ approval: approval("denied"), text: "ok" })));
    expect(count(box.textContent!, "negado por você")).toBe(1);
    expect(box.textContent).toContain("rm -rf build");
  });
  it("aprovado mostra a linha 'aprovado por você'", async () => {
    await mount(bubble(agent({ approval: approval("approved"), text: "feito" })));
    expect(box.textContent).toContain("aprovado por você");
  });
});

describe("editar mensagem com anexo", () => {
  const sent = { id: "u1", role: "user" as const, text: "@image:/h/images/a.png [screenshot]\n@file:/h/b.csv\n\nolha isso", rowId: 3 };

  it("anexos viram chips removíveis; só o texto livre fica no campo", async () => {
    await mount(<UserBubble m={sent} canEdit onEdit={noop} />);
    await click(byLabel("Editar a mensagem"));
    const area = byLabel("Editar sua mensagem") as HTMLTextAreaElement;
    expect(area.value).toBe("olha isso");
    expect(box.querySelectorAll(".au-edit .au-achip")).toHaveLength(2);
    expect(byLabel("Remover anexo a.png")).not.toBeNull();
    expect(byLabel("Remover anexo b.csv")).not.toBeNull();
  });

  it("reenviar entrega o texto livre e só os anexos que sobraram (com a referência)", async () => {
    const onEdit = vi.fn();
    await mount(<UserBubble m={sent} canEdit onEdit={onEdit} />);
    await click(byLabel("Editar a mensagem"));
    await click(byLabel("Remover anexo a.png"));
    expect(box.querySelectorAll(".au-edit .au-achip")).toHaveLength(1);
    await click([...box.querySelectorAll("button")].find((b) => b.textContent === "Enviar de novo")!);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith("olha isso", [expect.objectContaining({ name: "b.csv", kind: "file", ref: "@file:/h/b.csv" })]);
  });

  it("sem mudar nada, não reenvia; tirando todos os anexos, reenvia só o texto", async () => {
    const onEdit = vi.fn();
    await mount(<UserBubble m={sent} canEdit onEdit={onEdit} />);
    await click(byLabel("Editar a mensagem"));
    await click([...box.querySelectorAll("button")].find((b) => b.textContent === "Enviar de novo")!);
    expect(onEdit).not.toHaveBeenCalled();
    await click(byLabel("Editar a mensagem"));
    await click(byLabel("Remover anexo a.png"));
    await click(byLabel("Remover anexo b.csv"));
    await click([...box.querySelectorAll("button")].find((b) => b.textContent === "Enviar de novo")!);
    expect(onEdit).toHaveBeenCalledWith("olha isso", []);
  });

  it("mensagem enviada nesta sessão (anexo só com caminho no servidor) também volta como chip", async () => {
    await mount(<UserBubble m={{ id: "u2", role: "user", text: "veja", attachments: [{ name: "tela.png", kind: "image", paths: ["/h/images/u1.png"] }] }} canEdit onEdit={noop} />);
    await click(byLabel("Editar a mensagem"));
    expect(byLabel("Remover anexo tela.png")).not.toBeNull();
    expect((byLabel("Editar sua mensagem") as HTMLTextAreaElement).value).toBe("veja");
  });
});
