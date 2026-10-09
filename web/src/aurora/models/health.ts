// Estado de saúde dos provedores para a Sidebar: ponto vermelho em Modelos quando algum deles tem problema.
import { useSyncExternalStore } from "react";
import { modelsApi } from "./api";

let problem = false;
const subs = new Set<() => void>();

export function setModelsProblem(v: boolean) {
  if (v === problem) return;
  problem = v;
  subs.forEach((f) => f());
}

export function useModelsProblem(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => problem,
  );
}

/** Lê o estado guardado dos provedores (não testa ninguém); falha em silêncio. */
export async function refreshModelsHealth() {
  try {
    setModelsProblem((await modelsApi.providers()).some((p) => p.status === "error"));
  } catch {
    /* sem estado novo: mantém o anterior */
  }
}
