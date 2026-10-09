# 07 · Perfis (design A1)

Referência visual e de comportamento: `design_handoff_hermes_web_ui/Design Nova parte/A1 - Perfis/`
(`Hermes Perfis.html` + `PERFIS.md`). Fidelidade ao protótipo; dados reais, sem mock.

## Conceito
Cada perfil é um Hermes isolado (`~/.hermes/profiles/<id>`; o padrão é a raiz). Trocar de perfil no
painel **só muda o que o painel mostra**: todas as chamadas passam a levar `?profile=<id>` (mecanismo
já existente em `web/src/lib/api.ts`: `setManagementProfile` + `PROFILE_SCOPED_PREFIXES`) e a
conversa usa o parâmetro `profile` do JSON-RPC (`session.create/list/resume`, `commands.catalog`).

## Contrato de API (fechado)
Agregado novo, num router próprio `hermes_cli/web_routers/ops_profiles.py` (não escopado):
```
GET   /api/ops/profiles
  → [{id, name, desc, color, icon, isDefault, group: "copiloto"|null, channels: ["telegram",…],
      model, provider, status: "ok"|"paused"|"err", issue?: string, canPause, usageToday: {msgs, costUsd}}]
PATCH /api/ops/profiles/{id}   {color?, icon?}      → perfil atualizado
```
- `name`: `display_name` ou o id; `desc`: descrição nativa; `group`: `"copiloto"` quando o id começa com `cli-`.
- `color`/`icon`: guardados em `<home do perfil>/aurora.json` (`{"color","icon"}`); padrões: `violeta`/`user`
  (o perfil `aibiz` sugerido: `coral`/`message-circle`; `innovare`: `azul`/`code-xml`). Paleta e ícones do PERFIS.md.
- `isDefault`: o perfil que abre ao entrar = o perfil ativo fixo (`get_active_profile`); "Tornar padrão" usa `POST /api/profiles/active`.
- `status`: `paused` se `GET /api/ops/pause?profile=` diz pausado (ou a pausa geral `/api/estop` está ligada);
  `err` se há canal ligado e o gateway está parado, ou canal com erro (mesma regra de `healthFrom`); senão `ok`.
  `issue` = frase curta do problema (ex.: "Gateway parado com 1 canal ligado").
- `channels`: plataformas ligadas e configuradas do perfil (`/api/messaging/platforms` no escopo do perfil).
- `usageToday`: mensagens de hoje (ops inbox + sessões do dia) e custo do dia (analytics do perfil, 1 dia).
- `canPause`: de `GET /api/ops/pause` (o padrão não pausa sozinho: usa "Pausar tudo").

Operações que **já existem** e devem ser reusadas (não reimplementar):
- Criar/clonar: `POST /api/profiles` (`name`, `description`, `clone_from`, `clone_all`, `no_skills`, `clone_channels` **sempre false**).
  Mapear "Copiar de" → skills/memória/ferramentas para as flags existentes; se uma combinação não existir,
  documentar no relatório e implementar no menor ponto possível. **Nunca copiar canais nem chaves (.env).**
- Renomear: `PATCH /api/profiles/{id}` (o id não muda para o padrão; ver resposta). Descrição: `PUT /api/profiles/{id}/description`.
- Apagar: `DELETE /api/profiles/{id}` (a confirmação digitando o nome é no front).
- Pausar/retomar perfil: `PUT /api/ops/pause?profile=<id>` `{paused}`.
- Reiniciar gateway: `POST /api/gateway/restart`.

## Critérios de aceite
- **P7.1** ProfileSwitcher no topo da Sidebar (substitui o bloco "Hermes"): cor + ícone, nome, status, popover com busca, grupo "Clientes do Copiloto" recolhido, "Novo perfil", "Gerenciar perfis", teclado (Esc) e clique fora.
- **P7.2** Alerta de outro perfil com problema abaixo do gatilho ("Aibiz: gateway parado · Abrir").
- **P7.3** Trocar de perfil: `setManagementProfile`, lembra no navegador, `--acc`/`--accSoft`/brilho na cor do perfil, barra de 2px, skeleton, toast "Agora você está no perfil X…", pílula do perfil no header; **todas** as telas recarregam com os dados do perfil (ops, sessões, conversa nova no perfil certo, memória, skills, cron, gateways, chaves, modelos).
- **P7.4** Faixa de problema do perfil atual com "Ver registros" e "Reiniciar gateway".
- **P7.5** Configurações › Perfis: lista com colunas do design, linha atual e linha com problema destacadas, grupo do Copiloto, menu ⋯ completo (padrão não apaga e não pausa, com o motivo escrito).
- **P7.6** Criar/clonar (diálogo do design, validações, caminho `~/.hermes/profiles/<id>`, erro com "Tentar de novo"); após criar, troca para o perfil e abre o assistente curto (3 passos) se marcado.
- **P7.7** Editar nome/cor/ícone/descrição; aviso de que o id não muda.
- **P7.8** Apagar com confirmação forte (digitar o nome); se for o atual, volta para o padrão.
- **P7.9** Estados: carregando, só o Pessoal (vazio), erro, perfil pausado ("Retomar perfil"), perfil novo sem canais.
- **P7.10** Atividade de cada mudança aparece no perfil afetado.

## Fora deste spec
Clientes do Copiloto de verdade (Fase 3) — aqui só o agrupamento visual dos ids `cli-*`.
