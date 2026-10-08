# 03 · Português e clareza

Textos que vêm do backend (catálogos de canais, chaves, ferramentas, skills, comandos) estão em inglês
e técnicos; telas mostram tudo ao mesmo tempo. Quem recebe o Hermes distribuído não entende.

## Critérios de aceite

### Gateways
- **T3.1** Nome, descrição, rótulo e ajuda de cada campo dos canais principais (Telegram, WhatsApp,
  Discord, Slack, Email, Signal, Matrix, Mattermost, SMS, Google Chat, Teams) em português.
  Placeholder é um exemplo, nunca o nome da variável.
- **T3.2** Campo de lista sem contradição (rótulo e placeholder dizem a mesma coisa: "um por linha").
- **T3.3** Campos que dependem de outro ausente (ex.: segredo de webhook) ficam em "avançado".
- **T3.4** Canais ordenados por relevância (principais primeiro); experimentais/raros num grupo "Outros" recolhido.
- **T3.5** Clicar em qualquer lugar do cartão abre o formulário. Busca sem resultado mostra "Nenhum canal com esse nome".
- **T3.6** "Testar conexão" desabilitado mostra o motivo ao lado (não só no tooltip).

### Chaves de API
- **T3.7** Por padrão mostra só as chaves de provedores de modelo conhecidos e as de ferramentas;
  URLs de override e variáveis internas ficam em "Avançado".
- **T3.8** Cada chave com nome amigável ("OpenRouter", "Anthropic (Claude)") e a variável em letra pequena.
- **T3.9** Chave salva mostra "salva · termina em dSsA" (sem "«redacted:…»").
- **T3.10** Provedor conectado por outro meio (OAuth, login) aparece como conectado também na lista de chaves, com "via login".
- **T3.11** A lista não prende a rolagem da página.

### Ferramentas (Configurações)
- **T3.12** Nome e descrição de cada ferramenta em português, uma linha cada.
- **T3.13** Ferramenta que precisa de configuração ausente aparece desligada ou com aviso "precisa configurar".

### Skills
- **T3.14** Busca por nome/descrição.
- **T3.15** Origem honesta: "Incluída no Hermes" vs "Criada por você"/"Aprendida" (só o que de fato foi).
- **T3.16** Clicar abre o detalhe (descrição completa, quando foi usada) com ligar/desligar.
- **T3.17** Descrições não-PT exibidas com aviso discreto ou traduzidas; nenhuma em chinês sem contexto.

### Geral
- **T3.18** `<html lang="pt-BR">` e título da aba "Hermes · <tela>".
- **T3.19** Atalho mostra "Ctrl K" no Windows/Linux e "⌘K" no Mac.
- **T3.20** Sem jargão visível: "FTS5", "MEMORY.md/USER.md" (vira "Notas do agente"/"Sobre você"),
  "~/.hermes", "persona: padrão" → "Personalidade: Padrão", "local" → "Executa: nesta máquina".
- **T3.21** Contadores com unidade ("0 de 2.200 caracteres").
