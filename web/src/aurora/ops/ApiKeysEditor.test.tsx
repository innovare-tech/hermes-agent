// @vitest-environment jsdom
// "Nova chave" na aba Outras: valida o nome e salva uma variável que o catálogo não conhece.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const saved: [string, string][] = [];
vi.mock("../agent", async (orig) => {
  const { useEffect, useState } = await import("react");
  return {
    ...(await orig<typeof import("../agent")>()),
    agent: {
      apiKeys: async () => [{ key: "AIBIZ_MONGO_URI", description: "", category: "custom", isSet: true, preview: "«x»", advanced: false }],
      providerCatalog: async () => [],
      setApiKey: async (k: string, v: string) => void saved.push([k, v]),
    },
    useAgentData: <T,>(load: () => Promise<T>) => {
      const [v, setV] = useState<T | null>(null);
      useEffect(() => void load().then(setV), []);
      return [v, null, () => {}] as const;
    },
  };
});

const type = (el: HTMLInputElement, v: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

it("cria chave com nome livre e recusa nome inválido ou repetido", async () => {
  const { ApiKeysEditor } = await import("./ApiKeysEditor");
  const box = document.body.appendChild(document.createElement("div"));
  await act(async () => createRoot(box).render(<ApiKeysEditor />));
  await act(async () => (box.querySelectorAll<HTMLButtonElement>("[role=tab]")[2]).click());
  const name = box.querySelector<HTMLInputElement>("[aria-label='Nome da nova chave']")!;
  const value = box.querySelector<HTMLInputElement>("[aria-label='Valor da nova chave']")!;
  const submit = () => box.querySelector<HTMLButtonElement>("form button[type=submit]")!;

  await type(name, "minha-chave");
  expect(box.textContent).toContain("Use letras maiúsculas");
  await type(name, "aibiz_mongo_uri");
  expect(box.textContent).toContain("já existe");
  await type(name, "aibiz_mongo_rw_uri");
  await type(value, "mongodb://u:p@h/db");
  expect(submit().disabled).toBe(false);
  await act(async () => submit().click());
  expect(saved).toEqual([["AIBIZ_MONGO_RW_URI", "mongodb://u:p@h/db"]]);
});
