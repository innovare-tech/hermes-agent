import { describe, expect, it } from "vitest";
import { formatPhone, parsePhone, personName, sortParticipants, teamBody, teamBodyFromPhone, teamIdFor, type Participant, type TeamMember } from "./team";

const P = (o: Partial<Participant>): Participant => ({ id: "1@s.whatsapp.net", jid: "5511911110000@s.whatsapp.net", phone: "5511911110000", lid: null, admin: null, name: null, photo: null, key: "5511911110000", team: false, ...o });

describe("formatPhone / personName", () => {
  it("formata número brasileiro e deixa os outros só com +", () => {
    expect(formatPhone("5511912345678")).toBe("+55 (11) 91234-5678");
    expect(formatPhone("551133334444")).toBe("+55 (11) 3333-4444");
    expect(formatPhone("14155550123")).toBe("+14155550123");
    expect(formatPhone(null)).toBe("");
  });
  it("nome > número formatado > chave", () => {
    expect(personName(P({ name: " Ana " }))).toBe("Ana");
    expect(personName(P({ name: null }))).toBe("+55 (11) 91111-0000");
    expect(personName(P({ name: null, phone: null, key: "abc@lid" }))).toBe("abc@lid");
  });
});

describe("sortParticipants", () => {
  it("equipe primeiro, depois ordem alfabética, sem mutar a lista", () => {
    const list = [P({ key: "a", name: "Zeca" }), P({ key: "b", name: "Ana" }), P({ key: "c", name: "Carlos", team: true }), P({ key: "d", name: "Bia", team: true })];
    const out = sortParticipants(list);
    expect(out.map((p) => p.name)).toEqual(["Bia", "Carlos", "Ana", "Zeca"]);
    expect(list[0].name).toBe("Zeca");
  });
  it("o próprio Hermes (self) vai para o fim, mesmo sendo da equipe", () => {
    const out = sortParticipants([P({ key: "h", name: "Hermes", self: true, team: true }), P({ key: "a", name: "Zeca" }), P({ key: "x", phone: "5511999990000" })]);
    expect(out.map((p) => p.key)).toEqual(["a", "x", "h"]);
  });
  it("quem só tem número fica depois de quem tem nome", () => {
    const out = sortParticipants([P({ key: "x", phone: "5511999990000" }), P({ key: "y", name: "Ana" })]);
    expect(out.map((p) => p.key)).toEqual(["y", "x"]);
  });
});

describe("teamBody", () => {
  it("id = número, aliases = jid/lid/id sem repetir nem vazios, foto só se houver", () => {
    const b = teamBody(P({ lid: "99@lid", name: "Ana", photo: "https://x/y.jpg", id: "99@lid" }));
    expect(b).toEqual({ id: "5511911110000", name: "Ana", aliases: ["5511911110000@s.whatsapp.net", "99@lid"], photo: "https://x/y.jpg" });
  });
  it("sem número usa a chave e não manda foto nula", () => {
    const b = teamBody(P({ phone: null, jid: null, lid: "7@lid", id: "7@lid", key: "7@lid" }));
    expect(b).toEqual({ id: "7@lid", name: "7@lid", aliases: ["7@lid"] });
    expect("photo" in b).toBe(false);
  });
});

describe("número digitado", () => {
  it("aceita 10 a 15 dígitos, ignora espaços, + e traços", () => {
    expect(parsePhone("+55 (11) 91234-5678")).toBe("5511912345678");
    expect(parsePhone("1234567890")).toBe("1234567890");
  });
  it("recusa curto, longo e letras", () => {
    expect(parsePhone("123456789")).toBeNull();
    expect(parsePhone("1234567890123456")).toBeNull();
    expect(parsePhone("55119abc45678")).toBeNull();
    expect(parsePhone("")).toBeNull();
  });
  it("monta o corpo com nome opcional", () => {
    expect(teamBodyFromPhone("5511912345678")).toEqual({ id: "5511912345678", name: "+55 (11) 91234-5678", aliases: ["5511912345678"] });
    expect(teamBodyFromPhone("5511912345678", " Ana ").name).toBe("Ana");
  });
});

describe("teamIdFor", () => {
  const team: TeamMember[] = [{ id: "ana", name: "Ana", aliases: ["99@lid"], photo: null, added_at: 1 }];
  it("acha a entrada pelo alias; senão usa número ou chave", () => {
    expect(teamIdFor(P({ lid: "99@lid" }), team)).toBe("ana");
    expect(teamIdFor(P({}), team)).toBe("5511911110000");
    expect(teamIdFor(P({ phone: null, key: "k" }), [])).toBe("k");
  });
});
