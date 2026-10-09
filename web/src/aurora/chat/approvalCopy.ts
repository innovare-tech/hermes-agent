// Pedido de aprovação do gateway (descrição em inglês) → título e explicação em português.
// A descrição original continua disponível, recolhida, no cartão.

type Rule = [RegExp, string, string];

const RULES: Rule[] = [
  [/execute_code|script execution/i, "Executar um script de código", "O Hermes quer rodar um script. Ele pode abrir outros programas e alterar arquivos sem passar pela aprovação de cada comando. A aprovação vale só para esta execução."],
  [/recursive delete|\brm\b.*-r|delete.*(file|director)|remove.*(file|director)/i, "Apagar arquivos ou pastas", "O comando remove arquivos do computador e não dá para desfazer."],
  [/force push|git reset --hard|git clean|git branch force|rewrites remote history|destroys uncommitted/i, "Mudança destrutiva no git", "O comando pode apagar alterações não salvas ou reescrever o histórico do repositório."],
  [/sudo|privilege/i, "Comando com privilégios de administrador", "O comando pede permissão elevada (sudo) no computador."],
  [/chmod|chown|permission/i, "Mudar permissões de arquivos", "O comando altera quem pode ler ou executar arquivos."],
  [/uninstall|package manager/i, "Desinstalar um programa", "O comando remove software instalado, possivelmente fora do projeto atual."],
  [/curl|wget|pipe.*(sh|bash)|download.*execute|remote.*execut/i, "Baixar e executar algo da internet", "O comando baixa conteúdo da rede e o executa — confira a origem antes de aprovar."],
  [/shell execution|heredoc|bash -c|sh -c|\beval\b|script.*(-e|-c) flag/i, "Executar um comando de shell", "O comando roda outro programa de forma indireta, o que escapa das verificações simples."],
  [/overwrite|truncate|\bdd\b|mkfs|\bformat\b|\bdisk\b/i, "Sobrescrever dados", "O comando grava por cima de arquivos ou de um disco."],
  [/kill|pkill|terminate|stop.*process|systemctl|service/i, "Encerrar processos ou serviços", "O comando para programas que estão rodando no computador."],
  [/\.ssh|credential|secret|token|password|\benv\b/i, "Mexer em credenciais", "O comando lê ou altera chaves, senhas ou variáveis de ambiente."],
];

export function approvalCopy(description: string, tool?: string): { title: string; why: string; original: string } {
  const original = description.trim();
  const hay = `${tool ?? ""} ${original}`;
  const hit = RULES.find(([re]) => re.test(hay));
  if (hit) return { title: hit[1], why: hit[2], original };
  return { title: "Executar um comando", why: "O Hermes quer fazer algo que pede a sua aprovação antes de continuar. Confira o comando abaixo.", original };
}
