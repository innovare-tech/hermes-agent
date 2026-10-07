# 05 · Entregar ou cortar o que só promete

## Critérios de aceite

### Suporte
- **E5.1** Enquanto não houver conector de tickets, "Suporte" sai do menu (rota mostra explicação + volta).

### Pessoas
- **E5.2** Pendências são checkboxes reais: marcar conclui (some ou risca) e persiste.
- **E5.3** Contato tem campos de identificação por canal (telefone/WhatsApp, @Telegram, e-mail) usados
  para ligar o contato às mensagens da Caixa.
- **E5.4** "Ver histórico" mostra só conversas/mensagens daquele contato (pelo identificador), ou fica
  desabilitado com "adicione um identificador".
- **E5.5** Salvar sem nome mostra mensagem de erro no campo. Campos vazios no cartão não aparecem.
- **E5.6** Estado vazio com filtro ativo diz "Ninguém esperando há mais de 24h".

### Playbooks
- **E5.7** Tipo de gatilho explícito: **Manual**, **Horário** ou **Mensagem com palavra-chave** (canal opcional).
- **E5.8** Gatilho por palavra-chave funciona: mensagem que bate dispara o playbook com o texto da
  mensagem como contexto, respeitando kill switch e autonomia do canal; vira Atividade.
- **E5.9** Playbook novo nasce **desligado** até o usuário revisar e ligar.
- **E5.10** Nome separado do gatilho ("Nome: …" opcional na frase; senão título curto gerado).
- **E5.11** "+ Condição" entra antes do passo final; campos com placeholder; "Criar fluxo" vazio mostra o que escrever.
- **E5.12** Ajuda de horário em português com exemplos clicáveis ("dias úteis às 9h"), aceitando também as frases em inglês.

### Subagentes / Agendamentos
- **E5.13** Agendamentos: estado vazio com exemplos clicáveis e aviso se o gateway está parado.
- **E5.14** "Agendar" vazio mostra o que escrever.
- **E5.15** Subagentes: estado vazio explica quando aparecem ("o Hermes cria subagentes para tarefas
  longas — peça na Conversa") com botão para a Conversa; estados vazios com o mesmo estilo.

### Sessões / Memória
- **E5.16** Sessões: renomear e apagar (com confirmação).
- **E5.17** Memória: filtro sem resultado mostra "Nada com esse termo" nas duas colunas.
