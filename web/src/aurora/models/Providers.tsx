// Modelos › Provedores: grade de cartões, diálogo de adicionar/editar e diálogo de remover.
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api-error";
import { connectLine, errorLine, hostOf, modelsApi, plural, providerColor, removalEffects, urlOk, type Cfg, type Provider, type RemovalEffect, type TestResult } from "./api";
import { MIcon } from "./icons";

const soft = (c: string, p: number) => `color-mix(in oklab,${c} ${p}%,transparent)`;

/** Teste de um provedor salvo, por cartão: rodando, ou o resultado em uma linha. */
export type CardTest = { busy: true } | { busy?: false; ok: boolean; line: string };

export function ProviderGrid({ provs, used, tests, onTest, onEdit, onRemove, onAdd }: {
  provs: Provider[];
  used: Record<string, number>;
  tests: Record<string, CardTest | undefined>;
  onTest: (p: Provider) => void;
  onEdit: (p: Provider) => void;
  onRemove: (p: Provider) => void;
  onAdd: () => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
      {provs.map((p) => (
        <ProviderCard key={p.id} p={p} n={used[p.id] ?? 0} test={tests[p.id]} onTest={() => onTest(p)} onEdit={() => onEdit(p)} onRemove={() => onRemove(p)} />
      ))}
      <button className="mdl-add" onClick={onAdd}>
        <span style={{ width: 36, height: 36, borderRadius: 11, display: "grid", placeItems: "center", background: "var(--accSoft)", color: "var(--acc)" }}>
          <MIcon name="plus" size={18} />
        </span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Adicionar provedor compatível com OpenAI</span>
        <span style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.45 }}>Qualquer serviço que aceite o mesmo formato de pedido da OpenAI: Together, Groq, um servidor próprio…</span>
      </button>
    </div>
  );
}

function ProviderCard({ p, n, test, onTest, onEdit, onRemove }: { p: Provider; n: number; test?: CardTest; onTest: () => void; onEdit: () => void; onRemove: () => void }) {
  const bad = p.status === "error";
  const busy = !!test?.busy;
  const stColor = bad ? "var(--err)" : "var(--ok)";
  const res = test && !test.busy ? test : null;
  return (
    <div className="mdl-card" style={{ border: `1px solid ${bad ? soft("var(--err)", 45) : "var(--line)"}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ width: 36, height: 36, flex: "none", borderRadius: 11, background: providerColor(p.id), color: "#0c0e16", display: "grid", placeItems: "center", fontFamily: "var(--fd)", fontWeight: 600, fontSize: 16 }}>{p.name[0]?.toUpperCase()}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
            {p.kind === "decision" && (
              <span title="Não é compatível com OpenAI: usa a API de decisões" style={{ flex: "none", padding: "0 6px", borderRadius: 999, border: "1px solid var(--line2)", fontSize: 10, color: "var(--fg2)" }}>
                decisão
              </span>
            )}
          </span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.baseUrl ? hostOf(p.baseUrl) : "nativo do Hermes"}</span>
        </div>
        <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 999, background: soft(stColor, 14), color: stColor, fontSize: 11, fontWeight: 600 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: stColor }} />
          {bad ? "Com problema" : "Conectado"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "var(--fg2)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <MIcon name="boxes" size={13} color="var(--fg3)" />
          {plural(p.models.length, "modelo", "modelos")}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <MIcon name="list-checks" size={13} color="var(--fg3)" />
          {n ? plural(n, "tarefa", "tarefas") : "Nenhuma tarefa"}
        </span>
        {p.keyHint && (
          <span title="Só o final da chave; o resto fica guardado neste perfil" style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--fm)", fontSize: 11 }}>
            <MIcon name="key-round" size={13} color="var(--fg3)" />
            {p.keyHint}
          </span>
        )}
      </div>
      {bad && <span style={{ fontSize: 12, lineHeight: 1.45, color: "var(--err)" }}>{errorLine(p)}</span>}
      {res && (
        <span role="status" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: res.ok ? "var(--ok)" : "var(--err)", animation: "hin .2s both" }}>
          <MIcon name={res.ok ? "circle-check" : "circle-x"} size={13} />
          {res.line}
        </span>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
        {bad && p.editable && (
          <button className="mdl-sbtn err" onClick={onEdit}>
            <MIcon name="key-round" size={12} />
            Trocar chave
          </button>
        )}
        {p.editable && (
          <button className="mdl-sbtn" onClick={onTest} disabled={busy}>
            <MIcon name={busy ? "loader-circle" : "activity"} size={12} spin={busy} />
            {busy ? "Testando…" : "Testar"}
          </button>
        )}
        {!bad && p.editable && (
          <button className="mdl-sbtn" onClick={onEdit}>
            Editar
          </button>
        )}
        {p.editable ? (
          <button className="mdl-trash" title="Remover provedor" aria-label={`Remover ${p.name}`} onClick={onRemove} style={{ marginLeft: "auto" }}>
            <MIcon name="trash-2" size={14} />
          </button>
        ) : (
          <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 11, color: "var(--fg3)" }}>chave em Chaves de API</span>
        )}
      </div>
    </div>
  );
}

// ---- adicionar / editar ----

type TestState = null | { busy: true } | { busy?: false; r: TestResult };

export function ProviderDialog({ edit, hasDecision, onClose, onDone }: { edit: Provider | null; hasDecision: boolean; onClose: () => void; onDone: (p: Provider, wasEdit: boolean) => void }) {
  const [name, setName] = useState(edit?.name ?? "");
  const [url, setUrl] = useState(edit?.baseUrl ?? "");
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [decision, setDecision] = useState(edit?.kind === "decision");
  const [test, setTest] = useState<TestState>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const seq = useRef(0);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const urlBad = !!url.trim() && !urlOk(url);
  const canTest = urlOk(url) && !!key.trim() && !(test && test.busy);
  const passed = !!test && !test.busy && test.r.ok;
  const canSave = passed && !!name.trim() && !saving;
  const reset = () => {
    seq.current++; // um teste em andamento não vale mais
    setTest(null);
    setSaveErr("");
  };

  const runTest = async () => {
    if (!canTest) return;
    const mine = ++seq.current;
    setTest({ busy: true });
    try {
      const r = await modelsApi.test(url.trim(), key.trim(), decision ? "decision" : "openai");
      if (mine === seq.current) setTest({ r });
    } catch (e) {
      if (mine === seq.current) setTest({ r: { ok: false, code: "unreachable", message: errorMessage(e) || "Não consegui testar agora." } });
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveErr("");
    try {
      const p = edit
        ? await modelsApi.update(edit.id, { ...(name.trim() !== edit.name ? { name: name.trim() } : {}), baseUrl: url.trim(), apiKey: key.trim() })
        : await modelsApi.create(name.trim(), url.trim(), key.trim(), decision ? "decision" : "openai");
      onDone(p, !!edit);
    } catch (e) {
      setSaveErr(errorMessage(e) || "Não consegui salvar o provedor.");
      setSaving(false);
    }
  };

  const r = test && !test.busy ? test.r : null;
  const tone = r ? (r.ok ? "ok" : "err") : null;
  const title = edit ? `Editar ${edit.name}` : "Adicionar provedor";
  return (
    <div className="mdl-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="mdl-dialog">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "22px 24px 8px" }}>
          <span style={{ width: 42, height: 42, flex: "none", borderRadius: 12, background: "var(--accSoft)", color: "var(--acc)", display: "grid", placeItems: "center" }}>
            <MIcon name="plug-zap" size={20} />
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            <span style={{ fontFamily: "var(--fd)", fontWeight: 600, letterSpacing: "-.02em", fontSize: 21 }}>{title}</span>
            <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5 }}>
              {decision ? "Provedor de decisão (TypeSafe/Jev): não é compatível com OpenAI, usa a API de decisões. Só a triagem usa." : "Compatível com OpenAI quer dizer que ele aceita o mesmo formato de pedido da OpenAI. A maioria dos provedores aceita."}
            </span>
          </div>
          <button className="au-mini" title="Fechar" aria-label="Fechar" onClick={onClose} style={{ width: 30, height: 30 }}>
            <MIcon name="x" size={16} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "14px 24px 18px" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Nome</span>
            <input ref={nameRef} className="mdl-input" value={name} disabled={edit?.kind === "decision"} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Together AI" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Endereço (URL base)</span>
            <input
              className="mdl-input mono"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                reset();
              }}
              placeholder="https://api.together.xyz/v1"
              aria-invalid={urlBad}
              style={{ borderColor: urlBad ? "var(--err)" : undefined }}
            />
            <span style={{ fontSize: 11.5, color: urlBad ? "var(--err)" : "var(--fg3)" }}>{urlBad ? "Precisa começar com https:// e ter um domínio." : "Costuma terminar em /v1. Está na documentação do provedor."}</span>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Chave de API</span>
            <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--line2)", borderRadius: "var(--r2)", background: "var(--panel2)" }}>
              <input
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  reset();
                }}
                type={show ? "text" : "password"}
                autoComplete="off"
                placeholder={edit?.keyHint ? `Cole a chave nova (a atual termina em ${edit.keyHint.replace("…", "")})` : "sk-…"}
                style={{ flex: 1, minWidth: 0, padding: "10px 12px", border: 0, background: "transparent", color: "var(--fg)", fontFamily: "var(--fm)", fontSize: 13, outline: 0 }}
              />
              <button type="button" title={show ? "Esconder chave" : "Mostrar chave"} aria-label={show ? "Esconder chave" : "Mostrar chave"} onClick={() => setShow(!show)} style={{ width: 40, height: 40, border: 0, background: "transparent", color: "var(--fg2)", cursor: "pointer", display: "grid", placeItems: "center" }}>
                <MIcon name={show ? "eye-off" : "eye"} size={15} />
              </button>
            </div>
            <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>Fica guardada só neste perfil. Ninguém mais vê depois de salvar.</span>
          </label>
          {!edit && !hasDecision && (
            <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: "var(--fg2)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={decision}
                onChange={(e) => {
                  setDecision(e.target.checked);
                  reset();
                }}
              />
              É o Jev, da TypeSafe (provedor de decisão para a triagem)
            </label>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderRadius: "var(--r2)", border: `1px solid ${tone === "ok" ? soft("var(--ok)", 40) : tone === "err" ? soft("var(--err)", 40) : "var(--line)"}`, background: tone === "ok" ? soft("var(--ok)", 7) : tone === "err" ? soft("var(--err)", 7) : "var(--panel2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button type="button" onClick={runTest} disabled={!canTest} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 9, border: "1px solid var(--line2)", background: "var(--pop)", color: "var(--fg)", fontSize: 12.5, fontWeight: 600, cursor: canTest ? "pointer" : "not-allowed", opacity: canTest ? 1 : 0.5 }}>
                <MIcon name={test && test.busy ? "loader-circle" : "activity"} size={13} spin={!!test && !!test.busy} />
                {test && test.busy ? "Testando…" : test ? "Testar de novo" : "Testar conexão"}
              </button>
              <span role="status" style={{ fontSize: 12.5, color: r ? (r.ok ? "var(--ok)" : "var(--err)") : "var(--fg2)", lineHeight: 1.45 }}>
                {!test ? "Teste antes de salvar. Mando um pedido pequeno e listo os modelos." : test.busy ? "Conectando…" : r && r.ok ? connectLine(r) : r?.message}
              </span>
            </div>
            {r && r.ok && r.models.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", maxHeight: 96, overflow: "auto" }}>
                {r.models.slice(0, 60).map((m) => (
                  <span key={m} style={{ padding: "2px 8px", borderRadius: 999, background: "var(--panel2)", fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg2)" }}>
                    {m}
                  </span>
                ))}
                {r.models.length > 60 && <span style={{ fontSize: 11, color: "var(--fg3)", alignSelf: "center" }}>e mais {r.models.length - 60}</span>}
              </div>
            )}
          </div>
          {saveErr && (
            <span role="alert" style={{ fontSize: 12.5, color: "var(--err)", lineHeight: 1.45 }}>
              {saveErr}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 24px", borderTop: "1px solid var(--line)" }}>
          <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>{passed ? "" : "Salvar libera depois de um teste que deu certo."}</span>
          <button className="au-outline" onClick={onClose} style={{ marginLeft: "auto" }}>
            Cancelar
          </button>
          <button className="au-primary" onClick={save} disabled={!canSave} style={{ opacity: canSave ? 1 : 0.4, cursor: canSave ? "pointer" : "not-allowed" }}>
            {saving ? "Salvando…" : edit ? "Salvar" : "Adicionar provedor"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- remover ----

export function RemoveDialog({ prov, cfg, provs, busy, onClose, onConfirm }: { prov: Provider; cfg: Cfg; provs: Provider[]; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const effects: RemovalEffect[] = removalEffects(prov.id, cfg, provs);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="mdl-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="alertdialog" aria-modal="true" aria-label="Remover provedor" className="mdl-dialog danger">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "24px 24px 18px" }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: soft("var(--err)", 14), color: "var(--err)" }}>
            <MIcon name="trash-2" size={19} />
          </span>
          <span style={{ fontFamily: "var(--fd)", fontWeight: 600, letterSpacing: "-.02em", fontSize: 20 }}>Remover {prov.name}?</span>
          <span style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.5 }}>A chave é apagada deste perfil. {effects.length ? "Estas tarefas são afetadas:" : "Nenhuma tarefa usa este provedor agora."}</span>
          {effects.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "12px 14px", borderRadius: "var(--r2)", background: "var(--panel2)" }}>
              {effects.map((t) => (
                <span key={t.task} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, lineHeight: 1.45 }}>
                  <MIcon name={t.tone === "err" ? "circle-alert" : "corner-down-right"} size={13} color={t.tone === "err" ? "var(--err)" : "var(--fg3)"} className="au-mt2" />
                  <span>
                    <b>{t.task}</b> {t.what}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 24px", borderTop: "1px solid var(--line)" }}>
          <button className="au-outline" onClick={onClose}>
            Cancelar
          </button>
          <button className="au-primary au-danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Removendo…" : "Remover provedor"}
          </button>
        </div>
      </div>
    </div>
  );
}
