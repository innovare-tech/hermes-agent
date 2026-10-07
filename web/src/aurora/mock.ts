// Dados mock — copiados do <script data-dc-script> do protótipo.
import type { Activity, Approval, Channel, InboxItem, OpsAdapter, OpsSnapshot, Person, Playbook, RadarGroup, Ticket } from "./adapter";

const INBOX: InboxItem[] = [
  { id: "i1", business: "inn", channel: "WhatsApp", from: "Marcos Teles", initials: "MT", receivedAt: "06:52", priority: "urgente", autonomyMode: "Rascunhar", summary: "Painel da Teles Log fora do ar (erro 502) desde 06:40", message: "Bom dia! O painel da Teles Log não abre desde cedo, dá erro 502. Temos operação às 9h!", suggestedReply: "Bom dia, Marcos. Já identifiquei: o certificado do balanceador expirou às 06:38. Estou renovando agora — volta em até 10 minutos e te aviso por aqui.", context: ["Cliente desde 2023, plano Enterprise", "Prefere WhatsApp e prazos claros", "Último incidente em 14 ago, resolvido em 22 min"] },
  { id: "i2", business: "unic", channel: "Grupo", from: "Unic · Suporte VIP", initials: "SV", receivedAt: "08:44", priority: "urgente", autonomyMode: "Rascunhar", summary: "3 clientes relatando lentidão na geração de relatórios", message: "Tiago: relatório mensal travado há 30 min. Bianca: aqui também. Lumen: alguma previsão?", suggestedReply: "Pessoal, já estamos em cima. A geração de relatórios está lenta desde 08:10 por uma fila travada — estou reiniciando o worker agora e aviso aqui assim que normalizar.", context: ["Grupo com 48 clientes VIP da Unic", "Ticket #2041 já aberto e ligado ao erro", "Clima do grupo caiu 40% na última hora"] },
  { id: "i3", business: "unic", channel: "Suporte", from: "Juliana Prado", initials: "JP", receivedAt: "08:20", priority: "voce", autonomyMode: "Rascunhar", summary: "Pede estorno de cobrança em duplicidade (R$ 189,90)", message: "Fui cobrada duas vezes na mensalidade de setembro. Quero o estorno de uma das cobranças, por favor.", suggestedReply: "Oi, Juliana! Confirmei a cobrança duplicada de R$ 189,90 em 05/09. Já solicitei o estorno — aparece na sua fatura em até 7 dias úteis. Desculpe pelo transtorno.", context: ["Cliente Unic desde jan/2025, plano Pro", "Prefere contato por e-mail, tom formal", "Estorno precisa da sua aprovação (valor > R$ 100)"] },
  { id: "i4", business: "inn", channel: "WhatsApp", from: "Carla Mendes", initials: "CM", receivedAt: "ontem", priority: "voce", autonomyMode: "Rascunhar", summary: "Propõe reajuste de 12% no contrato de hospedagem", message: "Oi! Segue a proposta de renovação com reajuste de 12% a partir de novembro. Consegue me dar um retorno até quinta?", suggestedReply: "Oi, Carla. Recebi a proposta, obrigado. Vou avaliar com o time e te retorno até quinta.", context: ["Fornecedora de hospedagem desde 2022", "Último reajuste: 6% em out/2025", "Você costuma negociar antes de aceitar"] },
  { id: "i5", business: "pes", channel: "Telegram", from: "Ana", initials: "A", receivedAt: "07:58", priority: "voce", autonomyMode: "Rascunhar", summary: "Pergunta se você vai ao almoço de domingo", message: "Vai no almoço domingo? A mãe quer saber pra fazer a lasanha.", suggestedReply: "Vou sim! Chego por volta de 12h30 e levo a sobremesa.", context: ["Sua irmã", "Almoço na casa da sua mãe, domingo 12h", "Você levou a sobremesa da última vez também"] },
  { id: "i6", business: "inn", channel: "Email", from: "Rafael Nunes", initials: "RN", receivedAt: "07:12", priority: "resolve", autonomyMode: "Autônomo", summary: "Pediu as NFs de setembro — anexei e respondi", message: "Bom dia, pode me mandar as notas de setembro para o fechamento?", suggestedReply: "Bom dia, Rafael. Seguem em anexo as 14 notas fiscais de setembro. Qualquer coisa, estou por aqui.", sentAt: "Enviado sozinho às 07:12 · 14 anexos", context: ["Contador da Innovare", "Pedido recorrente todo dia 7"] },
  { id: "i7", business: "inn", channel: "Telegram", from: "Pedro Lins", initials: "PL", receivedAt: "08:05", priority: "resolve", autonomyMode: "Autônomo", summary: "Perguntou o status do deploy — respondi com o link", message: "O deploy de ontem foi pra produção?", suggestedReply: "Foi sim, às 18:42. Changelog: github.com/innovare-tech/hermes-agent/releases/v2.14", sentAt: "Enviado sozinho às 08:05", context: ["Dev da Innovare"] },
  { id: "i8", business: "unic", channel: "Email", from: "SaaS Weekly", initials: "SW", receivedAt: "06:00", priority: "ignorar", autonomyMode: "Autônomo", summary: "Newsletter semanal", message: "Edição 212: as 10 métricas que todo SaaS deveria acompanhar…", suggestedReply: "", context: ["Você nunca abriu as últimas 8 edições"] },
  { id: "i9", business: "pes", channel: "WhatsApp", from: "Condomínio Jardins", initials: "CJ", receivedAt: "ontem", priority: "ignorar", autonomyMode: "Observar", summary: "Aviso de manutenção da piscina na sexta", message: "Informamos que a piscina estará fechada na sexta para manutenção.", suggestedReply: "", context: ["Grupo do condomínio"] },
];

const APPROVALS: Approval[] = [
  { id: "a1", business: "inn", kind: "comando", icon: "square-terminal", title: "Renovar o certificado do balanceador da Teles Log", risk: "baixo", createdAt: "06:44", why: "O certificado expirou às 06:38 e é a causa do erro 502 relatado pelo Marcos.", preview: "ssh lb-teles 'certbot renew --cert-name teles.app && systemctl reload nginx'", source: "detectado via WhatsApp + monitoramento" },
  { id: "a2", business: "unic", kind: "comando", icon: "rotate-cw", title: "Reiniciar o worker de relatórios (produção)", risk: "médio", createdAt: "08:46", why: "A fila 'reports' está travada há 34 min com 212 jobs pendentes. Reinício resolveu o mesmo problema em 2 de 2 vezes.", preview: "kubectl -n unic rollout restart deploy/reports-worker", source: "ticket #2041" },
  { id: "a3", business: "unic", kind: "reembolso", icon: "receipt", title: "Estornar R$ 189,90 para Juliana Prado", risk: "médio", createdAt: "08:21", why: "Duas transações idênticas em 05/09 no gateway de pagamento. Cobrança duplicada confirmada.", preview: "refund ch_3Pq…8Kd · R$ 189,90 · motivo: duplicidade", source: "caixa de entrada · suporte" },
  { id: "a4", business: "inn", kind: "pagamento", icon: "credit-card", title: "Pagar fatura da AWS de setembro — US$ 1.284,10", risk: "alto", createdAt: "07:00", why: "Vence hoje. Valor 9% acima da média dos últimos 3 meses (aumento em transferência de dados).", preview: "Cartão final 4410 · fatura AWS-2026-09", source: "agendamento: contas a pagar" },
];

const RADAR: RadarGroup[] = [
  { id: "r1", business: "unic", channel: "WhatsApp", name: "Unic · Suporte VIP", members: 48, msgsToday: 132, sentiment: [0.8, 0.78, 0.74, 0.75, 0.66, 0.6, 0.5, 0.42, 0.36, 0.3, 0.27, 0.31], alert: "3 clientes irritados com lentidão nos relatórios desde 08:10", decisions: ["Janela de manutenção movida para sábado, 22h"], mentions: ["Lumen: “@você consegue ver a fatura de outubro?” · 08:41"], unanswered: ["Quando sai a exportação em Excel? — Tiago", "Relatório travado há 30 min — Bianca"] },
  { id: "r2", business: "inn", channel: "Telegram", name: "Innovare · Sócios", members: 4, msgsToday: 27, sentiment: [0.7, 0.72, 0.7, 0.75, 0.8, 0.78, 0.82, 0.8, 0.76, 0.8, 0.84, 0.83], decisions: ["Contratar 2 devs pleno até novembro", "Orçamento de marketing do Q4: R$ 40 mil"], mentions: ["Lucas: “@você revisa o contrato da Teles até sexta?”"], unanswered: [] },
  { id: "r3", business: "unic", channel: "WhatsApp", name: "Unic · Comercial", members: 6, msgsToday: 18, sentiment: [0.6, 0.62, 0.6, 0.55, 0.58, 0.5, 0.52, 0.48, 0.5, 0.47, 0.5, 0.49], alert: "Um lead citou o concorrente “Ploomes” 2 vezes", decisions: ["Desconto máximo de 15% em planos anuais"], mentions: [], unanswered: ["Grupo Ápice pediu proposta até amanhã"] },
  { id: "r4", business: "inn", channel: "Discord", name: "Innovare · Time Dev", members: 12, msgsToday: 210, sentiment: [0.7, 0.65, 0.68, 0.72, 0.7, 0.74, 0.7, 0.68, 0.72, 0.75, 0.7, 0.73], decisions: ["Congelar deploys na sexta"], mentions: [], unanswered: ["Alguém aprova o PR #421?"] },
  { id: "r5", business: "pes", channel: "WhatsApp", name: "Família", members: 9, msgsToday: 64, sentiment: [0.85, 0.88, 0.9, 0.86, 0.9, 0.92, 0.88, 0.9, 0.93, 0.9, 0.91, 0.94], decisions: ["Almoço de domingo na casa da mãe, 12h"], mentions: ["Ana: “você vai?”"], unanswered: ["Quem leva a sobremesa?"] },
];

const TICKETS: Ticket[] = [
  { n: 2041, business: "unic", client: "Lumen Contábil", title: "Relatório mensal não gera", system: "Relatórios", status: "investigando", owner: "Hermes", sla: "12 min", message: "O relatório mensal fica carregando e não termina. Preciso dele para o fechamento de hoje.", relatedError: "TimeoutError: job reports:monthly exceeded 300s\n  at Worker.process (workers/reports.ts:88)\n  at Queue.run (lib/queue.ts:141)\n→ 212 jobs pendentes na fila 'reports' desde 08:10", proposedFix: "Reiniciar o worker (aguardando sua aprovação) e subir o timeout para 600s. Causa raiz: query de faturas sem paginação — sugiro abrir um card." },
  { n: 2039, business: "unic", client: "Juliana Prado", title: "Cobrança em duplicidade", system: "Pagamentos", status: "aguardando você", owner: "Hermes", sla: "38 min", message: "Fui cobrada duas vezes em setembro.", relatedError: "", proposedFix: "Estornar uma das cobranças (R$ 189,90). Já está na fila de aprovações." },
  { n: 2037, business: "inn", client: "Teles Log", title: "Painel com erro 502", system: "Infra", status: "resolvendo", owner: "Hermes", sla: "2h 01m", message: "O painel não abre desde cedo, erro 502.", relatedError: "nginx: SSL_do_handshake() failed\ncert teles.app expired at 2026-10-07 06:38 -03", proposedFix: "Renovar o certificado e ativar renovação automática com alerta 15 dias antes." },
  { n: 2033, business: "unic", client: "Bianca Rocha", title: "Como exportar em Excel?", system: "Relatórios", status: "resolvido", owner: "Hermes", sla: "1m 12s", message: "Tem como exportar o relatório em Excel?", relatedError: "", proposedFix: "Respondido com o artigo da base “Como exportar relatórios em Excel”." },
  { n: 2030, business: "inn", client: "Ótica Visão", title: "Usuário sem acesso após troca de e-mail", system: "Autenticação", status: "resolvido", owner: "você", sla: "24 min", message: "Troquei meu e-mail e não consigo mais entrar.", relatedError: "", proposedFix: "Reenviar convite e invalidar sessão antiga." },
  { n: 2028, business: "unic", client: "Grupo Ápice", title: "Integração com ERP parou", system: "Integrações", status: "aberto", owner: "você", sla: "2h 10m", message: "Os pedidos pararam de entrar no ERP desde ontem à noite.", relatedError: "401 Unauthorized · POST /erp/v2/orders\ntoken expirado em 2026-10-06 23:00", proposedFix: "O token da integração expirou. Gerar novo token no painel do ERP e atualizar o segredo ERP_TOKEN." },
];

const act = (id: number, at: string, business: string, kind: Activity["kind"], action: string, why: string, reversible: boolean): Activity => ({ id: String(id), at, business, kind, action, why, reversible, undone: false });

const ACTIVITY: Activity[] = [
  act(1, "08:52", "unic", "msg", "Respondeu Bianca Rocha com o artigo “Como exportar relatórios em Excel”", "pergunta igual a 3 tickets anteriores; canal em modo autônomo.", false),
  act(2, "08:41", "unic", "tkt", "Abriu o ticket #2041 e ligou ao erro TimeoutError do worker de relatórios", "3 mensagens sobre lentidão no grupo VIP em 10 minutos.", false),
  act(3, "08:05", "inn", "msg", "Respondeu Pedro Lins com o link do release v2.14", "pergunta factual, resposta verificável no GitHub.", true),
  act(4, "07:30", "all", "msg", "Enviou o briefing da manhã no Telegram", "agendamento diário das 07:30.", false),
  act(5, "07:12", "inn", "msg", "Enviou as 14 NFs de setembro para Rafael Nunes", "pedido recorrente todo dia 7; e-mail da contabilidade em modo autônomo.", true),
  act(6, "06:44", "inn", "tkt", "Detectou o erro 502 da Teles Log e preparou a correção", "mensagem do cliente + certificado expirado no monitoramento.", false),
  act(7, "03:00", "inn", "cmd", "Fez o backup do Postgres para o S3 (2,3 GB, checksum ok)", "agendamento noturno.", false),
  act(8, "01:30", "unic", "mem", "Salvou memória: “Juliana prefere contato por e-mail”", "ela pediu isso explicitamente no ticket #2039.", true),
  act(9, "00:10", "inn", "pay", "Pagou a fatura da Vercel — US$ 20,00", "abaixo do limite de pagamento automático (US$ 50).", false),
];

const AUTONOMY: Channel[] = [
  { id: "c1", name: "WhatsApp · clientes Innovare", icon: "phone", business: "inn", mode: 1 },
  { id: "c2", name: "Grupo Unic · Suporte VIP", icon: "users", business: "unic", mode: 1 },
  { id: "c3", name: "Tickets de suporte Unic", icon: "life-buoy", business: "unic", mode: 2 },
  { id: "c4", name: "Email · contabilidade", icon: "mail", business: "inn", mode: 2 },
  { id: "c5", name: "Grupo Innovare · Sócios", icon: "users", business: "inn", mode: 0 },
  { id: "c6", name: "Telegram · família", icon: "send", business: "pes", mode: 1 },
];

const PEOPLE: Person[] = [
  { id: "p1", name: "Carla Mendes", initials: "CM", role: "Fornecedora · hospedagem (Innovare)", business: "inn", waitingHours: 26, lastTopic: "Reajuste de 12% no contrato", tone: "Cordial, negocia bem", channels: "WhatsApp, Email", pending: ["Responder a proposta até quinta"] },
  { id: "p2", name: "Tiago Alves", initials: "TA", role: "Cliente VIP · Unic", business: "unic", waitingHours: 31, lastTopic: "Prazo da exportação em Excel", tone: "Direto, um pouco impaciente", channels: "Grupo VIP, Email", pending: ["Dar prazo da exportação em Excel"] },
  { id: "p3", name: "Marcos Teles", initials: "MT", role: "Cliente · Teles Log (Innovare)", business: "inn", waitingHours: 2, lastTopic: "Painel fora do ar (502)", tone: "Direto, gosta de prazos claros", channels: "WhatsApp", pending: ["Confirmar que o painel voltou"] },
  { id: "p4", name: "Juliana Prado", initials: "JP", role: "Cliente · Unic", business: "unic", waitingHours: 1, lastTopic: "Estorno de setembro", tone: "Formal", channels: "Email, Suporte", pending: ["Confirmar o estorno"] },
  { id: "p5", name: "Ana", initials: "A", role: "Irmã", business: "pes", waitingHours: 1, lastTopic: "Almoço de domingo", tone: "Descontraído", channels: "Telegram, WhatsApp", pending: ["Confirmar presença no almoço"] },
  { id: "p6", name: "Rafael Nunes", initials: "RN", role: "Contador · Innovare", business: "inn", waitingHours: 0, lastTopic: "NFs de setembro (enviadas)", tone: "Objetivo", channels: "Email", pending: [] },
  { id: "p7", name: "Lucas Ferraz", initials: "LF", role: "Sócio · Innovare", business: "inn", waitingHours: 30, lastTopic: "Revisar contrato da Teles", tone: "Informal", channels: "Telegram", pending: ["Revisar o contrato da Teles até sexta"] },
];

const node = (kind: Playbook["nodes"][number]["kind"], text: string, elseText?: string) => (elseText ? { kind, text, elseText } : { kind, text });

const PLAYBOOKS: Playbook[] = [
  { id: "b1", name: "2ª via de boleto", business: "unic", trigger: "Mensagem no WhatsApp com “boleto” ou “2ª via”", runs: 142, enabled: true, lastRun: "há 18 min", nodes: [node("trigger", "Mensagem no WhatsApp contém “boleto” ou “2ª via”"), node("action", "Identificar o cliente pelo telefone no CRM da Unic"), node("cond", "Existe fatura em aberto?", "responder que está tudo em dia"), node("action", "Gerar a 2ª via no gateway e enviar o PDF"), node("end", "Registrar no ticket e na Atividade")] },
  { id: "b2", name: "Incidente de cliente", business: "inn", trigger: "Cliente fala em “fora do ar”, “erro” ou “502”", runs: 9, enabled: true, lastRun: "hoje 06:44", nodes: [node("trigger", "Cliente menciona “fora do ar”, “erro” ou “502”"), node("action", "Checar monitoramento e logs do sistema do cliente"), node("cond", "Incidente confirmado?", "pedir print e mais detalhes"), node("action", "Propor correção → fila de Aprovações"), node("action", "Avisar o cliente com previsão de volta"), node("end", "Abrir ticket e acompanhar até resolver")] },
  { id: "b3", name: "Lead no comercial", business: "unic", trigger: "Número desconhecido escreve no WhatsApp Comercial", runs: 37, enabled: true, lastRun: "ontem", nodes: [node("trigger", "Número desconhecido no WhatsApp Comercial"), node("action", "Qualificar: empresa, tamanho, necessidade"), node("cond", "Lead qualificado?", "enviar material e nutrir"), node("action", "Agendar demo na sua agenda"), node("end", "Criar oportunidade no CRM")] },
  { id: "b4", name: "Fechamento do mês", business: "inn", trigger: "Último dia útil do mês, 17h", runs: 6, enabled: false, lastRun: "30 set", nodes: [node("trigger", "Último dia útil do mês, 17h"), node("action", "Exportar faturamento e despesas"), node("action", "Enviar planilha para o contador"), node("end", "Resumo no Telegram")] },
];

const SNAPSHOT: OpsSnapshot = {
  account: { plan: "Nous Portal · Plus", credits: "$14,20 de $22 em créditos", home: "~/.hermes", version: "v2.14" },
  businesses: [
    { id: "inn", name: "Innovare", color: "#9d8cff" },
    { id: "unic", name: "Unic", color: "#3fd0b0" },
    { id: "pes", name: "Pessoal", color: "#f0b45a" },
  ],
  inbox: INBOX,
  approvals: APPROVALS,
  radar: RADAR,
  tickets: TICKETS,
  activity: ACTIVITY,
  autonomy: AUTONOMY,
  briefing: [
    { business: "inn", at: "07:30", text: "Teles Log com erro 502 desde 06:40 — a correção está pronta e espera sua aprovação. Carla Mendes propôs reajuste de 12% no contrato." },
    { business: "unic", at: "07:30", text: "Relatórios lentos desde 08:10 e 3 clientes reclamaram no grupo VIP. Um estorno aguarda você. 11 tickets resolvidos sozinho durante a noite." },
    { business: "pes", at: "07:30", text: "Almoço de domingo na casa da sua mãe, 12h. A fatura do cartão vence sexta." },
  ],
  last24h: { saved: "3h 40m", autoReplies: 37 },
  health: {
    online: true,
    uptime: "14d 6h",
    items: [
      { name: "Telegram", status: "ok", value: "conectado" },
      { name: "Discord", status: "ok", value: "conectado" },
      { name: "WhatsApp", status: "warn", value: "pareando" },
      { name: "Email", status: "ok", value: "conectado" },
    ],
    responseTime: "1,2s",
  },
  watches: ["cancelar", "concorrente", "reembolso", "urgente"],
  support: { firstResponse: "1m 48s", resolvedByHermes: "78%", csat: "4,7", kbUsage: "64%" },
  kb: [
    { title: "Como exportar relatórios em Excel", source: "escrito a partir do #2033 · hoje", uses: 18 },
    { title: "Por que meu relatório demora?", source: "escrito a partir do #2041 · hoje", uses: 3 },
    { title: "Estorno de cobrança em duplicidade", source: "escrito a partir de 4 tickets · set", uses: 22 },
    { title: "Trocar o e-mail de acesso", source: "escrito a partir do #2030 · ontem", uses: 7 },
  ],
  people: PEOPLE,
  playbooks: PLAYBOOKS,
  costs: {
    month: "outubro",
    total: 62.4,
    limit: 100,
    projection: 91,
    byBusiness: [
      { business: "inn", value: 28.4 },
      { business: "unic", value: 24.1 },
      { business: "pes", value: 9.9 },
    ],
  },
  paused: false,
  demo: true,
};

const hhmm = () => new Date().toTimeString().slice(0, 5);

// Kill switch do mock: guarda o estado para a sincronização periódica não despausar sozinha.
let paused = false;

export const mockAdapter: OpsAdapter = {
  load: async () => ({ ...structuredClone(SNAPSHOT), paused, demo: true }),
  getPaused: async () => paused,
  setPaused: async (p) => {
    paused = p;
  },
  perform: async (a) => ({
    id: crypto.randomUUID(),
    at: hhmm(),
    business: a.business,
    kind: a.kind,
    action: a.action,
    why: a.why,
    reversible: a.reversible ?? true,
    undone: false,
  }),
  deny: async () => {},
  archive: async () => {},
  undo: async () => {},
  draftApproval: async (a) => ({ ...a, id: "ap" + Date.now(), createdAt: "agora" }),
  setWatches: async () => {},
  savePlaybook: async () => {},
  setAutonomy: async () => {},
};
