import { describe, expect, it } from "vitest";
import { logFrom } from "./live";

describe("logFrom", () => {
  it("separa hora, nível, origem e mensagem", () => {
    expect(logFrom("2026-10-07 14:03:11,512 WARNING gateway.platforms.discord: latência alta (840ms)", 0)).toEqual({ id: "0", t: "14:03:11", level: "WARN", src: "discord", msg: "latência alta (840ms)" });
    expect(logFrom("2026-10-07 14:03:12,001 ERROR agent.loop: timeout ao abrir página", 1)).toMatchObject({ level: "ERRO", src: "loop" });
  });

  it("linha com [sessão] não duplica o nível na mensagem", () => {
    expect(logFrom("2026-10-07 18:38:09,232 INFO [20261007_183751_cada95] agent.conversation_loop: API call #3", 3)).toMatchObject({ t: "18:38:09", level: "INFO", src: "conversation_loop", msg: "API call #3" });
  });

  it("linha fora do formato vira só mensagem", () => {
    expect(logFrom("Traceback (most recent call last):", 2)).toMatchObject({ t: "", src: "", msg: "Traceback (most recent call last):" });
  });
});
