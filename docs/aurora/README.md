# Hermes Aurora — Central de Operações

Painel web do Hermes (dashboard) com conversa, caixa de entrada, aprovações, atividade, memória e
configurações. Nada é dado de exemplo: tudo vem do Hermes que está rodando e do arquivo
`$HERMES_HOME/ops.db` (SQLite), criado sozinho no primeiro uso.

## Como as peças se encaixam

| Processo | O que faz |
|---|---|
| `hermes gateway` | Recebe mensagens (Telegram, WhatsApp, Discord, Slack…). Cada mensagem real vira item da **Caixa de entrada**. |
| `hermes dashboard` | Serve o painel e a API `/api/ops/*`. Lê e grava o mesmo `ops.db`. |

Os dois usam o mesmo `HERMES_HOME`. O gateway pode ficar parado: o painel continua funcionando
(conversa, memória, configurações), só a caixa de entrada fica vazia.

### Autonomia por canal (Aprovações → Autonomia)

Todo canal novo aparece com o modo **Autônomo**, o comportamento padrão do Hermes. Dá para mudar
por canal:

- **Observar**: registra a mensagem e não responde.
- **Rascunhar**: o Hermes escreve a resposta, mas ela **não é enviada**. Vira rascunho em
  *Aprovações*. Ao aprovar, o envio usa o adaptador do gateway que está rodando; com o gateway
  parado, usa o mesmo caminho do `hermes send`.
- **Autônomo**: responde sozinho e registra a resposta na *Atividade*.

O botão **Pausar** (kill switch) bloqueia tudo: o gateway não inicia turnos e o painel recusa
envios até você retomar.

### O que você configura no painel

- **Configurações → Negócios**: nome e cor. O seletor da barra lateral filtra todas as telas.
- **Aprovações → Autonomia**: modo e negócio de cada canal.
- **Radar**: palavras vigiadas. Uma mensagem com uma delas entra como *urgente*.
- **Pessoas** e **Playbooks**: cadastro manual.
- **Memória**: o que o agente sabe (`MEMORY.md` e `USER.md`), com edição direta.
- **Modelo**: seletor no rodapé da Conversa.

## Instalar numa VPS

1. Instale o Hermes (`curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash`) e rode
   `hermes setup` para escolher o provedor e o modelo.
2. Conecte os canais: `hermes gateway setup`, depois `hermes gateway install` para deixar o gateway
   como serviço (reinicia sozinho e sobe com a máquina).
3. Proteja o painel. Fora do `127.0.0.1` ele só sobe com login. Em `~/.hermes/.env`:

   ```bash
   HERMES_DASHBOARD_BASIC_AUTH_USERNAME=admin
   HERMES_DASHBOARD_BASIC_AUTH_PASSWORD=uma-senha-forte
   HERMES_DASHBOARD_BASIC_AUTH_SECRET=$(openssl rand -base64 32)
   ```

4. Suba o painel como serviço (systemd do usuário):

   ```ini
   # ~/.config/systemd/user/hermes-dashboard.service
   [Service]
   EnvironmentFile=%h/.hermes/.env
   # shell de login: acha o `hermes` no PATH, onde quer que o instalador o tenha posto
   ExecStart=/bin/sh -lc 'exec hermes dashboard --host 0.0.0.0 --port 9119 --no-open'
   Restart=always
   RestartSec=10
   RestartPreventExitStatus=78

   [Install]
   WantedBy=default.target
   ```

   ```bash
   systemctl --user daemon-reload && systemctl --user enable --now hermes-dashboard
   loginctl enable-linger "$USER"   # mantém os serviços rodando sem sessão aberta
   ```

5. Acesse `http://IP_DA_VPS:9119` e entre com o usuário e a senha.

Usuário e senha só servem em rede confiável (VPN, Tailscale) ou atrás de HTTPS. Para expor na
internet, use OAuth/OIDC ou deixe o painel em `127.0.0.1` e acesse por túnel
(`ssh -L 9119:127.0.0.1:9119 vps`). Mais detalhes em
[web-dashboard → Authentication](../../website/docs/user-guide/features/web-dashboard.md#authentication-gated-mode).

### Várias VPS

Cada VPS roda o próprio Hermes, com o próprio `ops.db` e o próprio painel. Ainda não existe um
painel único que reúna várias máquinas: abra o painel de cada uma, ou use um perfil por sistema
(`hermes -p <perfil>`) quando forem várias operações na mesma máquina.
