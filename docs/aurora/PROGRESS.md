# Progresso — Hermes Aurora

Processo e legenda: [`specs/README.md`](specs/README.md). Layout de celular: fora de escopo por ora.

`⬜ a fazer` · `🔧 em andamento` · `🧪 em validação` · `✅ validado no Chrome` · `👀 aguardando dono` · `🏁 aprovado`

## Resumo

| Spec | Estado | PR | Última validação |
|---|---|---|---|
| 01 Conversa e Sessões | 👀 | — | R2 07/10: 15/15 ✅ (+C1.17 novo) |
| 02 Primeiro uso | 🧪 | — | R3 07/10: 9✅ (P2.10 parcial) |
| 03 Português e clareza | 🔧 | — | — |
| 04 Verdade | 🔧 | — | — |
| 05 Promessas | 🔧 | — | — |
| 06 Acabamento | 🔧 | — | — |

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
| C1.17 Contagem sem mensagens internas de ferramenta | ⬜ | R2: 1 pergunta = "4 mensagens"; backend só guarda o total → precisa de contagem por papel no session.list |
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
| T3.1 Canais principais em PT | 🧪 | 12 canais em PT |
| T3.2 Campo de lista coerente | 🧪 | "um por linha — ex.: …" |
| T3.3 Dependentes em avançado | 🧪 | dependentes em avançado |
| T3.4 Ordem por relevância + "Outros" | 🧪 | principais primeiro + "Outros canais" |
| T3.5 Cartão clicável; busca vazia | 🧪 | cartão clicável; busca vazia |
| T3.6 Motivo do "Testar" desabilitado | 🧪 | motivo ao lado |
| T3.7 Chaves: só relevantes por padrão | 🧪 | só relevantes + "Mostrar avançadas" |
| T3.8 Nome amigável da chave | 🧪 | nome amigável + variável pequena |
| T3.9 "termina em …" | 🧪 | "salva · termina em …" |
| T3.10 Conectado via login | 🧪 | "conectado por login" |
| T3.11 Lista não prende rolagem | 🧪 | sem altura fixa |
| T3.12 Ferramentas em PT | 🧪 | PT |
| T3.13 Ferramenta sem config sinalizada | 🧪 | "indisponível: falta configurar" |
| T3.14 Skills: busca | 🧪 | busca |
| T3.15 Skills: origem honesta | 🧪 | provenance real |
| T3.16 Skills: detalhe + ligar/desligar | 🧪 | detalhe + ligar/desligar + procedimento |
| T3.17 Skills: descrições não-PT | 🧪 | sem CJK + aviso de idioma |
| T3.18 lang pt-BR e título da aba | ✅ | R3 07/10 |
| T3.19 Ctrl K / ⌘K | ✅ | R3 07/10 |
| T3.20 Sem jargão visível | 🧪 | Memória ✅ R3; faltam: Conversa ("CONTEXTO", "Compactar"), "Backend de terminal", ".env" |
| T3.21 Contadores com unidade | ✅ | R3 07/10 |

## 04 · Verdade
| Critério | Estado | Nota |
|---|---|---|
| V4.1 Atividade automática no backend | 🧪 | backend: rotas da Central + middleware das rotas antigas (sem valores secretos) |
| V4.2 O quê/quando/por quê/desfazer | ⬜ | |
| V4.3 Filtros só do que existe | ✅ | R3 07/10 |
| V4.4 Saúde real | 🧪 | R3 ❌ subtítulo contradizia a saúde → subtítulo segue health.problems |
| V4.5 Avisos graves no Painel | ⬜ | |
| V4.6 Períodos corretos | ⬜ | |
| V4.7 "US$ 0,16" | ✅ | R3 07/10 |
| V4.8 Filtro por negócio | ⬜ | |
| V4.9 Zero neutro, sem traço solto | ✅ | R3 07/10 |
| V4.10 Briefing cria agendamento | ⬜ | |
| V4.11 Logs: busca e download | ⬜ | |
| V4.12 Logs: sem duplicação; vazio | ⬜ | |
| V4.13 Logs: ruído agrupado | ⬜ | |

## 05 · Promessas
| Critério | Estado | Nota |
|---|---|---|
| E5.1 Suporte fora do menu | 🧪 | R3 ✅ menu; /support ganhou título e "Ir para a Conversa" |
| E5.2 Pendências reais | ⬜ | |
| E5.3 Identificadores do contato | ⬜ | |
| E5.4 Histórico do contato | ⬜ | |
| E5.5 Validação e campos vazios | ⬜ | |
| E5.6 Vazio com filtro | ⬜ | |
| E5.7 Tipo de gatilho explícito | ⬜ | |
| E5.8 Gatilho por palavra-chave funciona | ⬜ | |
| E5.9 Playbook nasce desligado | 🧪 | nasce desligado |
| E5.10 Nome separado do gatilho | 🧪 | "Nome: quando…" |
| E5.11 Condição/placeholder/feedback | ⬜ | |
| E5.12 Ajuda de horário em PT | ⬜ | |
| E5.13 Agendamentos: vazio + aviso | ⬜ | |
| E5.14 "Agendar" vazio | ⬜ | |
| E5.15 Subagentes: vazio útil | ⬜ | |
| E5.16 Sessões: renomear/apagar | ⬜ | |
| E5.17 Memória: filtro vazio | ✅ | R3 07/10 |
| E5.18 Anexar/Voz funcionam ou somem | ⬜ | achado na revisão do código |

## 06 · Acabamento
| Critério | Estado | Nota |
|---|---|---|
| A6.1 Toasts no canto | ✅ | R3 07/10 — canto inferior direito, empilham, somem; podem passar sobre um valor de cartão (não títulos/faixas) |
| A6.2 Diálogo de confirmação próprio | ✅ | R3 07/10 |
| A6.3 Chips estáveis | ✅ | R3 07/10 |
| A6.4 Barra lateral: só a lista rola | 🧪 | R3 ❌ a 609px o menu rolava sozinho → abaixo de 820px de altura a barra inteira rola |
| A6.5 Pausa: um "Retomar"; confirmação | ✅ | R3 07/10 |
| A6.6 Configurações alinhada | ✅ | R3 07/10 |
| A6.7 Datas em uma linha | ✅ | R3 07/10 |
| A6.8 "Congelar rolagem" nos Logs | ✅ | R3 07/10 |
| A6.9 Radar: botão + dica | ✅ | R3 07/10 |
| A6.10 Cabeçalho da barra lateral | ✅ | R3 07/10 |

## Diário
- **07/10/2026** — R3: 18✅ 3❌ (A6.4, V4.4, P2.10 parcial) → corrigidos. Spec 03 implementado; V4.1 (Atividade automática) no backend.
- **07/10/2026** — Spec 01 R2: 15/15 ✅. Spec 02 R1: 8✅ 1❌ (P2.2) → corrigido. Adiantados itens de 03/04/05/06.
- **07/10/2026** — Spec 01 R1: 7✅ 8❌; causa principal: rota remontava a Conversa. Corrigido. Spec 02 implementado (exceto P2.10).
- **07/10/2026** — Auditoria completa no Chrome (17 telas). Specs 01–06 criados. Markdown entregue (PR #9).
