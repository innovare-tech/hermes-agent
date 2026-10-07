# 02 · Primeiro uso e padrões seguros

Quem instala o Hermes numa VPS nova precisa sair do assistente com: modelo funcionando, pelo menos um
canal conectado (opcional) e padrões seguros. Hoje o assistente não deixa cadastrar chave, corta o
Passo 3 e só "marca" canais sem pedir credencial; canais novos respondem sozinhos.

## Critérios de aceite

### Assistente de setup
- **P2.1** Todos os passos cabem e rolam: nenhum título ou fileira fica inacessível (testar a 1280×600).
- **P2.2** Passo "Modelo": lista provedores com e sem chave; escolher um sem chave pede a chave ali mesmo
  (campo de senha + link "onde pegar"), salva, e em seguida lista os modelos daquele provedor para escolher.
- **P2.3** Passo "Canais": escolher um canal abre os campos de credencial dele (mesmo formulário de
  Gateways), com "Testar conexão"; é possível pular.
- **P2.4** Passo "Segurança": explica e deixa escolher o modo padrão para canais novos (Observar /
  Rascunhar / Autônomo), já marcado em **Rascunhar**.
- **P2.5** Nada é aplicado "no clique" sem o usuário perceber: cada passo tem "Salvar e continuar"; "Pular" não aparece no último passo.
- **P2.6** Resumo final em português natural ("Nenhum canal conectado ainda — dá para conectar depois em Gateways").
- **P2.7** Assistente abre sozinho na primeira vez (sem modelo configurado) e pode ser reaberto em Configurações.

### Padrões
- **P2.8** Modo padrão de canais novos é configurável (Aprovações → Autonomia) e o padrão de fábrica é **Rascunhar**.
  Canais já registrados não mudam.
- **P2.9** O texto de Aprovações explica o padrão atual em uma frase, sem "comportamento atual do Hermes".
- **P2.10** Gateway: se há canal ligado e o gateway está parado, aviso visível em Gateways e no Painel
  com botão "Iniciar gateway".

## Notas técnicas
- Padrão de canal novo: `ops_center.store` — guardar em `meta` (`default_mode`), usar em `touch_channel`.
- Chaves: reaproveitar `ApiKeysEditor`/`agent.setApiKey`; provedores sem chave via `/api/model/options?include_unconfigured=1`.
- Credenciais de canal: reaproveitar o `Setup` de `screens/Gateways.tsx`.
