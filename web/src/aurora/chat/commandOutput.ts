// Saída dos comandos "/" (texto de terminal, em inglês) → cartões curtos em português.
// Quem não reconhecemos vira bloco de sistema discreto com o texto original — nunca "resposta do agente".
import type { CommandCard } from "./types";

export const EFFORT_PT: Record<string, string> = { none: "desligado", minimal: "mínimo", low: "baixo", medium: "médio", high: "alto", xhigh: "muito alto", max: "máximo", ultra: "ultra" };

const ALIAS: Record<string, string> = { compact: "compress", ctx: "context", v: "version", upgrade: "subscription" };

/** "/Reasoning high" → "reasoning". */
export const cmdName = (cmd: string) => {
  const n = cmd.trim().replace(/^\//, "").split(/\s+/)[0]?.toLowerCase() ?? "";
  return ALIAS[n] ?? n;
};

/** Linhas "Chave: valor" (ignora as sem dois-pontos). */
function pairs(output: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const m = line.match(/^\s*([A-Za-z][\w .]*?):\s+(.+?)\s*$/);
    if (m && !(m[1] in out)) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

const yn = (v?: string) => (!v ? "—" : /^(yes|true|on)$/i.test(v) ? "sim" : /^(no|false|off)$/i.test(v) ? "não" : v);

const system = (cmd: string, output: string): CommandCard => ({ kind: "system", icon: "info", title: "Resposta de " + (cmd.trim().split(/\s+/)[0] || "/comando"), raw: output.trim() });

export function parseCommandOutput(cmd: string, output: string): CommandCard {
  const text = output.replace(/\r/g, "").trim();
  if (!text) return { kind: "system", icon: "check", title: `${cmd.trim().split(/\s+/)[0]} executado` };
  const name = cmdName(cmd);
  const kv = pairs(text);
  let m: RegExpMatchArray | null;

  switch (name) {
    case "status":
      if (!/^\s*hermes\b.*status/i.test(text.split("\n")[0]) && !kv.model) break;
      return {
        kind: "card",
        icon: "gauge",
        title: "Estado da conversa",
        lines: [kv.model && `Modelo: ${kv.model}`, kv.tokens && `Tokens usados: ${kv.tokens}`, kv["agent running"] && `Respondendo agora: ${yn(kv["agent running"])}`, kv.created && `Criada em: ${kv.created}`, kv["last activity"] && `Última atividade: ${kv["last activity"]}`].filter(Boolean) as string[],
        raw: text,
      };

    case "usage":
      if (!/token usage/i.test(text) && !kv["total tokens"]) break;
      return {
        kind: "card",
        icon: "coins",
        title: "Uso de tokens desta conversa",
        lines: [
          kv.model && `Modelo: ${kv.model}`,
          kv["input tokens"] && `Entrada: ${kv["input tokens"]}`,
          kv["output tokens"] && `Saída: ${kv["output tokens"]}`,
          kv["reasoning tokens"] && `Raciocínio: ${kv["reasoning tokens"]}`,
          kv["total tokens"] && `Total: ${kv["total tokens"]}`,
          kv["api calls"] && `Chamadas ao modelo: ${kv["api calls"]}`,
          kv["current context"] && `Contexto agora: ${kv["current context"]}`,
          kv.compressions && kv.compressions !== "0" && `Compactações: ${kv.compressions}`,
        ].filter(Boolean) as string[],
        raw: text,
      };

    case "reasoning": {
      // "Reasoning effort:  high" (consulta) ou "✓ Reasoning effort set to 'high' (this session …)".
      const set = text.match(/effort set to ['"]?([a-z]+)['"]?/i);
      const cur = kv["reasoning effort"];
      const level = (set?.[1] ?? cur ?? "").toLowerCase();
      if (level) {
        const lines: string[] = [];
        if (set) lines.push(/use --global/i.test(text) ? "Vale só para esta conversa." : "Salvo como padrão do Hermes.");
        const disp = kv["reasoning display"];
        if (disp) lines.push(`Mostrar o pensamento nas respostas: ${/^off/i.test(disp) ? "desligado" : "ligado"}`);
        return { kind: "card", icon: "brain", title: `Esforço de raciocínio: ${EFFORT_PT[level] ?? level}`, lines, raw: text };
      }
      if ((m = text.match(/reasoning display[^\n]*\b(show|hide|on|off|full|clamp)\w*/i))) {
        const on = /show|on|full/i.test(m[1]);
        return { kind: "card", icon: "brain", title: `Pensamento nas respostas: ${on ? "visível" : "oculto"}`, raw: text };
      }
      break;
    }

    case "fast":
      if (/only available|not available|unavailable|isn.t available/i.test(text)) return { kind: "card", icon: "zap", title: "Modo rápido indisponível", lines: ["Este modelo não tem modo rápido (só alguns modelos da OpenAI, da Anthropic e da xAI têm)."], raw: text };
      if ((m = text.match(/\b(fast|priority|ultrafast|normal|off|on|auto|cold)\b/i))) {
        const on = /fast|priority|ultrafast|on|auto|cold/i.test(m[1]);
        return { kind: "card", icon: "zap", title: `Modo rápido: ${on ? "ligado" : "desligado"}`, raw: text };
      }
      break;

    case "undo":
    case "retry":
      if ((m = text.match(/Undid (\d+) turns?(?: \((\d+) message)?/i)))
        return { kind: "card", icon: "undo-2", title: `Voltou ${m[1]} ${m[1] === "1" ? "pergunta" : "perguntas"}`, lines: ["O texto voltou para o campo de mensagem — edite e envie de novo, ou escreva outra coisa."], raw: text };
      break;

    case "compress":
      if ((m = text.match(/Compressed(?: with fallback)?: (\d+) → (\d+) messages?/i))) {
        const tok = text.match(/request size: (.+)/i)?.[1];
        const lines = [tok && `Tamanho estimado: ${tok.replace(/\btokens\b/, "tokens")}`, /fallback/i.test(text) && "O resumo falhou e o Hermes usou um contexto reduzido de emergência."].filter(Boolean) as string[];
        return { kind: "card", icon: "layers", title: `Conversa compactada: ${m[1]} → ${m[2]} mensagens`, lines, raw: text };
      }
      if ((m = text.match(/No changes from compression: (\d+) messages?/i))) return { kind: "card", icon: "layers", title: "Nada para compactar", lines: [`A conversa tem ${m[1]} ${m[1] === "1" ? "mensagem" : "mensagens"} e já está enxuta.`], raw: text };
      if ((m = text.match(/Compression aborted: (\d+) messages?/i))) return { kind: "card", icon: "layers", title: "Não consegui compactar", lines: [`As ${m[1]} mensagens foram mantidas — o resumo falhou. Tente de novo ou troque de modelo.`], raw: text };
      if (/no active session/i.test(text)) return { kind: "card", icon: "layers", title: "Nada para compactar", lines: ["Comece a conversa primeiro."], raw: text };
      break;

    case "title":
      if ((m = text.match(/title (set|queued):\s*(.+?)(?:\s*\(will be saved[^)]*\))?\s*$/im))) {
        return { kind: "card", icon: "pencil", title: `Título da conversa: ${m[2]}`, lines: m[1].toLowerCase() === "queued" ? ["Será salvo quando você enviar a primeira mensagem."] : [], raw: text };
      }
      break;

    case "model":
      if ((m = text.match(/Current model:\s*(.+)/i))) return { kind: "card", icon: "cpu", title: `Modelo atual: ${m[1].replace(/^\(unknown\)$/, "não definido")}`, lines: ["Para trocar, use o seletor de modelo no campo de mensagem."], raw: text };
      break;

    case "help":
      return { kind: "card", icon: "circle-help", title: "Comandos", lines: ["Digite / no campo de mensagem para ver a lista, com busca."], raw: text };

    case "version":
      if ((m = text.match(/Hermes Agent\s+(v?[\w.\-+]+)/i))) return { kind: "card", icon: "info", title: `Hermes ${m[1]}`, raw: text };
      break;
  }
  return system(cmd, text);
}

/** Erro do `slash.exec` (JSON-RPC) → cartão. */
export function commandError(cmd: string, message: string): CommandCard {
  const name = cmdName(cmd);
  const msg = message.trim();
  let title = "Não consegui rodar " + (cmd.trim().split(/\s+/)[0] || "o comando");
  let line = msg;
  if (/no user messages to undo|no previous user message/i.test(msg)) {
    title = name === "retry" ? "Nada para refazer" : "Nada para desfazer";
    line = "Ainda não há perguntas nesta conversa.";
  } else if (/busy|running|while.*turn|in progress/i.test(msg)) {
    title = "O Hermes está respondendo";
    line = "Espere a resposta terminar ou clique em Parar, e tente de novo.";
  } else if (/unknown (slash )?command|not a command|no such command/i.test(msg)) {
    title = "Comando desconhecido";
    line = "Digite / para ver os comandos disponíveis.";
  } else if (/attached media|attachment/i.test(msg)) {
    line = "Não dá para refazer uma mensagem com anexos. Envie de novo com os anexos.";
  }
  return { kind: "error", icon: "circle-alert", title, lines: [line], raw: msg === line ? undefined : msg };
}
