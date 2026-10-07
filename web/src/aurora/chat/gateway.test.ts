import { describe, expect, it, vi } from "vitest";

// Cliente falso: guarda o handler de estado para simular a queda da conexão.
const fake = vi.hoisted(() => ({ state: null as null | ((s: string) => void) }));
vi.mock("@/lib/gatewayClient", () => ({
  GatewayClient: class {
    connect = async () => {};
    request = async (method: string) => (method === "session.resume" ? { session_id: "live1" } : {});
    on = () => () => {};
    onRequest = () => () => {};
    onState = (h: (s: string) => void) => {
      fake.state = h;
      return () => {};
    };
  },
}));
vi.mock("@/lib/api", () => ({ api: {} }));

const { gatewayChat } = await import("./gateway");

describe("send", () => {
  it("conexão caiu no meio do turno → erro e a promessa termina", async () => {
    const events: { type: string }[] = [];
    const turn = gatewayChat.send("s1", "oi", (e) => events.push(e));
    await vi.waitFor(() => expect(fake.state).not.toBeNull());
    fake.state!("closed");
    await turn;
    expect(events).toEqual([expect.objectContaining({ type: "error", message: expect.stringMatching(/conexão/) })]);
  });
});
