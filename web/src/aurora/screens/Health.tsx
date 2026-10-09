// Operação › Saúde (A7): servidores, banco, bots, Kubernetes, filas e serviços; incidentes que o Hermes investiga.
// Dados reais de /api/health e /api/incidents (por perfil). Nada de dado de exemplo.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { ChecksGroups } from "../health/Checks";
import { Connections } from "../health/Connections";
import { CreateDialog } from "../health/CreateDialog";
import { AttentionHero, CalmHero, CriticalHero } from "../health/Hero";
import { IncidentCard, NoIncidents, ResolveDialog, type IncidentBusy } from "../health/Incidents";
import { HealthEmpty, HealthError, HealthSkeleton, RecommendedResultCard } from "../health/States";
import { errText, healthApi, type Check, type Incident, type Overview, type RecommendedResult } from "../health/api";
import { setHealthIncidents } from "../health/badge";
import { checksSummary, countStatuses, GROUPS, heroIncident, nowSec, runToast, targetLabel } from "../health/model";
import "../health/health.css";
import { toast } from "../store";

const POLL_MS = 15000;

/** Relógio em segundos para as durações ao vivo. */
function useNow(ms: number) {
  const [n, setN] = useState(nowSec);
  useEffect(() => {
    const iv = setInterval(() => setN(nowSec()), ms);
    return () => clearInterval(iv);
  }, [ms]);
  return n;
}

const GLOW = {
  crit: "color-mix(in oklab,var(--err) 26%,transparent)",
  calm: "color-mix(in oklab,var(--ok) 16%,transparent)",
  attn: "color-mix(in oklab,var(--warn) 20%,transparent)",
} as const;

export function Health() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [incs, setIncs] = useState<Incident[]>([]);
  const [failed, setFailed] = useState(false);
  const [stale, setStale] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [incBusy, setIncBusy] = useState<Record<number, IncidentBusy>>({});
  const [creating, setCreating] = useState(false);
  const [connections, setConnections] = useState(false);
  const [resolving, setResolving] = useState<Incident | null>(null);
  const [resolveBusy, setResolveBusy] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [recs, setRecs] = useState<RecommendedResult | null>(null);
  const [usingRecs, setUsingRecs] = useState(false);
  const now = useNow(10000);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const checksRef = useRef<Check[] | null>(null);
  const incsRef = useRef<Incident[]>([]);

  const load = useCallback(async (silent: boolean) => {
    try {
      const [c, o, i] = await Promise.all([healthApi.checks(), healthApi.overview(), healthApi.incidents("open")]);
      checksRef.current = c;
      incsRef.current = i;
      setChecks(c);
      setOverview(o);
      setIncs(i);
      setHealthIncidents(i);
      setFailed(false);
      setStale(false);
    } catch {
      // Sem nada na tela, o erro vira a tela de erro; com dados, mantém o que tem e avisa que pode estar velho.
      if (silent) setStale(true);
      else setFailed(true);
    }
  }, []);

  useEffect(() => {
    load(false);
    const iv = setInterval(() => document.visibilityState === "visible" && load(true), POLL_MS);
    const ts = timers.current;
    return () => {
      clearInterval(iv);
      ts.forEach(clearTimeout);
    };
  }, [load]);

  const retry = async () => {
    setRetrying(true);
    await load(false);
    setRetrying(false);
  };

  // ---- ações ----

  const run = async (c: Check) => {
    setRunning((s) => new Set(s).add(c.id));
    try {
      const next = await healthApi.run(c.id);
      setChecks((cs) => cs && cs.map((x) => (x.id === next.id ? next : x)));
      const t = runToast(c, next, incsRef.current.some((i) => i.checkId === c.id));
      toast(t.text, t.sub);
      load(true); // o incidente pode ter aberto, reaberto ou fechado com este resultado
    } catch (e) {
      toast(errText(e, `Não consegui rodar “${c.name}” agora`));
    } finally {
      setRunning((s) => {
        const n = new Set(s);
        n.delete(c.id);
        return n;
      });
    }
  };

  const pause = async (c: Check, paused: boolean) => {
    setRunning((s) => new Set(s).add(c.id));
    try {
      const next = await healthApi.setPaused(c.id, paused);
      setChecks((cs) => cs && cs.map((x) => (x.id === next.id ? next : x)));
      toast(paused ? `“${c.name}” pausada` : `“${c.name}” retomada`, paused ? "Não roda nem chama a equipe; um incidente aberto dela foi fechado." : "Roda no próximo ciclo (até 30 s).");
      load(true);
    } catch (e) {
      toast(errText(e, `Não consegui ${paused ? "pausar" : "retomar"} “${c.name}”`));
    } finally {
      setRunning((s) => {
        const n = new Set(s);
        n.delete(c.id);
        return n;
      });
    }
  };

  const remove = async (c: Check) => {
    try {
      await healthApi.remove(c.id);
      setChecks((cs) => cs && cs.filter((x) => x.id !== c.id));
      toast(`“${c.name}” removida`);
    } catch (e) {
      toast(errText(e, `Não consegui remover “${c.name}”`));
    }
  };

  const busyOf = (id: number, p: IncidentBusy) => setIncBusy((b) => ({ ...b, [id]: { ...b[id], ...p } }));
  const swap = (next: Incident) => {
    incsRef.current = incsRef.current.map((x) => (x.id === next.id ? next : x));
    setIncs(incsRef.current);
  };

  const ack = async (inc: Incident) => {
    busyOf(inc.id, { ack: true });
    try {
      swap(await healthApi.ack(inc.id));
      toast(`${inc.code} reconhecido`, "Ficou registrado na linha do tempo. A equipe é avisada pelos Avisos de infra.");
    } catch (e) {
      toast(errText(e, "Não consegui reconhecer o incidente"));
    } finally {
      busyOf(inc.id, { ack: false });
    }
  };

  const fix = async (inc: Incident) => {
    busyOf(inc.id, { fix: true });
    try {
      const next = await healthApi.action(inc.id);
      swap(next);
      toast("Pedido de aprovação enviado", `Mandei para ${targetLabel(next.approval?.target ?? null)} com o comando exato. Assim que alguém aprovar, eu executo.`);
    } catch (e) {
      toast(errText(e, "Não consegui pedir a aprovação"));
    } finally {
      busyOf(inc.id, { fix: false });
    }
  };

  const resolve = async (inc: Incident, note: string) => {
    setResolveBusy(true);
    try {
      const r = await healthApi.resolve(inc.id, note);
      setResolving(null);
      incsRef.current = incsRef.current.filter((x) => x.id !== inc.id);
      setIncs(incsRef.current);
      setHealthIncidents(incsRef.current);
      toast(
        `${inc.code} resolvido`,
        r.stillFailing ? "A verificação ainda mostra problema; o Hermes reabre se continuar." : note ? `Anotado: “${note}”.` : "Registrado no histórico de incidentes.",
      );
      load(true);
    } catch (e) {
      toast(errText(e, "Não consegui resolver o incidente"));
    } finally {
      setResolveBusy(false);
    }
  };

  const created = (c: Check) => {
    setCreating(false);
    setFresh((s) => new Set(s).add(c.id));
    setChecks((cs) => {
      const next = [c, ...(cs ?? [])];
      checksRef.current = next;
      return next;
    });
    const label = GROUPS.find((g) => g.key === c.group)?.label ?? "Verificações";
    toast("Verificação criada", `Entrou em ${label}. A primeira execução vem em instantes.`);
    timers.current.push(setTimeout(() => run(c), 1500));
    load(true);
  };

  const useDefaults = async () => {
    setUsingRecs(true);
    try {
      const r = await healthApi.recommended();
      setRecs(r);
      toast(r.created.length ? `${r.created.length} verificações criadas` : "Nenhuma verificação nova", r.skipped.length ? "Veja o que falta configurar logo abaixo." : "Elas começam a rodar sozinhas.");
      await load(true);
    } catch (e) {
      toast(errText(e, "Não consegui criar as recomendadas"));
    } finally {
      setUsingRecs(false);
    }
  };

  // ---- derivados ----

  const counts = useMemo(() => countStatuses(checks ?? []), [checks]);
  const hero = useMemo(() => heroIncident(incs), [incs]);
  const loading = checks === null && !failed;
  const empty = checks !== null && checks.length === 0 && incs.length === 0;
  const ready = checks !== null && !empty;
  const calm = incs.length === 0 && counts.error === 0 && counts.warn === 0;
  const mood = hero ? "crit" : calm ? "calm" : "attn";
  const glow = ready ? GLOW[mood] : "transparent";

  return (
    <div className="hl-scroll" style={{ flex: 1, overflow: "auto", minHeight: 0, ["--hl-glow" as string]: glow }}>
      <div className="au-page">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, maxWidth: 640 }}>
            <span className="au-label">Operação · Fase 2</span>
            <h1 className="au-h1">Saúde</h1>
            <p style={{ margin: 0, color: "var(--fg2)", fontSize: 14.5, lineHeight: 1.55 }}>
              Servidores, banco, bots de WhatsApp e serviços deste perfil. O Hermes checa sozinho e investiga quando algo sai do normal.
            </p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="au-outline" onClick={() => setConnections(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 15px", fontWeight: 600 }}>
              <Icon name="plug" size={14} color="var(--acc)" />
              Conexões
            </button>
            <button className="au-outline" onClick={() => setCreating(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 15px", fontWeight: 600 }}>
              <Icon name="plus" size={14} color="var(--acc)" />
              Criar verificação
            </button>
          </div>
        </div>

        {stale && (
          <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--warn)" }}>
            <Icon name="triangle-alert" size={14} />
            <span>Não consegui atualizar agora; o que está abaixo pode estar desatualizado.</span>
            <button className="au-ghost" onClick={() => load(true)} style={{ color: "var(--acc)", textDecoration: "underline" }}>
              Tentar de novo
            </button>
          </div>
        )}

        {recs && <RecommendedResultCard result={recs} onConnections={() => setConnections(true)} onClose={() => setRecs(null)} />}

        {loading && <HealthSkeleton />}
        {failed && checks === null && <HealthError busy={retrying} onRetry={retry} />}
        {empty && <HealthEmpty busy={usingRecs} onUseDefaults={useDefaults} onCreate={() => setCreating(true)} />}

        {ready && (
          <>
            {mood === "crit" && hero && <CriticalHero inc={hero} now={now} acking={!!incBusy[hero.id]?.ack} onAck={() => ack(hero)} />}
            {mood === "calm" && <CalmHero overview={overview} counts={counts} now={now} />}
            {mood === "attn" && <AttentionHero counts={counts} overview={overview} now={now} />}

            <section id="incidentes" tabIndex={-1} aria-label="Incidentes abertos" className="hl-sec" style={{ outline: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <h2 className="hl-h2">Incidentes abertos</h2>
                <span className="hl-mono" style={{ fontSize: 12, color: "var(--fg3)" }}>{incs.length}</span>
              </div>
              {incs.length === 0 && <NoIncidents last={overview?.lastIncident} now={now} />}
              {incs.map((inc) => (
                <IncidentCard key={inc.id} inc={inc} now={now} busy={incBusy[inc.id] ?? {}} onAck={() => ack(inc)} onFix={() => fix(inc)} onResolve={() => setResolving(inc)} />
              ))}
            </section>

            <section className="hl-sec" aria-label="Verificações">
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h2 className="hl-h2">Verificações</h2>
                <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>{checksSummary(counts)}</span>
              </div>
              <ChecksGroups checks={checks ?? []} now={now} busy={running} freshIds={fresh} actions={{ onRun: run, onPause: pause, onRemove: remove }} />
            </section>
          </>
        )}
      </div>

      {creating && <CreateDialog onClose={() => setCreating(false)} onCreated={created} />}
      {connections && <Connections onClose={() => setConnections(false)} onSaved={() => load(true)} />}
      {resolving && (
        <ResolveDialog
          inc={resolving}
          stillFailing={checks?.find((c) => c.id === resolving.checkId)?.status === "error"}
          busy={resolveBusy}
          onClose={() => setResolving(null)}
          onSubmit={(note) => resolve(resolving, note)}
        />
      )}
    </div>
  );
}
