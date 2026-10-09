// Configurações › Perfis: todos os perfis do Hermes, com canais, modelo, status e uso de hoje; criar, clonar,
// editar, pausar, tornar padrão e apagar. Trocar de perfil só muda o que o painel mostra: os outros continuam rodando.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Icon } from "../Icon";
import { clientSummary, hexOf, isRevoked, menuReasons, money, splitProfiles, STATUS, statusDetail, statusKey, usageBar, usageTotals, type Profile } from "../profileLogic";
import { channelMeta, makeDefault, refreshProfiles, setProfilePaused, switchProfile } from "../profiles";
import { ask, setState, useStore } from "../store";

const COLS = "au-prow";

function Menu({ p, current, onClose }: { p: Profile; current: boolean; onClose: () => void }) {
  const why = menuReasons(p);
  const paused = p.status === "paused" && !isRevoked(p);
  const item = (label: string, icon: string, run: () => void, o: { danger?: boolean; reason?: string } = {}) => (
    <button key={label} role="menuitem" aria-disabled={!!o.reason} className={"au-mitem" + (o.danger ? " danger" : "")} onClick={() => !o.reason && (onClose(), run())}>
      <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <Icon name={icon} size={14} />
        {label}
      </span>
      {o.reason && <span style={{ fontSize: 11, color: "var(--fg3)", paddingLeft: 23, lineHeight: 1.4 }}>{o.reason}</span>}
    </button>
  );
  return (
    <div role="menu" className="au-float" onMouseDown={(e) => e.stopPropagation()} style={{ position: "absolute", right: 12, top: 54, zIndex: 5, width: 260, padding: 6, borderRadius: "var(--r2)", border: "1px solid var(--line2)", boxShadow: "var(--shadow)", display: "flex", flexDirection: "column", gap: 1, animation: "hin .15s both" }}>
      {!current && item("Usar este perfil", "arrow-right-left", () => switchProfile(p.id))}
      {item("Editar nome, cor e descrição", "pencil", () => setState({ profileDialog: { kind: "edit", id: p.id } }))}
      {item("Clonar", "copy", () => setState({ profileDialog: { kind: "create", from: p.id } }))}
      {item(
        paused ? "Retomar" : "Pausar",
        paused ? "play" : "pause",
        async () => {
          if (paused || (await ask({ title: `Pausar ${p.name}?`, body: "Ele deixa de responder ninguém até você retomar. As mensagens que chegarem ficam guardadas.", confirm: "Pausar", danger: true }))) setProfilePaused(p, !paused);
        },
        { reason: why.pause },
      )}
      {!p.isDefault && item("Tornar padrão", "star", () => makeDefault(p))}
      <div style={{ height: 1, background: "var(--line)", margin: "4px 2px" }} />
      {item("Apagar perfil", "trash-2", () => setState({ profileDialog: { kind: "delete", id: p.id } }), { danger: true, reason: why.remove })}
    </div>
  );
}

function Row({ p, theme, max, index, indent, current, target, menuOpen, onMenu }: { p: Profile; theme: "dark" | "light"; max: number; index: number; indent: boolean; current: boolean; target: boolean; menuOpen: boolean; onMenu: () => void }) {
  const st = STATUS[statusKey(p)];
  const hex = hexOf(p.color, theme);
  return (
    <div
      className={COLS}
      data-pid={p.id}
      aria-current={target ? "location" : undefined}
      style={{ position: "relative", boxShadow: target ? "inset 3px 0 0 var(--acc)" : undefined, zIndex: menuOpen ? 10 : undefined, padding: `14px 16px 14px ${indent ? 40 : 16}px`, borderTop: "1px solid var(--line)", background: current || target ? "var(--accSoft)" : p.status === "err" ? "color-mix(in oklab,var(--err) 6%,transparent)" : "transparent", animation: "hblurin .5s both", animationDelay: index * 40 + "ms" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, background: hex, color: "var(--accFg)", display: "grid", placeItems: "center" }}>
          <Icon name={p.icon} size={16} />
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
            {p.isDefault && <span style={{ flex: "none", padding: "1px 7px", borderRadius: 999, border: "1px solid var(--line2)", fontSize: 10.5, color: "var(--fg2)" }}>padrão</span>}
            {current && <span style={{ flex: "none", padding: "1px 7px", borderRadius: 999, background: "var(--acc)", color: "var(--accFg)", fontSize: 10.5, fontWeight: 600 }}>em uso</span>}
          </div>
          <span style={{ fontSize: 12.5, color: "var(--fg2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.desc || "Sem descrição"}</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>{p.id}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {p.channels.map((c) => {
          const m = channelMeta(c);
          return (
            <span key={c} title={m.name} style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--panel2)", display: "grid", placeItems: "center", color: "var(--fg2)" }}>
              <Icon name={m.icon} size={12} />
            </span>
          );
        })}
        {p.channels.length === 0 && <span style={{ fontSize: 12, color: "var(--fg3)" }}>Nenhum ainda</span>}
      </div>
      <span title={p.model} style={{ fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.model || "—"}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 500, color: st.tone }}>
          <Icon name={st.icon} size={13} />
          {st.label}
        </span>
        <span style={{ fontSize: 11.5, color: "var(--fg3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{statusDetail(p)}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12.5 }}>
          {p.usageToday.msgs} msgs<span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>{money(p.usageToday.costUsd)}</span>
        </span>
        <span style={{ height: 3, borderRadius: 3, background: "var(--panel2)", overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: usageBar(p.usageToday.msgs, max), background: hex, borderRadius: 3, animation: "hgrow .9s cubic-bezier(.2,.7,.2,1) both" }} />
        </span>
      </div>
      <button title="Ações do perfil" aria-label={`Ações de ${p.name}`} aria-haspopup="menu" aria-expanded={menuOpen} onMouseDown={(e) => e.stopPropagation()} onClick={onMenu} className="au-iconbtn" style={{ width: 32, height: 32, borderColor: menuOpen ? "var(--line2)" : "transparent" }}>
        <Icon name="ellipsis" size={16} />
      </button>
      {menuOpen && <Menu p={p} current={current} onClose={onMenu} />}
    </div>
  );
}

export function ProfilesPanel() {
  const navigate = useNavigate();
  const profiles = useStore((s) => s.profiles);
  const status = useStore((s) => s.profilesStatus);
  const id = useStore((s) => s.profileId);
  const theme = useStore((s) => s.theme);
  const [menu, setMenu] = useState<string | null>(null);
  // `?perfil=<id>` (link do Copiloto): abre o grupo, destaca a linha e rola até ela.
  const target = useSearchParams()[0].get("perfil");
  const [picked, setGrp] = useState<boolean | null>(null); // null: ninguém mexeu, o grupo abre sozinho se o link aponta para ele
  const box = useRef<HTMLDivElement>(null);
  const inGroup = !!target && profiles.some((p) => p.id === target && p.group);
  const grp = picked ?? inGroup;
  useEffect(() => {
    if (status !== "ready" || !target || (inGroup && !grp)) return;
    [...(box.current?.querySelectorAll<HTMLElement>("[data-pid]") ?? [])].find((el) => el.dataset.pid === target)?.scrollIntoView?.({ block: "center" });
  }, [status, target, inGroup, grp]);

  // Números frescos (status e uso de hoje) ao abrir a tela.
  useEffect(() => {
    refreshProfiles();
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setMenu(null);
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [menu]);

  const { top, clients } = splitProfiles(profiles);
  const max = Math.max(1, ...profiles.map((p) => p.usageToday.msgs));
  const sum = usageTotals(clients);
  const row = (p: Profile, i: number, indent: boolean) => <Row key={p.id} p={p} theme={theme} max={max} index={i} indent={indent} current={p.id === id} target={p.id === target} menuOpen={menu === p.id} onMenu={() => setMenu(menu === p.id ? null : p.id)} />;
  const onlyOne = status === "ready" && profiles.filter((p) => !p.group).length <= 1 && clients.length === 0;
  const only = profiles[0];

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, maxWidth: 620 }}>
          <h1 className="au-h1">Perfis</h1>
          <p style={{ margin: 0, color: "var(--fg2)", fontSize: 14.5, lineHeight: 1.5, textWrap: "pretty" }}>Cada perfil é um Hermes separado, com memória, canais, ferramentas e chaves próprias. Nada passa de um perfil para outro.</p>
        </div>
        <button className="au-primary" style={{ marginLeft: "auto", padding: "10px 16px", fontSize: 13.5 }} onClick={() => setState({ profileDialog: { kind: "create" } })}>
          <Icon name="plus" size={15} />
          Novo perfil
        </button>
      </div>

      {status === "loading" && (
        <div className="au-card" aria-busy="true" style={{ overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", fontSize: 12.5, color: "var(--fg3)", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="loader-circle" size={14} className="au-spin" />
            Carregando perfis…
          </div>
          {["40%", "55%", "35%", "48%"].map((w) => (
            <div key={w} style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) 120px 128px 150px 120px", gap: 14, alignItems: "center", padding: 16, borderTop: "1px solid var(--line)" }}>
              <div className="au-skel" style={{ width: 34, height: 34, borderRadius: 10 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <div className="au-skel" style={{ height: 11, width: w, borderRadius: 6 }} />
                <div style={{ height: 9, width: "70%", borderRadius: 6, background: "var(--panel2)" }} />
              </div>
              {[0, 1, 2, 3].map((k) => (
                <div key={k} style={{ height: 10, borderRadius: 6, background: "var(--panel2)" }} />
              ))}
            </div>
          ))}
        </div>
      )}

      {status === "error" && (
        <div role="alert" className="au-card" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, padding: 28, borderColor: "color-mix(in oklab,var(--err) 35%,transparent)" }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "color-mix(in oklab,var(--err) 14%,transparent)", color: "var(--err)" }}>
            <Icon name="cloud-off" size={19} />
          </span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Não consegui carregar os perfis</span>
          <span style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.55, maxWidth: 560 }}>
            O Hermes não respondeu ao ler a pasta de perfis (<span style={{ fontFamily: "var(--fm)", fontSize: 12 }}>~/.hermes/profiles</span>). Seus perfis continuam lá e nada foi apagado.
          </span>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              className="au-primary"
              onClick={() => {
                setState({ profilesStatus: "loading" });
                refreshProfiles();
              }}
            >
              <Icon name="rotate-cw" size={14} />
              Tentar de novo
            </button>
            <button className="au-outline" onClick={() => navigate("/logs")}>
              Ver registros
            </button>
          </div>
        </div>
      )}

      {status === "ready" && (
        <div ref={box}>
          <div className="au-card" style={{ position: "relative" }}>
            <div className={COLS} style={{ padding: "12px 16px", fontFamily: "var(--fm)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--fg3)" }}>
              <span>Perfil</span>
              <span>Canais</span>
              <span>Modelo</span>
              <span>Situação</span>
              <span>Uso hoje</span>
              <span />
            </div>
            {top.map((p, i) => row(p, i, false))}
            {clients.length > 0 && (
              <>
                <button className={COLS + " au-listrow"} aria-expanded={grp} onClick={() => { setGrp(!grp); setMenu(null); }} style={{ width: "100%", padding: "14px 16px", borderBottom: 0, borderTop: "1px solid var(--line)", animation: "none" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, border: "1px dashed var(--line2)", display: "grid", placeItems: "center", color: "var(--fg2)" }}>
                      <Icon name="users" size={16} />
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>
                        Clientes do Copiloto <span style={{ fontFamily: "var(--fm)", fontSize: 11, fontWeight: 400, color: "var(--fg3)" }}>{clients.length}</span>
                      </span>
                      <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>Criados pelo Copiloto, um perfil por cliente</span>
                    </span>
                  </span>
                  <span style={{ fontSize: 12, color: "var(--fg3)" }}>—</span>
                  <span style={{ fontSize: 12, color: "var(--fg3)" }}>—</span>
                  <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>{clientSummary(clients)}</span>
                  <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>{sum.msgs} msgs · {money(sum.costUsd)}</span>
                  <Icon name={grp ? "chevron-up" : "chevron-down"} size={16} color="var(--fg3)" className="au-ml-auto" />
                </button>
                {grp && clients.map((p, i) => row(p, i, true))}
              </>
            )}
          </div>
        </div>
      )}

      {onlyOne && only && (
        <div className="au-card" style={{ display: "flex", alignItems: "center", gap: 22, padding: "26px 28px", borderStyle: "dashed", borderColor: "var(--line2)", flexWrap: "wrap" }}>
          <span style={{ width: 48, height: 48, flex: "none", borderRadius: 14, display: "grid", placeItems: "center", background: "var(--accSoft)", color: "var(--acc)" }}>
            <Icon name="layers" size={22} />
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
            <span style={{ fontSize: 15.5, fontWeight: 600 }}>Você só tem o perfil {only.name}</span>
            <span style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.55, maxWidth: 520, textWrap: "pretty" }}>Crie um perfil para separar uma empresa ou um cliente. Ele terá memória, canais e chaves próprios.</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flex: "none" }}>
            <button className="au-outline" onClick={() => setState({ profileDialog: { kind: "create", from: only.id } })}>
              Clonar {only.name}
            </button>
            <button className="au-primary" onClick={() => setState({ profileDialog: { kind: "create" } })}>
              <Icon name="plus" size={14} />
              Criar perfil
            </button>
          </div>
        </div>
      )}

      <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--fg3)" }}>
        <Icon name="info" size={13} />
        Trocar de perfil só muda o que você vê aqui. Os outros perfis continuam rodando.
      </p>
    </>
  );
}
