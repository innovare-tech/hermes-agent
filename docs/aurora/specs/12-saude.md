# 12 · Saúde da plataforma (design A7, Fase 2)

Tela **Operação › Saúde** (`/saude`). O backend fica em `ops_center/health.py`, com as rotas em `hermes_cli/web_routers/ops_center.py`, e trabalha por perfil (`?profile=`).
O design de referência está em `design_handoff_hermes_web_ui/Design Nova parte/A7 - Saúde/` (`Hermes Saude.html` + `SAUDE.md`).

## Como funciona
- **Ciclo.** O ticker do gateway (`ops_center.listen.start`) chama `health.tick()` a cada 30 s em cada perfil servido.
  - Roda as verificações vencidas, uma a uma.
  - Investiga os incidentes novos.
  - Com o perfil pausado, as verificações continuam rodando, mas não há investigação.
- **Executores (`kind`).**

  | `kind` | O que faz |
  |---|---|
  | `http` | Chama `/health`: código 2xx e tempo de resposta (lento vira atenção). |
  | `mongo` | Mede réplicas, latência média das consultas no intervalo e espaço em disco (`fsUsedSize`). |
  | `ssh` | Lê CPU, memória e disco (`vmstat`, `free`, `df`) pela chave em Chaves `HEALTH_SSH_KEY_<NOME>`. |
  | `k8s` | Consulta a API REST do cluster com token de leitura: pods prontos/desejados, reinícios em 1 h e último motivo (ex.: OOMKilled). |
  | `bot` | Lê `system_client_sources.status` e conta as mensagens da janela em `messages_receive` (filtro por `_id`, que usa o índice padrão). |
  | `dead_letters` | Conta as falhas de hoje contra as de ontem até a mesma hora e mostra o motivo mais comum. |

- **Incidentes.**
  - Abrem depois de 2 erros seguidos e avisam em Avisos › infra, no nível da severidade da verificação.
  - Quando a verificação volta a ok, o incidente fecha sozinho ("Hermes").
  - Se der erro de novo em até 1 h depois de fechado, o mesmo incidente reabre.
- **Investigação.**
  - É um turno do Hermes com origem `health_probe`. O guardrails bloqueia qualquer escrita, seja qual for a matriz.
  - Produz linha do tempo, hipótese, impacto e uma correção sugerida.
  - Se a correção cair em "sempre bloqueado", ela é descartada.
- **Correção.**
  - `POST /incidents/:id/action` cria um pedido de aprovação no destino das Permissões (Telegram, botões `oa:`).
  - O comando só roda depois do Aprovar. O painel nunca executa direto.
- **Conexões** (meta `health_settings`).
  - Mongo: `uri_env` e `db`.
  - Coleções dos bots.
  - Filas de falha: coleção, campo de data e campo de agrupamento.
  - k8s: `server`, `token_env`, `ca_env` e `namespaces`.
  - `servers`: nome, host, usuário e porta.
  - `services`: nome e url.
  - Os segredos ficam só no `.env` do perfil, guardados pelo nome da variável.
- **Recomendadas.**
  - Entram os bots de canais em uso: conectado, esperando QR, reconectando ou caído há menos de 7 dias. Canal caído há mais tempo é tratado como abandonado.
  - Entram também as 4 filas de falha, as 3 métricas do Mongo, os servidores, os serviços e os deployments dos namespaces.
  - Não duplica o que já existe.

## API
```
GET    /api/health/checks                → [{id, group, name, detail, kind, status: ok|warn|error|pending, severity,
                                             result: {text, metrics?: {cpu, ram, disk}}, intervalSec, lastRunAt,
                                             history: [{at, value}], historyLabel, clientId, sourceText, createdAt}]
                                             (problemas primeiro)
GET    /api/health/overview              → {availability30d, botsConnected, botsTotal, lastRunAt, checks, lastIncident}
POST   /api/health/checks/:id/run        → a verificação atualizada
POST   /api/health/checks/parse          {text, interval} → {ok: true, check: {target, condition, window, frequency, group,
                                             groupLabel, severity, notify, spec}} | {ok: false, reason}
POST   /api/health/checks                {text, interval, parsed} | {group, name, kind, params, intervalSec, severity, clientId}
POST   /api/health/checks/recommended    → {created: [...], skipped: ["o que falta configurar"]}
PATCH  /api/health/checks/:id            {intervalSec?, severity?, name?, params?}
DELETE /api/health/checks/:id
GET    /api/health/settings              → configuração + status: {mongo, k8s, servers: {nome: {keyEnv, key}}}
PUT    /api/health/settings              {mongo?, bots?, deadLetters?, k8s?, servers?, services?, toolsets?}
GET    /api/incidents?status=open|resolved → [{id, code: "INC-n", checkId, severity: critical|warning, title, impact,
                                             status, startedAt, ackBy, ackAt, resolvedAt, resolvedBy, note,
                                             timeline: [{at, result: problem|signal|ruled_out|info, text}], hypothesis,
                                             investigating, suggestedAction: {label, command, needsApproval} | null,
                                             approval: {id, status, target, expiresAt, decidedBy, result} | null}]
                                             (abertos: críticos primeiro, depois os mais antigos)
POST   /api/incidents/:id/ack            {by?}
POST   /api/incidents/:id/resolve        {by?, note?} → {incident, stillFailing}
POST   /api/incidents/:id/action         {by?} → o incidente com approval
```
Os erros de validação voltam como 400 com `detail` em português. Item que não existe volta 404.

## Critérios de aceite
- **S1 · Humores.**
  - Tudo verde: herói "Tudo funcionando", que respira devagar, com os números de `overview`.
  - Incidente crítico: faixa vermelha (`role="alert"`) com o crítico mais antigo, duração ao vivo, "Ver o que o Hermes achou" e "Estou vendo".
- **S2 · Cartão de incidente.**
  - Mostra severidade, código, quem reconheceu, título, impacto, duração e linha do tempo (ícone por `result`).
  - Mostra a hipótese. Enquanto `investigating` está ligado, aparece "O Hermes está investigando…".
- **S3 · Correção.**
  - O botão principal mostra o `label`.
  - Depois do clique aparece "Aguardando aprovação no Telegram", com o destino e a expiração. Mostra também o resultado quando aprovado ou negado.
  - Sem correção sugerida, o botão não aparece.
- **S4 · Reconhecer e Resolver.**
  - Resolver abre um diálogo com nota opcional.
  - Se `stillFailing`, aparece o toast honesto: "a verificação ainda mostra problema; o Hermes reabre se continuar".
- **S5 · Seis grupos recolhíveis** (`aria-expanded`).
  - Cada grupo tem pílulas de contagem e borda na cor do pior status.
  - Bots mostram 6 linhas, sempre com todas as que têm problema, mais "Ver todos os N bots".
- **S6 · Linha.**
  - Ponto de status com `title`, nome e detalhe, texto do resultado ou mini barras de CPU/memória/disco (≥80 âmbar, ≥90 vermelho), chip de frequência e sparkline 100×24 (`aria-hidden`) com legenda.
  - Botão "Rodar agora", com spinner e depois toast com o resultado real.
- **S7 · Criar verificação.**
  - O diálogo tem texto livre, exemplos clicáveis e frequência.
  - "Ver o que o Hermes entendeu" mostra o cartão "Entendi assim:" ou o motivo em vermelho.
  - Criar só fica liberado com uma interpretação válida. A verificação nova aparece destacada como "Aguardando a primeira execução".
- **S8 · Estados.**
  - Carregando: skeleton.
  - Vazio: "Nenhuma verificação ainda", com **Usar as recomendadas** (mostra o que foi criado e o que falta configurar) e **Criar uma do zero**.
  - Erro: "Não consegui falar com o monitor", avisando que os avisos do Telegram também podem ter parado, com **Tentar de novo**.
- **S9 · Conexões.**
  - Uma gaveta ou diálogo para editar servidores, serviços, cluster e banco (nomes de variável).
  - Mostra o que já está ligado e diz em qual variável de Chaves colocar cada segredo. Segredo nunca aparece na tela.
- **S10 · Sidebar.**
  - Item "Saúde" em Operação, com badge vermelho quando há crítico aberto e âmbar quando só há atenção.
  - O status do perfil mostra "Incidente crítico".
- **S11 · Movimento reduzido.** Com `prefers-reduced-motion`, pulsos e respiração ficam desligados.
- **S12 · Ponta a ponta.**
  - Derrubar um alvo de teste (serviço `http` apontando para uma porta fechada).
  - Em até 2 ciclos, o incidente abre, o aviso chega ao tópico de infra e a investigação preenche a linha do tempo.
  - Quando o alvo volta, o incidente fecha sozinho.
