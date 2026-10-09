# 08 · Blindagem: nada sai no canal de cliente (Fase 1.1)

Promessa ao dono: o Hermes **nunca** responde nem age a partir de um grupo de cliente (WhatsApp).
Lê, entende e avisa a equipe em outro canal (Telegram). Backend apenas; sem tela própria.

## Regra única
Canal **mudo** (`ops_center.store.is_muted`) = Observar, Escutar, ou **grupo** em Rascunhar.
Em canal mudo nada gerado pelo Hermes sai: resposta, "digitando", aviso de ocupado, aviso de pausado,
erro do turno, eco de transcrição, pergunta (`clarify`), pedido de aprovação, reação, edição,
`send_message` do agente ou do cron.
- A única saída permitida é uma resposta **aprovada por uma pessoa no painel** (`ops-send`), e nem ela passa em **Escutar**.
- DM em Rascunhar segue como antes: só usuários autorizados falam ali. Comandos e "digitando" funcionam e só a resposta final vira rascunho.
- Canal nunca visto pela Central (destino de cron, home channel) não é afetado. Grupo não recebe resposta de admissão (o pareamento é só por DM) e a primeira mensagem já o registra no modo padrão.
- Falha ao ler o `ops.db`: grupo de WhatsApp fica mudo (fail-closed); o resto segue.

## Onde é aplicada
| Ponto | O que cobre |
|---|---|
| `gateway/outbound_guard.py::install` (em `_create_adapter`) | todo método de saída do adaptador (`send*`, `edit_message`, `delete_message`, reações, `on_processing_*`). Bloqueado = `SendResult(success=True, message_id=None)`, sem retry nem reentrega. |
| `tools/send_message_tool.py::_handle_send` | envios do agente e do cron, inclusive pelos senders avulsos (sem adaptador vivo) |
| `gateway/run_inbound.py` | Observar/Escutar e comando em canal mudo não rodam turno. Registro antes da checagem de pausa, para a mensagem entrar na caixa mesmo pausado. |
| `gateway/ops_hooks.py::record` | mensagem só de mídia vira item com marcador (`[áudio]`, `[imagem]`, `[vídeo]`…) |
| `gateway/ops_hooks.py::_send_approved` | janela `approved()` para a resposta aprovada; recusa em Escutar |

## Critérios
- **B8.1** Grupo em Escutar/Observar/Rascunhar: nenhuma chamada de saída chega ao adaptador. ✅ teste
- **B8.2** Nota de voz sem legenda e foto sem legenda viram item na caixa. ✅ teste
- **B8.3** `/help` num grupo mudo não roda; no Autônomo, roda. ✅ teste
- **B8.4** `send_message` para canal mudo é recusado com o motivo. ✅ teste
- **B8.5** Resposta aprovada sai em Rascunhar e é recusada em Escutar. ✅ teste
- **B8.6** Ponta a ponta com o número de suporte num grupo de teste (texto, áudio, imagem, vídeo, "/help"): nada aparece no grupo. ⬜ (Fase 1.8)

## Pendências para as próximas etapas
- **1.2 Escutar:** a mensagem do grupo precisa ser capturada **antes** da autorização de remetente,
  porque a equipe do cliente não é usuário autorizado e ler não é rodar turno. O bridge não pode exigir
  menção (`WHATSAPP_REQUIRE_MENTION`). A mídia (caminho do arquivo) precisa ficar guardada para a
  transcrição e a visão no lote.
- **1.5 Avisos:** o tópico/grupo da equipe que recebe os avisos precisa estar em **Autônomo**, senão a
  trava o silencia. Ao escolher um destino de aviso, o painel deve colocá-lo em Autônomo (ou avisar).
- **1.7 Permissões:** a trava cobre só o que **sai** no canal. Ferramentas de escrita disparadas por
  quem fala num canal Autônomo/Rascunhar são assunto dos guardrails.
