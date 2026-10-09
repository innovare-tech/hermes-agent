// Incidentes abertos para a Sidebar: badge vermelho (crítico) ou âmbar (só atenção) em Saúde e "Incidente crítico" no perfil.
import { useSyncExternalStore } from "react";
import { getManagementProfile } from "@/lib/api";
import { healthApi, type Incident } from "./api";
import { badgeOf } from "./model";

export type HealthBadge = { critical: number; open: number };
const NONE: HealthBadge = { critical: 0, open: 0 };

let badge = NONE;
const subs = new Set<() => void>();

export function setHealthBadge(next: HealthBadge) {
  if (next.critical === badge.critical && next.open === badge.open) return;
  badge = next;
  subs.forEach((f) => f());
}

/** A tela de Saúde já leu a lista: atualiza o badge sem esperar o próximo ciclo. */
export const setHealthIncidents = (list: Pick<Incident, "severity" | "status">[]) => setHealthBadge(badgeOf(list));

export function useHealthBadge(): HealthBadge {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => badge,
  );
}

/** Lê os incidentes abertos; falha em silêncio (mantém o que já estava). */
export async function refreshHealthBadge() {
  const pid = getManagementProfile();
  try {
    const list = await healthApi.incidents("open");
    if (getManagementProfile() === pid) setHealthIncidents(list); // trocou de perfil no meio: descarta
  } catch {
    /* sem leitura nova: mantém o badge anterior */
  }
}

/** Troca de perfil: o badge do perfil anterior não vale mais. */
export const resetHealthBadge = () => setHealthBadge(NONE);
