# 04 · Números e estados verdadeiros

O painel mostra "tudo verde" com gateway parado, Atividade sempre vazia, rótulos de período errados e
filtro por negócio que não filtra custo.

## Critérios de aceite

### Atividade
- **V4.1** Registram-se automaticamente (backend, não só o front): pausar/retomar; aprovar/negar
  rascunho; resposta autônoma enviada; executar playbook; criar/editar/remover negócio, contato,
  playbook; mudar modo de canal; salvar/apagar credencial de canal ou chave (sem o valor);
  iniciar/parar/reiniciar gateway; editar/esquecer memória.
- **V4.2** Cada item diz o quê, quando, por quê (quem pediu: "você no painel", "canal Autônomo"…) e
  tem "Desfazer" só quando é de fato reversível.
- **V4.3** Filtros só para tipos que existem (sem "Pagamentos"/"Tickets" enquanto não houver).

### Saúde (Painel)
- **V4.4** Saúde reflete: gateway parado com canal ligado → "Atenção"; erro de canal → "Atenção" com o canal;
  backend sem resposta → "Offline". Verde só quando tudo ok. Clicar leva ao lugar do problema.
- **V4.5** Avisos graves recentes do log (travamento do servidor, falha de canal) aparecem como alerta no Painel.

### Rótulos e custos
- **V4.6** Cada cartão do Painel diz o período que realmente mostra (hoje / 7 dias / mês) e bate com a requisição.
- **V4.7** Dinheiro formatado como "US$ 0,16".
- **V4.8** Com um negócio selecionado, custo e números mostram só daquele negócio; se o dado não
  existe por negócio, o cartão diz "todos os negócios".
- **V4.9** "alertas nos grupos 0" não fica vermelho; zero é neutro. Sem traço solto ("BRIEFING · —").
- **V4.10** Briefing da manhã tem botão "Criar agendamento" que cria o cron sugerido.

### Logs
- **V4.11** Busca por texto e download do trecho visível.
- **V4.12** Sem nível duplicado nem coluna vazia; filtro sem resultado mostra "Nenhuma linha".
- **V4.13** Ruído de conexão (`ws closed … reaped_sessions=0`) agrupado ou oculto por padrão.
