// Configurações › Modelos (design A5): provedores, quem faz o quê, gasto e limites do perfil.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "@/lib/api-error";
import { toast } from "../store";
import { useCurrentProfile } from "../ProfileChrome";
import {
  changedTasks, eff, limitsChanged, modelsApi, testLine, toBody, toCfg, TASKS,
  type Cfg, type Limits, type LimitsCfg, type Provider, type Routing, type Spend,
} from "./api";
import { refreshModelsHealth, setModelsProblem } from "./health";
import { MIcon } from "./icons";
import { LimitsPanel } from "./LimitsPanel";
import { ProviderDialog, ProviderGrid, RemoveDialog, type CardTest } from "./Providers";
import { TaskTable } from "./Tasks";
import "./models.css";

type Loaded = { provs: Provider[]; routing: Routing; spend: Spend | null; limits: Limits };

const toLimitsCfg = (l: Limits): LimitsCfg => ({ dailyUsd: l.dailyUsd, monthlyUsd: l.monthlyUsd, alertPct: l.alertPct, onLimit: l.onLimit });

export function ModelsScreen() {
  const profile = useCurrentProfile();
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [provs, setProvs] = useState<Provider[]>([]);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [saved, setSaved] = useState<Cfg | null>(null);
  const [lim, setLim] = useState<LimitsCfg | null>(null);
  const [savedLim, setSavedLim] = useState<LimitsCfg | null>(null);
  const [tests, setTests] = useState<Record<string, CardTest | undefined>>({});
  const [dialog, setDialog] = useState<{ edit: Provider | null } | null>(null);
  const [removing, setRemoving] = useState<Provider | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const [p, routing, limits, spend] = await Promise.all([modelsApi.providers(), modelsApi.routing(), modelsApi.limits(), modelsApi.spend().catch(() => null)]);
      if (!alive.current) return;
      setData({ provs: p, routing, spend, limits });
      setProvs(p);
      const c = toCfg(routing);
      setCfg(c);
      setSaved(c);
      const l = toLimitsCfg(limits);
      setLim(l);
      setSavedLim(l);
      setFailed(false);
    } catch {
      if (alive.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  // O ponto vermelho da Sidebar acompanha o que a tela está vendo.
  useEffect(() => {
    if (data) setModelsProblem(provs.some((p) => p.status === "error"));
  }, [data, provs]);

  const retry = async () => {
    setRetrying(true);
    await load();
    if (alive.current) setRetrying(false);
  };

  const used = useMemo(() => {
    const n: Record<string, number> = {};
    if (!cfg) return n;
    for (const t of TASKS) {
      const e = eff(t.id, cfg);
      if (!e.none) n[e.p] = (n[e.p] ?? 0) + 1;
    }
    return n;
  }, [cfg]);

  const dirtyTasks = cfg && saved ? changedTasks(cfg, saved) : [];
  const dirtyLimits = lim && savedLim ? limitsChanged(lim, savedLim) : [];
  const nDirty = dirtyTasks.length + dirtyLimits.length;

  // ---- provedores (salvam na hora) ----

  const testCard = async (p: Provider) => {
    setTests((t) => ({ ...t, [p.id]: { busy: true } }));
    try {
      const r = await modelsApi.testSaved(p.id);
      setTests((t) => ({ ...t, [p.id]: { ok: r.ok, line: testLine(r) } }));
      const fresh = await modelsApi.providers();
      setProvs(fresh);
      refreshModelsHealth();
    } catch (e) {
      setTests((t) => ({ ...t, [p.id]: { ok: false, line: errorMessage(e) || "Não consegui testar agora." } }));
    }
  };

  const providerDone = async (p: Provider, wasEdit: boolean) => {
    setDialog(null);
    setTests((t) => ({ ...t, [p.id]: undefined }));
    try {
      setProvs(await modelsApi.providers());
    } catch {
      setProvs((cur) => [...cur.filter((x) => x.id !== p.id), p]);
    }
    refreshModelsHealth();
    toast(wasEdit ? "Provedor atualizado" : `${p.name} adicionado`, wasEdit ? `${p.name} voltou a responder. As tarefas que usam ele já funcionam.` : "Os modelos dele já aparecem nos seletores de “Quem faz o quê”.");
  };

  const doRemove = async () => {
    if (!removing) return;
    const p = removing;
    setRemoveBusy(true);
    try {
      await modelsApi.remove(p.id);
      const [fresh, routing] = await Promise.all([modelsApi.providers(), modelsApi.routing()]);
      // Só o que o backend mudou (tarefas que usavam o provedor): o que está em edição por cima segue como está.
      const after = toCfg(routing);
      setSaved(after);
      setCfg((cur) => (cur && saved ? (Object.fromEntries(TASKS.map((t) => [t.id, JSON.stringify(cur[t.id]) === JSON.stringify(saved[t.id]) ? after[t.id] : cur[t.id]])) as Cfg) : after));
      setProvs(fresh);
      refreshModelsHealth();
      setRemoving(null);
      toast(`${p.name} removido`, "As tarefas que usavam ele voltaram para o padrão.");
    } catch (e) {
      toast(errorMessage(e) || "Não consegui remover o provedor");
    } finally {
      setRemoveBusy(false);
    }
  };

  // ---- salvar tarefas e limites ----

  const save = async () => {
    if (!cfg || !saved || !lim || !savedLim || saving) return;
    setSaving(true);
    let failedAt = "";
    try {
      const body = toBody(cfg, saved);
      if (body) {
        failedAt = "os modelos";
        const r = await modelsApi.saveRouting(body);
        const c = toCfg(r);
        setCfg(c);
        setSaved(c);
        setData((d) => (d ? { ...d, routing: r } : d));
      }
      if (dirtyLimits.length) {
        failedAt = "os limites";
        const l = toLimitsCfg(await modelsApi.saveLimits(lim));
        setLim(l);
        setSavedLim(l);
      }
      toast("Modelos salvos", "As próximas mensagens já usam a nova configuração. O que está em andamento termina com o modelo anterior.");
    } catch (e) {
      toast(errorMessage(e) || `Não consegui salvar ${failedAt}`);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (saved) setCfg(saved);
    if (savedLim) setLim(savedLim);
  };

  const ready = !!data && !!cfg && !!lim && !failed;
  const noProv = ready && provs.length === 0;

  return (
    <div className="mdl-root" style={{ display: "flex", flexDirection: "column", gap: 30 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, maxWidth: 680 }}>
        <h1 className="au-h1" style={{ margin: 0 }}>Modelos</h1>
        <p style={{ margin: 0, color: "var(--fg2)", fontSize: 14.5, lineHeight: 1.5, textWrap: "pretty" }}>
          Qual IA faz cada coisa neste perfil, quanto custa e até quanto pode gastar. Modelos maiores escrevem melhor; menores são mais rápidos e baratos.
        </p>
      </div>

      {!data && !failed && (
        <div aria-busy="true" aria-label="Carregando modelos" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
            {[1, 2, 3].map((k) => (
              <div key={k} className="mdl-skel" style={{ height: 132 }} />
            ))}
          </div>
          <div className="mdl-skel" style={{ height: 420, animation: "none", background: "var(--panel)" }} />
        </div>
      )}

      {failed && (
        <div role="alert" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, padding: 28, border: "1px solid color-mix(in oklab,var(--err) 35%,transparent)", borderRadius: "var(--r)", background: "var(--panel)" }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "color-mix(in oklab,var(--err) 14%,transparent)", color: "var(--err)" }}>
            <MIcon name="cloud-off" size={19} />
          </span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Não consegui carregar a configuração de modelos</span>
          <span style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.55, maxWidth: 580 }}>O Hermes continua usando os modelos que já estavam salvos. Só esta tela não carregou.</span>
          <button className="au-primary" onClick={retry} disabled={retrying}>
            <MIcon name="rotate-cw" size={14} spin={retrying} />
            Tentar de novo
          </button>
        </div>
      )}

      {noProv && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12, padding: "56px 28px", border: "1px dashed var(--line2)", borderRadius: "var(--r)", background: "var(--panel)" }}>
          <span style={{ width: 52, height: 52, borderRadius: 15, display: "grid", placeItems: "center", background: "var(--accSoft)", color: "var(--acc)" }}>
            <MIcon name="cpu" size={24} />
          </span>
          <span style={{ fontFamily: "var(--fd)", fontWeight: 600, letterSpacing: "-.02em", fontSize: 22 }}>Nenhum provedor conectado</span>
          <span style={{ fontSize: 14, color: "var(--fg2)", lineHeight: 1.55, maxWidth: 470, textWrap: "pretty" }}>
            Provedor é quem roda a IA (Nous Portal, OpenRouter, OpenAI…). Sem um, o Hermes deste perfil não consegue responder nem analisar nada. Você vai precisar do endereço e da chave do provedor.
          </span>
          <button className="au-primary" onClick={() => setDialog({ edit: null })} style={{ marginTop: 6 }}>
            <MIcon name="plus" size={14} />
            Adicionar provedor
          </button>
        </div>
      )}

      {ready && !noProv && cfg && lim && (
        <>
          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <h2 className="mdl-h2">Provedores</h2>
              <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>Quem roda a IA. Cada um tem a própria chave, guardada só neste perfil.</span>
            </div>
            <ProviderGrid provs={provs} used={used} tests={tests} onTest={testCard} onEdit={(p) => setDialog({ edit: p })} onRemove={setRemoving} onAdd={() => setDialog({ edit: null })} />
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <h2 className="mdl-h2">Quem faz o quê</h2>
              <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>Tarefas sem escolha própria usam o padrão. Os canais herdam da conversa principal.</span>
            </div>
            <TaskTable provs={provs} cfg={cfg} setCfg={(fn) => setCfg((c) => (c ? fn(c) : c))} meta={data.routing.taskMeta} onFixKey={(p) => setDialog({ edit: p })} />
          </section>

          <LimitsPanel spend={data.spend} lim={lim} setLim={(fn) => setLim((l) => (l ? fn(l) : l))} profileName={profile?.name ?? "este perfil"} />
        </>
      )}

      {ready && nDirty > 0 && (
        <div className="mdl-savebar" role="region" aria-label="Alterações não salvas">
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warn)" }} />
          <span style={{ fontSize: 13 }}>{nDirty === 1 ? "1 alteração não salva" : `${nDirty} alterações não salvas`}</span>
          <button className="au-outline" onClick={discard} disabled={saving} style={{ borderRadius: 999, padding: "7px 12px", fontSize: 12.5 }}>
            Descartar
          </button>
          <button className="au-primary" onClick={save} disabled={saving} style={{ borderRadius: 999, padding: "7px 14px", fontSize: 12.5 }}>
            <MIcon name={saving ? "loader-circle" : "check"} size={13} spin={saving} />
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      )}

      {dialog && <ProviderDialog edit={dialog.edit} hasDecision={provs.some((p) => p.kind === "decision")} onClose={() => setDialog(null)} onDone={providerDone} />}
      {removing && cfg && <RemoveDialog prov={removing} cfg={cfg} provs={provs} busy={removeBusy} onClose={() => !removeBusy && setRemoving(null)} onConfirm={doRemove} />}
    </div>
  );
}

