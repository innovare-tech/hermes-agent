# 10 · Permissões por origem (design A6, Fase 1.7)

O que o Hermes pode fazer depende de **quem pediu**:
- WhatsApp: grupo de cliente;
- Telegram: equipe;
- API: Copiloto;
- tarefa agendada.

Backend: `ops_center/guardrails.py`, chamado no núcleo (`hermes_cli/plugins._get_pre_tool_call_directive_details`) **antes de qualquer plugin**, em toda chamada de ferramenta.

## Ordem de avaliação
1. **Classificação** da chamada:
   - `terminal`: por comando (kubectl/helm/gcloud → cluster; mongosh/psql/… → banco; o resto → servidor; `ssh host 'cmd'` julga o comando remoto). Leitura só quando **todo** trecho é de leitura.
   - `write_file`/`patch` → arquivos.
   - `execute_code` → escrita.
   - `web_*`/`browser_*` → web.
   - `mcp__<servidor>__<ferramenta>` → conector, e o `readOnlyHint` decide se altera.
   - O resto não entra nas permissões.
2. **Sempre bloqueado** (não editável): apagar banco/tabela, apagar ou alterar em massa, `rm -rf`, apagar partes do cluster, chaves e acessos, mudar estas permissões pelo chat.
   - Em leitura valem só as duas últimas (ex.: `cat .env`).
   - O bloqueio vai para o histórico e avisa no destino das aprovações.
3. **Execução aprovada:** só a chamada idêntica à aprovada passa (ContextVar durante `execute_approved`).
4. **Matriz** ação × origem: `allow`/`approve`/`deny`.
   - Ferramenta MCP sem regra: `approve` (só leitura: `allow`).

## Invariantes
- **Grupo de WhatsApp nunca altera nada**, mesmo com as permissões desligadas.
  - "Permitido" é recusado ao salvar e rebaixado na leitura.
  - Sem regra explícita = bloqueado. Só fica "pede aprovação" se o dono escolher.
- Com as permissões desligadas (`enabled: false`), o dono e as outras origens seguem como antes. Isso evita mudar o perfil Pessoal sem querer.
- **Falha da checagem** numa origem controlada bloqueia (fail-closed). Para o dono direto, segue.
- A análise do Escutar roda pelo cron, mas com origem `whatsapp_group` (`as_origin`).

## Aprovação por botão
O portão nativo não serve: tem "sempre permitir", yolo, auto-aprovação no cron e o limite de 30 s do hook. Por isso:
1. A chamada é recusada para o modelo com "Pedi aprovação (#N)…". O pedido grava o **comando exato** (ferramenta + argumentos) com validade de 15 min.
2. Destino da mensagem:
   - o próprio chat/tópico, se o pedido veio do Telegram;
   - senão, `approval_target` (ex.: `telegram:-100…:<tópico>`).
   A mensagem leva os botões **✅ Aprovar / ❌ Negar** (`oa:y|n:<id>` no adaptador do Telegram).
3. Regras da decisão:
   - quem pediu não aprova o próprio pedido;
   - com `approvers` configurados, só eles aprovam;
   - vale a primeira decisão (Telegram ou painel);
   - sem resposta em 15 min = `expired`, contado como negado.
4. Aprovado: o Hermes executa **aquela** chamada (`handle_function_call`, no escopo do perfil), edita a mensagem e responde com o resultado. O modelo não refaz a chamada.

## API (por perfil, `?profile=`)
```
GET  /api/ops/permissions   → {enabled, origins, originLabels, actions, matrix, hardDeny[{label,patterns}],
                               approvers, approvalTarget, approvalTtlMin}
PUT  /api/ops/permissions   {enabled?, matrix?, approvers?, approvalTarget?}   (400 se liberar escrita a grupo)
GET  /api/ops/approvals?status=pending|approved|denied|expired|blocked
POST /api/ops/approvals/{id}/decide {approve, note?}   (409 se já decidido/expirado)
```

## Critérios
- **G10.1** Classificação de comandos (leitura × escrita, ssh, redirecionamento, `sed -i`). ✅ teste
- **G10.2** Sempre bloqueado, incluindo leitura de `.env`; sem falso positivo em `delete … where` e `find({})`. ✅ teste
- **G10.3** Grupo de WhatsApp nunca altera, mesmo sem configuração; leitura passa. ✅ teste
- **G10.4** Telegram + escrita → pedido com comando exato e botões no mesmo tópico. ✅ teste
- **G10.5** Decisão: quem pediu, aprovadores, primeira decisão, expiração. ✅ teste
- **G10.6** Execução aprovada só passa com argumentos idênticos. ✅ teste
- **G10.7** Ponta a ponta no Telegram real: pedir `kubectl scale`, aprovar pelo botão e ver o resultado; `kubectl delete ns` de qualquer origem bloqueado. ⬜ (1.8)

## Limites conhecidos
- "Mais de 500 linhas" não é checável sem rodar a consulta. Só os padrões sem `WHERE`/filtro vazio são bloqueados.
- A classificação de terminal é heurística (lista de comandos de leitura). Na dúvida, conta como escrita.
- A aprovação pelo **painel** executa no processo do painel. Ferramentas MCP que só existem no gateway devem ser aprovadas pelo Telegram.
- **Tela A6:** falta implementar. Matriz com conectores MCP descobertos, histórico e o diálogo "Liberar sem aprovação?".
