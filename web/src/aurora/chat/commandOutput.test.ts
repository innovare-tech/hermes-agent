import { describe, expect, it } from "vitest";
import { cmdName, commandError, parseCommandOutput, ptConfirm, ptNumbers, ptWarning, withWarning } from "./commandOutput";

// Textos reais do gateway (inglês, formato de terminal).
const STATUS = "Hermes TUI Status\n\nSession ID: 20261009_161220_4c21a4\nPath: ~/AppData/Local/hermes\nModel: gemini-3.8-flash (gemini)\nCreated: 2026-10-09 16:12\nLast Activity: 2026-10-09 16:12\nTokens: 0\nAgent Running: No";
const USAGE = "Session Token Usage\n────────────────────────────────────────\nModel: gemini-3.8-flash\nInput tokens:                 1,200\nOutput tokens:                340\nPrompt tokens:                1,200\nCompletion tokens:            340\nTotal tokens:                 1,540\nAPI calls:                    3\nCurrent context:              ~18,894 / 1,048,576 (~2%)\nMessages:                     6\nCompressions:                 0";

describe("parseCommandOutput", () => {
  it("/status vira cartão em português com o texto original guardado", () => {
    const c = parseCommandOutput("/status", STATUS);
    expect(c).toMatchObject({ kind: "card", title: "Estado da conversa" });
    expect(c.lines).toEqual(["Modelo: gemini-3.8-flash (gemini)", "Tokens usados: 0", "Respondendo agora: não", "Criada em: 2026-10-09 16:12", "Última atividade: 2026-10-09 16:12"]);
    expect(c.raw).toBe(STATUS);
  });

  it("/usage", () => {
    const c = parseCommandOutput("/usage", USAGE);
    expect(c.title).toBe("Uso de tokens desta conversa");
    expect(c.lines).toContain("Entrada: 1.200");
    expect(c.lines).toContain("Total: 1.540");
    expect(c.lines).toContain("Contexto agora: ~18.894 / 1.048.576 (~2%)");
  });

  it("/reasoning: consulta e troca", () => {
    const q = parseCommandOutput("/reasoning", "  Reasoning effort:  high\n  Reasoning display: off (clamped to 10 lines)\n  Usage: /reasoning <none|minimal|low|medium|high|xhigh|max|ultra|show|hide|full|clamp> [--global]");
    expect(q).toMatchObject({ title: "Esforço de raciocínio: alto", lines: ["Mostrar o pensamento nas respostas: desligado"] });
    const set = parseCommandOutput("/reasoning xhigh", "  ✓ Reasoning effort set to 'xhigh' (this session — use --global to persist)");
    expect(set).toMatchObject({ title: "Esforço de raciocínio: muito alto", lines: ["Vale só para esta conversa."] });
  });

  it("/fast sem suporte do modelo", () => {
    const c = parseCommandOutput("/fast", "  (._.) /fast is only available for models that support fast mode (OpenAI Priority Processing or Anthropic Fast Mode).");
    expect(c).toMatchObject({ icon: "zap", title: "Modo rápido indisponível" });
  });

  it("/undo, /compress e /title", () => {
    expect(parseCommandOutput("/undo", "↶ Undid 1 turn (2 message(s)). Edit and resubmit, or send a new message.").title).toBe("Voltou 1 pergunta");
    expect(parseCommandOutput("/undo 3", "↶ Undid 3 turns (6 message(s)). Edit.").title).toBe("Voltou 3 perguntas");
    expect(parseCommandOutput("/compress", "Compressed: 13 → 10 messages\nApprox request size: ~9,000 → ~7,000 tokens")).toMatchObject({
      title: "Conversa compactada: 13 → 10 mensagens",
      lines: ["Tamanho estimado: ~9.000 → ~7.000 tokens"],
    });
    expect(parseCommandOutput("/compact", "No changes from compression: 0 messages\nApprox request size: ~0 tokens (unchanged)").title).toBe("Nada para compactar");
    expect(parseCommandOutput("/title Teste", "  Session title queued: Teste (will be saved on first message)")).toMatchObject({ title: "Título da conversa: Teste", lines: ["Será salvo quando você enviar a primeira mensagem."] });
    expect(parseCommandOutput("/title Teste", "  Session title set: Teste").title).toBe("Título da conversa: Teste");
  });

  it("saída desconhecida vira bloco de sistema com o texto original, nunca resposta do agente", () => {
    const c = parseCommandOutput("/curator", "Curator: 3 skills pinned\n- a\n- b");
    expect(c).toMatchObject({ kind: "system", raw: "Curator: 3 skills pinned\n- a\n- b", title: "Resposta de /curator" });
    expect(parseCommandOutput("/status", "algo que não é o status").kind).toBe("system");
  });

  it("saída vazia: comando executado", () => {
    expect(parseCommandOutput("/stop", "")).toMatchObject({ kind: "system", title: "/stop executado" });
  });

  it("apelidos: /ctx e /compact", () => {
    expect([cmdName("/CTX"), cmdName("/compact now"), cmdName("reasoning high")]).toEqual(["context", "compress", "reasoning"]);
  });
});

describe("commandError", () => {
  it("erros do gateway em português", () => {
    expect(commandError("/undo", "no user messages to undo")).toMatchObject({ kind: "error", title: "Nada para desfazer" });
    expect(commandError("/retry", "retry cannot safely reconstruct or combine attached media").lines?.[0]).toMatch(/anexos/);
    expect(commandError("/model x", "Hermes is busy: turn in progress").title).toBe("O Hermes está respondendo");
    expect(commandError("/zzz", "boom").title).toBe("Não consegui rodar /zzz");
  });
});

describe("números no formato brasileiro", () => {
  it("vírgula de milhar do inglês vira ponto", () => {
    expect(ptNumbers("Entrada: 85,903")).toBe("Entrada: 85.903");
    expect(ptNumbers("20,508 / 1,048,576")).toBe("20.508 / 1.048.576");
    expect(ptNumbers("~22,097 → ~21,519 tokens")).toBe("~22.097 → ~21.519 tokens");
    expect(ptNumbers("a, b, 12 e 1,5")).toBe("a, b, 12 e 1,5");
  });
  it("nos cartões de /usage e /compress", () => {
    const u = parseCommandOutput("/usage", "Session Token Usage\nInput tokens:  85,903\nTotal tokens:  90,000\nCurrent context:  20,508 / 1,048,576 (~2%)");
    expect(u.lines).toContain("Entrada: 85.903");
    expect(u.lines).toContain("Contexto agora: 20.508 / 1.048.576 (~2%)");
    expect(parseCommandOutput("/compress", "Compressed: 13 → 10 messages\nApprox request size: ~22,097 → ~21,519 tokens").lines).toEqual(["Tamanho estimado: ~22.097 → ~21.519 tokens"]);
  });
});

describe("/model", () => {
  const NOTE = "Note: `gemini-9` was not found in the Google AI Studio curated catalog and the /models endpoint was unreachable. The model may still work if it exists on the provider.";
  it("a nota de modelo fora do catálogo vira aviso âmbar em português", () => {
    expect(ptWarning(NOTE)).toBe("Atenção: **gemini-9** não está no catálogo deste provedor e não deu para conferir. Se o nome estiver errado, a próxima mensagem vai falhar.");
    expect(ptWarning("Note: `x` was not found in the live /v1/models listing but exists in the curated catalog — accepted.")).toMatch(/está no catálogo/);
    expect(ptWarning("outro aviso")).toBe("outro aviso");
  });
  it("o cartão mantém 'Modelo da conversa: X' e ganha o aviso", () => {
    const c = withWarning(parseCommandOutput("/model gemini-9", "Modelo da conversa: gemini-9"), NOTE);
    expect(c).toMatchObject({ kind: "card", title: "Modelo da conversa: gemini-9" });
    expect(c.warn).toMatch(/^Atenção: \*\*gemini-9\*\*/);
    expect(c.lines).toEqual([]);
    expect(parseCommandOutput("/model x", "Modelo da conversa: x (vale a partir da próxima mensagem)").lines).toEqual(["Vale a partir da próxima mensagem."]);
    expect(withWarning(parseCommandOutput("/model x", "Modelo da conversa: x"), "").warn).toBeUndefined();
  });
});

describe("/title e outras mensagens de comando", () => {
  it("título repetido", () => {
    const msg = "Title 'Teste QA' is already in use by session 20261009_161220_4c21a4";
    expect(commandError("/title Teste QA", msg)).toMatchObject({ kind: "error", title: "Título já em uso", lines: ["Já existe uma conversa com o título “Teste QA”. Escolha outro."] });
    expect(parseCommandOutput("/title Teste QA", msg).lines).toEqual(["Já existe uma conversa com o título “Teste QA”. Escolha outro."]);
  });
  it("outras mensagens óbvias", () => {
    expect(commandError("/title x", "Title too long (140 chars, max 100)").lines).toEqual(["O título tem 140 caracteres; o máximo é 100."]);
    expect(commandError("/queue", "usage: /queue <prompt>").lines).toEqual(["Faltou o texto depois de /queue."]);
    expect(commandError("/x", "empty command").lines?.[0]).toMatch(/Digite/);
  });
});

describe("confirmação de troca de modelo", () => {
  it("contexto grande", () => {
    const c = ptConfirm("!!! LARGE CONTEXT MODEL SWITCH !!!\n\nThis session holds ~171,345 tokens of context.\nSwitching to gemini-3.8-flash makes the next reply re-read all of it uncached.\n\nConfirm only if you intend to switch now.");
    expect(c).toEqual({ title: "Trocar de modelo agora?", body: "Esta conversa tem cerca de 171.345 tokens de contexto. Trocar para gemini-3.8-flash faz a próxima resposta reler tudo sem cache, o que custa mais. Confirme só se quiser trocar agora." });
  });
  it("modelo caro, e as duas juntas", () => {
    const exp = "!!! EXPENSIVE MODEL WARNING !!!\n\ngpt-9-pro has known pricing above Hermes' safety threshold.\nInput tokens: $30.00/M\nOutput tokens: $120.00/M\nConfirm only if you intend to use this model.";
    expect(ptConfirm(exp)).toEqual({ title: "Este modelo é caro", body: "O modelo gpt-9-pro custa mais que o limite de segurança do Hermes (entrada $30,00/M e saída $120,00/M). Confirme só se quiser usá-lo." });
    const both = ptConfirm(exp + "\n\n!!! LARGE CONTEXT MODEL SWITCH !!!\n\nThis session holds ~2,000 tokens.\nSwitching to x makes the next reply re-read");
    expect(both.body).toMatch(/2\.000 tokens[\s\S]*gpt-9-pro/);
  });
  it("texto desconhecido passa como veio; troca cancelada vira cartão", () => {
    expect(ptConfirm("Algo novo").body).toBe("Algo novo");
    expect(commandError("/model x", "Troca de modelo cancelada").title).toBe("Troca de modelo cancelada");
  });
});
