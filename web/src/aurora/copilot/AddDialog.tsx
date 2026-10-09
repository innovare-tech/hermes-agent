// Adicionar cliente ao Copiloto em 3 passos: cliente (banco da Aibiz), plano e revisão das 5 etapas.
// O backend cria tudo numa chamada só (POST /api/copilot/clients): o andamento das 5 etapas é visual.
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { errText } from "../health/api";
import { copilotApi, type ClientDetail, type CopilotSettings, type DirectoryClient, type Plan } from "./api";
import { CREATE_STEPS, directoryInfo, fmtInt, planName, PLANS, plural, profilePreview, stepDetail, toolsOf } from "./model";
import { Avatar, CpDialog, InlineError, KeyBox, spinIcon } from "./parts";

const STEP_LABELS = ["Cliente", "Plano", "Criar"];
const TICK_MS = 550;

export function AddDialog({ settings, onClose, onCreated }: { settings: CopilotSettings; onClose: () => void; onCreated: (c: ClientDetail) => void }) {
  const [step, setStep] = useState(0);
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [dir, setDir] = useState<DirectoryClient[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<string | null>(null);
  const [dirBusy, setDirBusy] = useState(true);
  const [dirErr, setDirErr] = useState(false);
  const [tick, setTick] = useState(0);
  const [picked, setPicked] = useState<DirectoryClient | null>(null);
  const [plan, setPlan] = useState<Plan>("starter");
  const [running, setRunning] = useState(false);
  const [prog, setProg] = useState(0);
  const [err, setErr] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [profile, setProfile] = useState("");
  const req = useRef(0);
  const iv = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => () => clearInterval(iv.current), []);

  // Busca no banco da Aibiz com um respiro de 250 ms; a resposta velha nunca cobre a nova.
  useEffect(() => {
    const t = setTimeout(() => setQd(q.trim()), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const id = ++req.current;
    setDirBusy(true);
    setDirErr(false);
    copilotApi.directory(qd).then(
      (p) => {
        if (id !== req.current) return;
        setDir(p.items);
        setTotal(p.total);
        setNext(p.nextCursor);
        setDirBusy(false);
      },
      () => {
        if (id !== req.current) return;
        setDirErr(true);
        setDirBusy(false);
      },
    );
  }, [qd, tick]);

  const more = async () => {
    const id = ++req.current;
    setDirBusy(true);
    try {
      const p = await copilotApi.directory(qd, next);
      if (id !== req.current) return;
      setDir((d) => [...d, ...p.items.filter((x) => !d.some((y) => y.systemClientId === x.systemClientId))]);
      setNext(p.nextCursor);
    } catch {
      if (id === req.current) setDirErr(true);
    } finally {
      if (id === req.current) setDirBusy(false);
    }
  };

  const done = key !== null;
  const create = async () => {
    if (!picked || running) return;
    setRunning(true);
    setErr("");
    setProg(0);
    iv.current = setInterval(() => setProg((p) => Math.min(p + 1, 4)), TICK_MS); // a última etapa só fecha com a resposta
    try {
      const r = await copilotApi.create(picked.systemClientId, plan);
      clearInterval(iv.current);
      setProg(5);
      setKey(r.apiKey);
      setProfile(r.profileId);
      onCreated(r.client);
    } catch (e) {
      clearInterval(iv.current);
      setProg(0);
      setErr(errText(e, "Não consegui criar o Copiloto. Nada foi criado; tente de novo."));
    } finally {
      setRunning(false);
    }
  };

  const tools = toolsOf(settings.catalog, plan);
  const credits = settings.plans[plan].credits;
  const nextDisabled = running || (step === 0 && !picked);
  const onNext = () => {
    if (done) onClose();
    else if (step < 2) setStep(step + 1);
    else create();
  };

  return (
    <CpDialog
      title="Adicionar cliente ao Copiloto"
      width={600}
      busy={running}
      onClose={onClose}
      header={
        <ol className="cp-steps" aria-label="Passos" style={{ listStyle: "none", margin: "0 0 0 auto", padding: 0 }}>
          {STEP_LABELS.map((l, i) => {
            const cur = step === i;
            const ok = step > i || done;
            return (
              <li key={l} aria-current={cur ? "step" : undefined} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: cur ? "var(--fg)" : "var(--fg3)" }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: cur || ok ? "var(--acc)" : "var(--panel2)", color: cur || ok ? "var(--accFg)" : "var(--fg3)", display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 700 }}>
                  {ok ? <Icon name="check" size={11} /> : i + 1}
                </span>
                {l}
              </li>
            );
          })}
        </ol>
      }
      footer={
        <>
          {step > 0 && !running && !done && (
            <button className="au-outline" onClick={() => setStep(step - 1)}>
              Voltar
            </button>
          )}
          <button className="au-outline" onClick={onClose} disabled={running} style={{ marginLeft: "auto" }}>
            {done ? "Fechar" : "Cancelar"}
          </button>
          <button className="au-primary" onClick={onNext} disabled={nextDisabled} style={{ opacity: nextDisabled ? 0.4 : 1, cursor: nextDisabled ? "not-allowed" : "pointer" }}>
            {running ? spinIcon(true, "") : <Icon name={done ? "arrow-right" : step === 2 ? "user-plus" : "arrow-right"} size={14} />}
            {done ? "Ver o cliente" : step === 2 ? (running ? "Criando…" : "Criar Copiloto") : "Continuar"}
          </button>
        </>
      }
    >
      {step === 0 && (
        <>
          <span style={{ fontSize: 13, color: "var(--fg2)" }}>Escolha o cliente no banco da Aibiz. Cada cliente só pode ter um Copiloto.</span>
          <div className="cp-search" style={{ height: 40, borderRadius: "var(--r2)", padding: "0 12px" }}>
            <Icon name={dirBusy ? "loader-circle" : "search"} size={14} color="var(--fg3)" className={dirBusy ? "au-spin" : undefined} />
            <input autoFocus aria-label="Buscar cliente por nome ou código" placeholder="Buscar por nome ou código" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontSize: 13.5 }} />
          </div>
          {dirErr && (
            <InlineError>
              Não consegui buscar no banco da Aibiz.{" "}
              <button className="au-ghost" style={{ display: "inline", color: "var(--err)", textDecoration: "underline" }} onClick={() => setTick((t) => t + 1)}>
                Tentar de novo
              </button>
            </InlineError>
          )}
          <div className="cp-dir" role="group" aria-label="Clientes do banco da Aibiz" aria-busy={dirBusy}>
            {dir.map((c) => (
              <button
                key={c.systemClientId}
                className="cp-dirrow"
                aria-pressed={picked?.systemClientId === c.systemClientId}
                aria-disabled={c.hasCopilot}
                onClick={() => !c.hasCopilot && setPicked(c)}
              >
                <Avatar id={c.systemClientId} name={c.name} size={28} />
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="cp-ellip" style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                  <span className="cp-mono cp-ellip" style={{ fontSize: 10.5, color: "var(--fg3)" }}>
                    {c.systemClientId} · {directoryInfo(c)}
                  </span>
                </span>
                {c.hasCopilot && <span style={{ fontSize: 11, color: "var(--fg3)" }}>já tem Copiloto</span>}
                {picked?.systemClientId === c.systemClientId && <Icon name="circle-check" size={15} color="var(--acc)" />}
              </button>
            ))}
            {!dirBusy && !dirErr && dir.length === 0 && (
              <span style={{ padding: "12px 4px", fontSize: 12.5, color: "var(--fg2)" }}>{qd ? `Nenhum cliente no banco com “${qd}”.` : "Nenhum cliente no banco da Aibiz. Sincronize os clientes em Canais."}</span>
            )}
            {next && (
              <button className="cp-more" onClick={more} disabled={dirBusy}>
                Carregar mais
              </button>
            )}
          </div>
          <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>{qd ? plural(total, "resultado", "resultados") : "Sem busca, mostro primeiro quem ainda não tem Copiloto."}</span>
        </>
      )}

      {step === 1 && picked && (
        <>
          <span style={{ fontSize: 13, color: "var(--fg2)" }}>
            Plano do Copiloto para <b style={{ color: "var(--fg)" }}>{picked.name}</b>. Dá para mudar depois.
          </span>
          <div className="cp-plans" role="radiogroup" aria-label="Plano">
            {PLANS.map((p) => (
              <button key={p} role="radio" aria-checked={plan === p} className="cp-plancard" onClick={() => setPlan(p)}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "var(--fd)", fontWeight: 600, fontSize: 18 }}>{planName(p, settings.planLabels)}</span>
                  {plan === p && <Icon name="circle-check" size={16} color="var(--acc)" />}
                </span>
                <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>{fmtInt(settings.plans[p].credits)} créditos por mês</span>
                <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {settings.catalog.map((t) => {
                    const inc = t.plans.includes(p);
                    return (
                      <span key={t.key} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: inc ? "var(--fg)" : "var(--fg3)" }}>
                        <Icon name={inc ? "check" : "minus"} size={12} />
                        {t.label}
                        <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{inc ? " (incluída)" : " (não incluída)"}</span>
                      </span>
                    );
                  })}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 2 && picked && (
        <>
          <span style={{ fontSize: 13, color: "var(--fg2)" }}>{done ? "Tudo criado:" : "Revise. Ao criar, o Hermes faz isto:"}</span>
          <ol className="cp-table" style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Etapas">
            {CREATE_STEPS.map((l, i) => {
              const fin = prog > i || done;
              const cur = running && prog === i;
              const color = fin ? "var(--ok)" : cur ? "var(--acc)" : "var(--fg3)";
              return (
                <li key={l} className="cp-etapa" aria-current={cur ? "step" : undefined}>
                  <span style={{ width: 22, height: 22, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", background: fin ? "color-mix(in oklab,var(--ok) 18%,transparent)" : cur ? "var(--accSoft)" : "var(--panel2)", color }}>
                    <Icon name={fin ? "check" : cur ? "loader-circle" : "circle"} size={12} className={cur ? "au-spin" : undefined} />
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{l}</span>
                    <span className={i === 2 ? "cp-mono" : undefined} style={{ fontSize: 11.5, color: "var(--fg2)", wordBreak: "break-all" }}>
                      {stepDetail(i, { profile: done ? profile : profilePreview(picked.name), sid: picked.systemClientId, plan: planName(plan, settings.planLabels), tools: tools.length, credits })}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          {err && <InlineError>{err}</InlineError>}
          {key && (
            <div className="cp-ok">
              <span style={{ fontSize: 13, fontWeight: 600 }}>Pronto. O Copiloto de {picked.name} está criado.</span>
              <span style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.45 }}>Cadastre esta chave no Aibiz Manager para o gestor ver o Copiloto. Ela aparece só agora: se fechar sem guardar, é preciso rotacionar.</span>
              <KeyBox value={key} />
            </div>
          )}
        </>
      )}
    </CpDialog>
  );
}
