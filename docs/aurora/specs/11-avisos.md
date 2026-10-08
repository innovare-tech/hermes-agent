# 11 · Avisos: para onde vão (design A4)

Tela **Configurações › Avisos** (`/settings/avisos`) e backend `ops_center/notify.py` + `hermes_cli/web_routers/ops_notify.py`.
O destino é o **supergrupo da equipe no Telegram**, com tópicos. Fala com a Bot API por HTTP (`urllib`) usando `TELEGRAM_BOT_TOKEN` do perfil. O token nunca volta ao painel.

## Estado (`ops.db`, tabela `meta`)
- `notify_routes`: `chatId` + rotas (contrato abaixo).
- `notify_topics`: tópicos que o bot criou ou que alguém registrou. **A Bot API não lista tópicos.**
- `notify_members`: cache de pessoas (administradores vêm da API; `learn_member` guarda quem escreveu).
- `notify_queue`: avisos segurados pelo horário de silêncio (máx. 200).
- `notify_digest_last`: último dia em que o resumo diário saiu.

Grupo (`chatId`): o salvo nas rotas; senão deduzido de `listen.notify_target`, `approval_target` ou `TELEGRAM_HOME_CHANNEL`.

## API (por perfil, `?profile=`)
```
GET  /api/notify/telegram              → {connected, status: ok|no_token|no_chat|error, chatId, bot:{username},
                                          chat:{id,title,members,isForum,botIsAdmin,canManageTopics},
                                          topics:[{threadId,name,color,icon}], members:[{id,name,username,role}], error?}
PUT  /api/notify/telegram {chatId}     → confere o grupo (getChat) e salva
POST /api/notify/telegram/topics/refresh {create?, topics?:[{threadId,name}]}
                                       → relê o grupo; `topics` registra tópicos existentes; `create` cria os 3 padrão que faltam
                                         (Alertas de infra, Grupos de clientes, Conversa). Erro do Telegram → 502 com a mensagem.
GET/PUT /api/notify/routes             → {chatId, analyses:{critical,high,medium,low:{topic,quiet}, mentions:[userId]},
                                          infra:{critical,warning,info,mentions}, digest:{topic,time,days:[0..6]},
                                          quietHours:{from,to,weekend,tz}}      (PUT aceita parcial; 400 se quiet em critical)
POST /api/notify/test {type, draft?}   → {ok, topic, topicName, latencyMs, messageUrl} | {ok:false, code, message}
                                          code: no_token | no_chat | no_permission | topic_off | telegram_error
POST /api/notify/digest/send-now       → manda o resumo de ontem agora
POST /api/notify/quiet/flush           → manda o que o silêncio guardou, se ele acabou
```
`topic`: número do tópico; `null` = Geral; `"off"` = não envia (fica só no painel). `days`: 0 = domingo.

## Envio
`notify.send(kind, level, text)`: `kind` = `analyses` (`critica|alta|media|baixa`) ou `infra` (`critical|warning|info`).
- Aplica o tópico da rota, o silêncio e as menções (**só no nível crítico**).
- Crítico nunca silencia. Nível silenciado dentro do horário vai para a fila e sai num resumo (`flush_quiet`).
- Devolve `{sentAt, messageId, url, topic, target}`; `None` se não enviou (sem rotas, "Não enviar", fila ou falha, que só vai ao log).
- `listen.send_notice` usa `notify.send` quando as rotas estão salvas e há token e grupo (`notify.is_configured()`); senão, o `notify_target` antigo. Com rotas configuradas não há fallback para o destino antigo.
- Quem tem `@usuário` é chamado por `@usuário`; os demais por `tg://user?id=…`.

## Agendamento (a ligar)
`notify.tick()` faz tudo que depende de relógio, no escopo do perfil: `flush_quiet()` quando o silêncio acaba e o **resumo diário** no horário (`digest.time`, nos `days`, uma vez por dia). Basta o ticker/cron do gateway chamá-lo a cada minuto, como o `listen.start` faz com `process_due`. Enquanto ninguém chamar, o silêncio só descarrega por `POST /api/notify/quiet/flush` e o resumo só sai por `send-now`.

Resumo diário (`digest_text`): análises de ontem (no fuso do silêncio) por urgência e resolvidas, análises abertas agora, mensagens sociais ignoradas. Sem custo (o painel não tem esse dado por perfil).

## Limites conhecidos
- **Tópicos:** a Bot API não lista; aparecem os que o Hermes criou ou que foram registrados por `topics` em `refresh`. A tela ainda não tem campo para registrar um tópico criado à mão.
- **Membros:** só administradores. `notify.learn_member` guarda quem escreve no grupo, mas nenhum adaptador o chama ainda (o `gateway/*` ficou fora do escopo).
- **Botões inline** (✅ Resolvido, 👀 Estou vendo) do protótipo foram removidos: ninguém trata o clique do bot.
- Infra: nada chama `notify.send("infra", …)` ainda; a rota e o teste já funcionam.
