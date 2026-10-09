// Seletor de perfil no topo da barra lateral (substitui o bloco "Hermes"): gatilho com cor + ícone + status,
// faixa de problema de OUTRO perfil, e o popover com busca, perfis, grupo "Clientes do Copiloto", Novo e Gerenciar.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "./Icon";
import { hexOf, otherIssueLabel, otherIssues, rowSubtitle, splitProfiles, triggerStatus, type Profile } from "./profileLogic";
import { switchProfile } from "./profiles";
import { setState, useStore } from "./store";

function Row({ p, current, small, onPick }: { p: Profile; current: boolean; small?: boolean; onPick: () => void }) {
  const theme = useStore((s) => s.theme);
  const sub = rowSubtitle(p);
  const box = small ? 22 : 28;
  return (
    <button role="option" aria-selected={current} className="au-popt" onClick={onPick} style={small ? { padding: "6px 8px 6px 20px" } : undefined}>
      <span style={{ position: "relative", width: box, height: box, flex: "none", borderRadius: small ? 7 : 8, background: hexOf(p.color, theme), color: "var(--accFg)", display: "grid", placeItems: "center" }}>
        <Icon name={p.icon} size={small ? 11 : 14} />
        {p.status === "err" && <span title="Com problema" style={{ position: "absolute", right: -4, top: -4, width: 11, height: 11, borderRadius: "50%", background: "var(--err)", border: "2px solid var(--bg)" }} />}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: small ? 1 : 2 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: small ? 12.5 : 13, fontWeight: 500 }}>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
          {p.isDefault && <span style={{ flex: "none", fontSize: 10, color: "var(--fg3)", border: "1px solid var(--line2)", borderRadius: 999, padding: "0 6px" }}>padrão</span>}
        </span>
        <span style={{ fontSize: small ? 10.5 : 11.5, fontFamily: small ? "var(--fm)" : undefined, color: sub.tone, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub.text}</span>
      </span>
      {current && <Icon name="check" size={small ? 14 : 15} color="var(--fg)" />}
    </button>
  );
}

export function ProfileSwitcher() {
  const navigate = useNavigate();
  const profiles = useStore((s) => s.profiles);
  const id = useStore((s) => s.profileId);
  const version = useStore((s) => s.account?.version);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [grp, setGrp] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    setQ("");
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      trigger.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const cur = profiles.find((p) => p.id === id);
  // Lista ainda não chegou (ou falhou): o bloco "Hermes" de sempre, sem seletor.
  if (!cur) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "18px 18px 16px" }}>
        <div className="au-logo" aria-hidden="true">☤</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="au-display" style={{ fontSize: 19, lineHeight: 1 }}>Hermes</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>{version || " "}</span>
        </div>
      </div>
    );
  }

  const st = triggerStatus(cur);
  const others = otherIssues(profiles, id);
  const { top, clients } = splitProfiles(profiles, q);
  const searching = q.trim().length > 0;
  const grpOpen = grp || searching;
  const clientIssues = profiles.filter((p) => p.group && p.status === "err").length;
  const none = searching && !top.length && !clients.length;

  const pick = (pid: string) => {
    close();
    switchProfile(pid);
  };
  const create = (name?: string) => {
    close();
    setState({ profileDialog: { kind: "create", name } });
  };

  return (
    <div ref={wrap} style={{ padding: "12px 10px 10px" }}>
      <button ref={trigger} className="au-ptrig" aria-haspopup="listbox" aria-expanded={open} title="Trocar de perfil" onClick={() => (open ? close() : setOpen(true))}>
        <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, background: "var(--acc)", color: "var(--accFg)", display: "grid", placeItems: "center", boxShadow: "0 0 0 4px var(--accSoft)", transition: "background .4s,box-shadow .4s" }}>
          <Icon name={cur.icon} size={17} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
          <span className="au-display" style={{ fontSize: 17, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cur.name}</span>
          <span role="status" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: st.tone }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.tone, animation: st.pulse ? "hpulse 2.4s ease-in-out infinite" : "none" }} />
            {st.label}
          </span>
        </span>
        <Icon name="chevrons-up-down" size={15} color="var(--fg3)" />
      </button>

      {others.length > 0 && (
        <button className="au-palert" onClick={() => switchProfile(others[0].id)}>
          <Icon name="triangle-alert" size={13} />
          <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{otherIssueLabel(others)}</span>
          <span style={{ fontWeight: 600 }}>Abrir</span>
        </button>
      )}

      {open && (
        <div role="listbox" aria-label="Perfis" className="au-pop au-float">
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 9, background: "var(--panel2)", marginBottom: 6 }}>
            <Icon name="search" size={14} color="var(--fg3)" />
            <input autoFocus aria-label="Buscar perfil" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar perfil" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 13 }} />
            <span className="au-kbd" style={{ marginLeft: 0, fontSize: 10 }}>Esc</span>
          </div>
          {top.map((p) => (
            <Row key={p.id} p={p} current={p.id === id} onPick={() => pick(p.id)} />
          ))}
          {clients.length > 0 && (
            <>
              <button className="au-pgrp" aria-expanded={grpOpen} onClick={() => setGrp(!grp)}>
                <Icon name={grpOpen ? "chevron-down" : "chevron-right"} size={14} className="au-pgrp-ic" />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>Clientes do Copiloto</span>
                {clientIssues > 0 && <span style={{ fontSize: 11, color: "var(--err)" }}>{clientIssues} com problema</span>}
                <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, padding: "1px 7px", borderRadius: 999, background: "var(--panel2)" }}>{clients.length}</span>
              </button>
              {grpOpen && clients.map((p) => <Row key={p.id} p={p} small current={p.id === id} onPick={() => pick(p.id)} />)}
            </>
          )}
          {none && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 8px" }}>
              <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>Nenhum perfil com “{q.trim()}”.</span>
              <button className="au-outline" style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", fontSize: 12.5 }} onClick={() => create(q.trim())}>
                <Icon name="plus" size={13} />
                Criar “{q.trim()}”
              </button>
            </div>
          )}
          <div style={{ height: 1, background: "var(--line)", margin: "6px 2px" }} />
          <button className="au-popt" onClick={() => create()} style={{ padding: 8, fontSize: 13 }}>
            <Icon name="plus" size={15} color="var(--acc)" className="au-pgrp-ic" />
            Novo perfil
          </button>
          <button
            className="au-popt"
            style={{ padding: 8, fontSize: 13 }}
            onClick={() => {
              close();
              navigate("/settings/perfis");
            }}
          >
            <Icon name="settings-2" size={15} color="var(--fg2)" className="au-pgrp-ic" />
            Gerenciar perfis
          </button>
        </div>
      )}
    </div>
  );
}
