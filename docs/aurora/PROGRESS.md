# Progresso — Hermes Aurora

Processo e legenda: [`specs/README.md`](specs/README.md). Layout de celular: fora de escopo por ora.

`⬜ a fazer` · `🔧 em andamento` · `🧪 em validação` · `✅ validado no Chrome` · `👀 aguardando dono` · `🏁 aprovado`

## Resumo

| Spec | Estado | PR | Última validação |
|---|---|---|---|
| 01 Conversa e Sessões | 👀 | — | R2 07/10: 15/15 ✅ (+C1.17 novo) |
| 02 Primeiro uso | 👀 | — | R3 07/10: 9✅ (P2.10 parcial) |
| 03 Português e clareza | 👀 | — | R5 07/10: 21/21 ✅ |
| 04 Verdade | 👀 | — | R4: V4.1/V4.2 ❌ → corrigidos |
| 05 Promessas | 👀 | — | — |
| 06 Acabamento | 👀 | — | — |

## Já entregue antes dos specs
- 🏁 PRs #1–#8: telas Aurora, sem mocks, ops_center, gateway com autonomia, playbooks com horário.
- 👀 PR #9: conexões (Gateways, chaves de API), "pensando" com animação reduzida, seletor de modelo
  sólido, queda de conexão tratada, **markdown** e conexão única (corrige "Não consegui carregar as sessões").

## 01 · Conversa e Sessões
| Critério | Estado | Nota |
|---|---|---|
| C1.1 URL `/chat/<id>` após 1ª mensagem | ✅ | R2 07/10 |
| C1.2 F5 reabre a conversa | ✅ | R1 07/10 |
| C1.3 Lista de conversas na barra lateral da Conversa | ✅ | R1 07/10 |
| C1.4 Nova conversa mantém a anterior na lista | ✅ | R1 07/10 |
| C1.5 Origem Web | ✅ | R2 07/10 |
| C1.6 Filtros de origem corretos em Sessões | ✅ | R2 07/10 |
| C1.7 Contagem de mensagens e plural | ✅ | R2 07/10 |
| C1.8 Tokens/custo coerentes | ✅ | R2 07/10 |
| C1.9 Cabeçalho sem jargão | ✅ | R1 07/10 |
| C1.10 Menu "/" fecha (Esc, fora, enviar) | ✅ | R2 07/10 |
| C1.11 Menu "/" só comandos web, em PT | ✅ | R1 07/10 |
| C1.12 Modelo ativo único | ✅ | R1 07/10 |
| C1.13 Botões da resposta em PT | ✅ | R2 07/10 |
| C1.14 Saída real do passo | ✅ | R2 07/10 |
| C1.15 Passo em PT | ✅ | R1 07/10 |
| C1.17 Contagem sem mensagens internas de ferramenta | ⬜ | backend: message_count inclui ferramentas; tool_call_count não dá conta exata (várias chamadas por resposta) e session.list não tem. Precisa de contagem por papel no backend — baixa prioridade |
| C1.16 Markdown | ✅ | validado 07/10 (sessão "Exemplo com formatações diversas") |

## 02 · Primeiro uso
| Critério | Estado | Nota |
|---|---|---|
| P2.1 Passos sem corte | ✅ | R1 07/10 |
| P2.2 Chave do modelo no assistente | ✅ | R3 07/10 |
| P2.3 Credencial de canal no assistente | ✅ | R1 07/10 |
| P2.4 Passo Segurança (padrão Rascunhar) | ✅ | R1 07/10 |
| P2.5 Salvar e continuar; sem "Pular" no fim | ✅ | R1 07/10 |
| P2.6 Resumo em PT natural | ✅ | R1 07/10 |
| P2.7 Abre sozinho na 1ª vez | ✅ | R1 07/10 (parcial: não reabre com modelo configurado; 1ª vez real não testável aqui) |
| P2.8 Padrão de canal novo configurável (Rascunhar) | ✅ | R1 07/10 |
| P2.9 Texto de Aprovações | ✅ | R1 07/10 |
| P2.10 Aviso gateway parado com canal ligado | 🧪 | R3: caso sem canal ligado ok; caso com canal ligado não testável sem credencial |

## 03 · Português e clareza
| Critério | Estado | Nota |
|---|---|---|
| T3.1 Canais principais em PT | ✅ | R5 07/10 |
| T3.2 Campo de lista coerente | ✅ | R4 07/10 |
| T3.3 Dependentes em avançado | ✅ | R4 07/10 |
| T3.4 Ordem por relevância + "Outros" | ✅ | R4 07/10 |
| T3.5 Cartão clicável; busca vazia | ✅ | R5 07/10 |
| T3.6 Motivo do "Testar" desabilitado | ✅ | R4 07/10 |
| T3.7 Chaves: só relevantes por padrão | ✅ | R4 07/10 |
| T3.8 Nome amigável da chave | ✅ | R4 07/10 |
| T3.9 "termina em …" | ✅ | R4 07/10 |
| T3.10 Conectado via login | ✅ | R4 07/10 |
| T3.11 Lista não prende rolagem | ✅ | R4 07/10 |
| T3.12 Ferramentas em PT | ✅ | R4 07/10 |
| T3.13 Ferramenta sem config sinalizada | ✅ | R4 07/10 |
| T3.14 Skills: busca | ✅ | R4 07/10 |
| T3.15 Skills: origem honesta | ✅ | R4 07/10 |
| T3.16 Skills: detalhe + ligar/desligar | ✅ | R4 07/10 |
| T3.17 Skills: descrições não-PT | ✅ | R4 07/10 |
| T3.18 lang pt-BR e título da aba | ✅ | R3 07/10 |
| T3.19 Ctrl K / ⌘K | ✅ | R3 07/10 |
| T3.20 Sem jargão visível | ✅ | R5 07/10 |
| T3.21 Contadores com unidade | ✅ | R3 07/10 |

## 04 · Verdade
| Critério | Estado | Nota |
|---|---|---|
| V4.1 Atividade automática no backend | ✅ | R5 07/10 |
| V4.2 O quê/quando/por quê/desfazer | ✅ | R5 07/10 |
| V4.3 Filtros só do que existe | ✅ | R3 07/10 |
| V4.4 Saúde real | ✅ | R4 07/10 |
| V4.5 Avisos graves no Painel | ✅ | R6 07/10 |
| V4.6 Períodos corretos | ✅ | R5 07/10 |
| V4.7 "US$ 0,16" | ✅ | R3 07/10 |
| V4.8 Filtro por negócio | ✅ | R6 07/10 |
| V4.9 Zero neutro, sem traço solto | ✅ | R3 07/10 |
| V4.10 Briefing cria agendamento | ✅ | R5 07/10 |
| V4.11 Logs: busca e download | ✅ | R5 07/10 |
| V4.12 Logs: sem duplicação; vazio | ✅ | R6 07/10 |
| V4.13 Logs: ruído agrupado | ✅ | R5 07/10 |

## 05 · Promessas
| Critério | Estado | Nota |
|---|---|---|
| E5.1 Suporte fora do menu | ✅ | R4 07/10 |
| E5.2 Pendências reais | ✅ | R5 07/10 |
| E5.3 Identificadores do contato | ✅ | R5 07/10 |
| E5.4 Histórico do contato | ✅ | R5 07/10 |
| E5.5 Validação e campos vazios | ✅ | R5 07/10 |
| E5.6 Vazio com filtro | ✅ | R5 07/10 |
| E5.7 Tipo de gatilho explícito | ✅ | R6 07/10 |
| E5.8 Gatilho por palavra-chave funciona | ✅ | R6 07/10 (salvar/Atividade no painel; disparo real coberto por teste automático — falta testar com canal real) |
| E5.9 Playbook nasce desligado | ✅ | R4 07/10 |
| E5.10 Nome separado do gatilho | ✅ | R4 07/10 |
| E5.11 Condição/placeholder/feedback | ✅ | R5 07/10 |
| E5.12 Ajuda de horário em PT | ✅ | R6 07/10 |
| E5.13 Agendamentos: vazio + aviso | ✅ | R5 07/10 |
| E5.14 "Agendar" vazio | ✅ | R5 07/10 |
| E5.15 Subagentes: vazio útil | ✅ | R5 07/10 |
| E5.16 Sessões: renomear/apagar | ✅ | R5 07/10 |
| E5.17 Memória: filtro vazio | ✅ | R3 07/10 |
| E5.18 Anexar/Voz funcionam ou somem | ✅ | R5 07/10 |

## 06 · Acabamento
| Critério | Estado | Nota |
|---|---|---|
| A6.1 Toasts no canto | ✅ | R3 07/10 — canto inferior direito, empilham, somem; podem passar sobre um valor de cartão (não títulos/faixas) |
| A6.2 Diálogo de confirmação próprio | ✅ | R3 07/10 |
| A6.3 Chips estáveis | ✅ | R3 07/10 |
| A6.4 Barra lateral: só a lista rola | ✅ | R5 07/10 |
| A6.5 Pausa: um "Retomar"; confirmação | ✅ | R3 07/10 |
| A6.6 Configurações alinhada | ✅ | R3 07/10 |
| A6.7 Datas em uma linha | ✅ | R3 07/10 |
| A6.8 "Congelar rolagem" nos Logs | ✅ | R3 07/10 |
| A6.9 Radar: botão + dica | ✅ | R3 07/10 |
| A6.10 Cabeçalho da barra lateral | ✅ | R3 07/10 |

## Diário
- **07/10/2026** — R6 (final): todos os critérios testados ✅. Pendentes: C1.17 (contagem precisa de backend), P2.10 com canal ligado e E5.8 com mensagem real (precisam de credencial de canal). Aguardando validação do dono.
- **07/10/2026** — R5: 21✅ 2❌ (V4.12, E5.12) → corrigidos. Gatilho por palavra-chave (E5.7/E5.8), avisos graves no Painel (V4.5) e escopo de custo (V4.8) implementados.
- **07/10/2026** — R4: 13✅ 5❌ (skill na Atividade, Desfazer, textos de canais, clique no cartão, jargão) → corrigidos. Logs, Pessoas, Sessões, Agendamentos, Subagentes implementados.
- **07/10/2026** — R3: 18✅ 3❌ (A6.4, V4.4, P2.10 parcial) → corrigidos. Spec 03 implementado; V4.1 (Atividade automática) no backend.
- **07/10/2026** — Spec 01 R2: 15/15 ✅. Spec 02 R1: 8✅ 1❌ (P2.2) → corrigido. Adiantados itens de 03/04/05/06.
- **07/10/2026** — Spec 01 R1: 7✅ 8❌; causa principal: rota remontava a Conversa. Corrigido. Spec 02 implementado (exceto P2.10).
- **07/10/2026** — Auditoria completa no Chrome (17 telas). Specs 01–06 criados. Markdown entregue (PR #9).
