// Participantes de um grupo de WhatsApp (gaveta do canal) e a lista da equipe (tela Canais).
import { useState } from "react";
import { Icon } from "../Icon";
import { plural } from "../chat/sources";
import { ask, toast } from "../store";
import { formatPhone, parsePhone, personName, sortParticipants, teamApi, teamBody, teamBodyFromPhone, teamIdFor, type Participant, type TeamBody, type TeamMember } from "./team";
import { Modal } from "./parts";

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const asBody = (m: TeamMember): TeamBody => ({ id: m.id, name: m.name, aliases: m.aliases, ...(m.photo ? { photo: m.photo } : {}) });

/** Foto da pessoa; sem foto ou se ela falhar ao carregar, a inicial. */
export function PersonAvatar({ name, photo, size = 34 }: { name: string; photo: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (name.replace(/^\+/, "").trim()[0] ?? "?").toUpperCase();
  return (
    <span className="au-avatar" aria-hidden="true" style={{ width: size, height: size, flex: "none", overflow: "hidden", fontSize: Math.round(size * 0.4) }}>
      {photo && !broken ? <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initial}
    </span>
  );
}

type Load = "idle" | "loading" | "ok" | "error";

/** Seção "Participantes" da gaveta: carrega sob demanda (pode levar até 40 s em grupo grande). */
export function Participants({ channelId, onTeamChanged }: { channelId: string; onTeamChanged: () => void }) {
  const [load, setLoad] = useState<Load>("idle");
  const [error, setError] = useState("");
  const [list, setList] = useState<Participant[]>([]);
  const [size, setSize] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchList = async () => {
    setLoad("loading");
    try {
      const out = await teamApi.participants(channelId);
      setList(sortParticipants(out.participants));
      setSize(out.size ?? out.participants.length);
      setLoad("ok");
    } catch (e) {
      setError(errMsg(e, "Não consegui buscar os participantes."));
      setLoad("error");
    }
  };

  /** Troca o selo localmente e reordena (equipe primeiro). */
  const mark = (p: Participant, team: boolean) => setList((l) => sortParticipants(l.map((x) => (x.key === p.key ? { ...x, team } : x))));

  const toggle = async (p: Participant) => {
    const name = personName(p);
    if (busy) return;
    if (!p.team) {
      const ok = await ask({
        title: `Tratar ${name} como equipe em todos os grupos?`,
        body: "Vale para qualquer grupo deste perfil, inclusive os que ainda vão aparecer. Nas análises, as mensagens dessa pessoa contam como resposta do suporte, não como pedido do cliente.",
        confirm: "Tratar como equipe",
      });
      if (!ok) return;
      setBusy(p.key);
      try {
        await teamApi.add(teamBody(p));
        mark(p, true);
        onTeamChanged();
        toast(`${name} agora é equipe`, { sub: "Vale em todos os grupos deste perfil." });
      } catch (e) {
        toast(errMsg(e, "Não consegui salvar. Nada mudou."));
      }
      return setBusy(null);
    }
    setBusy(p.key);
    try {
      const team = await teamApi.list().catch(() => [] as TeamMember[]);
      const id = teamIdFor(p, team);
      const before = team.find((m) => m.id === id);
      await teamApi.remove(id);
      mark(p, false);
      onTeamChanged();
      toast(`${name} saiu da equipe`, {
        undo: async () => {
          try {
            await teamApi.add(before ? asBody(before) : teamBody(p));
            mark(p, true);
            onTeamChanged();
            toast("Desfeito");
          } catch (e) {
            toast(errMsg(e, "Não consegui desfazer"));
          }
        },
      });
    } catch (e) {
      toast(errMsg(e, "Não consegui remover da equipe. Nada mudou."));
    }
    setBusy(null);
  };

  if (load === "idle")
    return (
      <>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--fg2)" }}>Veja quem está no grupo e marque quem é da sua equipe, para o Hermes não tratar essas mensagens como pedido de cliente.</p>
        <div>
          <button className="au-outline" onClick={fetchList}>
            <Icon name="users" size={13} /> Ver participantes
          </button>
        </div>
      </>
    );
  if (load === "loading")
    return (
      <div role="status" aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>Buscando os participantes… em grupos grandes isso pode levar até meio minuto.</span>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="au-ch-skel" style={{ width: 34, height: 34, borderRadius: "50%", flex: "none" }} />
            <span className="au-ch-skel" style={{ width: `${60 - i * 12}%` }} />
          </div>
        ))}
      </div>
    );
  if (load === "error")
    return (
      <>
        <p role="alert" style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, lineHeight: 1.5, color: "var(--err)" }}>
          <Icon name="triangle-alert" size={15} />
          {error}
        </p>
        <div>
          <button className="au-outline" onClick={fetchList}>
            Tentar de novo
          </button>
        </div>
      </>
    );

  const nTeam = list.filter((p) => p.team && !p.self).length;
  return (
    <>
      <span style={{ fontSize: 12, color: "var(--fg3)" }}>
        {plural(size || list.length, "pessoa", "pessoas")} no grupo{nTeam ? ` · ${nTeam} da equipe` : ""}
      </span>
      {list.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--fg2)" }}>Nenhum participante encontrado.</p>
      ) : (
        <ul aria-label="Participantes do grupo" style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 420, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {list.map((p) => {
            const name = p.self ? "Hermes · este número" : personName(p);
            const phone = formatPhone(p.phone);
            return (
              <li key={p.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <PersonAvatar name={name} photo={p.photo} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <span className="au-ch-clip" style={{ fontSize: 13.5, fontWeight: 500 }} title={name}>
                      {name}
                    </span>
                    {p.admin && (
                      <span className="au-tag" style={{ color: "var(--fg2)" }}>
                        admin
                      </span>
                    )}
                  </span>
                  {phone && name !== phone && (
                    <span className="au-ch-clip" style={{ fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg3)" }}>
                      {phone}
                    </span>
                  )}
                </span>
                {!p.self && (
                  <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
                    <span style={{ fontSize: 11.5, color: p.team ? "var(--acc)" : "var(--fg3)" }}>Equipe</span>
                    <button type="button" role="switch" aria-checked={p.team} aria-label={`Tratar ${name} como equipe`} disabled={busy === p.key} className="au-switch" style={{ marginLeft: 0 }} onClick={() => toggle(p)}>
                      <span />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <button className="au-outline" onClick={fetchList}>
          <Icon name="refresh-cw" size={13} /> Atualizar
        </button>
      </div>
    </>
  );
}

/** Lista da equipe do perfil (foto, nome, número, remover) e campo para adicionar pelo número. */
export function TeamDialog({ team, onChanged, onClose }: { team: TeamMember[]; onChanged: () => void; onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const digits = parsePhone(phone);
  const invalid = touched && !digits;

  const add = async () => {
    setTouched(true);
    if (!digits || busy) return;
    setBusy(true);
    try {
      await teamApi.add(teamBodyFromPhone(digits, name));
      setPhone("");
      setName("");
      setTouched(false);
      onChanged();
      toast("Pessoa adicionada à equipe", { sub: "Vale em todos os grupos deste perfil." });
    } catch (e) {
      toast(errMsg(e, "Não consegui adicionar. Nada mudou."));
    }
    setBusy(false);
  };
  const remove = async (m: TeamMember) => {
    try {
      await teamApi.remove(m.id);
      onChanged();
      toast(`${m.name} saiu da equipe`, {
        undo: async () => {
          try {
            await teamApi.add(asBody(m));
            onChanged();
            toast("Desfeito");
          } catch (e) {
            toast(errMsg(e, "Não consegui desfazer"));
          }
        },
      });
    } catch (e) {
      toast(errMsg(e, "Não consegui remover. Nada mudou."));
    }
  };

  return (
    <Modal title="Equipe deste perfil" onClose={onClose} busy={busy} width={520}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--fg2)" }}>
        Nas análises, as mensagens dessas pessoas contam como resposta do suporte, em qualquer grupo, inclusive nos que ainda vão aparecer.
      </p>
      {team.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--fg3)" }}>Ninguém na equipe ainda. Marque pessoas na gaveta de um grupo ou adicione pelo número abaixo.</p>
      ) : (
        <ul aria-label="Equipe" style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 300, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {team.map((m) => {
            const num = formatPhone(m.id);
            return (
              <li key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <PersonAvatar name={m.name} photo={m.photo} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                  <span className="au-ch-clip" style={{ fontSize: 13.5, fontWeight: 500 }} title={m.name}>
                    {m.name}
                  </span>
                  {num && num !== m.name && (
                    <span style={{ fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg3)" }}>{num}</span>
                  )}
                </span>
                <button className="au-iconbtn" aria-label={`Remover ${m.name} da equipe`} title="Remover da equipe" onClick={() => remove(m)}>
                  <Icon name="trash-2" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        <span className="au-label">Adicionar pelo número</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label className="au-ch-input" style={{ flex: "1 1 170px" }}>
            <input aria-label="Número com DDI e DDD" aria-invalid={invalid || undefined} aria-describedby="team-phone-help" inputMode="tel" placeholder="5511912345678" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="au-ch-input" style={{ flex: "1 1 140px" }}>
            <input aria-label="Nome (opcional)" placeholder="Nome (opcional)" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="au-primary" disabled={busy}>
            Adicionar
          </button>
        </div>
        <span id="team-phone-help" role={invalid ? "alert" : undefined} style={{ fontSize: 11.5, lineHeight: 1.45, color: invalid ? "var(--err)" : "var(--fg3)" }}>
          {invalid ? "Use só números, de 10 a 15 dígitos, com o código do país e o DDD." : "Código do país + DDD + número, só dígitos. Ex.: 5511912345678."}
        </span>
      </form>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="au-outline" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
