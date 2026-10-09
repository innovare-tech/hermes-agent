// Equipe e participantes dos grupos: contrato com /api/ops/team e /api/ops/channels/{id}/participants,
// e a lógica pura (ordem, nome de exibição, corpo do POST, validação do número). Tudo vem do backend.
import { fetchJSON } from "@/lib/api";

export type Participant = {
  id: string;
  jid: string | null;
  phone: string | null;
  lid: string | null;
  admin: "admin" | "superadmin" | null;
  name: string | null;
  photo: string | null;
  key: string;
  team: boolean;
  /** É o próprio número do Hermes (o número de suporte que lê o grupo). */
  self?: boolean;
};
export type ParticipantsOut = { name: string; size: number; participants: Participant[] };

export type TeamMember = { id: string; name: string; aliases: string[]; photo: string | null; added_at: number };
export type TeamBody = { id: string; name: string; aliases: string[]; photo?: string };

const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export const teamApi = {
  list: () => fetchJSON<TeamMember[]>("/api/ops/team"),
  add: (body: TeamBody) => fetchJSON<unknown>("/api/ops/team", json("POST", body)),
  remove: (id: string) => fetchJSON<unknown>(`/api/ops/team/${encodeURIComponent(id)}`, json("DELETE")),
  participants: (cid: string) => fetchJSON<ParticipantsOut>(`/api/ops/channels/${encodeURIComponent(cid)}/participants`),
};

/** "5511912345678" → "+55 (11) 91234-5678"; outros países: "+" e os dígitos. Vazio se não houver número. */
export function formatPhone(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return "";
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${d}`;
}

/** Nome da pessoa; sem nome, o número formatado; sem número, a chave. */
export const personName = (p: Pick<Participant, "name" | "phone" | "key">) => p.name?.trim() || formatPhone(p.phone) || p.key;

/** Equipe primeiro; depois quem tem nome (alfabético), quem só tem número e, por último, o próprio Hermes (estável). */
export function sortParticipants(list: Participant[]): Participant[] {
  return list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(!!a.p.self) - Number(!!b.p.self) || Number(b.p.team) - Number(a.p.team) || Number(!!b.p.name?.trim()) - Number(!!a.p.name?.trim()) || personName(a.p).localeCompare(personName(b.p), "pt-BR", { sensitivity: "base" }) || a.i - b.i)
    .map((x) => x.p);
}

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

/** Corpo do POST /api/ops/team ao marcar um participante: id = número (ou a chave), aliases = jid/lid/id. */
export function teamBody(p: Participant): TeamBody {
  return { id: p.phone || p.key, name: personName(p), aliases: uniq([p.jid, p.lid, p.id]), ...(p.photo ? { photo: p.photo } : {}) };
}

/** Número digitado: tira espaços, "+", "-" e parênteses; só dígitos, de 10 a 15. null = inválido. */
export function parsePhone(input: string): string | null {
  const d = input.replace(/[\s+\-()]/g, "");
  return /^\d{10,15}$/.test(d) ? d : null;
}

/** Corpo do POST ao adicionar pelo número (nome opcional). */
export const teamBodyFromPhone = (digits: string, name = ""): TeamBody => ({ id: digits, name: name.trim() || formatPhone(digits), aliases: [digits] });

/** Id da equipe que corresponde ao participante (a entrada pode ter nascido por outro caminho); padrão: número ou chave. */
export function teamIdFor(p: Participant, team: TeamMember[]): string {
  const mine = new Set(uniq([p.phone, p.key, p.jid, p.lid, p.id]));
  const hit = team.find((m) => mine.has(m.id) || m.aliases.some((a) => mine.has(a)));
  return hit?.id ?? (p.phone || p.key);
}
