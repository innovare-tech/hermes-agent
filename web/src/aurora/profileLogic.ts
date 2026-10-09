// Lógica pura dos perfis (design A1): tipos, paleta, ids, busca, status e textos. Sem store nem rede,
// para ficar fácil de testar. As ações (trocar, criar, apagar…) vivem em profiles.ts.
import type { Theme } from "./store";

export type ProfileStatus = "ok" | "paused" | "err";

/** Um perfil como o agregado `/api/ops/profiles` devolve. */
export type Profile = {
  id: string;
  name: string;
  desc: string;
  color: string;
  icon: string;
  isDefault: boolean;
  group: "copiloto" | null;
  channels: string[];
  model: string;
  provider: string;
  status: ProfileStatus;
  issue?: string;
  issueKind?: "gateway" | "channel";
  canPause: boolean;
  /** Quem pausou: só este perfil, ou o "Pausar tudo" (aí não dá para retomar só ele). */
  pausedBy: "profile" | "all" | null;
  usageToday: { msgs: number; costUsd: number };
};

/** Paleta aprovada no design: cada perfil escolhe uma; substitui `--acc` no painel inteiro. */
export const COLORS = [
  { id: "violeta", name: "Violeta", dark: "#a395ff", light: "#5b4ce6" },
  { id: "azul", name: "Azul", dark: "#7cb8ff", light: "#2f6fd6" },
  { id: "ciano", name: "Ciano", dark: "#62d6f0", light: "#0b7fa0" },
  { id: "coral", name: "Coral", dark: "#ff9f7a", light: "#c4532c" },
  { id: "rosa", name: "Rosa", dark: "#f48fd0", light: "#b8358f" },
  { id: "lima", name: "Lima", dark: "#c2e66b", light: "#5f8a12" },
  { id: "ambar", name: "Âmbar", dark: "#f5c26b", light: "#a8691a" },
] as const;

export const ICONS = ["user", "code-xml", "message-circle", "store", "briefcase", "croissant", "glasses", "heart-pulse", "activity", "building-2"] as const;

export const NAME_MAX = 40;
export const DESC_MAX = 80;

export const hexOf = (colorId: string, theme: Theme) => {
  const c = COLORS.find((k) => k.id === colorId) ?? COLORS[0];
  return theme === "dark" ? c.dark : c.light;
};

export function hexToRgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Variáveis que o perfil atual põe no painel: cor, cor suave (15% escuro / 10% claro), brilho de fundo (26% / 22%) e holofote. */
export function accentVars(colorId: string, theme: Theme): Record<string, string> {
  const hex = hexOf(colorId, theme);
  const dark = theme === "dark";
  return {
    "--acc": hex,
    "--accSoft": hexToRgba(hex, dark ? 0.15 : 0.1),
    "--accGlow": hexToRgba(hex, dark ? 0.26 : 0.22),
    "--spot": hexToRgba(hex, dark ? 0.09 : 0.08),
  };
}

// ---- id e caminho ----

/** Nome → id de pasta: sem acento, minúsculas, só a-z0-9 e hífen. Igual ao backend (ops_profiles.slugify). */
export function slugify(name: string) {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return s || "perfil";
}

/** `slugify` + `-2`, `-3`… enquanto o id já existir. */
export function uniqueId(name: string, taken: Iterable<string>) {
  const used = new Set(taken);
  const base = slugify(name);
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

export const profilePath = (name: string, taken: Iterable<string> = []) => "~/.hermes/profiles/" + (name.trim() ? uniqueId(name, taken) : "…");

// ---- validação ----

/** Texto do erro do campo Nome ("" = válido). `editId`: o perfil que está sendo editado não conflita consigo. */
export function nameError(name: string, profiles: Profile[], editId = "") {
  const n = name.trim();
  if (!n) return "Dê um nome ao perfil.";
  if (n.length > NAME_MAX) return `No máximo ${NAME_MAX} caracteres.`;
  if (profiles.some((p) => p.id !== editId && p.name.trim().toLowerCase() === n.toLowerCase())) return "Já existe um perfil com esse nome.";
  return "";
}

// ---- busca e grupos ----

/** Busca no nome, no id e na descrição, sem diferenciar maiúsculas nem acentos. */
export function matchProfile(p: Profile, q: string) {
  const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const needle = fold(q.trim());
  return !needle || fold(`${p.name} ${p.id} ${p.desc}`).includes(needle);
}

/** Perfis principais e o grupo "Clientes do Copiloto", já filtrados pela busca. */
export function splitProfiles(list: Profile[], q = "") {
  const hit = list.filter((p) => matchProfile(p, q));
  return { top: hit.filter((p) => !p.group), clients: hit.filter((p) => p.group) };
}

// ---- status ----

export const STATUS = {
  ok: { label: "Rodando", tone: "var(--ok)", icon: "circle-check" },
  paused: { label: "Pausado", tone: "var(--fg2)", icon: "circle-pause" },
  err: { label: "Com problema", tone: "var(--err)", icon: "triangle-alert" },
} as const;

/** Linha de status do gatilho do seletor. */
export function triggerStatus(p: Pick<Profile, "status">) {
  return p.status === "err" ? { label: "Com problema", tone: "var(--err)", pulse: false } : p.status === "paused" ? { label: "Pausado", tone: "var(--fg3)", pulse: false } : { label: "Hermes · rodando", tone: "var(--ok)", pulse: true };
}

/** Problema em poucas palavras ("Gateway parado"). */
export const issueShort = (p: Pick<Profile, "issue" | "issueKind">) => (p.issueKind === "gateway" ? "Gateway parado" : (p.issue ?? "Com problema"));

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** Texto da faixa do seletor para os OUTROS perfis com problema ("Aibiz: gateway parado" / "2 perfis com problema"). */
export function otherIssueLabel(others: Profile[]) {
  if (others.length === 0) return "";
  if (others.length > 1) return `${others.length} perfis com problema`;
  const o = others[0];
  return `${o.name}: ${o.issueKind === "gateway" ? lowerFirst(issueShort(o)) : issueShort(o)}`;
}

export const otherIssues = (list: Profile[], currentId: string) => list.filter((p) => p.status === "err" && p.id !== currentId);

/** Título e explicação da faixa de problema do perfil atual (o termo técnico vem explicado). */
export function problemCopy(p: Profile) {
  if (p.issueKind === "gateway") {
    const n = p.channels.length;
    return {
      title: "Gateway parado",
      text: `${n === 1 ? "Há 1 canal ligado" : `Há ${n} canais ligados`}, mas ninguém está respondendo. (Gateway é o serviço que liga o Hermes aos canais.)`,
    };
  }
  return { title: "Um canal está com problema", text: `${p.issue ?? "Algo falhou"}. Veja os detalhes em Gateways.` };
}

/** Subtítulo da linha no seletor: o problema em vermelho, "Pausado", ou a descrição (id para clientes do Copiloto). */
export function rowSubtitle(p: Profile) {
  if (p.status === "err") return { text: issueShort(p), tone: "var(--err)" };
  if (p.status === "paused") return { text: "Pausado", tone: "var(--fg3)" };
  return { text: p.group ? p.id : p.desc || "Sem descrição", tone: "var(--fg3)" };
}

/** Detalhe do status na lista de Configurações › Perfis. */
export function statusDetail(p: Profile) {
  if (p.status === "err") return issueShort(p);
  if (p.status === "paused") return p.pausedBy === "all" ? "Pausado por “Pausar tudo”" : "Pausado por você";
  return p.channels.length ? "Respondendo normalmente" : "Sem canais conectados";
}

/** Resumo do grupo recolhido ("1 com problema · 1 pausado" / "Todos rodando"). */
export function clientSummary(clients: Profile[]) {
  const er = clients.filter((p) => p.status === "err").length;
  const pa = clients.filter((p) => p.status === "paused").length;
  return [er && `${er} com problema`, pa && `${pa} pausado${pa > 1 ? "s" : ""}`].filter(Boolean).join(" · ") || "Todos rodando";
}

export const money = (usd: number) => "US$ " + usd.toFixed(2).replace(".", ",");

export const usageTotals = (list: Profile[]) => ({ msgs: list.reduce((a, p) => a + p.usageToday.msgs, 0), costUsd: list.reduce((a, p) => a + p.usageToday.costUsd, 0) });

/** Largura da barra de uso de cada linha (mínimo 2% para a barra aparecer). */
export const usageBar = (msgs: number, max: number) => Math.max(2, Math.round((msgs / Math.max(1, max)) * 100)) + "%";

// ---- perfil inicial ----

/** Ao entrar: o último aberto neste navegador, senão o padrão do Hermes, senão a raiz. */
export function pickInitialProfile(list: Profile[], saved: string) {
  if (saved && list.some((p) => p.id === saved)) return saved;
  return list.find((p) => p.isDefault)?.id ?? (list.some((p) => p.id === "default") ? "default" : (list[0]?.id ?? ""));
}

/** Cor do próximo perfil: a primeira da paleta que ninguém usa (senão azul). */
export function nextColor(list: Profile[]) {
  const used = new Set(list.map((p) => p.color));
  return (COLORS.find((c) => !used.has(c.id)) ?? COLORS[1]).id;
}

// ---- diálogos ----

/** O que o diálogo de perfil pede para abrir. O formulário em si vive no componente. */
export type ProfileDialog = { kind: "create"; from?: string; name?: string } | { kind: "edit"; id: string } | { kind: "delete"; id: string };

/** O que cada opção de "Copiar de" leva para o perfil novo (canais e chaves nunca). */
export type CopyOptions = { skills: boolean; memory: boolean; tools: boolean };

export const copiedLabels = (c: CopyOptions) => [c.skills && "skills", c.memory && "memória", c.tools && "ferramentas"].filter(Boolean) as string[];

/** Frase do toast depois de criar. */
export function createdSub(from: Profile | undefined, c: CopyOptions) {
  if (!from) return "Começou do zero. Você já está nele.";
  const what = copiedLabels(c);
  return what.length ? `Copiei ${what.join(", ")} de ${from.name}. Canais e chaves começam vazios.` : `Começou do zero, sem copiar nada de ${from.name}. Você já está nele.`;
}

// ---- menu ⋯ e apagar ----

/** Por que um item do menu está desligado — escrito embaixo dele, nunca só cinza. "" = liberado. */
export function menuReasons(p: Profile) {
  return {
    pause: p.pausedBy === "all" ? "Está pausado pelo “Pausar tudo”. Retome por lá." : !p.canPause ? `${p.name} só pausa pelo “Pausar tudo”.` : "",
    remove: p.isDefault ? "É o perfil padrão. Torne outro perfil padrão antes de apagar este." : p.id === "default" ? "É o perfil principal do Hermes e não pode ser apagado." : "",
  };
}

/** O que há num perfil (para mostrar o que "Copiar de" leva e o que "Apagar" perde). null = não deu para ler. */
export type Inventory = { memories: number | null; skills: number | null; tools: number | null; convs: number | null; keys: string[] | null };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Linhas do aviso de apagar, a partir do que há de verdade no perfil. */
export function deleteItems(inv: Inventory | null, channelNames: string[]) {
  return [
    { i: "brain", l: inv?.memories != null ? plural(inv.memories, "memória", "memórias") : "Memórias" },
    { i: "sparkles", l: inv?.skills != null && inv.tools != null ? `${plural(inv.skills, "skill", "skills")} e ${plural(inv.tools, "ferramenta", "ferramentas")}` : "Skills e ferramentas" },
    { i: "messages-square", l: inv?.convs != null ? plural(inv.convs, "conversa", "conversas") : "Conversas" },
    { i: "unplug", l: channelNames.length ? `${plural(channelNames.length, "canal desconectado", "canais desconectados")}: ${channelNames.join(", ")}` : "Nenhum canal conectado" },
    { i: "key-round", l: inv?.keys == null ? "Chaves de API" : inv.keys.length ? `Chaves: ${inv.keys.join(", ")}` : "Nenhuma chave salva" },
  ];
}
