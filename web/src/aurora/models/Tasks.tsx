// Modelos › Quem faz o quê: tabela de tarefas, seletor de modelo (popover), painel da Triagem e avisos por linha.
import { useEffect, useMemo, useState } from "react";
import {
  CAPS, LACKS, MIN_CONF, NEED, TASKS, costPerK, eff, findModel, findProvider, modelMeta, modelOk, providerColor, usdOrDash,
  type Cap, type Cfg, type ModelEntry, type Provider, type TaskDef, type TaskId, type TaskMeta,
} from "./api";
import { MIcon } from "./icons";

const soft = (c: string, p: number) => `color-mix(in oklab,${c} ${p}%,transparent)`;
const COLS = "minmax(0,1fr) 300px 132px 120px";

const JQ = [
  { type: "Escolha", l: "Qual a categoria?", opts: "bug · dúvida · sugestão · reclamação · elogio · conversa social" },
  { type: "Nota", l: "Qual a urgência?", opts: "baixa → média → alta → crítica" },
  { type: "Sim/não", l: "É só conversa social?", opts: "se sim, guarda sem analisar" },
];

/** A triagem tem que ser um modelo de decisão; o resto, o que a tarefa pede. */
const acceptsModel = (t: TaskDef, m: ModelEntry) => (t.cap === "decision" ? m.caps.includes("decision") : t.cap === "audio" ? m.caps.includes("audio") : modelOk(m, t.cap));

function whyNot(t: TaskDef, m: ModelEntry): string {
  if (t.cap === "decision" && m.caps.includes("text")) return "A triagem ainda só fala com modelos de decisão";
  const w = LACKS[t.cap];
  return w[0].toUpperCase() + w.slice(1);
}

type Warn = { icon: string; color: string; bg: string; text: string; btn?: { label: string; run: () => void } };

export function TaskTable({ provs, cfg, setCfg, meta, onFixKey }: {
  provs: Provider[];
  cfg: Cfg;
  setCfg: (fn: (c: Cfg) => Cfg) => void;
  meta: Record<TaskId, TaskMeta>;
  onFixKey: (p: Provider) => void;
}) {
  const [open, setOpen] = useState<TaskId | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const edit = (id: TaskId, next: Cfg[TaskId]) => setCfg((c) => ({ ...c, [id]: next }));

  return (
    <>
      {open && <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />}
      <div style={{ position: "relative", zIndex: open ? 30 : "auto", border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--panel)", backdropFilter: "var(--blur)", WebkitBackdropFilter: "var(--blur)" }}>
        <div className="au-label" style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, padding: "12px 18px" }}>
          <span>Tarefa</span>
          <span>Provedor e modelo</span>
          <span>Custo estimado</span>
          <span>Usar o padrão</span>
        </div>
        {TASKS.map((t) => (
          <Row
            key={t.id}
            t={t}
            provs={provs}
            cfg={cfg}
            metas={meta}
            open={open === t.id}
            q={q}
            setQ={setQ}
            toggleOpen={() => {
              setOpen(open === t.id ? null : t.id);
              setQ("");
            }}
            close={() => setOpen(null)}
            edit={edit}
            onFixKey={onFixKey}
          />
        ))}
      </div>
    </>
  );
}

function Row({ t, provs, cfg, metas, open, q, setQ, toggleOpen, close, edit, onFixKey }: {
  t: TaskDef;
  provs: Provider[];
  cfg: Cfg;
  metas: Record<TaskId, TaskMeta>;
  open: boolean;
  q: string;
  setQ: (q: string) => void;
  toggleOpen: () => void;
  close: () => void;
  edit: (id: TaskId, c: Cfg[TaskId]) => void;
  onFixKey: (p: Provider) => void;
}) {
  const c = cfg[t.id];
  const meta = metas[t.id];
  const e = eff(t.id, cfg);
  const P = e.none ? undefined : findProvider(provs, e.p);
  const M = e.none ? undefined : findModel(provs, e.p, e.m);
  const inh = !t.root && !!c.def;
  const capOk = !!M && (t.cap === "decision" ? M.caps.includes("decision") : t.cap === "audio" ? M.caps.includes("audio") : modelOk(M, t.cap));
  const parent = t.parent ? eff(t.parent, cfg) : null;
  const pM = parent && !parent.none ? findModel(provs, parent.p, parent.m) : undefined;
  const parentOk = !!pM && acceptsModel(t, pM);
  const defDis = !t.root && !parentOk && !c.def;
  const parentName = t.parent === "main" ? "Conversa principal" : "Modelo padrão";
  const minPct = t.jev && "min" in c && c.min !== undefined ? c.min : MIN_CONF.def;

  const none = !!e.none;
  const stale = !none && !M; // o config aponta para um modelo que o catálogo do provedor não lista mais
  const warn: Warn | null = none
    ? { icon: "circle-alert", color: "var(--err)", bg: soft("var(--err)", 9), text: t.root ? "Sem modelo padrão. Tarefas que herdam o padrão estão paradas. Escolha um modelo." : t.jev ? "Sem modelo de decisão. A triagem está desligada e os lotes vão direto para a análise completa." : "Sem modelo. Esta tarefa está parada até você escolher um." }
    : P && P.status === "error"
      ? { icon: "triangle-alert", color: "var(--err)", bg: soft("var(--err)", 9), text: `${P.name} está recusando a chave: ${t.label.toLowerCase()} está falhando agora.`, btn: P.editable ? { label: "Trocar chave", run: () => onFixKey(P) } : undefined }
      : stale
        ? { icon: "triangle-alert", color: "var(--warn)", bg: soft("var(--warn)", 10), text: `${e.none ? "" : e.m} não aparece mais na lista do provedor. Escolha outro modelo.` }
        : M && !capOk
          ? { icon: "triangle-alert", color: "var(--warn)", bg: soft("var(--warn)", 10), text: `${M.id} ${LACKS[t.cap]}. Escolha outro modelo.` }
          : null;

  const cost = M ? costPerK(M, meta) : null;
  const unit = meta?.unit ?? "mil unidades";
  const pl = t.sub ? 52 : 18;
  const wPl = t.sub ? 93 : 59;
  const labelId = `mdl-row-${t.id}`;

  const pick = (p: Provider, m: ModelEntry) => {
    edit(t.id, { p: p.id, m: m.id, ...(t.jev ? { min: minPct } : {}) });
    close();
  };
  const toggleDef = () => {
    if (defDis) return;
    if (c.def) edit(t.id, { p: parent && !parent.none ? parent.p : null, m: parent && !parent.none ? parent.m : null, ...(t.jev ? { min: minPct } : {}) });
    else edit(t.id, { def: true });
  };

  return (
    <div style={{ position: "relative", zIndex: open ? 20 : "auto", borderTop: "1px solid var(--line)", background: t.root ? "var(--accSoft)" : "transparent" }}>
      <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, alignItems: "center", padding: `13px 18px 13px ${pl}px` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11, minWidth: 0 }}>
          <span style={{ width: 30, height: 30, flex: "none", borderRadius: 9, background: t.root ? "var(--acc)" : "var(--panel2)", color: t.root ? "var(--accFg)" : "var(--fg2)", display: "grid", placeItems: "center" }}>
            <MIcon name={t.icon} size={14} />
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <span id={labelId} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 600 }}>
              {t.label}
              {t.root && <span style={{ padding: "1px 7px", borderRadius: 999, background: "var(--acc)", color: "var(--accFg)", fontSize: 10.5, fontWeight: 700 }}>padrão</span>}
              {t.jev && <span style={{ padding: "1px 7px", borderRadius: 999, border: "1px solid var(--line2)", fontFamily: "var(--fm)", fontSize: 10, color: "var(--fg2)" }}>JEV</span>}
            </span>
            <span style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.45, textWrap: "pretty" }}>{t.desc}</span>
          </div>
        </div>

        <div style={{ position: "relative", minWidth: 0 }}>
          <button
            className="mdl-trig"
            onClick={toggleOpen}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-labelledby={labelId}
            style={{ border: `1px ${inh ? "dashed" : "solid"} ${open ? "var(--acc)" : "var(--line2)"}`, background: inh ? "transparent" : "var(--panel2)" }}
          >
            <span style={{ width: 30, height: 30, flex: "none", borderRadius: 9, background: none ? "var(--panel2)" : providerColor(e.none ? "" : e.p), color: "#0c0e16", display: "grid", placeItems: "center", fontFamily: "var(--fd)", fontWeight: 600, fontSize: 13, opacity: inh ? 0.55 : 1 }}>
              {none ? <MIcon name="circle-dashed" size={14} color="var(--fg3)" /> : inh ? <MIcon name="corner-down-right" size={14} /> : (P?.name[0]?.toUpperCase() ?? "?")}
            </span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: "var(--fm)", fontSize: 12, color: none ? "var(--err)" : inh ? "var(--fg2)" : "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.none ? "Escolher modelo" : e.m}</span>
              <span style={{ fontSize: 11, color: "var(--fg3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.none ? "Nenhum modelo" : inh ? `Herdado de ${parentName} · ${P?.name ?? e.p}` : (P?.name ?? e.p)}</span>
            </span>
            <MIcon name="chevrons-up-down" size={14} color="var(--fg3)" />
          </button>
          {open && <Picker t={t} provs={provs} meta={metas} cur={e.none ? null : { p: e.p, m: e.m }} inh={inh} q={q} setQ={setQ} pick={pick} unit={unit} />}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: "var(--fm)", fontSize: 13, color: inh ? "var(--fg2)" : "var(--fg)" }}>{M ? usdOrDash(cost) : "—"}</span>
          <span style={{ fontSize: 11, color: "var(--fg3)" }}>por {unit}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {t.root ? (
            <span style={{ fontSize: 11.5, color: "var(--fg3)", lineHeight: 1.35 }}>É o padrão</span>
          ) : (
            <>
              <button
                role="switch"
                aria-checked={inh}
                aria-disabled={defDis}
                aria-label={`Usar o padrão em ${t.label}`}
                title={defDis ? `${t.jev ? "O padrão" : `O ${parentName.toLowerCase()}`} ${LACKS[t.cap]}` : undefined}
                className="au-switch lg"
                onClick={toggleDef}
                style={{ marginLeft: 0, opacity: defDis ? 0.45 : 1, cursor: defDis ? "not-allowed" : "pointer" }}
              >
                <span />
              </button>
              <span style={{ fontSize: 11.5, color: "var(--fg3)", lineHeight: 1.35 }}>{defDis ? `O padrão ${LACKS[t.cap]}` : inh ? "Herdando" : "Escolha própria"}</span>
            </>
          )}
        </div>
      </div>

      {t.jev && !!M && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 250px", gap: 16, margin: "-2px 18px 14px 59px", padding: 14, borderRadius: "var(--r2)", border: "1px solid var(--line)", background: "var(--panel2)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600 }}>
              Perguntas que a triagem responde<span style={{ fontWeight: 400, color: "var(--fg3)" }}>· em uma chamada só</span>
            </span>
            {JQ.map((q) => (
              <div key={q.l} style={{ display: "flex", alignItems: "baseline", gap: 9, fontSize: 12.5, lineHeight: 1.45 }}>
                <span style={{ flex: "none", width: 58, padding: "1px 0", borderRadius: 999, border: "1px solid var(--line2)", textAlign: "center", fontFamily: "var(--fm)", fontSize: 10, color: "var(--fg2)" }}>{q.type}</span>
                <span style={{ minWidth: 0 }}>
                  <b style={{ fontWeight: 600 }}>{q.l}</b> <span style={{ color: "var(--fg2)" }}>{q.opts}</span>
                </span>
              </div>
            ))}
            <span style={{ fontSize: 11.5, color: "var(--fg3)", lineHeight: 1.45 }}>Cada resposta vem com a chance de estar certa (confiança). É o número que aparece em Análises dos grupos.</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, paddingLeft: 16, borderLeft: "1px solid var(--line)" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Confiança mínima</span>
            <div className="mdl-step" style={{ alignSelf: "flex-start", background: "var(--pop)" }}>
              <button title="Menos" aria-label="Menos confiança mínima" disabled={minPct <= MIN_CONF.min} onClick={() => edit(t.id, { ...(c as { p: string | null; m: string | null }), min: Math.max(MIN_CONF.min, minPct - MIN_CONF.step) })}>
                <MIcon name="minus" size={13} />
              </button>
              <span aria-live="polite" style={{ minWidth: 44, textAlign: "center", fontFamily: "var(--fm)", fontSize: 13 }}>{minPct}%</span>
              <button title="Mais" aria-label="Mais confiança mínima" disabled={minPct >= MIN_CONF.max} onClick={() => edit(t.id, { ...(c as { p: string | null; m: string | null }), min: Math.min(MIN_CONF.max, minPct + MIN_CONF.step) })}>
                <MIcon name="plus" size={13} />
              </button>
            </div>
            <span style={{ fontSize: 11.5, color: "var(--fg2)", lineHeight: 1.45 }}>Abaixo de {minPct}% de confiança, o lote vai para a análise completa em vez de ser decidido aqui.</span>
          </div>
        </div>
      )}

      {warn && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, margin: `-4px 18px 12px ${wPl}px`, padding: "8px 11px", borderRadius: 10, background: warn.bg, fontSize: 12, lineHeight: 1.45 }}>
          <MIcon name={warn.icon} size={14} color={warn.color} />
          <span style={{ flex: 1 }}>{warn.text}</span>
          {warn.btn && (
            <button className="mdl-sbtn" onClick={warn.btn.run} style={{ flex: "none", padding: "5px 10px", borderRadius: 8, fontSize: 11.5 }}>
              {warn.btn.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---- seletor ----

const MAX_PER_GROUP = 80;
const MAX_DISABLED = 3;

type Group = { p: Provider; items: { m: ModelEntry; ok: boolean; on: boolean; rec: boolean }[]; hiddenDisabled: number; hiddenTail: number };

function Picker({ t, provs, meta, cur, inh, q, setQ, pick, unit }: {
  t: TaskDef;
  provs: Provider[];
  meta: Record<TaskId, TaskMeta>;
  cur: { p: string; m: string } | null;
  inh: boolean;
  q: string;
  setQ: (s: string) => void;
  pick: (p: Provider, m: ModelEntry) => void;
  unit: string;
}) {
  const query = q.trim().toLowerCase();
  const groups = useMemo<Group[]>(() => {
    const out: Group[] = [];
    for (const p of provs) {
      const all = p.models
        .filter((m) => !query || m.id.toLowerCase().includes(query))
        .map((m) => ({ m, ok: acceptsModel(t, m), on: !inh && !!cur && cur.p === p.id && cur.m === m.id, rec: acceptsModel(t, m) && (t.rec ?? []).includes(m.id) }));
      if (!all.length) continue;
      // Recomendados primeiro, depois os que servem; os que não servem ficam no fim e só alguns aparecem.
      all.sort((a, b) => Number(b.rec) - Number(a.rec) || Number(b.ok) - Number(a.ok));
      const good = all.filter((x) => x.ok);
      const bad = all.filter((x) => !x.ok);
      const shownBad = query ? bad : bad.slice(0, MAX_DISABLED);
      const items = [...good.slice(0, MAX_PER_GROUP), ...shownBad.slice(0, MAX_PER_GROUP)];
      out.push({ p, items, hiddenDisabled: bad.length - shownBad.length, hiddenTail: Math.max(0, good.length - MAX_PER_GROUP) });
    }
    // Triagem: provedores com modelo de decisão primeiro.
    if (t.cap === "decision") out.sort((a, b) => Number(b.p.models.some((m) => m.caps.includes("decision"))) - Number(a.p.models.some((m) => m.caps.includes("decision"))));
    return out;
  }, [provs, query, t, inh, cur]);

  return (
    <div role="listbox" aria-label="Escolher modelo" className="mdl-pop">
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
        <MIcon name="search" size={15} color="var(--fg3)" />
        <input autoFocus value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Buscar modelo" aria-label="Buscar modelo" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 13.5 }} />
        <span style={{ fontSize: 11, color: "var(--fg3)" }}>{NEED[t.cap as Cap]}</span>
      </div>
      <div style={{ maxHeight: 340, overflow: "auto", padding: 6 }}>
        {groups.map((g) => (
          <div key={g.p.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 10px 6px" }}>
              <span style={{ width: 16, height: 16, borderRadius: 5, background: providerColor(g.p.id), color: "#0c0e16", display: "grid", placeItems: "center", fontSize: 9, fontWeight: 700 }}>{g.p.name[0]?.toUpperCase()}</span>
              <span className="au-label">{g.p.name}</span>
              {g.p.status === "error" && <span style={{ fontSize: 11, color: "var(--err)" }}>com problema</span>}
            </div>
            {g.items.map(({ m, ok, on, rec }) => (
              <button
                key={m.id}
                role="option"
                aria-selected={on}
                aria-disabled={!ok}
                className="mdl-opt"
                onClick={() => ok && pick(g.p, m)}
                style={{ background: on ? "var(--accSoft)" : "transparent", cursor: ok ? "pointer" : "not-allowed", opacity: ok ? 1 : 0.5 }}
              >
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontFamily: "var(--fm)", fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.id}</span>
                    {rec && <span style={{ flex: "none", padding: "0 6px", borderRadius: 999, background: "var(--accSoft)", color: "var(--acc)", fontSize: 10, fontWeight: 700 }}>recomendado</span>}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--fg3)" }}>
                    {m.caps.map((cp) => (
                      <span key={cp} title={CAPS[cp].label} style={{ display: "inline-flex" }}>
                        <MIcon name={CAPS[cp].icon} size={12} />
                      </span>
                    ))}
                    <span>{t.cap === "vision" && !m.capsKnown ? "capacidade de imagem não confirmada" : modelMeta(m)}</span>
                  </span>
                  {!ok && <span style={{ fontSize: 11, color: "var(--warn)" }}>{whyNot(t, m)}</span>}
                </span>
                <span style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  <span style={{ fontFamily: "var(--fm)", fontSize: 11.5 }}>{ok ? usdOrDash(costPerK(m, meta[t.id])) : "—"}</span>
                  <span style={{ fontSize: 10, color: "var(--fg3)" }}>por {unit}</span>
                </span>
                <span style={{ width: 14, flex: "none" }}>{on && <MIcon name="check" size={14} color="var(--acc)" />}</span>
              </button>
            ))}
            {g.hiddenDisabled > 0 && <div style={{ padding: "4px 10px 6px", fontSize: 11, color: "var(--fg3)" }}>e mais {g.hiddenDisabled} que não servem para isso. Busque pelo nome para ver.</div>}
            {g.hiddenTail > 0 && <div style={{ padding: "4px 10px 6px", fontSize: 11, color: "var(--fg3)" }}>e mais {g.hiddenTail}. Busque pelo nome.</div>}
          </div>
        ))}
        {!groups.length && <div style={{ padding: "14px 10px", fontSize: 12.5, color: "var(--fg2)" }}>{query ? `Nenhum modelo com “${q.trim()}”.` : "Nenhum modelo disponível."}</div>}
      </div>
      <div style={{ padding: "9px 14px", borderTop: "1px solid var(--line)", fontSize: 11, color: "var(--fg3)", lineHeight: 1.4 }}>
        Custo por {unit}, com o tamanho médio desta tarefa{meta[t.id]?.measured ? " neste perfil" : ""}. Preço do provedor em US$.
      </div>
    </div>
  );
}

