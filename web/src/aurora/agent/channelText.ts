// Textos dos canais em português (o catálogo do backend vem em inglês). Canal ou campo fora daqui
// cai no texto original. ``advanced`` força "avançado" (campos que dependem de outro que não está à vista).

type Field = { label: string; help?: string; example?: string; advanced?: boolean };

/** Ordem de relevância: os primeiros aparecem antes; o resto vai para "Outros canais". */
export const MAIN_CHANNELS = ["telegram", "whatsapp", "whatsapp_cloud", "discord", "slack", "email", "sms", "teams", "google_chat", "signal", "matrix", "mattermost"];

export const CHANNEL_PT: Record<string, { name?: string; description: string }> = {
  telegram: { description: "Converse com o Hermes no Telegram: conversas diretas, grupos e tópicos." },
  whatsapp: { name: "WhatsApp (QR code)", description: "Usa o WhatsApp do seu celular, conectado por QR code (ponte local)." },
  whatsapp_cloud: { name: "WhatsApp Business (API oficial)", description: "API oficial da Meta para WhatsApp Business, sem ponte local." },
  discord: { description: "Converse com o Hermes no Discord: mensagens diretas, canais e threads." },
  slack: { description: "Use o Hermes no Slack (modo Socket). Informe quem pode falar com ele." },
  email: { name: "E-mail", description: "O Hermes lê e responde uma caixa de e-mail (IMAP/SMTP)." },
  sms: { name: "SMS (Twilio)", description: "Envia e recebe SMS por um número da Twilio." },
  teams: { description: "Conversas do Microsoft Teams, por um bot registrado no Azure." },
  google_chat: { description: "Google Chat via Cloud Pub/Sub ou eventos HTTP." },
  signal: { description: "Signal por uma ponte signal-cli (REST)." },
  matrix: { description: "Salas e mensagens diretas no Matrix." },
  mattermost: { description: "Canais e mensagens diretas no Mattermost." },
};

const ALLOWED = "Quem pode falar com o Hermes";

export const FIELD_PT: Record<string, Field> = {
  TELEGRAM_BOT_TOKEN: { label: "Token do bot", help: "Crie o bot com o @BotFather no Telegram e cole o token completo (número, dois-pontos e o segredo).", example: "123456789:AA…" },
  TELEGRAM_ALLOWED_USERS: { label: ALLOWED, help: "IDs numéricos do Telegram, um por linha. Em branco: cada pessoa nova pede acesso e você aprova.", example: "123456789" },
  TELEGRAM_WEBHOOK_SECRET: { label: "Segredo do webhook", help: "Só para o modo webhook. No modo padrão, deixe em branco.", advanced: true },

  DISCORD_BOT_TOKEN: { label: "Token do bot", help: "No Discord Developer Portal: seu app → Bot → Reset Token.", example: "MTA…" },
  DISCORD_ALLOWED_USERS: { label: ALLOWED, help: "IDs de usuário do Discord, um por linha (modo desenvolvedor → Copiar ID).", example: "123456789012345678" },

  SLACK_BOT_TOKEN: { label: "Token do bot (xoxb-…)", help: "No app do Slack: adicione os escopos, instale no workspace e copie em OAuth & Permissions.", example: "xoxb-…" },
  SLACK_APP_TOKEN: { label: "Token do app (xapp-…)", help: "Ative o Socket Mode e crie em Basic Information → App-Level Tokens (escopo connections:write).", example: "xapp-…" },
  SLACK_ALLOWED_USERS: { label: ALLOWED, help: "IDs de membro do Slack, um por linha (perfil → ⋯ → Copiar ID de membro).", example: "U0123ABCD" },

  WHATSAPP_ENABLED: { label: "Ligar o WhatsApp", help: "Digite true para ligar. Depois, inicie o gateway: o QR code para escanear com o celular aparece nos Logs.", example: "true" },
  WHATSAPP_MODE: { label: "Modo da ponte", help: "Deixe em branco para o padrão.", advanced: true },
  WHATSAPP_DM_POLICY: { label: "Quem pode mandar mensagem direta", help: "Deixe em branco para o padrão (só quem está na lista abaixo).", advanced: true },
  WHATSAPP_ALLOWED_USERS: { label: ALLOWED, help: "Números com DDI, um por linha.", example: "5511999999999" },

  EMAIL_ADDRESS: { label: "Endereço de e-mail", example: "hermes@suaempresa.com" },
  EMAIL_PASSWORD: { label: "Senha", help: "Senha da conta ou senha de app (no Gmail, use senha de app)." },
  EMAIL_IMAP_HOST: { label: "Servidor de entrada (IMAP)", example: "imap.gmail.com" },
  EMAIL_SMTP_HOST: { label: "Servidor de saída (SMTP)", example: "smtp.gmail.com" },
  EMAIL_SMTP_PORT: { label: "Porta SMTP", help: "Padrão 587.", example: "587", advanced: true },
  EMAIL_ALLOWED_USERS: { label: ALLOWED, help: "Endereços de e-mail, um por linha.", example: "voce@empresa.com" },
  EMAIL_AUTHSERV_ID: { label: "authserv-id do servidor de e-mail", help: "Proteção contra remetente falso; deixe em branco se não souber.", advanced: true },

  TWILIO_ACCOUNT_SID: { label: "Account SID da Twilio", example: "AC…" },
  TWILIO_AUTH_TOKEN: { label: "Auth Token da Twilio" },
  TWILIO_PHONE_NUMBER: { label: "Número da Twilio (com DDI)", example: "+5511999999999" },
  SMS_ALLOWED_USERS: { label: ALLOWED, help: "Números com DDI, um por linha.", example: "+5511999999999" },

  TEAMS_CLIENT_ID: { label: "ID do aplicativo (Azure)", help: "No portal do Azure: registro do app do bot → ID do aplicativo (cliente)." },
  TEAMS_CLIENT_SECRET: { label: "Senha do aplicativo (Azure)", help: "Certificados e segredos → novo segredo do cliente." },
  TEAMS_TENANT_ID: { label: "ID do diretório (Azure)", help: "Visão geral do app → ID do diretório (locatário)." },
  TEAMS_ALLOWED_USERS: { label: ALLOWED, help: "E-mails do Teams, um por linha.", example: "voce@empresa.com" },
  TEAMS_GRAPH_ACCESS_TOKEN: { label: "Token do Microsoft Graph", help: "Só para enviar resumos de reunião pelo Graph.", advanced: true },
  TEAMS_INCOMING_WEBHOOK_URL: { label: "URL de webhook de entrada", help: "Só para enviar resumos de reunião por webhook.", advanced: true },
  TEAMS_HOST: { label: "Endereço do webhook", advanced: true },
  TEAMS_PORT: { label: "Porta do webhook", help: "Padrão 3978.", advanced: true },

  GOOGLE_CHAT_SERVICE_ACCOUNT_JSON: { label: "Conta de serviço (JSON)", help: "Caminho do arquivo JSON ou o próprio JSON. Em branco usa as credenciais padrão do Google Cloud." },
  GOOGLE_CHAT_ALLOWED_USERS: { label: ALLOWED, help: "E-mails, um por linha.", example: "voce@empresa.com" },
  GOOGLE_CHAT_PROJECT_ID: { label: "ID do projeto no Google Cloud", advanced: true },
  GOOGLE_CHAT_SUBSCRIPTION_NAME: { label: "Assinatura do Pub/Sub", advanced: true },
  GOOGLE_CHAT_HTTP_EVENTS_URL: { label: "URL de eventos HTTP", advanced: true },
  GOOGLE_CHAT_HTTP_EVENTS_AUDIENCE: { label: "Audience dos eventos HTTP", advanced: true },
  GOOGLE_CHAT_HTTP_EVENTS_SERVICE_ACCOUNT_EMAIL: { label: "E-mail da conta de serviço dos eventos", advanced: true },

  SIGNAL_HTTP_URL: { label: "Endereço da ponte signal-cli", example: "http://127.0.0.1:8080" },
  SIGNAL_ACCOUNT: { label: "Número do Signal (com DDI)", example: "+5511999999999" },
  SIGNAL_ALLOWED_USERS: { label: ALLOWED, help: "Números do Signal com DDI, um por linha.", example: "+5511999999999" },

  MATRIX_HOMESERVER: { label: "Servidor (homeserver)", example: "https://matrix.org" },
  MATRIX_ACCESS_TOKEN: { label: "Token de acesso", help: "Preferível à senha." },
  MATRIX_USER_ID: { label: "Usuário do bot", example: "@hermes:matrix.org" },
  MATRIX_PASSWORD: { label: "Senha (alternativa ao token)", advanced: true },
  MATRIX_ALLOWED_USERS: { label: ALLOWED, help: "Usuários no formato @nome:servidor, um por linha.", example: "@voce:matrix.org" },
  MATRIX_DEVICE_ID: { label: "ID do dispositivo", advanced: true },
  MATRIX_RECOVERY_KEY: { label: "Chave de recuperação", advanced: true },

  MATTERMOST_URL: { label: "Endereço do servidor", example: "https://mm.suaempresa.com" },
  MATTERMOST_TOKEN: { label: "Token do bot" },
  MATTERMOST_ALLOWED_USERS: { label: ALLOWED, help: "IDs de usuário do Mattermost, um por linha (perfil → Copiar ID).", example: "8xk3…" },
};

/** Ferramentas (toolsets) em português: nome curto e o que permitem, numa linha. */
export const TOOL_PT: Record<string, [string, string]> = {
  web: ["Busca na web", "Pesquisa e lê páginas da internet"],
  browser: ["Navegador", "Abre sites, clica e preenche formulários"],
  terminal: ["Terminal", "Roda comandos e programas na máquina"],
  file: ["Arquivos", "Lê, cria e edita arquivos"],
  code_execution: ["Execução de código", "Roda trechos de código para calcular e testar"],
  vision: ["Visão", "Entende imagens e capturas de tela"],
  video: ["Análise de vídeo", "Entende vídeos (precisa de modelo com vídeo)"],
  image_gen: ["Geração de imagens", "Cria imagens a partir de texto"],
  video_gen: ["Geração de vídeo", "Cria vídeos a partir de texto ou imagem"],
  x_search: ["Busca no X (Twitter)", "Pesquisa no X (precisa de chave da xAI)"],
  tts: ["Fala", "Transforma texto em áudio"],
  stt: ["Transcrição", "Entende mensagens de voz"],
  skills: ["Skills", "Usa e cria procedimentos reutilizáveis"],
  todo: ["Plano de tarefas", "Organiza tarefas longas em passos"],
  kanban: ["Quadro de tarefas", "Gerencia um quadro kanban"],
  memory: ["Memória", "Lembra de você e do trabalho entre conversas"],
  context_engine: ["Motor de contexto", "Ferramentas do motor de contexto ativo"],
  session_search: ["Busca em conversas", "Procura no histórico de conversas"],
  connections: ["Conexões", "Usa contas conectadas (conectores remotos)"],
  clarify: ["Perguntas de esclarecimento", "Pergunta quando algo está ambíguo"],
  delegation: ["Subagentes", "Divide tarefas grandes com outros agentes"],
  cronjob: ["Agendamentos", "Cria e gerencia tarefas agendadas"],
  spotify: ["Spotify", "Controla músicas e playlists"],
  discord: ["Discord (ler e participar)", "Lê mensagens, busca membros, cria threads"],
  discord_admin: ["Discord (administração)", "Canais, cargos e mensagens fixadas"],
  yuanbao: ["Yuanbao", "Grupos e mensagens no Yuanbao"],
  computer_use: ["Controle do computador", "Usa o mouse e o teclado da máquina"],
  a2a: ["Agente para agente (A2A)", "Conversa com outros agentes pelo protocolo A2A"],
  homeassistant: ["Home Assistant", "Controla a casa conectada (precisa do token do Home Assistant)"],
};
