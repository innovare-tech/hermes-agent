// Diálogos de perfil: criar/clonar/editar, apagar (confirmação forte) e o assistente curto de 3 passos.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { adapter, type AutonomyMode } from "./adapter";
import { Icon } from "./Icon";
import { agent } from "./agent";
import type { ProviderOption } from "./agent/types";
import { useCurrentProfile } from "./ProfileChrome";
import { COLORS, createdSub, deleteItems, DESC_MAX, hexOf, hexToRgba, ICONS, nameError, nextColor, NAME_MAX, profilePath, type CopyOptions, type Inventory, type ProfileDialog } from "./profileLogic";
import { channelMeta, createProfile, deleteProfile, profileInventory, refreshProfiles, saveProfile, switchProfile } from "./profiles";
import { MODES, setState, toast, useStore } from "./store";

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const DEFAULT_COPY: CopyOptions = { skills: true, memory: false, tools: true };

/** Esc fecha o diálogo — menos durante o envio. */
function useEscape(onEsc: () => void, disabled: boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !disabled && onEsc();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}

const closeDialog = () => setState({ profileDialog: null });

// ---- criar / clonar / editar ----

function FormDialog({ req }: { req: Extract<ProfileDialog, { kind: "create" | "edit" }> }) {
  const navigate = useNavigate();
  const profiles = useStore((s) => s.profiles);
  const theme = useStore((s) => s.theme);
  const edit = req.kind === "edit" ? profiles.find((p) => p.id === req.id) : undefined;
  const [f, setF] = useState(() => {
    if (edit) return { name: edit.name, desc: edit.desc, color: edit.color, icon: edit.icon, from: "", copy: DEFAULT_COPY, wizard: false };
    const src = req.kind === "create" && req.from ? profiles.find((p) => p.id === req.from) : undefined;
    return { name: (req.kind === "create" && req.name) || (src ? `${src.name} (cópia)` : ""), desc: src?.desc ?? "", color: nextColor(profiles), icon: src?.icon ?? "briefcase", from: src?.id ?? "", copy: DEFAULT_COPY, wizard: true };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const [inv, setInv] = useState<Inventory | null>(null);
  const src = profiles.find((p) => p.id === f.from);
  const patch = (o: Partial<typeof f>) => {
    setF((x) => ({ ...x, ...o }));
    setError("");
  };

  // Quanto há na origem (as caixas de "Copiar de" mostram a contagem real).
  useEffect(() => {
    setInv(null);
    if (!f.from) return;
    let alive = true;
    profileInventory(f.from).then((i) => alive && setInv(i));
    return () => {
      alive = false;
    };
  }, [f.from]);

  useEscape(closeDialog, busy);
  if (req.kind === "edit" && !edit) return null;

  const nErr = nameError(f.name, profiles, edit?.id);
  const showErr = touched && nErr;
  const hex = hexOf(f.color, theme);
  const title = edit ? "Editar perfil" : src ? `Clonar ${src.name}` : "Novo perfil";
  const n = (v: number | null | undefined) => (v == null ? (inv ? "" : "…") : String(v));
  const rows: [keyof CopyOptions, string, string][] = [
    ["skills", "Skills", inv?.skills != null ? `${n(inv.skills)} procedimentos que o Hermes já sabe fazer` : "Os procedimentos que o Hermes já sabe fazer"],
    ["memory", "Memória", inv?.memories != null ? `${n(inv.memories)} coisas que ele lembra (preferências, contexto, regras)` : "O que ele lembra (preferências, contexto, regras)"],
    ["tools", "Ferramentas", inv?.tools != null ? `${n(inv.tools)} ferramentas ligadas` : "As ferramentas ligadas neste perfil"],
  ];

  const submit = async () => {
    if (busy) return;
    if (nErr) return setTouched(true);
    setBusy(true);
    setError("");
    try {
      if (edit) {
        const p = await saveProfile(edit.id, { name: f.name.trim(), desc: f.desc.trim(), color: f.color, icon: f.icon });
        closeDialog();
        toast("Perfil atualizado", `${p.name} já aparece com o novo nome e a nova cor.`);
      } else {
        const p = await createProfile({ name: f.name.trim(), desc: f.desc.trim(), color: f.color, icon: f.icon, from: f.from, copy: f.copy });
        closeDialog();
        navigate("/");
        switchProfile(p.id, { silent: true });
        toast(`Perfil ${p.name} criado`, createdSub(src, f.copy));
        if (f.wizard) setState({ wizard: true });
      }
    } catch (e) {
      setError(errMsg(e, "Não consegui criar o perfil. Nada foi criado. Tente de novo."));
      setBusy(false);
    }
  };

  return (
    <div className="au-modal" onMouseDown={(e) => e.target === e.currentTarget && !busy && closeDialog()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="au-card au-float" style={{ width: "min(600px,100%)", maxHeight: "calc(100vh - 48px)", overflow: "auto", boxShadow: "var(--shadow)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "22px 24px 6px" }}>
          <span style={{ width: 42, height: 42, flex: "none", borderRadius: 12, background: hex, color: "var(--accFg)", display: "grid", placeItems: "center", transition: "background .3s" }}>
            <Icon name={f.icon} size={20} />
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <span className="au-display" style={{ fontSize: 21 }}>{title}</span>
            <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>{edit ? "Mude como o perfil aparece para você." : "Um Hermes novo, com memória, canais e chaves só dele."}</span>
          </div>
          <button className="au-mini" title="Fechar" aria-label="Fechar" disabled={busy} onClick={closeDialog} style={{ marginLeft: "auto", alignSelf: "flex-start", width: 30, height: 30 }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "16px 24px 20px" }}>
          <label className="au-field">
            <span style={{ fontSize: 13, fontWeight: 600 }}>Nome</span>
            <input
              autoFocus
              value={f.name}
              maxLength={NAME_MAX}
              placeholder="Ex.: Padaria Sol"
              aria-invalid={!!showErr}
              onChange={(e) => {
                patch({ name: e.target.value });
                setTouched(true);
              }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              style={{ borderColor: showErr ? "var(--err)" : undefined }}
            />
            <span style={{ fontSize: 11.5, color: showErr ? "var(--err)" : "var(--fg3)" }}>{showErr ? nErr : "Aparece no seletor e no topo do painel."}</span>
          </label>
          <label className="au-field">
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Descrição <span style={{ fontWeight: 400, color: "var(--fg3)" }}>· opcional</span>
            </span>
            <input value={f.desc} maxLength={DESC_MAX} placeholder="Para que serve este perfil" onChange={(e) => patch({ desc: e.target.value })} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 24 }}>
            <div role="group" aria-label="Cor" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Cor</span>
              <div style={{ display: "flex", gap: 8 }}>
                {COLORS.map((c) => {
                  const h = hexOf(c.id, theme);
                  const sel = f.color === c.id;
                  return <button key={c.id} title={c.name} aria-label={c.name} aria-pressed={sel} onClick={() => patch({ color: c.id })} style={{ width: 24, height: 24, borderRadius: "50%", border: 0, background: h, cursor: "pointer", boxShadow: sel ? `0 0 0 2px var(--bg),0 0 0 4px ${h}` : "none", transition: "box-shadow .2s" }} />;
                })}
              </div>
            </div>
            <div role="group" aria-label="Ícone" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Ícone</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {ICONS.map((ic) => {
                  const sel = f.icon === ic;
                  return (
                    <button key={ic} aria-label={ic} aria-pressed={sel} onClick={() => patch({ icon: ic })} style={{ width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 8, border: `1px solid ${sel ? hex : "var(--line)"}`, background: sel ? hexToRgba(hex, 0.15) : "transparent", color: sel ? "var(--fg)" : "var(--fg2)", cursor: "pointer" }}>
                      <Icon name={ic} size={14} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {!edit && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
                    <label htmlFor="au-copy-from" style={{ fontSize: 13, fontWeight: 600 }}>
                      Copiar de outro perfil <span style={{ fontWeight: 400, color: "var(--fg3)" }}>· opcional</span>
                    </label>
                    <span style={{ fontSize: 12, color: "var(--fg2)" }}>Aproveita o que outro Hermes já aprendeu. Depois de criado, os dois seguem separados.</span>
                  </div>
                  <div className="au-field" style={{ flex: "none", width: 200 }}>
                    <select id="au-copy-from" value={f.from} onChange={(e) => patch({ from: e.target.value })}>
                      <option value="">Não copiar (do zero)</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {src && (
                  <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--line)", borderRadius: "var(--r2)", overflow: "hidden", animation: "hin .18s both" }}>
                    {rows.map(([k, label, sub]) => {
                      const on = f.copy[k];
                      return (
                        <button key={k} role="checkbox" aria-checked={on} className="au-popt" onClick={() => patch({ copy: { ...f.copy, [k]: !on } })} style={{ gap: 12, padding: "11px 14px", borderRadius: 0, borderBottom: "1px solid var(--line)" }}>
                          <span style={{ width: 18, height: 18, flex: "none", borderRadius: 5, border: `1.5px solid ${on ? hex : "var(--line2)"}`, background: on ? hex : "transparent", color: "var(--accFg)", display: "grid", placeItems: "center" }}>{on && <Icon name="check" size={12} />}</span>
                          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
                            <span style={{ fontSize: 12, color: "var(--fg2)" }}>{sub}</span>
                          </span>
                        </button>
                      );
                    })}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: "var(--panel2)" }}>
                      <Icon name="lock" size={14} color="var(--fg3)" className="au-pgrp-ic" />
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg2)" }}>Canais e chaves nunca são copiados</span>
                        <span style={{ fontSize: 12, color: "var(--fg3)" }}>Cada perfil conecta o próprio WhatsApp, Telegram, e-mail e as próprias chaves de API.</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <button role="switch" aria-checked={f.wizard} onClick={() => patch({ wizard: !f.wizard })} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "var(--r2)", background: "transparent", color: "var(--fg)", cursor: "pointer", textAlign: "left" }}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Abrir o assistente de configuração em seguida</span>
                  <span style={{ fontSize: 12, color: "var(--fg2)" }}>Escolher modelo, nível de autonomia e conectar o primeiro canal.</span>
                </span>
                <span style={{ width: 38, height: 22, flex: "none", borderRadius: 999, background: f.wizard ? hex : "var(--line2)", position: "relative", transition: "background .2s" }}>
                  <span style={{ position: "absolute", top: 3, left: f.wizard ? 19 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                </span>
              </button>
            </>
          )}

          {edit && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: "var(--r2)", background: "var(--panel2)", fontSize: 12.5, color: "var(--fg2)" }}>
              <Icon name="folder" size={14} color="var(--fg3)" />
              <span>
                Identificador <span style={{ fontFamily: "var(--fm)", color: "var(--fg)" }}>{edit.id}</span> não muda ao renomear, para não quebrar atalhos e tarefas agendadas.
              </span>
            </div>
          )}

          {error && (
            <div role="alert" style={{ display: "flex", gap: 10, padding: "11px 14px", borderRadius: "var(--r2)", border: "1px solid color-mix(in oklab,var(--err) 40%,transparent)", background: "color-mix(in oklab,var(--err) 9%,transparent)", fontSize: 12.5, lineHeight: 1.5 }}>
              <Icon name="circle-alert" size={15} color="var(--err)" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 24px", borderTop: "1px solid var(--line)" }}>
          <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{edit ? "" : profilePath(f.name, profiles.map((p) => p.id))}</span>
          <button className="au-outline" style={{ marginLeft: "auto" }} disabled={busy} onClick={closeDialog}>
            Cancelar
          </button>
          <button className="au-primary" disabled={busy} onClick={submit} style={{ background: hex, opacity: busy ? 0.7 : 1 }}>
            <Icon name={busy ? "loader-circle" : edit ? "check" : "plus"} size={14} className={busy ? "au-spin" : undefined} />
            {busy ? (edit ? "Salvando…" : "Criando…") : edit ? "Salvar" : error ? "Tentar de novo" : "Criar perfil"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- apagar ----

function DeleteDialog({ id }: { id: string }) {
  const profiles = useStore((s) => s.profiles);
  const current = useStore((s) => s.profileId);
  const p = profiles.find((x) => x.id === id);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inv, setInv] = useState<Inventory | null>(null);
  useEffect(() => {
    let alive = true;
    profileInventory(id).then((i) => alive && setInv(i));
    return () => {
      alive = false;
    };
  }, [id]);
  useEscape(closeDialog, busy);
  if (!p) return null;
  const def = profiles.find((x) => x.isDefault) ?? profiles.find((x) => x.id === "default");
  const ok = text === p.name;
  const go = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteProfile(p);
      closeDialog();
    } catch (e) {
      setError(errMsg(e, "Não consegui apagar o perfil. Nada foi apagado."));
      setBusy(false);
    }
  };
  return (
    <div className="au-modal" onMouseDown={(e) => e.target === e.currentTarget && !busy && closeDialog()}>
      <div role="alertdialog" aria-modal="true" aria-label="Apagar perfil" className="au-card au-float" style={{ width: "min(500px,100%)", borderColor: "color-mix(in oklab,var(--err) 40%,var(--line2))", boxShadow: "var(--shadow)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "24px 24px 18px" }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: "color-mix(in oklab,var(--err) 14%,transparent)", color: "var(--err)" }}>
            <Icon name="trash-2" size={19} />
          </span>
          <span className="au-display" style={{ fontSize: 21 }}>Apagar o perfil {p.name}?</span>
          <span style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.5 }}>
            Isto apaga tudo o que é deste perfil. <b style={{ color: "var(--fg)" }}>Não dá para desfazer.</b>
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "12px 14px", borderRadius: "var(--r2)", background: "var(--panel2)" }}>
            {deleteItems(inv, p.channels.map((c) => channelMeta(c).name)).map((d) => (
              <span key={d.i} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}>
                <Icon name={d.i} size={13} color="var(--fg3)" />
                {d.l}
              </span>
            ))}
          </div>
          {id === current && def && (
            <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>
              Você está usando este perfil agora. Depois de apagar, o painel volta para <b style={{ color: "var(--fg)" }}>{def.name}</b>.
            </span>
          )}
          <label className="au-field" style={{ marginTop: 4 }}>
            <span style={{ fontSize: 13 }}>
              Para confirmar, digite <b style={{ fontFamily: "var(--fm)", fontSize: 12.5, padding: "1px 6px", borderRadius: 5, background: "var(--panel2)" }}>{p.name}</b>
            </span>
            <input autoFocus value={text} placeholder={p.name} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} style={{ borderColor: ok ? "var(--err)" : undefined }} />
          </label>
          {error && (
            <div role="alert" style={{ display: "flex", gap: 10, padding: "11px 14px", borderRadius: "var(--r2)", border: "1px solid color-mix(in oklab,var(--err) 40%,transparent)", background: "color-mix(in oklab,var(--err) 9%,transparent)", fontSize: 12.5, lineHeight: 1.5 }}>
              <Icon name="circle-alert" size={15} color="var(--err)" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 24px", borderTop: "1px solid var(--line)" }}>
          <button className="au-outline" disabled={busy} onClick={closeDialog}>
            Cancelar
          </button>
          <button className="au-primary au-danger" disabled={!ok || busy} onClick={go} style={{ opacity: ok ? 1 : 0.4, cursor: ok ? "pointer" : "not-allowed" }}>
            <Icon name={busy ? "loader-circle" : "trash-2"} size={14} className={busy ? "au-spin" : undefined} />
            {busy ? "Apagando…" : "Apagar para sempre"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- assistente de configuração (perfil novo) ----

const AUTOS: { mode: AutonomyMode; icon: string; desc: string }[] = [
  { mode: 0, icon: "eye", desc: "Só lê e resume. Não responde ninguém." },
  { mode: 1, icon: "pen-line", desc: "Escreve as respostas e espera você aprovar." },
  { mode: 2, icon: "zap", desc: "Responde sozinho, dentro das regras que você definir." },
];

type Pick = { provider: string; model: string; providerName: string };

/** Até 4 modelos dos provedores com chave: o atual primeiro. */
function modelChoices(catalog: ProviderOption[], current: { provider: string; model: string }): Pick[] {
  const all = catalog.filter((c) => c.connected).flatMap((c) => c.models.map((m) => ({ provider: c.id, model: m, providerName: c.name })));
  const first = all.find((x) => x.provider === current.provider && x.model === current.model);
  return [...(first ? [first] : []), ...all.filter((x) => x !== first)].slice(0, 4);
}

function Wizard() {
  const navigate = useNavigate();
  const cur = useCurrentProfile();
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState<Pick[] | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [mode, setMode] = useState<AutonomyMode>(1);
  const [saving, setSaving] = useState(false);
  const close = () => setState({ wizard: false });
  useEscape(() => skip(), saving);

  useEffect(() => {
    let alive = true;
    Promise.all([agent.providerCatalog(), agent.settings()]).then(
      ([catalog, st]) => {
        if (!alive) return;
        const list = modelChoices(catalog, st);
        setChoices(list);
        setPick(list[0] ?? null);
      },
      () => alive && setChoices([]),
    );
    return () => {
      alive = false;
    };
  }, []);

  if (!cur) return null;
  const skip = () => {
    close();
    if (step < 2) toast("Assistente fechado", "Você pode abri-lo de novo pelo Início deste perfil.");
  };
  const next = async () => {
    if (step === 0) return setStep(1);
    if (step === 1) {
      setSaving(true);
      try {
        if (pick) await agent.saveSettings({ provider: pick.provider, model: pick.model });
        await adapter.setDefaultMode(mode);
        setState({ defaultMode: mode });
        refreshProfiles();
      } catch (e) {
        toast(errMsg(e, "Não consegui salvar. Tente de novo."));
        setSaving(false);
        return;
      }
      setSaving(false);
      return setStep(2);
    }
    close();
    navigate("/gateways");
  };

  return (
    <div className="au-modal">
      <div role="dialog" aria-modal="true" aria-label="Assistente de configuração" className="au-card au-float" style={{ width: "min(560px,100%)", boxShadow: "var(--shadow)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 24px 4px" }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--acc)", color: "var(--accFg)", display: "grid", placeItems: "center" }}>
            <Icon name={cur.icon} size={15} />
          </span>
          <span style={{ fontSize: 13, color: "var(--fg2)" }}>
            Configurando <b style={{ color: "var(--fg)" }}>{cur.name}</b>
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 5 }} aria-label={`Passo ${step + 1} de 3`}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ height: 6, width: step === i ? 22 : 6, borderRadius: 6, background: step >= i ? "var(--acc)" : "var(--line2)", transition: "all .3s" }} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px 24px 22px", minHeight: 250 }}>
          {step === 0 && (
            <>
              <span className="au-display" style={{ fontSize: 22 }}>Qual modelo este perfil usa?</span>
              <span style={{ fontSize: 13, color: "var(--fg2)" }}>O modelo é o “cérebro” do Hermes. Dá para trocar depois.</span>
              {choices === null && <span style={{ fontSize: 13, color: "var(--fg3)" }}>Carregando modelos…</span>}
              {choices?.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--fg2)" }}>Este perfil ainda não tem a chave de nenhum provedor de modelo. Chaves nunca são copiadas de outro perfil.</p>
                  <button
                    className="au-outline"
                    onClick={() => {
                      close();
                      setState({ onboarding: 1 });
                    }}
                  >
                    Colocar a chave de um provedor
                  </button>
                </div>
              )}
              <div role="radiogroup" aria-label="Modelo" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {choices?.map((m) => {
                  const on = pick?.provider === m.provider && pick.model === m.model;
                  return (
                    <button key={m.provider + m.model} role="radio" aria-checked={on} className="au-choice" onClick={() => setPick(m)} style={{ gap: 4, padding: "12px 14px" }}>
                      <span style={{ fontFamily: "var(--fm)", fontSize: 12, overflowWrap: "anywhere" }}>{m.model}</span>
                      <span style={{ fontSize: 12, color: "var(--fg2)" }}>{m.providerName}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <span className="au-display" style={{ fontSize: 22 }}>Quanta liberdade ele tem?</span>
              <span style={{ fontSize: 13, color: "var(--fg2)" }}>Vale para os canais novos deste perfil. Dá para ajustar canal por canal depois.</span>
              <div role="radiogroup" aria-label="Autonomia" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {AUTOS.map((a) => (
                  <button key={a.mode} role="radio" aria-checked={mode === a.mode} className="au-choice" onClick={() => setMode(a.mode)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: "12px 14px" }}>
                    <Icon name={a.icon} size={16} color="var(--acc)" />
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{MODES[a.mode]}</span>
                      <span style={{ fontSize: 12, color: "var(--fg2)" }}>{a.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <span style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--accSoft)", color: "var(--acc)" }}>
                <Icon name="check" size={20} />
              </span>
              <span className="au-display" style={{ fontSize: 22 }}>Falta só conectar um canal</span>
              <span style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.55 }}>
                {cur.name} {pick ? <>vai usar <span style={{ fontFamily: "var(--fm)", fontSize: 12.5, color: "var(--fg)" }}>{pick.model}</span> </> : "vai usar o modelo que você escolher "}no modo <b style={{ color: "var(--fg)" }}>{MODES[mode]}</b>. Enquanto nenhum canal estiver conectado, ele não recebe nem envia mensagens.
              </span>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 24px", borderTop: "1px solid var(--line)" }}>
          <button className="au-ghost" onClick={skip} disabled={saving} style={{ padding: "9px 4px", fontSize: 13 }}>
            {step === 2 ? "Fazer depois" : "Pular por agora"}
          </button>
          <button className="au-outline" disabled={saving} onClick={() => setStep(step - 1)} style={{ marginLeft: "auto", visibility: step > 0 && step < 2 ? "visible" : "hidden" }}>
            Voltar
          </button>
          <button className="au-primary" disabled={saving} onClick={next}>
            {saving ? "Salvando…" : step === 2 ? "Conectar um canal" : "Continuar"}
            <Icon name="arrow-right" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Todos os diálogos de perfil num lugar só: o seletor e Configurações › Perfis só pedem para abrir. */
export function ProfileDialogs() {
  const dlg = useStore((s) => s.profileDialog);
  const wizard = useStore((s) => s.wizard);
  return (
    <>
      {dlg && dlg.kind !== "delete" && <FormDialog key={dlg.kind + (dlg.kind === "edit" ? dlg.id : "")} req={dlg} />}
      {dlg?.kind === "delete" && <DeleteDialog key={dlg.id} id={dlg.id} />}
      {wizard && <Wizard />}
    </>
  );
}
