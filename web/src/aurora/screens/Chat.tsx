import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { spot } from "../Chrome";
import { Icon } from "../Icon";
import { chat } from "../chat";
import { AgentBubble, UserBubble } from "../chat/Bubbles";
import { checkAttachment, attachError, attachKind, refsOf, withRefs } from "../chat/attachments";
import { CommandCard } from "../chat/CommandCard";
import { cmdName, commandError, EFFORT_PT, parseCommandOutput, ptWarning, withWarning } from "../chat/commandOutput";
import { Composer } from "../chat/Composer";
import { ContextPanel } from "../chat/ContextPanel";
import { saveExtras } from "../chat/persist";
import { plural } from "../chat/sources";
import { answered, applyEvent, interrupted, keepForRetry, keepForUndo, lastUserIndex, mergeStat, planEdit, questionCount, retryBlock } from "../chat/turn";
import type { AgentMessage, ApprovalChoice, Attachment, ChatMessage, ContextBreakdown, SentAttachment, SessionInfo, SlashCommand } from "../chat/types";
import { actOnBehalf, ask, loadSessions, toast, useStore } from "../store";

const BACKEND_LABEL: Record<string, string> = { local: "nesta máquina", docker: "Docker", ssh: "via SSH", modal: "Modal", daytona: "Daytona", singularity: "Singularity", vercel_sandbox: "Vercel Sandbox" };
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const BLANK: SessionInfo = { model: "", backend: "local", persona: "padrão", ctxUsed: null, ctxMax: 0, cost: null };

const SUGGESTIONS = [
  { icon: "brain", t: "O que você sabe sobre mim?", d: "Mostra a memória e o perfil que o Hermes guardou" },
  { icon: "calendar-clock", t: "Toda sexta às 18h, resuma minha semana", d: "Cria um agendamento recorrente" },
  { icon: "search", t: "Do que conversamos na última semana?", d: "Busca no histórico de sessões" },
  { icon: "sparkles", t: "Quais skills você tem?", d: "Lista o que o Hermes sabe fazer" },
];

const wide = () => window.innerWidth >= 1280;
const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

type TurnOpts = { keep?: ChatMessage[]; truncateFrom?: number; user?: Omit<Extract<ChatMessage, { role: "user" }>, "id" | "role">; refs?: string[] };

export function Chat() {
  const { sid: param } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const sessions = useStore((s) => s.sessions);
  const [sid, setSid] = useState<string | null>(param ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [info, setInfo] = useState<SessionInfo>(BLANK);
  const [loading, setLoading] = useState(!!param);
  const [running, setRunning] = useState(false);
  const [insp, setInsp] = useState(wide);
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [breakdown, setBreakdown] = useState<ContextBreakdown | null>(null);
  const [pendingModel, setPendingModel] = useState<string | undefined>();
  const [showThinking, setShowThinking] = useState<boolean | null>(null);
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [prefill, setPrefill] = useState<{ text: string; id: number } | null>(null);
  const [openModel, setOpenModel] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [jump, setJump] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const sidRef = useRef(sid);
  sidRef.current = sid;
  // Conversa criada aqui: a URL passa a /chat/<id> sem recarregar o histórico (apagaria a resposta em andamento).
  const created = useRef<string | null>(null);
  const creating = useRef<Promise<string> | null>(null);

  // Sidebar/URL trocou de sessão: recarrega o histórico. Sem id = conversa nova.
  useEffect(() => {
    if (param && param === created.current) return;
    created.current = null;
    setSid(param ?? null);
    setMessages([]);
    setInfo(BLANK);
    setBreakdown(null);
    setPendingModel(undefined);
    setAtts([]);
    setLoading(!!param);
    let alive = true;
    chat
      .history(param ?? null)
      .then((h) => {
        if (!alive) return;
        setMessages(h.messages);
        setInfo(h.info);
        stick.current = true;
      })
      .catch(() => alive && toast("Não consegui abrir essa sessão"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [param]);

  useEffect(() => {
    chat.slashCommands().then(setCommands, () => {});
    const onResize = () => !wide() && setInsp(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Padrão do perfil (esforço e "mostrar pensamento"), enquanto a sessão não informa o dela. Se a leitura falhar, tenta mais algumas vezes.
  const semEsforco = info.effort === undefined;
  useEffect(() => {
    if (!semEsforco) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (left: number) =>
      chat.defaults().then(
        (d) => {
          // Sem checar `alive`: se o histórico chegou antes, o esforço dele vence (guarda no setInfo) e o "mostrar pensamento" ainda é preenchido.
          setShowThinking((cur) => cur ?? d.showReasoning);
          setInfo((i) => (i.effort === undefined ? { ...i, effort: d.effort } : i));
        },
        () => {
          if (alive && left > 0) timer = setTimeout(() => load(left - 1), 1500);
          // Esgotou as tentativas: sem leitura, o menu mostra "padrão" em vez de "…" eterno.
          else if (alive) setInfo((i) => (i.effort === undefined ? { ...i, effort: "" } : i));
        },
      );
    load(3);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [semEsforco]);

  // O gateway avisa quando algo muda na sessão (inclusive por /model e /reasoning digitados): o painel acompanha.
  useEffect(() => {
    if (!sid) return;
    return chat.watch(sid, (e) => {
      if (e.type === "info") {
        const rest = e.info;
        setInfo((i) => ({ ...i, ...rest }));
        if (rest.model) setPendingModel((p) => (p && p === rest.model ? undefined : p));
      } else if (e.type === "title") {
        setInfo((i) => ({ ...i, title: e.title }));
        loadSessions().catch(() => {});
      } else if (e.type === "usage") setInfo((i) => ({ ...i, usage: e.usage, ctxUsed: e.ctxUsed ?? i.ctxUsed, ctxMax: e.ctxMax || i.ctxMax }));
      else if (e.type === "error") toast(e.message);
    });
  }, [sid]);

  // Painel: divisão do contexto (só quando aberto).
  const refreshPanel = useCallback(async () => {
    const id = sidRef.current;
    if (!id) return;
    const [u, b] = await Promise.all([chat.usage(id), chat.breakdown(id)]);
    if (sidRef.current !== id) return;
    if (u) setInfo((i) => ({ ...i, usage: u.usage, cost: u.usage.cost, ctxUsed: u.ctxUsed ?? i.ctxUsed, ctxMax: u.ctxMax || i.ctxMax }));
    setBreakdown(b);
  }, []);
  useEffect(() => {
    if (insp && sid && !loading) refreshPanel().catch(() => {});
  }, [insp, sid, loading, refreshPanel]);

  // Rolagem: acompanha o fim enquanto o usuário não subiu; o botão "ir para o fim" aparece quando subiu.
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = dist < 80;
    setJump(dist > 240);
  };
  const toEnd = (smooth = false) => {
    stick.current = true;
    setJump(false);
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" });
  };
  useEffect(() => {
    if (stick.current) requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight }));
  }, [messages]);

  // Cartões de comando, pensamento, tokens e "interrompido" não vêm do histórico do backend: guarda aqui para o recarregar.
  useEffect(() => {
    if (sid && !loading && !running && messages.length) saveExtras(sid, messages);
  }, [sid, loading, running, messages]);

  const updateLive = (f: (m: AgentMessage) => AgentMessage) => setMessages((list) => list.map((m) => (m.role === "agent" && m.live ? f(m) : m)));

  // Cria a sessão sob demanda (primeira mensagem, primeiro anexo, escolha de esforço): uma só, mesmo com várias chamadas juntas.
  const ensureSession = useCallback((): Promise<string> => {
    if (sidRef.current) return Promise.resolve(sidRef.current);
    creating.current ??= chat
      .create()
      .then((id) => {
        created.current = id;
        sidRef.current = id;
        setSid(id);
        navigate(`/chat/${id}`, { replace: true, state: { created: true } });
        return id;
      })
      .finally(() => (creating.current = null));
    return creating.current;
  }, [navigate]);

  const afterTurn = useCallback(() => {
    loadSessions().catch(() => {});
    const id = sidRef.current;
    if (id)
      chat.info(id).then(
        (i) => {
          if (sidRef.current !== id) return;
          setInfo((cur) => ({ ...cur, ...i }));
          setPendingModel((p) => (p && p === i.model ? undefined : p));
        },
        () => {},
      );
    refreshPanel().catch(() => {});
  }, [refreshPanel]);

  /** Roda um turno do agente. `keep` = as mensagens que ficam (Refazer, Editar); sem ele, soma ao que está na tela. */
  async function startTurn(message: string, o: TurnOpts = {}) {
    if (running) return;
    setRunning(true);
    stick.current = true;
    const now = Date.now();
    const user = o.user ? [{ id: uid("u"), role: "user" as const, ...o.user }] : [];
    const live: AgentMessage = { id: "a" + now, role: "agent", steps: [], text: "", live: true };
    setMessages((list) => [...(o.keep ?? list), ...user, live]);
    try {
      const id = await ensureSession();
      await chat.send(
        id,
        withRefs(message, o.refs),
        (e) => {
          if (e.type === "submitted") {
            setMessages((list) => {
              const i = lastUserIndex(list);
              return i < 0 ? list : list.map((m, j) => (j === i && m.role === "user" ? { ...m, rowId: e.rowId } : m));
            });
            return;
          }
          // O gateway confirma a interrupção depois do Parar, já com os tokens do turno: completa o rodapé do turno parado.
          if (e.type === "interrupted" && e.stat && !messagesRef.current.some((m) => m.role === "agent" && m.live)) {
            setMessages((list) => {
              const i = list.map((m) => m.role).lastIndexOf("agent");
              return list.map((m, j) => (j === i && m.role === "agent" && m.interrupted ? { ...m, stat: mergeStat(m.stat, e.stat) } : m));
            });
            return;
          }
          updateLive((m) => applyEvent(m, e));
          if (e.type === "done") {
            if (e.info) setInfo((i) => ({ ...i, ...e.info }));
            if (e.learned) toast("Aprendi algo novo · memória salva");
          }
        },
        { raw: true, truncateFrom: o.truncateFrom },
      );
    } catch (e) {
      updateLive((m) => applyEvent(m, { type: "error", message: errText(e, "Não consegui falar com o agente") }));
    } finally {
      setRunning(false);
      afterTurn();
    }
  }

  async function send(raw: string) {
    if (running) return;
    let text = raw.trim();
    const ready = atts.filter((a) => a.status === "ready");
    if (text.startsWith("/") && (!ready.length || cmdName(text) === "retry")) return slash(text);
    if (!text && !ready.length) return;
    if (!text) text = "Veja o que anexei.";
    const user = { text, attachments: ready.map((a) => ({ name: a.name, kind: a.kind, preview: a.preview, paths: [...(a.paths ?? []), ...(a.ref ? [a.ref.replace(/^@\w+:/, "").replace(/\s*\[[^\]]*\]\s*$/, "")] : [])] })) };
    const refs = ready.map((a) => a.ref).filter((r): r is string => !!r);
    setAtts([]);
    await startTurn(text, { user, refs });
  }

  /** `/comando`: a resposta vira cartão (ou um turno, se o comando é um pedido ao agente). */
  async function slash(text: string) {
    const name = cmdName(text);
    if (name === "retry") return retry();
    if (name === "undo") return undo();
    const id = await ensureSession();
    const ph = uid("s");
    setMessages((list) => [...list, { id: ph, role: "system", cmd: text, pending: true }]);
    stick.current = true;
    const r = await chat.slash(id, text);
    const drop = () => setMessages((list) => list.filter((m) => m.id !== ph));
    if (r.type === "send") {
      drop();
      return startTurn(r.message, { user: { text } });
    }
    const card =
      r.type === "error" ? commandError(text, r.message) : r.type === "prefill" ? parseCommandOutput("/undo", r.notice) : withWarning(parseCommandOutput(text, r.output), r.warning);
    if (r.type === "prefill") setPrefill({ text: r.message, id: Date.now() });
    setMessages((list) => list.map((m) => (m.id === ph ? { ...m, pending: false, card } : m)));
    // Comando que mexe na sessão (/model, /reasoning, /fast, /personality…): relê o que ficou valendo.
    if (r.type !== "error")
      chat.info(id).then(
        (i) => {
          setInfo((cur) => ({ ...cur, ...i }));
          setPendingModel((p) => (p && p === i.model ? undefined : p));
        },
        () => {},
      );
    if (name === "compress" || name === "usage" || name === "status" || name === "context") refreshPanel().catch(() => {});
    loadSessions().catch(() => {});
  }

  /** Refazer: apaga a resposta de baixo e gera de novo no mesmo lugar (sem balão "/retry"). */
  async function retry() {
    const id = sidRef.current;
    const keep = keepForRetry(messagesRef.current);
    if (!id || !keep || running) return;
    // O backend não reconstrói anexo pendente junto do pedido refeito (código 4018): avisa antes, sem mandar.
    const blocked = retryBlock(atts.filter((a) => a.status !== "error").length);
    if (blocked) return void toast(blocked);
    const r = await chat.slash(id, "/retry");
    if (r.type !== "send") {
      toast((r.type === "error" && retryBlock(0, r.message)) || (r.type === "error" ? commandError("/retry", r.message).lines?.[0] : "") || "Não consegui refazer");
      return;
    }
    await startTurn(r.message, { keep });
  }

  /** Desfazer: volta a última pergunta, tira o turno da tela e devolve o texto ao campo. */
  async function undo() {
    const id = sidRef.current;
    const keep = keepForUndo(messagesRef.current);
    if (!id || !keep || running) return;
    try {
      const r = await chat.undo(id);
      setMessages(keep);
      setPrefill({ text: r.text, id: Date.now() });
      toast(r.removed > 1 ? `Voltou ${r.removed} perguntas` : "Voltou uma pergunta", "O texto voltou para o campo de mensagem.");
      afterTurn();
    } catch (e) {
      toast(commandError("/undo", errText(e, "")).title);
    }
  }

  /** Editar uma pergunta: apaga dali em diante e responde de novo com o texto novo. */
  async function edit(m: Extract<ChatMessage, { role: "user" }>, free: string, kept: SentAttachment[]) {
    const id = sidRef.current;
    const plan = planEdit(messagesRef.current, m.id);
    if (!id || running) return;
    if (!plan) return void toast("Recarregue a conversa para editar essa mensagem");
    // O campo trouxe só o texto livre; as referências dos anexos que sobraram voltam na frente do pedido.
    const text = free || "Veja o que anexei.";
    const refs = kept.flatMap(refsOf);
    const user = { text, attachments: kept.length ? kept : undefined };
    if (plan.mode === "truncate") return startTurn(text, { keep: plan.keep, truncateFrom: plan.rowId, user, refs });
    try {
      await chat.undo(id); // mensagem sem endereço no histórico: só a última, desfazendo e reenviando
    } catch (e) {
      return void toast(errText(e, "Não consegui editar essa mensagem"));
    }
    return startTurn(text, { keep: plan.keep, user, refs });
  }

  // Aprovar um comando pedido no meio do turno é agir em seu nome: passa pelo kill switch e vira Atividade.
  const answeredIds = useRef(new Set<string>());
  async function answer(m: AgentMessage, choice: ApprovalChoice) {
    const a = m.approval;
    if (!a || a.status !== "pending" || answeredIds.current.has(a.id)) return;
    if (choice === "always" && !(await ask({ title: "Permitir sempre?", body: "O Hermes passa a executar este tipo de comando em qualquer conversa, sem perguntar. Dá para revisar depois em Permissões.", confirm: "Permitir sempre" }))) return;
    if (choice !== "deny") {
      const ok = await actOnBehalf({
        business: "all",
        kind: "cmd",
        action: "Executou na Conversa: " + a.command,
        why: (choice === "always" ? "sempre permitido por você" : choice === "session" ? "aprovado por você para esta sessão" : "aprovado por você") + (a.description ? " — " + a.description : "") + ".",
        reversible: false,
        done: "Aprovado · executando",
        target: { kind: "approval", id: a.id },
      });
      if (!ok) return;
    }
    answeredIds.current.add(a.id);
    a.respond(choice);
    setMessages((list) => list.map((x) => (x.role === "agent" && x.id === m.id ? answered(x, choice) : x)));
    if (choice === "deny") toast("Negado — o Hermes não vai fazer isso");
  }

  async function pickModel(provider: string, model: string) {
    if (model === info.model && provider === info.provider && !pendingModel) return;
    try {
      const sw = await chat.setModel(sid, provider, model);
      if (sw.warning) toast(ptWarning(sw.warning).replaceAll("**", ""));
      if (sw.state === "pending") {
        setPendingModel(sw.model);
        toast("Troca agendada: " + sw.model, "O Hermes está respondendo; o modelo novo vale a partir da próxima mensagem.");
        return;
      }
      setPendingModel(undefined);
      setInfo((i) => ({ ...i, model: sw.model, provider: sw.provider ?? provider }));
      if (sw.state === "default") return void toast("Modelo padrão: " + sw.model);
      // Confere com o que o gateway diz ter ficado: não afirma troca que não pegou.
      const real: Partial<SessionInfo> = sid ? await chat.info(sid).catch(() => ({})) : {};
      setInfo((i) => ({ ...i, ...real }));
      if (real.model && real.model !== sw.model) toast("A troca não pegou", `A conversa continua em ${real.model}.`);
      else toast("Modelo desta conversa: " + sw.model);
    } catch (e) {
      toast(errText(e, "Não consegui trocar o modelo"));
    }
  }

  async function pickEffort(effort: string) {
    try {
      // O esforço vira padrão do perfil: não precisa de sessão (não cria conversa vazia nem muda a URL).
      await chat.setReasoning(sidRef.current, effort);
      setInfo((i) => ({ ...i, effort }));
      toast(`Esforço de raciocínio: ${EFFORT_PT[effort] ?? effort}`, "Fica como padrão deste perfil, nesta e nas próximas conversas.");
    } catch (e) {
      toast(errText(e, "Não consegui mudar o esforço de raciocínio"));
    }
  }

  async function toggleThinking(show: boolean) {
    try {
      await chat.setShowReasoning(sid, show);
      setShowThinking(show);
      toast(show ? "Pensamento visível nas respostas" : "Pensamento oculto nas respostas", sid ? "Vale para esta conversa." : "Vale para as próximas conversas.");
    } catch (e) {
      toast(errText(e, "Não consegui mudar isso"));
    }
  }

  async function setFast(on: boolean) {
    if (!sid) return;
    try {
      const fast = await chat.setFast(sid, on);
      setInfo((i) => ({ ...i, fast }));
      toast(fast ? "Modo rápido ligado" : "Modo rápido desligado");
    } catch (e) {
      toast(/not available|only available/i.test(errText(e, "")) ? "Este modelo não tem modo rápido" : errText(e, "Não consegui mudar o modo rápido"));
    }
  }

  async function stop() {
    if (sid) await chat.interrupt(sid).catch(() => {});
    // Grava a marca já: o turno parado precisa voltar como "interrompido" mesmo se recarregar antes de a conversa assentar.
    const next = messagesRef.current.map((m) => (m.role === "agent" && m.live ? interrupted(m) : m));
    if (sid) saveExtras(sid, next);
    updateLive((m) => interrupted(m));
    setRunning(false);
  }

  async function compress() {
    if (!messages.length || running) return;
    await slash("/compress");
  }

  // Anexos: sobem para o gateway na hora (erro aparece no chip, não depois de enviar).
  async function attachFiles(files: File[]) {
    let count = atts.length;
    for (const file of files) {
      const why = checkAttachment(file, count);
      if (why) {
        toast(why);
        continue;
      }
      count++;
      const kind = attachKind(file);
      const a: Attachment = { id: uid("f"), name: file.name || "colado." + (file.type.split("/")[1] ?? "png"), kind, size: file.size, preview: kind === "image" ? URL.createObjectURL(file) : undefined, status: "sending" };
      const patch = (p: Partial<Attachment>) => setAtts((l) => l.map((x) => (x.id === a.id ? { ...x, ...p } : x)));
      setAtts((l) => [...l, a]);
      try {
        const id = await ensureSession();
        const r = await chat.attach(id, file, kind);
        patch({ status: "ready", paths: r.paths, ref: r.ref });
      } catch (e) {
        patch({ status: "error", error: attachError(errText(e, "")) });
      }
    }
  }
  function removeAttachment(id: string) {
    const a = atts.find((x) => x.id === id);
    setAtts((l) => l.filter((x) => x.id !== id));
    if (a?.preview) URL.revokeObjectURL(a.preview);
    if (a?.paths?.length && sid) chat.detach(sid, a.paths).catch(() => {});
  }
  useEffect(() => () => atts.forEach((a) => a.preview && URL.revokeObjectURL(a.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files");
  const dragProps = {
    onDragEnter: (e: DragEvent) => hasFiles(e) && (e.preventDefault(), setDragging(true)),
    onDragOver: (e: DragEvent) => hasFiles(e) && (e.preventDefault(), (e.dataTransfer.dropEffect = "copy")),
    onDragLeave: (e: DragEvent) => !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node) && setDragging(false),
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      attachFiles([...e.dataTransfer.files]);
    },
  };

  async function rename(raw: string) {
    setRenaming(false);
    const t = raw.trim();
    if (!t || !sid || t === title) return;
    try {
      const done = await chat.rename(sid, t);
      setInfo((i) => ({ ...i, title: done }));
      loadSessions().catch(() => {});
      toast("Conversa renomeada");
    } catch (e) {
      toast(errText(e, "Não consegui renomear"));
    }
  }

  const cur = sessions.find((s) => s.id === sid);
  const title = info.title || cur?.title || "Nova conversa";
  // Renomeou pela barra lateral (ou o Hermes deu título sozinho): o cabeçalho acompanha a lista.
  useEffect(() => {
    if (cur?.title) setInfo((i) => (i.title === cur.title ? i : { ...i, title: cur.title }));
  }, [cur?.title]);
  const count = questionCount(messages);
  const hour = new Date().getHours();
  const greet = [...(hour < 12 ? "Bom dia." : hour < 18 ? "Boa tarde." : "Boa noite.").split(" "), ..."O que vamos resolver hoje?".split(" ")];
  const lastAgent = messages.map((m) => m.role).lastIndexOf("agent");
  const empty = !loading && messages.length === 0;

  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, position: "relative" }} {...dragProps}>
        {dragging && (
          <div className="au-drop" role="presentation">
            <Icon name="paperclip" size={22} />
            <span>Solte para anexar</span>
            <span style={{ fontSize: 12, color: "var(--fg2)" }}>imagem, PDF ou arquivo · até 25 MB cada</span>
          </div>
        )}
        <header style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 26px", minHeight: 60, borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            {renaming ? (
              <input
                autoFocus
                aria-label="Novo título da conversa"
                className="au-inline"
                defaultValue={title}
                maxLength={120}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setRenaming(false);
                  if (e.key === "Enter") rename((e.target as HTMLInputElement).value);
                }}
                onBlur={(e) => rename(e.target.value)}
                style={{ fontSize: 14.5, fontWeight: 500, margin: "-6px -8px", width: 320, maxWidth: "100%" }}
              />
            ) : sid && !loading ? (
              <button className="au-title" title="Clique para renomear a conversa" aria-label={`${title} — renomear`} onClick={() => setRenaming(true)}>
                <span>{title}</span>
                <Icon name="pencil" size={11} />
              </button>
            ) : (
              <span style={{ fontSize: 14.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{loading ? "Carregando…" : title}</span>
            )}
            <span title={sid ? `id: ${sid} · conta as suas perguntas nesta conversa, o mesmo número da lista de Sessões` : undefined} style={{ fontSize: 11.5, color: "var(--fg3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {loading ? " " : sid ? `${cur?.source ?? "Web"} · ${plural(count, "pergunta", "perguntas")}` : "ainda não salva — começa ao enviar"}
            </span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span className="au-chip" title="Onde os comandos do agente rodam (Configurações → Onde os comandos rodam)">
              <Icon name="box" size={12} />
              {BACKEND_LABEL[info.backend] ?? info.backend}
            </span>
            <span className="au-chip" title="Personalidade das respostas (Configurações → Personalidade)">
              <Icon name="drama" size={12} />
              {cap(info.persona === "padrão" || !info.persona ? "Personalidade padrão" : info.persona)}
            </span>
            <button className="au-iconbtn" title="Memória da conversa e custo" aria-label="Memória da conversa e custo" aria-pressed={insp} onClick={() => setInsp(!insp)}>
              <Icon name="panel-right" size={15} />
            </button>
          </div>
        </header>

        <div ref={scroller} onScroll={onScroll} style={{ flex: 1, overflow: "auto", minHeight: 0, scrollPaddingBottom: 56 }}>
          {loading && (
            <div className="au-chat-skel" role="status" aria-label="Carregando a conversa">
              <div className="au-skel" style={{ height: 44, width: "46%", marginLeft: "auto" }} />
              <div className="au-skel" style={{ height: 96 }} />
              <div className="au-skel" style={{ height: 44, width: "58%", marginLeft: "auto" }} />
              <div className="au-skel" style={{ height: 150 }} />
            </div>
          )}
          {empty && (
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "8vh 26px 24px", display: "flex", flexDirection: "column", gap: 28, animation: "hup .6s cubic-bezier(.2,.7,.2,1) both" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Orbit />
                <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)", letterSpacing: ".08em", textTransform: "uppercase", animation: "hblurin .7s .1s both" }}>
                  {info.model ? `modelo ${info.model}` : "seu agente"}{sessions.length ? ` · ${sessions.length} conversas recentes` : ""}
                </span>
                <h1 className="au-display" style={{ margin: 0, fontSize: "calc(var(--h1) * 1.3)", lineHeight: 1.04, display: "flex", flexWrap: "wrap", columnGap: ".24em" }}>
                  {greet.map((w, i) => {
                    const it = i >= greet.length - 5;
                    return (
                      <span key={i} style={{ display: "inline-block", color: it ? "var(--acc)" : "var(--fg)", fontStyle: it ? "italic" : "normal", animation: "hblurin .9s cubic-bezier(.2,.7,.2,1) both", animationDelay: 150 + i * 85 + "ms" }}>
                        {w}
                      </span>
                    );
                  })}
                </h1>
                <p style={{ margin: 0, color: "var(--fg2)", fontSize: 15, lineHeight: 1.55, animation: "hblurin .8s .75s both" }}>
                  Peça algo, mande executar uma tarefa ou digite / para ver os comandos. Por onde começamos?
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 10 }}>
                {SUGGESTIONS.map((sg, i) => (
                  <button key={sg.t} className="au-card au-suggest" onMouseMove={spot} onClick={() => send(sg.t)} style={{ animationDelay: (i + 2) * 45 + "ms" }}>
                    <Icon name={sg.icon} size={16} color="var(--acc)" />
                    <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 500 }}>{sg.t}</span>
                      <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.45 }}>{sg.d}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ maxWidth: 780, margin: "0 auto", padding: "30px 26px 80px", display: "flex", flexDirection: "column", gap: 30 }}>
            {messages.map((m, i) =>
              m.role === "user" ? (
                <UserBubble key={m.id} m={m} canEdit={!running && !!sid} onEdit={(t, a) => edit(m, t, a)} />
              ) : m.role === "system" ? (
                <CommandCard key={m.id} cmd={m.cmd} card={m.card} pending={m.pending} />
              ) : (
                <AgentBubble key={m.id} m={m} isLast={i === lastAgent} busy={running} onRetry={retry} onUndo={undo} onSwitchModel={() => setOpenModel((n) => n + 1)} onCron={() => navigate("/cron")} onAnswer={(c) => answer(m, c)} />
              ),
            )}
          </div>
        </div>

        {jump && (
          <button className="au-jump" onClick={() => toEnd(true)} aria-label="Ir para o fim da conversa">
            <Icon name="arrow-down" size={14} />
            {running ? "Acompanhar resposta" : "Ir para o fim"}
          </button>
        )}

        <Composer
          running={running}
          model={info.model || (loading ? "…" : "sem modelo")}
          provider={info.provider}
          pendingModel={pendingModel}
          effort={info.effort}
          fast={info.fast}
          fastSupported={info.fastSupported}
          showThinking={showThinking}
          commands={commands}
          attachments={atts}
          onSend={send}
          onStop={stop}
          onPickModel={pickModel}
          onPickEffort={pickEffort}
          onToggleThinking={toggleThinking}
          onToggleFast={setFast}
          onAttach={attachFiles}
          onRemoveAttachment={removeAttachment}
          initialDraft={search.get("q") ?? ""}
          prefill={prefill}
          openModel={openModel}
        />
      </div>
      {insp && <ContextPanel info={info} breakdown={breakdown} empty={messages.length === 0} running={running} onCompress={compress} />}
    </div>
  );
}

export function Orbit() {
  return (
    <div aria-hidden="true" style={{ position: "relative", width: 92, height: 92, marginBottom: 8, animation: "hpop .9s cubic-bezier(.3,1.4,.5,1) both" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1px solid var(--line2)" }} />
      <div style={{ position: "absolute", inset: 13, borderRadius: "50%", border: "1px dashed var(--line2)", animation: "hring 40s linear infinite reverse" }} />
      <div style={{ position: "absolute", inset: 0, animation: "hring 7s linear infinite" }}>
        <span style={{ position: "absolute", top: -3, left: "calc(50% - 3px)", width: 6, height: 6, borderRadius: "50%", background: "var(--acc)", boxShadow: "0 0 14px var(--acc)" }} />
      </div>
      <div style={{ position: "absolute", inset: 13, animation: "hring 11s linear infinite reverse" }}>
        <span style={{ position: "absolute", bottom: -2, left: "calc(50% - 2px)", width: 4, height: 4, borderRadius: "50%", background: "var(--acc)", opacity: 0.7 }} />
      </div>
      <div style={{ position: "absolute", inset: 29, borderRadius: "50%", background: "var(--acc)", color: "var(--accFg)", display: "grid", placeItems: "center", fontSize: 17, animation: "hglow 3.6s ease-in-out infinite" }}>☤</div>
    </div>
  );
}
