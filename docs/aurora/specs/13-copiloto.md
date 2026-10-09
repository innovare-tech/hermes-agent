# 13 · Clientes do Copiloto (design A8, Fase 3)

Tela **Operação › Clientes do Copiloto** (`/copiloto`), no perfil que administra (Aibiz). O backend fica em `ops_center/copilot.py` e as rotas em `hermes_cli/web_routers/ops_center.py`, todas por perfil (`?profile=`).
O MCP que lê os dados é `products/Aibiz/ms-aibiz-copilot-mcp`, somente leitura e isolado por `systemClientId`.
Design de referência: `design_handoff_hermes_web_ui/Design Nova parte/A8 - Copiloto/` (`Hermes Copiloto.html` + `COPILOTO.md`).

## Como funciona
- **Um perfil `cli-<cliente>` por cliente.**
  - O `.env` guarda `API_SERVER_KEY`, a chave que o Aibiz Manager usa em `/p/cli-…/v1/chat/completions`, e `AIBIZ_MCP_TOKEN`, um JWT HS256 `{sub: systemClientId, plan}` assinado com o `COPILOT_MCP_JWT_SECRET` do perfil que administra (o mesmo segredo do MCP).
  - O perfil **não tem** terminal, arquivos, código, web, navegador, subagentes nem agendamentos. A API só oferece o MCP `aibiz_ops`, com as ferramentas do plano.
- **Planos.**
  - **Starter:** status dos canais, relatório de atendimento, consultar conversas e linha do tempo.
  - **Pro:** tudo do Starter, mais "por que foi para esse setor", auditar atendente, mensagens que não entraram, mapa dos dados, consulta livre e análise livre.
  - Os créditos do mês de cada plano são configuráveis.
- **Cota** (até existir a carteira da Aibiz, ver `ms-aibiz-copilot-mcp/docs/SPEC-creditos-e-chat.md`).
  - Crédito = peso da ferramenta + 1 a cada 2.000 tokens do turno.
  - Ao zerar, a API responde **402** "Sem saldo"; revogado também é recusado.
- **Rotacionar a chave:** "agora" corta a antiga na hora; "em 24 horas" mantém a antiga válida até `API_SERVER_KEY_PREVIOUS_UNTIL`.
- **Revogar:**
  - remove a chave e o token, então a API responde 401 e o MCP recusa;
  - a memória fica guardada 30 dias e depois o perfil é apagado (ticker);
  - a auditoria fica.
- **Auditoria.**
  - Cada chamada ao MCP grava no `ops.db` do cliente: ferramenta, argumentos, consulta feita (com o filtro), linhas, ms, resultado (`ok`, `blocked_scope`, `blocked_query`, `error`) e créditos.
  - O fim do turno grava tokens, créditos, a pergunta e quem perguntou (`author.name` do corpo da requisição).

## API
```
GET    /api/copilot/clients?q=&status=active|no_credit|revoked&plan=starter|pro&cursor=&limit=20
       → {items:[{systemClientId, name, plan, profileId, status:'active'|'no_credit'|'revoked', isNew, createdAt,
                  month:{conversations, credits, creditsLimit, tokens, toolCalls, spendUsd}, lastActivityAt,
                  keyRotatedAt, revoked:{at, by, reason, purgeAt}|null}],
          total, counts:{all, active, no_credit, revoked}, kpis:{active, noCredit, spendUsd}, nextCursor}
GET    /api/copilot/clients/:sid
       → item + {tools:[{key, label, weight, enabled, reason}],
                 usage:{daily:[{day, credits}], byTool:[{key, uses, credits}], tokens, tokenCredits},
                 filter:{systemClientId}}
GET    /api/copilot/clients/:sid/audit?cursor=
       → {items:[{at, question, askedBy:{name, role, via}, tool, toolLabel, args, query, rows, ms,
                  result:'ok'|'blocked_scope'|'blocked_query'|'error', error, credits}], nextCursor}
POST   /api/copilot/clients            {systemClientId, plan} → {profileId, apiKey (só agora), client}
POST   /api/copilot/clients/:sid/rotate-key   {graceHours: 0|24} → {apiKey, client}
POST   /api/copilot/clients/:sid/revoke       {confirm: systemClientId, reason?} → client
POST   /api/copilot/clients/:sid/reactivate   → {apiKey, client}
PATCH  /api/copilot/clients/:sid               {plan} → client
GET    /api/copilot/settings   → {mcpUrl, secretEnv, plans:{starter:{credits}, pro:{credits}}, catalog:[…], planLabels}
PUT    /api/copilot/settings   {mcpUrl?, plans?}
GET    /api/aibiz/clients?q=&cursor=  → diretório de clientes (Canais) + hasCopilot; sem busca, os sem Copiloto primeiro
```
Os erros de validação voltam com status 400 e `detail` em português; item que não existe volta 404.

## Critérios de aceite
- **C1 · Faixa de isolamento.**
  - Faixa verde fixa sob o título: "O Copiloto só lê dados daquele cliente.", com a explicação do design.
  - Em Ferramentas: "Todas são só leitura e filtradas por `systemClientId = "…"`".
- **C2 · Lista (380 px).**
  - Busca por nome ou id, chips de status com contadores e chips de plano.
  - Item com avatar (cor estável por id), plano, id em fonte mono, conversas e gasto do mês, status e última atividade.
  - Ordem: novos, sem saldo, ativos, revogados; revogado aparece a 60%.
  - "Mostrando 20 de N · carregar mais".
  - KPIs: ativos, sem saldo, gasto do mês. Botão **Adicionar cliente**.
- **C3 · Detalhe.**
  - Cabeçalho com link para o perfil `cli-…` (Perfis) e as ações Mudar plano, Rotacionar chave e Revogar (vermelho), que vira Reativar quando revogado.
  - Faixa de contexto para sem saldo, revogado (quando, por quem, motivo, data em que a memória some) e cliente novo.
  - 4 KPIs: conversas, gasto, créditos usados/limite e última atividade.
- **C4 · Ferramentas.** Grade com o catálogo: liberada ("Liberado pelo plano X · só leitura") ou com cadeado ("Só no plano Pro").
- **C5 · Consumo.**
  - Barra de créditos do mês (âmbar a partir de 80%, vermelha em 100%) e a explicação do crédito.
  - Barras por dia e tabela por ferramenta (usos, créditos, parte do total).
  - Tokens do mês, gasto com IA e uma linha explicando o que é token.
- **C6 · Auditoria.**
  - Cada linha tem hora, pergunta entre aspas, quem perguntou, ferramenta e linhas.
  - A linha expande para a **consulta feita** (mono, com o filtro) e uma nota: "Só leitura · filtro … · N ms".
  - `blocked_scope` aparece em vermelho como **"Recusado: outro cliente"**; `blocked_query` aparece como "Consulta não permitida".
  - Estado vazio com explicação.
- **C7 · Rotacionar.** Opções Agora / Em 24 horas, com a explicação de cada uma. A chave nova aparece **uma vez**, com Copiar e o aviso para atualizar no Aibiz Manager.
- **C8 · Revogar** (`alertdialog`).
  - Lista as consequências: a chave para, o gestor vê "Copiloto indisponível", a memória fica 30 dias, a auditoria fica e dá para reativar.
  - Só libera depois de digitar o systemClientId.
- **C9 · Mudar plano.** Cartões Starter/Pro com o atual marcado, a diferença de ferramentas (entra/sai) e de créditos, e o aviso sobre a cobrança.
- **C10 · Adicionar cliente (3 passos).**
  1. Busca no diretório; quem já tem Copiloto aparece desabilitado.
  2. Plano.
  3. Revisão das 5 etapas e "Criar Copiloto" com progresso. Mostra a chave uma vez e "Ver o cliente"; o cliente entra no topo, selecionado, com a faixa "Cliente novo".
- **C11 · Estados.** Carregando (skeleton), vazio ("Nenhum cliente no Copiloto ainda" + Adicionar o primeiro), erro ("os Copilotos continuam funcionando" + Tentar de novo) e filtro sem resultado (Limpar filtros).
- **C12 · Acessibilidade.** `aria-current` no item, `aria-pressed` nos filtros, `aria-expanded` na auditoria, `role="radio"` nos planos, `alertdialog` no revogar, `aria-live` nos toasts; Esc fecha diálogos, exceto durante a criação.
- **C13 · Ponta a ponta.**
  - Criar um Copiloto para um cliente real e perguntar pela API.
  - A resposta usa só dados dele.
  - Pedir dados de outro cliente resulta em recusa (`blocked_scope`) registrada na auditoria.
  - Rotacionar a chave: a antiga cai, ou continua valendo 24 h.
  - Revogar: a API responde 401.
