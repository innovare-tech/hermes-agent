# 09 · Escutar: lote, triagem e análise (Fase 1.2)

Núcleo de backend do modo **Escutar** (modo 3). As telas vêm depois:
- **Canais (A2):** janela do lote e vínculo de cliente.
- **Análises (A3):** lista e detalhe.
- **Avisos (A4):** destinos.
- **Modelos (A5):** triagem.

O Hermes lê o grupo, entende e avisa a equipe em outro canal. **Nunca** responde no grupo (spec 08).

## Fluxo
1. **Captura** (`gateway/ops_hooks.listen_capture`, em `_hm_admit_event`, **antes** da autorização):
   - grupo em Escutar → item `listen` no `ops.db`, com texto, marcador de mídia e caminhos dos arquivos;
   - nenhum turno roda.
   - A equipe do cliente não é usuária do Hermes e ler não é rodar turno, por isso a captura vem antes.
2. **Lote** (`store.due_listen_channels`/`open_batch`):
   - o lote fecha quando o grupo fica **X min em silêncio** ou **Y min** depois da 1ª mensagem;
   - padrão 5/30, com sobrescrita por canal em `channels.listen_silence_min/max_min`;
   - o lote é uma linha de `analyses` (contrato A3).
3. **Ticker** (`ops_center/listen.start`, iniciado com o cron do gateway):
   - a cada 30 s, em cada perfil servido, no escopo de segredos do perfil;
   - pausado (ESTOP) → nada é analisado, e os itens esperam.
4. **Áudio** transcrito pela ferramenta de transcrição do Hermes. A falha fica na evidência (`transcriptError`).
5. **Triagem** (`ops_center/decide.py`, Jev): uma chamada `POST {base_url}/decisions` com três perguntas:
   - categoria (choice);
   - urgência (score);
   - é conversa social? (noul).
   Destino do lote:
   - social com confiança ≥ mínima (padrão 70%) → `ignored`;
   - abaixo disso, ou sem triagem configurada → análise completa.
6. **Análise** (`cron.scheduler.run_job`, mesmo caminho do cron: modelo, chaves e guardas):
   - ferramentas `listen.toolsets` (padrão `vision, video, no_mcp`; MCP só os listados de propósito, e só leitura);
   - as mensagens vão como contexto da execução e passam pelo scanner de injeção;
   - a saída em JSON alimenta resumo, categoria, urgência, participantes, citações, checagens, hipótese e resposta sugerida.
7. **Aviso** (`listen.send_notice`):
   - vai para `notify_target` (ex.: `telegram:-100…:<tópico>`), com urgência, categoria, cliente, resumo, hipótese e resposta sugerida;
   - análise que falhou (inclusive bloqueio do scanner) também avisa, com as mensagens cruas.

## Configuração
`GET/PUT /api/ops/listen` (por perfil, `?profile=`):
```
{silence_min:5, max_min:30, min_confidence:0.7, toolsets:["vision","video","no_mcp"],
 notify_target:"", triage:{base_url:"", model:"jev-latest", api_key_env:"TYPESAFE_API_KEY"}}
```
A chave fica no `.env` do perfil (`TYPESAFE_API_KEY`), nunca no `ops.db`.

## Critérios
- **E9.1** Mensagem de membro não autorizado num grupo em Escutar é capturada; DM e grupo em outro modo seguem o fluxo normal. ✅ teste
- **E9.2** Lote fecha por silêncio e pelo máximo; não reabre itens já em lote. ✅ teste
- **E9.3** Conversa social com confiança alta vai para "ignoradas" sem gastar o modelo de texto. ✅ teste
- **E9.4** Abaixo da confiança ou sem triagem → análise completa → aviso com urgência, categoria, cliente e resposta sugerida. ✅ teste
- **E9.5** Análise que falha avisa a equipe com as mensagens. ✅ teste
- **E9.6** Áudio transcrito entra no texto do lote; falha vira evidência. ✅ teste
- **E9.7** Ponta a ponta com o número real, o Jev real e o tópico do Telegram. ⬜ (1.8)

## A confirmar com a chave real
- **URL nativa da TypeSafe:** não está publicada; por isso `base_url` é configurável (Portkey/OpenRouter também servem).
- **Formato exato da `score`:** a leitura prefere `probabilities` por nível.
- **`run_job` com job em memória:** o caminho já existe no Hermes, mas ainda não rodou de ponta a ponta com modelo real.

## Para as telas
- **A2:** janela por canal (colunas prontas), vínculo de cliente (`channels.client_id/client_name`) e "Escutar" como padrão de grupos de cliente.
- **A3:** rotas sobre `store.list_analyses/get_analysis/update_analysis`. Os campos JSON já seguem o contrato. Faltam:
  - `seen_by`, `resolved` e `irrelevant`, alimentados pelas ações;
  - servir os arquivos de mídia por rota.
- **A4:** `notify_target` vira rotas por tipo e nível. O destino precisa estar em Autônomo (spec 08).
- **A5:** "Triagem" grava `triage.*` e `min_confidence`; "Análise dos grupos" grava o modelo do job.
- **Rascunhar em grupo:** o design prevê análise em lote também para grupos em Rascunhar; hoje só Escutar faz lote.
