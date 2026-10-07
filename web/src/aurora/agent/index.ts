import { useCallback, useEffect, useState } from "react";
import { served } from "../served";
import { toast } from "../store";
import { liveAgent } from "./live";
import { mockAgent } from "./mock";
import type { AgentAdapter } from "./types";

export const agent: AgentAdapter = served ? liveAgent : mockAgent;

/** Carrega dados de uma tela do agente; `pollMs` recarrega periodicamente; `active=false` congela (sem buscar). */
export function useAgentData<T>(load: () => Promise<T>, deps: unknown[], pollMs?: number, active = true) {
  const [data, setData] = useState<T | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  const reload = useCallback(() => {
    run().then(setData, () => toast("Não consegui carregar os dados do agente"));
  }, [run]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const tick = () => run().then((d) => alive && setData(d), () => alive && toast("Não consegui carregar os dados do agente"));
    tick();
    const iv = pollMs ? setInterval(tick, pollMs) : undefined;
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [run, pollMs, active]);
  return [data, setData, reload] as const;
}
