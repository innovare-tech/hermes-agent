import { describe, expect, it } from "vitest";
import { cmdName, commandError, parseCommandOutput } from "./commandOutput";

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
    expect(c.lines).toContain("Entrada: 1,200");
    expect(c.lines).toContain("Total: 1,540");
    expect(c.lines).toContain("Contexto agora: ~18,894 / 1,048,576 (~2%)");
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
      lines: ["Tamanho estimado: ~9,000 → ~7,000 tokens"],
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
