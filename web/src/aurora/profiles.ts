// Ações dos perfis: ler o agregado, trocar, criar/clonar, editar, pausar, tornar padrão, apagar, reiniciar o gateway.
// Trocar de perfil recarrega TUDO no perfil novo: `setManagementProfile` faz as rotas do painel levarem
// `?profile=<id>`, e a conversa leva `profile` no JSON-RPC (chat/gateway.ts).
import { api, fetchJSON, setManagementProfile } from "@/lib/api";
import { agent } from "./agent";
import { CHANNEL_PT } from "./agent/channelText";
import { resetChatProfile } from "./chat";
import { PLATFORM_ICON } from "./live";
import { keyName } from "./ops/ApiKeysEditor";
import { pickInitialProfile, type CopyOptions, type Inventory, type Profile } from "./profileLogic";
import { EMPTY_OPS, getState, loadOps, loadSessions, setState, toast } from "./store";

const PROFILE_KEY = "hermes.aurora.profile";

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const q = encodeURIComponent;
/** "OpenRouter API key" → "OpenRouter". */

/** Nome e ícone de um canal pelo id da plataforma ("whatsapp" → "WhatsApp (QR code)"). */
export const channelMeta = (id: string) => ({ name: CHANNEL_PT[id]?.name ?? id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " "), icon: PLATFORM_ICON[id] ?? "radio-tower" });

/** Último perfil aberto neste navegador ("" sem storage ou sem nada salvo). */
function readSaved() {
  try {
    return localStorage.getItem(PROFILE_KEY) ?? "";
  } catch {
    return "";
  }
}

function save(id: string) {
  try {
    localStorage.setItem(PROFILE_KEY, id);
  } catch {
    // lembrar o perfil é conveniência deste navegador; sem storage abre o padrão
  }
}

/** Relê o agregado (todos os perfis, com status, canais e uso de hoje). Devolve null se falhar. */
export async function refreshProfiles(): Promise<Profile[] | null> {
  try {
    const list = await fetchJSON<Profile[]>("/api/ops/profiles");
    setState({ profiles: list, profilesStatus: "ready" });
    // Lista que só chegou agora (falhou na entrada): adota o perfil inicial e carrega os dados dele.
    if (!getState().profileId && list.length) await adopt(pickInitialProfile(list, readSaved()));
    return list;
  } catch {
    setState((s) => ({ profilesStatus: s.profiles.length ? "ready" : "error" }));
    return null;
  }
}

async function adopt(id: string) {
  setManagementProfile(id);
  setState({ profileId: id });
  await Promise.all([loadOps().catch(() => {}), loadSessions().catch(() => {}), loadKeys()]);
}

/** Antes de qualquer outra chamada do painel: descobre em qual perfil entrar e já aponta as rotas para ele. */
export async function bootProfiles() {
  const list = await refreshProfiles();
  const id = list ? pickInitialProfile(list, readSaved()) : readSaved();
  if (id && getState().profileId !== id) {
    setManagementProfile(id);
    setState({ profileId: id });
  }
}

/** Chaves de API salvas no perfil atual (nomes de variável), para o rodapé da barra lateral. */
export async function loadKeys() {
  const pid = getState().profileId;
  const keys = await agent.apiKeys().then(
    (ks) => ks.filter((k) => k.isSet).map((k) => k.key),
    () => [] as string[],
  );
  if (getState().profileId === pid) setState({ keys });
}

/** Troca o perfil que o painel mostra. Os outros continuam rodando; só muda o que você vê aqui. */
export async function switchProfile(id: string, opts: { silent?: boolean } = {}) {
  const s = getState();
  const target = s.profiles.find((p) => p.id === id);
  if (!target || id === s.profileId) return;
  setManagementProfile(id);
  save(id);
  resetChatProfile(); // ids vivos da conversa eram do perfil anterior
  setState({ ...EMPTY_OPS, profileId: id, switching: true, keys: [] });
  if (!opts.silent) toast(`Agora você está no perfil ${target.name}`, "Painel, memória, canais e chaves passam a ser deste perfil.", 4200);
  await Promise.all([loadOps().catch(() => toast(`Não consegui carregar os dados do perfil ${target.name}`)), loadSessions().catch(() => {}), loadKeys(), refreshProfiles()]);
  if (getState().profileId === id) setState({ switching: false });
}

const upsert = (p: Profile) => setState((s) => ({ profiles: s.profiles.some((x) => x.id === p.id) ? s.profiles.map((x) => (x.id === p.id ? p : x)) : [...s.profiles, p] }));

export type ProfileForm = { name: string; desc: string; color: string; icon: string; from: string; copy: CopyOptions };

/** Cria (ou clona) um perfil. Lança com o motivo se falhar — o diálogo mostra e deixa tentar de novo. Não troca sozinho. */
export async function createProfile(f: ProfileForm): Promise<Profile> {
  const p = await fetchJSON<Profile>("/api/ops/profiles", json("POST", { name: f.name, desc: f.desc, color: f.color, icon: f.icon, copyFrom: f.from || undefined, copy: f.copy }));
  upsert(p);
  return p;
}

/** Nome, descrição, cor e ícone (o id/pasta não muda). Lança se falhar. */
export async function saveProfile(id: string, patch: { name?: string; desc?: string; color?: string; icon?: string }): Promise<Profile> {
  const p = await fetchJSON<Profile>(`/api/ops/profiles/${q(id)}`, json("PATCH", patch));
  upsert(p);
  return p;
}

/** Pausa ou retoma SÓ este perfil (o "Pausar tudo" é outro botão, de toda a frota). */
export async function setProfilePaused(p: Profile, paused: boolean) {
  try {
    await fetchJSON(`/api/ops/pause?profile=${q(p.id)}`, json("PUT", { paused }));
  } catch (e) {
    return toast(errMsg(e, `Não consegui ${paused ? "pausar" : "retomar"} ${p.name}`));
  }
  await refreshProfiles();
  toast(paused ? `${p.name} pausado` : `${p.name} retomado`, paused ? "Ele não responde ninguém até você retomar. As mensagens ficam guardadas." : "Voltou a responder nos canais dele.");
}

/** Perfil que abre ao entrar no painel (e na CLI). */
export async function makeDefault(p: Profile) {
  try {
    await api.setActiveProfile(p.id);
    await fetchJSON(`/api/ops/activity?profile=${q(p.id)}`, json("POST", { kind: "cfg", action: "Virou o perfil padrão", why: "você no painel." }));
  } catch (e) {
    return toast(errMsg(e, "Não consegui mudar o perfil padrão"));
  }
  await refreshProfiles();
  toast(`${p.name} agora é o padrão`, "É o perfil que abre quando você entra no painel.");
}

/** Apaga o perfil (a confirmação digitando o nome já foi feita). Lança se falhar. Se era o atual, volta para o padrão. */
export async function deleteProfile(p: Profile) {
  await api.deleteProfile(p.id);
  const wasCurrent = getState().profileId === p.id;
  const left = (await refreshProfiles()) ?? getState().profiles.filter((x) => x.id !== p.id);
  const def = left.find((x) => x.isDefault) ?? left.find((x) => x.id === "default") ?? left[0];
  // Rastro na Atividade do perfil que ficou (o apagado levou a dele junto).
  if (def) fetchJSON(`/api/ops/activity?profile=${q(def.id)}`, json("POST", { kind: "cfg", action: `Apagou o perfil “${p.name}”`, why: "você no painel." })).catch(() => {});
  if (wasCurrent && def) await switchProfile(def.id, { silent: true });
  toast(`Perfil ${p.name} apagado`, wasCurrent && def ? `Você voltou para o perfil ${def.name}.` : "Memória, canais e chaves dele foram removidos.");
}

/** Reinicia o gateway do perfil atual e relê o status (o gateway leva alguns segundos para subir). */
export async function restartCurrentGateway() {
  try {
    await agent.gatewayAction("restart");
  } catch (e) {
    return toast(errMsg(e, "Não consegui reiniciar o gateway"));
  }
  toast("Gateway reiniciado", "Os canais voltam a responder em instantes.");
  for (const wait of [1500, 5000]) {
    await new Promise((r) => setTimeout(r, wait));
    await Promise.all([refreshProfiles(), loadOps().catch(() => {})]);
  }
}

export async function profileInventory(id: string): Promise<Inventory> {
  const [mem, skills, tools, sess, env] = await Promise.allSettled([
    fetchJSON<{ memory: string[]; user: string[] }>(`/api/ops/memory?profile=${q(id)}`),
    api.getSkills(id),
    api.getToolsets(id),
    api.getSessions(1, 0, id),
    fetchJSON<Record<string, { is_set: boolean; description: string; category: string; custom?: boolean; channel_managed?: boolean }>>(`/api/env?profile=${q(id)}`),
  ]);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
  const m = ok(mem);
  const t = ok(tools);
  const e = ok(env);
  return {
    memories: m ? m.memory.length + m.user.length : null,
    skills: ok(skills)?.length ?? null,
    tools: t ? t.filter((x) => x.enabled).length : null,
    convs: ok(sess)?.total ?? null,
    keys: e ? Object.entries(e).filter(([, v]) => v.is_set && !v.channel_managed && (v.category === "provider" || v.category === "tool" || v.custom)).map(([k]) => keyName(k)) : null,
  };
}
