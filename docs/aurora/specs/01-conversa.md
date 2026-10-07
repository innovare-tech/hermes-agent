# 01 · Conversa e Sessões sólidas

A Conversa é a tela mais usada. Hoje: recarregar perde a conversa, a lista de sessões some, a origem
aparece como "tui", contagens não batem, o menu "/" não fecha e mostra comandos de terminal.

## Critérios de aceite

### Endereço e navegação
- **C1.1** Ao mandar a primeira mensagem de uma conversa nova, a URL vira `/chat/<id>` sem recarregar a página.
- **C1.2** Recarregar (F5) em `/chat/<id>` reabre a mesma conversa com todo o histórico (texto, passos, markdown).
- **C1.3** Na tela Conversa a barra lateral mostra a lista de conversas recentes (como no Painel); clicar
  abre a conversa; a conversa atual fica destacada.
- **C1.4** "Nova conversa" (botão e Ctrl+K) volta para `/chat` vazio; a conversa anterior continua na lista.

### Origem e números
- **C1.5** Conversas criadas pelo painel são registradas com origem **Web** (não "tui"), no cabeçalho e em Sessões.
- **C1.6** Sessões tem filtro para cada origem que existe nos dados (Web, Terminal, Telegram…); nenhum
  filtro mostra vazio quando há sessões daquela origem. Estado vazio sem busca não diz "Tente outro termo".
- **C1.7** Contagem de mensagens igual na lista de Sessões e no cabeçalho da conversa; plural correto ("1 mensagem").
- **C1.8** Painel de contexto e rodapé da resposta usam a mesma fonte: tokens de contexto atuais
  (não soma acumulada) e custo; se o provedor não informa custo, mostrar "custo não informado" em vez de "$0,00".
- **C1.9** Cabeçalho da conversa sem jargão: título + "Web · 4 mensagens" (id da sessão só no tooltip).

### Composer
- **C1.10** Menu "/" fecha com Esc, com clique fora e ao enviar; setas + Enter escolhem.
- **C1.11** Menu "/" mostra só comandos que funcionam na web, com descrição em português.
  Comandos de terminal (/redraw, /mouse, /statusbar, /quit, /prompt, /login, /yolo…) não aparecem.
- **C1.12** Seletor de modelo marca **um** item ativo (provedor + modelo corretos), nunca o mesmo modelo em dois provedores.
- **C1.13** Botões da resposta com rótulo em português ("Copiar", "Refazer", "Desfazer"), sem "/retry" no tooltip.

### Passos (ferramentas)
- **C1.14** Passo concluído expandido mostra a saída real; "(sem saída)" só quando a ferramenta de fato não devolveu nada.
- **C1.15** Texto do passo em português (sem "+ 2 commands").

### Markdown (feito em 07/10)
- **C1.16** Título, lista, código com linguagem, tabela, negrito, link renderizados (validado manualmente 07/10).

## Notas técnicas
- `session.create` aceita `source` → passar `"web"`; conferir que `_resolve_agent_platform("web")`
  não muda toolsets de forma indesejada (comparar com "tui").
- Rota `/chat/:sid?` já existe; falta navegar após `create()` e carregar sessões na tela de Conversa.
- Catálogo de comandos: `commands.catalog` → filtrar por lista de permitidos na web + tradução local.
