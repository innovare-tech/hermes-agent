import { describe, expect, it } from "vitest";
import { approvalCopy } from "./approvalCopy";
import { classifyError, failedTurnError, isErrorText, isFailedTurnText, modelFromText, stripFailedTurn } from "./errors";

describe("classifyError", () => {
  it("modelo inexistente (o caso do Gemini 404) vira cartão em português", () => {
    const e = classifyError("⚠ Gemini HTTP 404 (NOT_FOUND): models/gemini-9-flash is not found for API version v1beta");
    expect(e).toMatchObject({ kind: "model", title: "O modelo gemini-9-flash não existe neste provedor", body: "Escolha outro modelo para continuar.", retryable: false, switchModel: true });
    expect(e.detail).toBe("Gemini HTTP 404 (NOT_FOUND): models/gemini-9-flash is not found for API version v1beta");
  });
  it("o código do gateway vence o texto", () => {
    expect(classifyError("qualquer coisa", { code: "rate_limit" }).kind).toBe("limit");
    expect(classifyError("qualquer coisa", { code: "auth" }).kind).toBe("key");
    expect(classifyError("x", { code: "billing" }).kind).toBe("billing");
    expect(classifyError("x", { code: "timeout" })).toMatchObject({ kind: "network", retryable: true, switchModel: false });
    expect(classifyError("x", { code: "context_overflow" }).kind).toBe("context");
  });
  it("sem código, reconhece pelo texto do provedor", () => {
    expect(classifyError("HTTP 429: quota exceeded").kind).toBe("limit");
    expect(classifyError("401 Unauthorized: invalid API key").kind).toBe("key");
    expect(classifyError("Connection timed out").kind).toBe("network");
    expect(classifyError("algo estranho").kind).toBe("other");
  });
  it("o gateway pode dizer se vale tentar de novo", () => {
    expect(classifyError("x", { code: "server_error", retryable: false }).retryable).toBe(false);
  });
  it("auxiliares", () => {
    expect(isErrorText("⚠ falhou")).toBe(true);
    expect(isErrorText("tudo certo")).toBe(false);
    expect(modelFromText("The model `gpt-9` does not exist")).toBe("gpt-9");
  });
});

describe("approvalCopy", () => {
  it("execute_code em português, com o original guardado", () => {
    const c = approvalCopy("execute_code script execution. The script can spawn subprocesses or mutate files without passing through terminal command approval; approval is one-shot for this run.", "execute_code");
    expect(c.title).toBe("Executar um script de código");
    expect(c.why).toMatch(/script/);
    expect(c.original).toMatch(/^execute_code script execution/);
  });
  it("comandos perigosos conhecidos e o padrão genérico", () => {
    expect(approvalCopy("git force push (rewrites remote history)").title).toBe("Mudança destrutiva no git");
    expect(approvalCopy("recursive delete").title).toBe("Apagar arquivos ou pastas");
    expect(approvalCopy("something nobody mapped").title).toBe("Executar um comando");
  });
});

describe("turno sem resposta no histórico", () => {
  const NOTICE = "Your request was not processed. Send it again if you still want me to carry it out.";
  it("reconhece o aviso do backend e as variações", () => {
    expect(isFailedTurnText(NOTICE)).toBe(true);
    expect(isFailedTurnText("Your message was not processed.")).toBe(true);
    expect(isFailedTurnText("This turn did not complete. Some actions may already have run; verify their effects before resending.")).toBe(true);
    expect(isFailedTurnText("Seu pedido foi processado")).toBe(false);
    expect(stripFailedTurn("Comecei a ver.\n\n" + NOTICE)).toBe("Comecei a ver.");
    expect(stripFailedTurn(NOTICE)).toBe("");
  });
  it("vira cartão em português, com o original no detalhe e 'Tentar de novo'", () => {
    expect(failedTurnError(NOTICE)).toMatchObject({ title: "Esta pergunta não foi respondida", body: "Envie de novo se ainda quiser.", detail: NOTICE, retryable: true, switchModel: false });
    expect(failedTurnError("This turn did not complete. Some actions may already have run.").title).toBe("Este turno não terminou");
  });
});
