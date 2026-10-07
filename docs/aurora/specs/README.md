# Specs do Hermes Aurora — como trabalhamos

Origem: auditoria completa de QA (07/10/2026) pedida pelo dono do produto. Objetivo: painel que ele
instala nas VPS para gerenciar os sistemas **e distribui para outras pessoas** — então tudo precisa
ser claro para quem nunca viu o Hermes, em português, e honesto (nada promete o que não faz).

Fora de escopo agora: **layout de celular** (decisão do dono, 07/10/2026).

## Arquivos

| Arquivo | O que é |
|---|---|
| `../PROGRESS.md` | Estado de cada critério. Fonte única do "onde estamos". |
| `01-conversa.md` | Conversa e Sessões sólidas |
| `02-primeiro-uso.md` | Assistente de setup e padrões seguros |
| `03-portugues-clareza.md` | Tudo em português, sem jargão, só o relevante à vista |
| `04-verdade.md` | Atividade, saúde e números que batem com a realidade |
| `05-promessas.md` | Cortar ou entregar o que hoje só promete |
| `06-acabamento.md` | Avisos, confirmações, rolagem, detalhes visuais |

## Ciclo de cada spec

1. **Fazer** — implementar todos os critérios do spec (código + teste automático quando houver lógica).
2. **Validar no Chrome** — um agente de QA abre o painel pelo Claude in Chrome e verifica **cada
   critério** do spec, um por um, registrando ✅/❌ com evidência (o que fez, o que viu).
3. **Corrigir** — todo ❌ volta para o passo 1. Repetir até 100% ✅.
4. **Validação do dono** — PR aberto com o resumo e as evidências; o dono testa e aprova (merge) ou
   devolve com comentários, que viram novos critérios.
5. **Atualizar** `PROGRESS.md` em cada passo (status + data + PR).

Status usados: `⬜ a fazer` · `🔧 em andamento` · `🧪 em validação` · `✅ validado` · `👀 aguardando dono` · `🏁 aprovado`.

## Regras para o agente de QA

- Só `http://127.0.0.1:9119`. Aba nova. Não mexer em credenciais, gateway, modelo, provedor.
- Dados de teste com prefixo `QA ` e removidos no fim. No máximo 2 mensagens na Conversa por rodada
  (crédito de API real).
- Relatar só o observado. Cada critério: ✅ ou ❌ + evidência curta.

## Regras de produto (valem para todos os specs)

- **Português do Brasil** em todo texto visível. Termo técnico só quando não há equivalente, e com explicação.
- **Nada de beco sem saída**: estado vazio sempre diz o que fazer e tem o botão para isso.
- **Honestidade**: se não funciona ainda, não aparece (ou aparece desabilitado com o porquê).
- **Ação em nome do usuário** passa pelo kill switch e vira Atividade.
