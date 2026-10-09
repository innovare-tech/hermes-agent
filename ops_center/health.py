"""Saúde da plataforma (tela A7): verificações agendadas e incidentes, no ``ops.db`` do perfil.

Cada verificação tem um ``kind`` (o executor: ``http``, ``mongo``, ``ssh``, ``k8s``, ``bot``, ``dead_letters``)
com ``params``, uma frequência e uma severidade. O ticker do gateway (``ops_center.listen.start``) chama
``tick`` a cada 30 s: roda o que venceu, guarda o resultado e o histórico (sparkline) e cuida dos incidentes:

- ``CONFIRM_FAILS`` erros seguidos abrem um incidente (um soluço não acorda ninguém) e avisam em Avisos › infra;
- no ciclo seguinte o Hermes investiga (turno só de leitura, origem ``health_probe``): linha do tempo,
  hipótese e uma correção sugerida, que só roda por pedido de aprovação (Permissões);
- verificação voltou a ``ok`` → o incidente fecha sozinho; erro de novo até ``REOPEN_WINDOW_S`` depois de
  resolvido → o mesmo incidente reabre.

Conexões nunca ficam aqui: URIs e tokens vêm do ``.env`` do perfil pelo nome da variável (``*_env``).
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
import uuid
from typing import Any, Callable, Optional

from ops_center import store

logger = logging.getLogger(__name__)

GROUPS = ("servers", "mongo", "whatsapp_bots", "k8s", "dead_letters", "services")
INTERVALS = (60, 300, 900, 3600, 86400)
SEVERITIES = ("critical", "warning")
HISTORY_MAX = 30
CONFIRM_FAILS = 2
REOPEN_WINDOW_S = 3600
_JSON_COLS = ("params", "result", "history", "parsed")


# ---- verificações ----

def _check_row(r: Any) -> dict:
    d = dict(r)
    for k in _JSON_COLS:
        d[k] = json.loads(d[k]) if d.get(k) else ({} if k != "history" else [])
    return d


def _api_check(d: dict) -> dict:
    res = d["result"] or {}
    return {"id": d["id"], "group": d["grp"], "name": d["name"], "detail": d["detail"], "kind": d["kind"],
            "status": "paused" if d.get("paused") else d["status"], "paused": bool(d.get("paused")), "severity": d["severity"], "intervalSec": d["interval_sec"],
            "result": {k: res[k] for k in ("text", "metrics") if k in res}, "lastRunAt": d["last_run_at"],
            "history": d["history"], "historyLabel": d["history_label"], "clientId": d["client_id"],
            "sourceText": d["source_text"], "createdAt": d["created_at"]}


def _get(cid: str) -> dict:
    with store.connect() as c:
        r = c.execute("SELECT * FROM health_checks WHERE id=?", (cid,)).fetchone()
    if not r:
        raise KeyError(cid)
    return _check_row(r)


def list_checks() -> list[dict]:
    """Problemas primeiro (erro, atenção, aguardando, ok), depois por grupo e nome."""
    with store.connect() as c:
        rows = [_check_row(r) for r in c.execute("SELECT * FROM health_checks")]
    rank = {"error": 0, "warn": 1, "pending": 2, "ok": 3}
    rows.sort(key=lambda d: (5 if d.get("paused") else rank.get(d["status"], 4), GROUPS.index(d["grp"]) if d["grp"] in GROUPS else 9,
                             d["name"].lower()))
    return [_api_check(d) for d in rows]


def add_check(*, group: str, name: str, kind: str, params: dict, interval_sec: int = 300, detail: str = "",
              severity: str = "critical", client_id: Optional[str] = None, source_text: Optional[str] = None,
              parsed: Optional[dict] = None, history_label: str = "") -> dict:
    if group not in GROUPS:
        raise ValueError(f"grupo inválido: {group}")
    if kind not in RUNNERS:
        raise ValueError(f"tipo de verificação desconhecido: {kind}")
    if int(interval_sec) not in INTERVALS:
        raise ValueError("frequência inválida (1 min, 5 min, 15 min, 1 hora ou 1 dia)")
    if severity not in SEVERITIES:
        raise ValueError(f"severidade inválida: {severity}")
    name = (name or "").strip()[:120]
    if not name:
        raise ValueError("dê um nome à verificação")
    cid = uuid.uuid4().hex[:12]
    with store.connect() as c:
        c.execute("INSERT INTO health_checks(id, grp, name, detail, kind, params, interval_sec, severity, client_id,"
                  " source_text, parsed, history_label, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                  (cid, group, name, detail[:200], kind, json.dumps(params or {}), int(interval_sec), severity,
                   client_id, source_text, json.dumps(parsed) if parsed else None,
                   history_label or HISTORY_LABEL.get(kind, ""), time.time()))
    return _api_check(_get(cid))


def update_check(cid: str, patch: dict) -> dict:
    cur = _get(cid)
    sets: dict[str, Any] = {}
    if "intervalSec" in patch:
        if int(patch["intervalSec"]) not in INTERVALS:
            raise ValueError("frequência inválida")
        sets["interval_sec"] = int(patch["intervalSec"])
    if "severity" in patch:
        if patch["severity"] not in SEVERITIES:
            raise ValueError("severidade inválida")
        sets["severity"] = patch["severity"]
    if "name" in patch and str(patch["name"]).strip():
        sets["name"] = str(patch["name"]).strip()[:120]
    if "params" in patch and isinstance(patch["params"], dict):
        sets["params"] = json.dumps({**cur["params"], **patch["params"]})
    if "paused" in patch and bool(patch["paused"]) != bool(cur.get("paused")):
        # Pausar fecha o incidente aberto (ninguém mais é chamado); retomar roda no próximo ciclo, do zero.
        sets.update({"paused": 1, "fails": 0} if patch["paused"] else {"paused": 0, "fails": 0, "last_run_at": None})
    if sets:
        with store.connect() as c:
            c.execute(f"UPDATE health_checks SET {', '.join(f'{k}=?' for k in sets)} WHERE id=?", (*sets.values(), cid))
    if sets.get("paused"):
        with store.connect() as c:
            r = c.execute("SELECT id FROM incidents WHERE check_id=? AND status='open'", (cid,)).fetchone()
        if r:
            resolve(r[0], "Hermes", "verificação pausada no painel")
    return _api_check(_get(cid))


def delete_check(cid: str) -> None:
    _get(cid)
    with store.connect() as c:
        c.execute("DELETE FROM health_checks WHERE id=?", (cid,))


# ---- execução ----

def _why(e: BaseException) -> str:
    """Motivo curto e sem segredos (a mensagem de exceções de rede/driver pode trazer a URI)."""
    msg = str(e) if isinstance(e, (ValueError, TimeoutError)) else type(e).__name__
    return re.sub(r"[a-z]+://\S+", "<conexão>", msg)[:200]


def _within(only: Optional[dict], now: float) -> bool:
    """``only = {from, to, days}`` (ex.: horário comercial); fora da janela a verificação não roda."""
    if not only:
        return True
    from ops_center import notify

    d = notify._local(now, notify.routes()["quietHours"]["tz"])
    days = only.get("days")
    if days and d.isoweekday() % 7 not in [int(x) % 7 for x in days]:
        return False
    a, b, m = notify._min(only.get("from") or "00:00"), notify._min(only.get("to") or "23:59"), d.hour * 60 + d.minute
    return a <= m <= b if a <= b else (m >= a or m <= b)


def run_check(cid: str, *, now: Optional[float] = None) -> dict:
    """Roda já (botão "Rodar agora" e o ticker). Grava o resultado e move o incidente ligado."""
    now = time.time() if now is None else now
    c = _get(cid)
    if c.get("paused"):
        raise ValueError("verificação pausada: retome para rodar")
    try:
        res = RUNNERS[c["kind"]](c["params"], c["result"] or {})
    except Exception as e:  # noqa: BLE001 — a falha de checar também é um resultado (e pode ser o incidente)
        logger.info("ops_center: verificação %s falhou ao rodar: %s", c["name"], type(e).__name__)
        res = {"status": "error", "text": f"não consegui checar: {_why(e)}"}
    status = res.get("status") if res.get("status") in ("ok", "warn", "error") else "error"
    history = list(c["history"])
    if res.get("value") is not None:
        history = (history + [{"at": now, "value": res["value"]}])[-HISTORY_MAX:]
    fails = c["fails"] + 1 if status == "error" else 0
    keep = {k: res[k] for k in ("text", "metrics", "state", "impact") if k in res}
    with store.connect() as con:
        con.execute("UPDATE health_checks SET status=?, result=?, last_run_at=?, history=?, fails=? WHERE id=?",
                    (status, json.dumps(keep), now, json.dumps(history), fails, cid))
    c = _get(cid)
    try:
        _incident_step(c, now)
    except Exception:
        logger.exception("ops_center: incidente da verificação %s não foi atualizado", c["name"])
    return _api_check(c)


def tick(now: Optional[float] = None, *, investigate: bool = True) -> list[str]:
    """Um ciclo no perfil atual: roda as verificações vencidas e investiga incidentes novos. Devolve os ids rodados.

    ponytail: em série, no ticker do Escutar — bom para dezenas de verificações; pool se passar de ~100."""
    now = time.time() if now is None else now
    with store.connect() as c:
        rows = [_check_row(r) for r in c.execute(
            "SELECT * FROM health_checks WHERE paused=0 AND (last_run_at IS NULL OR last_run_at + interval_sec <= ?)",
            (now,))]
    ran = []
    for d in rows:
        if not _within(d["params"].get("only"), now):
            continue
        run_check(d["id"], now=now)
        ran.append(d["id"])
    if investigate:  # perfil pausado: as verificações seguem, mas o Hermes não gasta turno investigando
        investigate_pending()
    return ran


# ---- incidentes ----

def _inc_row(r: Any) -> dict:
    d = dict(r)
    d["timeline"] = json.loads(d["timeline"] or "[]")
    d["suggested_action"] = json.loads(d["suggested_action"]) if d.get("suggested_action") else None
    return d


def _api_incident(d: dict) -> dict:
    out = {"id": d["id"], "code": f"INC-{d['id']}", "checkId": d["check_id"], "severity": d["severity"],
           "title": d["title"], "impact": d["impact"], "status": d["status"], "startedAt": d["started_at"],
           "ackBy": d["ack_by"], "ackAt": d["ack_at"], "resolvedAt": d["resolved_at"], "resolvedBy": d["resolved_by"],
           "note": d["note"], "timeline": d["timeline"], "hypothesis": d["hypothesis"],
           "investigating": False, "investigationPaused": False, "suggestedAction": d["suggested_action"],
           "approval": None}
    if not d["investigated"] and d["status"] == "open":
        paused = _paused()
        out["investigating"], out["investigationPaused"] = not paused, paused
    if d.get("approval_id"):
        a = store.get_approval(d["approval_id"]) or {}
        out["approval"] = {k: a.get(s) for k, s in (("id", "id"), ("status", "status"), ("target", "target"),
                                                     ("expiresAt", "expires_at"), ("decidedBy", "decided_by"),
                                                     ("result", "result"))}
        out["approval"]["targetLabel"] = _target_label(a.get("target") or "")
    return out


def _paused() -> bool:
    """Perfil pausado (Parar tudo ou limite de gasto): o Hermes não investiga até retomar."""
    try:
        from agent.estop import is_engaged

        return bool(is_engaged())
    except Exception:  # noqa: BLE001
        return False


def _target_label(target: str) -> str:
    """``telegram:<chat>:<tópico>`` → "Telegram · Alertas de infra" (nome do tópico quando conhecido)."""
    parts = target.split(":")
    if not parts or parts[0] != "telegram":
        return target
    if len(parts) < 3 or parts[2] in ("", "1"):
        return "Telegram"
    from ops_center import notify

    name = next((t.get("name") for t in notify._topics() if str(t.get("id")) == parts[2]), None)
    return f"Telegram · {name or 'tópico ' + parts[2]}"


def _inc(iid: int) -> dict:
    with store.connect() as c:
        r = c.execute("SELECT * FROM incidents WHERE id=?", (int(iid),)).fetchone()
    if not r:
        raise KeyError(f"INC-{iid}")
    return _inc_row(r)


def _save_inc(iid: int, **cols: Any) -> None:
    for k in ("timeline", "suggested_action"):
        if k in cols and not isinstance(cols[k], (str, type(None))):
            cols[k] = json.dumps(cols[k], ensure_ascii=False)
    with store.connect() as c:
        c.execute(f"UPDATE incidents SET {', '.join(f'{k}=?' for k in cols)} WHERE id=?", (*cols.values(), int(iid)))


def _event(d: dict, result: str, text: str, now: Optional[float] = None) -> list:
    """``result``: problem (vermelho) · signal (âmbar) · ruled_out (verde) · info."""
    return d["timeline"] + [{"at": time.time() if now is None else now, "result": result, "text": text[:500]}]


def list_incidents(status: str = "open") -> list[dict]:
    """``open`` (críticos primeiro, mais antigos primeiro — o herói é o crítico mais antigo) ou ``resolved``."""
    with store.connect() as c:
        if status == "open":
            rows = c.execute("SELECT * FROM incidents WHERE status='open' "
                             "ORDER BY severity='critical' DESC, started_at").fetchall()
        else:
            rows = c.execute("SELECT * FROM incidents WHERE status!='open' ORDER BY resolved_at DESC LIMIT 50").fetchall()
    return [_api_incident(_inc_row(r)) for r in rows]


def _notify(level: str, text: str) -> None:
    try:
        from ops_center import notify

        notify.send("infra", level, text)
    except Exception:
        logger.warning("ops_center: aviso de infra não saiu", exc_info=True)


def _incident_step(c: dict, now: float) -> None:
    with store.connect() as con:
        r = con.execute("SELECT * FROM incidents WHERE check_id=? ORDER BY id DESC LIMIT 1", (c["id"],)).fetchone()
    last = _inc_row(r) if r else None
    text = (c["result"] or {}).get("text") or ""
    if c["status"] == "ok":
        if last and last["status"] == "open":
            _save_inc(last["id"], status="resolved", resolved_at=now, resolved_by="Hermes",
                      timeline=_event(last, "ruled_out", f"Voltou ao normal sozinho: {text}", now))
            _notify("warning", f"✅ INC-{last['id']} · {c['name']} voltou ao normal.")
        return
    if c["status"] != "error" or c["fails"] < CONFIRM_FAILS or (last and last["status"] == "open"):
        return
    impact = (c["result"] or {}).get("impact") or ""
    if last and last["resolved_at"] and now - last["resolved_at"] < REOPEN_WINDOW_S:
        _save_inc(last["id"], status="open", resolved_at=None, resolved_by=None, ack_by=None, ack_at=None,
                  timeline=_event(last, "problem", f"Reaberto: a verificação continua com problema ({text}).", now))
        _notify(last["severity"], f"🔁 INC-{last['id']} reaberto · {c['name']}\n{text}")
        return
    title = f"{c['name']}: {text}"[:160]
    first = [{"at": now, "result": "problem",
              "text": f"A verificação “{c['name']}” falhou {c['fails']} vezes seguidas: {text}"[:500]}]
    with store.connect() as con:
        iid = con.execute("INSERT INTO incidents(check_id, severity, title, impact, started_at, timeline) "
                          "VALUES(?,?,?,?,?,?)", (c["id"], c["severity"], title, impact, now,
                                                  json.dumps(first, ensure_ascii=False))).lastrowid
    icon = "🔴" if c["severity"] == "critical" else "🟠"
    _notify(c["severity"], f"{icon} INC-{iid} · {title}" + (f"\nImpacto: {impact}" if impact else "")
            + "\nO Hermes está investigando; veja em Saúde no painel.")


def ack(iid: int, by: str) -> dict:
    d = _inc(iid)
    if d["status"] != "open":
        raise ValueError("este incidente não está aberto")
    _save_inc(iid, ack_by=by, ack_at=time.time(), timeline=_event(d, "info", f"{by} está vendo."))
    _notify("warning", f"👀 INC-{iid} · {by} está vendo: {d['title']}")
    return _api_incident(_inc(iid))


def resolve(iid: int, by: str, note: str = "") -> dict:
    """Fecha. ``stillFailing``: a verificação ligada ainda está com erro — o Hermes reabre se continuar."""
    d = _inc(iid)
    if d["status"] != "open":
        raise ValueError("este incidente já está resolvido")
    now = time.time()
    _save_inc(iid, status="resolved", resolved_at=now, resolved_by=by, note=(note or "")[:1000],
              timeline=_event(d, "ruled_out", f"Resolvido por {by}" + (f": {note}" if note else "."), now))
    still = False
    if d["check_id"]:
        try:
            still = _get(d["check_id"])["status"] == "error"
        except KeyError:
            pass
    _notify("warning", f"✅ INC-{iid} resolvido por {by}." + (f"\n{note}" if note else ""))
    return {"incident": _api_incident(_inc(iid)), "stillFailing": still}


def request_action(iid: int, by: str) -> dict:
    """A correção sugerida vira pedido de aprovação (Telegram), nunca execução direta."""
    from ops_center import guardrails

    d = _inc(iid)
    sa = d["suggested_action"]
    if not sa or not sa.get("command"):
        raise ValueError("este incidente não tem correção sugerida")
    if d["approval_id"]:
        a = store.get_approval(d["approval_id"]) or {}
        if a.get("status") == "pending":
            return _api_incident(d)
    aid = guardrails.request_panel_approval(sa["command"], label=sa.get("label") or "Correção do incidente",
                                            by=by, context=f"INC-{iid} · {d['title']}")
    a = store.get_approval(aid) or {}
    _save_inc(iid, approval_id=aid, timeline=_event(
        d, "info", f"{by} pediu a correção “{sa.get('label')}”: aguardando aprovação ({a.get('target') or 'Telegram'})."))
    return _api_incident(_inc(iid))


# ---- investigação (turno do Hermes, só leitura) ----

INVESTIGATE_PROMPT = """Você é o plantonista de infraestrutura da equipe. Uma verificação de saúde abriu um incidente
(dados abaixo). Investigue com comandos e ferramentas SÓ DE LEITURA (nada que altere servidor, banco ou cluster):
confirme o problema, procure a causa e descarte hipóteses. Seja breve: no máximo 6 comandos. Se a máquina onde você
roda não tem acesso ao alvo (sem ssh/kubectl/mongosh configurado), não procure mais: diga isso numa linha da timeline
e responda com o que os dados do incidente já mostram.

Responda SOMENTE com um objeto JSON, em português do Brasil, sem texto fora dele:
{"timeline": [{"result": "problem|signal|ruled_out", "text": "o que você olhou e o que achou, com o termo técnico explicado (ex.: OOMKilled = o processo foi morto por falta de memória)"}],
 "hypothesis": "a causa mais provável, em uma ou duas frases",
 "suggested_action": {"label": "verbo + objeto curto, ex.: Reiniciar o wa-gateway", "command": "o comando exato de terminal que corrige"} ou null,
 "impact": "quem é afetado, curto (ex.: 3 clientes · 23 mensagens esperando)" ou ""}
"problem" = achou problema; "signal" = sinal suspeito; "ruled_out" = hipótese descartada. A correção só roda depois que
um humano aprovar; sugira só o que for seguro e reversível."""


def _run_investigation(context: str, cfg: dict) -> str:
    from cron.scheduler import run_job
    from ops_center.guardrails import as_origin

    job = {"id": f"ops-health-{int(time.time() * 1000)}", "name": "Saúde · investigação", "prompt": INVESTIGATE_PROMPT,
           "enabled_toolsets": list(cfg.get("toolsets") or ["terminal"]), "deliver": "local",
           "repeat": {"times": 1, "completed": 0}}
    cancel = threading.Event()  # teto de tempo: um turno que se perde não consome a cota inteira
    timer = threading.Timer(INVESTIGATE_BUDGET_S, cancel.set)
    timer.daemon = True
    timer.start()
    try:
        with as_origin("health_probe"):  # escrita bloqueada pelo guardrails, qualquer que seja a matriz
            ok, _doc, final, error = run_job(job, extra_prompt=context, cancel_event=cancel)
    finally:
        timer.cancel()
    if cancel.is_set():
        raise TimeoutError(f"a investigação passou de {INVESTIGATE_BUDGET_S // 60} min e foi interrompida")
    if not ok or not (final or "").strip():
        raise RuntimeError(error or "a investigação não devolveu resposta")
    return final


def _public_params(p: dict) -> dict:
    return {k: v for k, v in p.items() if not k.endswith("_env")}


def investigate(iid: int, *, run: Callable[[str, dict], str] = _run_investigation) -> dict:
    d = _inc(iid)
    try:
        c = _get(d["check_id"]) if d["check_id"] else None
    except KeyError:
        c = None
    ctx = (f"Incidente INC-{iid} ({d['severity']}): {d['title']}\n"
           + (f"Verificação: {c['name']} · tipo {c['kind']} · {json.dumps(_public_params(c['params']), ensure_ascii=False)}\n"
              f"Último resultado: {(c['result'] or {}).get('text')}\n"
              f"Histórico ({c['history_label']}): {[h['value'] for h in c['history'][-10:]]}\n" if c else ""))
    try:
        raw = run(ctx, settings())
        m = re.search(r"\{.*\}", raw or "", re.S)
        data = json.loads(m.group(0)) if m else {}
    except Exception as e:  # noqa: BLE001
        logger.warning("ops_center: investigação do INC-%s falhou: %s", iid, type(e).__name__)
        _save_inc(iid, investigated=1, timeline=_event(_inc(iid), "signal", f"Não consegui investigar sozinho ({_why(e)})."))
        return _api_incident(_inc(iid))
    d = _inc(iid)
    tl = d["timeline"]
    now = time.time()
    for ev in (data.get("timeline") or [])[:12]:
        if isinstance(ev, dict) and ev.get("text"):
            res = ev.get("result") if ev.get("result") in ("problem", "signal", "ruled_out") else "signal"
            tl.append({"at": now, "result": res, "text": str(ev["text"])[:500]})
    sa = data.get("suggested_action")
    action = None
    if isinstance(sa, dict) and str(sa.get("command") or "").strip():
        from ops_center import guardrails

        cmd = str(sa["command"]).strip()[:2000]
        if not guardrails.hard_deny(cmd):
            action = {"label": str(sa.get("label") or "Aplicar a correção")[:80], "command": cmd, "needsApproval": True}
    cols: dict[str, Any] = {"investigated": 1, "timeline": tl, "hypothesis": str(data.get("hypothesis") or "")[:1000] or None,
                            "suggested_action": action}
    if data.get("impact") and not d["impact"]:
        cols["impact"] = str(data["impact"])[:160]
    _save_inc(iid, **cols)
    if cols["hypothesis"]:
        _notify(d["severity"] if d["severity"] == "warning" else "warning",
                f"🔎 INC-{iid} · o que o Hermes achou\n{cols['hypothesis']}"
                + (f"\nCorreção sugerida: {action['label']} (precisa de aprovação, peça no painel)" if action else ""))
    return _api_incident(_inc(iid))


INVESTIGATE_BUDGET_S = 180
_investigating = threading.Lock()


def investigate_pending(*, wait: bool = False) -> Optional[threading.Thread]:
    """Investiga os incidentes novos numa thread (as verificações seguem rodando), uma investigação por vez.

    ponytail: uma thread global para todos os perfis — dezenas de incidentes por hora já é crise; fila se precisar."""
    with store.connect() as c:
        ids = [r[0] for r in c.execute("SELECT id FROM incidents WHERE status='open' AND investigated=0")]
    if not ids or not _investigating.acquire(blocking=False):
        return None

    def _work() -> None:
        try:
            for iid in ids:
                try:
                    investigate(iid)
                except Exception:
                    logger.exception("ops_center: investigação do INC-%s quebrou", iid)
                    _save_inc(iid, investigated=1)  # nunca re-tentar a cada ciclo (cada tentativa é um turno pago)
        finally:
            _investigating.release()

    import contextvars

    ctx = contextvars.copy_context()  # mesmo perfil (home, segredos, terminal) do ciclo que chamou
    t = threading.Thread(target=ctx.run, args=(_work,), name="ops-health-investigate", daemon=True)
    t.start()
    if wait:
        t.join()
    return t


# ---- configuração e visão geral ----

DEFAULT_SETTINGS: dict[str, Any] = {
    "toolsets": ["terminal"],  # o que a investigação pode usar (guardrails mantém só leitura)
    # Banco do negócio (só leitura): a URI fica em Chaves do perfil, aqui só o nome da variável.
    "mongo": {"uri_env": "AIBIZ_MONGO_URI", "db": "aibiz_mrz"},
    # Bots: estado do canal (status ready|waiting|reconnecting|disconnected|blocked|error|inactive) e mensagens que entram.
    "bots": {"channels": "system_client_sources", "messages": "messages_receive",
             "instances": "system_whatsapp_bot_instances_control"},
    # Filas de falha (coleções de dead letters): data e campo para agrupar o "mais comum".
    "deadLetters": [
        {"name": "Mensagens ignoradas pelo socket", "collection": "whatsapp_socket_dead_letters",
         "dateField": "createdAt", "groupField": "reason"},
        {"name": "Falha ao processar mensagem recebida", "collection": "messages_receive_dead_letters",
         "dateField": "failedAt", "groupField": "error.message"},
        {"name": "Webhook oficial (Meta)", "collection": "webhook_dead_letters", "dateField": "failedAt",
         "groupField": "error"},
        {"name": "Erros de conta da Meta", "collection": "meta_webhook_errors", "dateField": "receivedAt",
         "groupField": "code"},
    ],
    "k8s": {"server": "", "token_env": "K8S_TOKEN", "ca_env": "K8S_CA_CERT", "namespaces": "default"},
    "servers": [],  # [{name, host, user, port}] — chave privada em Chaves: HEALTH_SSH_KEY (todas) ou HEALTH_SSH_KEY_<NOME>
    "services": [],  # [{name, url}] — endereços de /health
}
_DICTS = ("mongo", "bots", "k8s")


def settings() -> dict:
    saved = store.get_meta("health_settings") or {}
    out = {**DEFAULT_SETTINGS, **saved}
    for k in _DICTS:
        out[k] = {**DEFAULT_SETTINGS[k], **(saved.get(k) or {})}
    return out


def ssh_key_env(server: str) -> str:
    return "HEALTH_SSH_KEY_" + re.sub(r"[^A-Z0-9]", "_", server.upper())


def settings_view() -> dict:
    """Configuração + o que já está ligado (nunca devolve segredo, só se existe)."""
    from agent.secret_scope import get_secret_str

    cfg = settings()
    k8s = cfg["k8s"]
    return {**cfg, "status": {
        "mongo": bool(get_secret_str(cfg["mongo"]["uri_env"])),
        "k8s": bool(k8s.get("server") and get_secret_str(k8s["token_env"])),
        "sshKey": bool(get_secret_str("HEALTH_SSH_KEY")),
        "servers": {s["name"]: {"keyEnv": "HEALTH_SSH_KEY",
                                "key": bool(get_secret_str(ssh_key_env(s["name"])) or get_secret_str("HEALTH_SSH_KEY"))}
                    for s in cfg["servers"]}}}


_NAME = re.compile(r"[\w.\-]+")


def save_settings(patch: dict) -> dict:
    cur = store.get_meta("health_settings") or {}
    for key in _DICTS:
        if isinstance(patch.get(key), dict):
            cur[key] = {**(cur.get(key) or {}), **{k: str(v).strip() for k, v in patch[key].items()}}
    if isinstance(patch.get("servers"), list):
        cur["servers"] = [_server(s) for s in patch["servers"]]
    if isinstance(patch.get("services"), list):
        cur["services"] = [_service(s) for s in patch["services"]]
    if isinstance(patch.get("deadLetters"), list):
        cur["deadLetters"] = [_dead_letter(d) for d in patch["deadLetters"]]
    if isinstance(patch.get("toolsets"), list):
        cur["toolsets"] = [str(t) for t in patch["toolsets"] if str(t).strip()]
    store.set_meta("health_settings", cur)
    return settings_view()


def _server(s: dict) -> dict:
    name = re.sub(r"[^a-z0-9-]", "", str(s.get("name") or "").lower())
    host = str(s.get("host") or "").strip()
    if not name or not host or not _NAME.fullmatch(host):
        raise ValueError("servidor precisa de nome (letras, números, hífen) e host")
    return {"name": name, "host": host, "user": re.sub(r"[^\w.\-]", "", str(s.get("user") or "")),
            "port": int(s.get("port") or 22)}


def _service(s: dict) -> dict:
    url = str(s.get("url") or "").strip()
    if not re.match(r"https?://", url):
        raise ValueError("o endereço do serviço precisa começar com http:// ou https://")
    return {"name": str(s.get("name") or url)[:80], "url": url}


def _dead_letter(d: dict) -> dict:
    out = {k: str(d.get(k) or "").strip() for k in ("name", "collection", "dateField", "groupField")}
    if not _NAME.fullmatch(out["collection"]) or not _NAME.fullmatch(out["dateField"] or "createdAt"):
        raise ValueError("fila de falha precisa de coleção e campo de data válidos")
    out["dateField"] = out["dateField"] or "createdAt"
    out["name"] = out["name"] or out["collection"]
    return out


def overview(now: Optional[float] = None) -> dict:
    """Números do herói: disponibilidade em 30 dias (tempo sem incidente crítico), bots conectados, última checagem."""
    now = time.time() if now is None else now
    start = now - 30 * 86400
    with store.connect() as c:
        crit = c.execute("SELECT started_at, resolved_at FROM incidents WHERE severity='critical' AND "
                         "(resolved_at IS NULL OR resolved_at > ?)", (start,)).fetchall()
        bots = c.execute("SELECT status FROM health_checks WHERE grp='whatsapp_bots' AND paused=0").fetchall()
        last_run = c.execute("SELECT MAX(last_run_at) FROM health_checks").fetchone()[0]
        last = c.execute("SELECT * FROM incidents WHERE status!='open' ORDER BY resolved_at DESC LIMIT 1").fetchone()
        total = c.execute("SELECT COUNT(*) FROM health_checks").fetchone()[0]
    down = sum(min(r["resolved_at"] or now, now) - max(r["started_at"], start) for r in crit)
    return {"availability30d": round(max(0.0, 1 - down / (30 * 86400)) * 100, 2),
            "botsConnected": sum(1 for b in bots if b[0] == "ok"), "botsTotal": len(bots), "lastRunAt": last_run,
            "checks": total, "lastIncident": _api_incident(_inc_row(last)) if last else None}


# ---- executores ----
# Cada um recebe ``(params, resultado_anterior)`` e devolve ``{status, text, value?, metrics?, state?, impact?}``.

def _secret(name: str) -> str:
    from agent.secret_scope import get_secret_str

    v = get_secret_str(name) if name else ""
    if not v:
        raise ValueError(f"falta {name} em Chaves deste perfil")
    return v


def _run_http(p: dict, _prev: dict) -> dict:
    import urllib.error
    import urllib.request

    url = str(p.get("url") or "")
    if not re.match(r"https?://", url):
        raise ValueError("endereço inválido")
    slow = int(p.get("slowMs") or 2000)
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "hermes-health"}),  # noqa: S310
                                    timeout=float(p.get("timeout") or 10)) as r:
            code, body = r.status, r.read(4096).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        code, body = e.code, ""
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        reason = getattr(e, "reason", e)
        return {"status": "error", "text": f"não respondeu ({_why(reason if isinstance(reason, BaseException) else e)})"}
    ms = round((time.monotonic() - t0) * 1000)
    if not 200 <= code < 300:
        return {"status": "error", "text": f"respondeu {code} em {ms} ms", "value": ms}
    if p.get("expect") and str(p["expect"]) not in body:
        return {"status": "error", "text": f"respondeu {code}, mas sem “{p['expect']}”", "value": ms}
    return {"status": "warn" if ms >= slow else "ok", "text": f"respondeu {code} em {ms} ms", "value": ms}


_MONGO: dict[str, Any] = {}


def _mongo_client(uri_env: str) -> Any:
    """Um cliente por conexão (o pymongo mantém o pool); só leitura, preferindo secundária."""
    uri = _secret(uri_env)
    client = _MONGO.get(uri)
    if client is None:
        from ops_center.clients_sync import _mongo

        client = _mongo().MongoClient(uri, serverSelectionTimeoutMS=8000, appname="hermes-health")
        _MONGO[uri] = client
    return client


def _pct_status(v: float, warn: float = 80, err: float = 90) -> str:
    return "error" if v >= err else "warn" if v >= warn else "ok"


def _run_mongo(p: dict, prev: dict) -> dict:
    client = _mongo_client(p.get("uri_env") or settings()["mongo"]["uri_env"])
    metric = p.get("metric") or "replica"
    if metric == "replica":
        st = client.admin.command("replSetGetStatus")
        members = st.get("members") or []
        up = [m for m in members if m.get("health") == 1]
        primary = next((m.get("name") for m in members if m.get("stateStr") == "PRIMARY"), None)
        pts = [m["optimeDate"] for m in members if m.get("optimeDate") and m.get("stateStr") == "PRIMARY"]
        lag = max(((pts[0] - m["optimeDate"]).total_seconds() for m in members
                   if pts and m.get("optimeDate") and m.get("stateStr") == "SECONDARY"), default=0)
        text = f"{len(up)} de {len(members)} réplicas no ar" + (f" · primária {primary}" if primary else " · SEM primária")
        if lag >= 10:
            text += f" · atraso de {round(lag)} s"
        status = "error" if not primary or len(up) < len(members) else "warn" if lag >= 30 else "ok"
        return {"status": status, "text": text, "value": len(up)}
    if metric == "latency":
        ops = client.admin.command("serverStatus").get("opLatencies") or {}
        cur = {k: [int((ops.get(k) or {}).get("latency") or 0), int((ops.get(k) or {}).get("ops") or 0)]
               for k in ("reads", "writes", "commands")}
        old = (prev.get("state") or {}).get("lat") or {}
        lat = sum(cur[k][0] - old.get(k, [0, 0])[0] for k in cur)
        n = sum(cur[k][1] - old.get(k, [0, 0])[1] for k in cur)
        if not old or n <= 0 or lat < 0:
            return {"status": "ok", "text": "medindo (precisa de duas leituras)", "state": {"lat": cur}}
        ms = round(lat / n / 1000, 1)
        warn, err = float(p.get("warnMs") or 100), float(p.get("errorMs") or 500)
        return {"status": "error" if ms >= err else "warn" if ms >= warn else "ok",
                "text": f"consultas levam em média {ms} ms ({n} no intervalo)", "value": ms, "state": {"lat": cur}}
    if metric == "space":
        st = client[p.get("db") or "admin"].command("dbStats")
        used, total = st.get("fsUsedSize"), st.get("fsTotalSize")
        if not used or not total:
            gb = round((st.get("storageSize") or 0) / 1e9, 1)
            return {"status": "ok", "text": f"{gb} GB em uso (o servidor não informa o tamanho do disco)", "value": gb}
        pct = round(used / total * 100)
        return {"status": _pct_status(pct), "text": f"disco do banco {pct}% cheio ({round(used / 1e9)} de "
                                                     f"{round(total / 1e9)} GB)", "value": pct}
    raise ValueError(f"métrica de Mongo desconhecida: {metric}")


def _pem(v: str) -> str:
    """Chave/certificado colado como PEM (quebras reais ou ``\\n``) ou como base64 do arquivo, numa linha."""
    import base64

    v = (v or "").strip()
    if v and "BEGIN" not in v:
        try:
            v = base64.b64decode(v + "=" * (-len(v) % 4)).decode().strip()
        except Exception:  # noqa: BLE001
            raise ValueError("chave/certificado ilegível: cole o arquivo em base64 numa linha") from None
    return v.replace("\\n", "\n") + "\n" if v else ""


_SSH_PROBE ="vmstat 1 2 | tail -1; free -b | sed -n 2p; df -P / | tail -1"


def parse_resources(out: str) -> dict:
    """Saída do ``_SSH_PROBE`` → ``{cpu, ram, disk}`` em %."""
    lines = [ln.split() for ln in out.strip().splitlines() if ln.strip()]
    vm, mem, df = lines[-3], lines[-2], lines[-1]
    cpu = 100 - int(vm[14])
    total, avail = int(mem[1]), int(mem[6]) if len(mem) > 6 else int(mem[3])
    ram = round((total - avail) / total * 100)
    disk = int(df[4].rstrip("%"))
    return {"cpu": cpu, "ram": ram, "disk": disk}


def _run_ssh(p: dict, _prev: dict) -> dict:
    import os
    import subprocess
    import tempfile

    srv = next((s for s in settings()["servers"] if s["name"] == p.get("server")), None)
    if not srv:
        raise ValueError(f"servidor “{p.get('server')}” não está em Saúde › Conexões")
    from agent.secret_scope import get_secret_str

    key = _pem(get_secret_str(ssh_key_env(srv["name"])) or get_secret_str("HEALTH_SSH_KEY"))
    from hermes_constants import get_hermes_home

    known = get_hermes_home() / "health_known_hosts"
    args = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=accept-new",
            "-o", f"UserKnownHostsFile={known}", "-p", str(srv["port"])]
    keyfile = None
    try:
        if key:
            fd, keyfile = tempfile.mkstemp(prefix="hermes-ssh-")
            with os.fdopen(fd, "w", newline="\n") as f:  # CRLF quebra a leitura da chave no OpenSSH
                f.write(key)
            os.chmod(keyfile, 0o600)
            if os.name == "nt":  # o OpenSSH do Windows ignora chave com ACL herdada ("bad permissions")
                import getpass

                subprocess.run(["icacls", keyfile, "/inheritance:r", "/grant:r", f"{getpass.getuser()}:(R,D)"],  # noqa: S603,S607
                               capture_output=True, timeout=10)
            args += ["-i", keyfile, "-o", "IdentitiesOnly=yes"]
        args += [f"{srv['user']}@{srv['host']}" if srv["user"] else srv["host"], _SSH_PROBE]
        r = subprocess.run(args, capture_output=True, text=True, timeout=30)  # noqa: S603
    except subprocess.TimeoutExpired:
        return {"status": "error", "text": "o servidor não respondeu em 30 s"}
    finally:
        if keyfile:
            os.unlink(keyfile)
    if r.returncode != 0:
        err = (r.stderr.strip().splitlines() or ["falha no ssh"])[-1]
        return {"status": "error", "text": f"não consegui entrar ({err[:160]})"}
    m = parse_resources(r.stdout)
    worst = max(m.values())
    hot = max(m, key=m.get)
    label = {"cpu": "CPU", "ram": "memória", "disk": "disco"}[hot]
    text = f"CPU {m['cpu']}% · memória {m['ram']}% · disco {m['disk']}%"
    status = _pct_status(worst)
    return {"status": status, "text": text if status == "ok" else f"{label} em {worst}% · {text}",
            "value": m[p.get("metric") or "cpu"], "metrics": m}


def _k8s_get(path: str) -> dict:
    import base64
    import ssl
    import urllib.request

    cfg = settings()["k8s"]
    if not cfg.get("server"):
        raise ValueError("cluster não configurado em Saúde › Conexões")
    token = _secret(cfg["token_env"]).strip()
    if not token.startswith("eyJ"):  # colado como saiu do kubectl (.data.token, em base64)
        token = base64.b64decode(token + "=" * (-len(token) % 4)).decode().strip()
    from agent.secret_scope import get_secret_str

    ca = _pem(get_secret_str(cfg.get("ca_env") or ""))
    ctx = ssl.create_default_context(cadata=ca) if ca else ssl.create_default_context()
    req = urllib.request.Request(cfg["server"].rstrip("/") + path, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=15, context=ctx) as r:  # noqa: S310
        return json.loads(r.read().decode())


def _run_k8s(p: dict, prev: dict) -> dict:
    import urllib.parse

    ns = p.get("namespace") or _namespaces()[0]
    dep = _k8s_get(f"/apis/apps/v1/namespaces/{ns}/deployments/{p['deployment']}")
    want = int((dep.get("spec") or {}).get("replicas") or 0)
    ready = int((dep.get("status") or {}).get("readyReplicas") or 0)
    sel = ",".join(f"{k}={v}" for k, v in (((dep.get("spec") or {}).get("selector") or {}).get("matchLabels") or {}).items())
    pods = _k8s_get(f"/api/v1/namespaces/{ns}/pods?labelSelector={urllib.parse.quote(sel)}").get("items") or []
    restarts, reasons = 0, set()
    for pod in pods:
        for cs in (pod.get("status") or {}).get("containerStatuses") or []:
            restarts += int(cs.get("restartCount") or 0)
            why = ((cs.get("lastState") or {}).get("terminated") or {}).get("reason")
            if why and why != "Completed":
                reasons.add(why)
    state = prev.get("state") or {}
    now = time.time()
    marks = [m for m in state.get("marks", []) if now - m[0] <= 3600] + [[now, restarts]]
    in_hour = max(0, restarts - marks[0][1])
    text = f"{ready}/{want} pods prontos · {in_hour} reinício{'s' if in_hour != 1 else ''} em 1 h"
    if reasons:
        text += f" · último motivo: {', '.join(sorted(reasons))}"
    status = "error" if want and ready == 0 else "warn" if ready < want or in_hour >= 3 else "ok"
    return {"status": status, "text": text, "value": in_hour, "state": {"marks": marks}}


def _namespaces() -> list[str]:
    return [n.strip() for n in str(settings()["k8s"].get("namespaces") or "default").split(",") if n.strip()] or ["default"]


def _db() -> Any:
    cfg = settings()["mongo"]
    return _mongo_client(cfg["uri_env"])[cfg["db"]]


def _since(minutes: float) -> Any:
    """ObjectId do instante ``agora - minutes``: filtro por ``_id`` usa o índice padrão (varre só o recente)."""
    from datetime import datetime, timedelta, timezone

    from bson import ObjectId

    return ObjectId.from_datetime(datetime.now(timezone.utc) - timedelta(minutes=minutes))


BOT_LABEL = {"ready": "conectado", "waiting": "esperando ler o QR (desconectado do celular)",
             "reconnecting": "reconectando", "disconnected": "caído", "blocked": "bloqueado pelo WhatsApp",
             "error": "com erro (tentativas de reconexão esgotadas)", "inactive": "desativado",
             "unknown": "em estado desconhecido"}
_BOT_STATUS = {"ready": "ok", "waiting": "warn", "reconnecting": "warn"}  # o resto é erro


def _hhmm(ts: Any) -> str:
    from ops_center import notify

    if hasattr(ts, "tzinfo") and ts.tzinfo is None:  # o pymongo devolve UTC sem fuso
        from datetime import timezone

        ts = ts.replace(tzinfo=timezone.utc)
    when = ts.timestamp() if hasattr(ts, "timestamp") else float(ts)
    tz = notify.routes()["quietHours"]["tz"]
    d = notify._local(when, tz)
    return d.strftime("%d/%m %H:%M" if d.year == notify._local(time.time(), tz).year else "%d/%m/%Y")


def _run_bot(p: dict, _prev: dict) -> dict:
    """Canal em ``system_client_sources`` + mensagens que entraram em ``messages_receive`` na janela."""
    cfg = settings()["bots"]
    db = _db()
    ch = db[cfg["channels"]].find_one({"id": p["channelId"]}, {"status": 1, "updatedAt": 1, "systemClientId": 1},
                                      max_time_ms=5000)
    if not ch:
        return {"status": "error", "text": "canal não encontrado no banco (foi apagado?)"}
    st = str(ch.get("status") or "unknown")
    win = float(p.get("silenceMin") or 5)
    n = db[cfg["messages"]].count_documents({"data.phoneNumberId": p["channelId"], "_id": {"$gt": _since(win)}},
                                            maxTimeMS=8000)
    client = store.get_client(str(ch.get("systemClientId") or p.get("systemClientId") or ""))
    impact = f"1 cliente · {client['name']}" if client else ""
    msgs = f"{n} mensage{'ns' if n != 1 else 'm'} em {int(win)} min"
    if st != "ready":
        since = f" desde {_hhmm(ch['updatedAt'])}" if ch.get("updatedAt") else ""
        return {"status": _BOT_STATUS.get(st, "error"), "text": f"{BOT_LABEL.get(st, st)}{since}", "value": n,
                "impact": impact}
    if p.get("silenceMin") and n == 0:
        return {"status": "error", "text": f"conectado, mas sem mensagens há mais de {int(win)} min", "value": 0,
                "impact": impact}
    return {"status": "ok", "text": f"conectado · {msgs}", "value": n, "impact": impact}


def _run_dead_letters(p: dict, _prev: dict) -> dict:
    """Volume de hoje (fuso dos Avisos) contra o de ontem até a mesma hora, e o motivo mais comum."""
    from datetime import timedelta, timezone

    from ops_center import notify

    col = _db()[p["collection"]]
    f = p.get("dateField") or "createdAt"
    local = notify._local(time.time(), notify.routes()["quietHours"]["tz"])
    midnight = local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).replace(tzinfo=None)
    now = local.astimezone(timezone.utc).replace(tzinfo=None)
    base = dict(p.get("filter") or {})
    today = col.count_documents({**base, f: {"$gte": midnight}}, maxTimeMS=10000)
    yday = col.count_documents({**base, f: {"$gte": midnight - timedelta(days=1), "$lt": now - timedelta(days=1)}},
                               maxTimeMS=10000)
    text = f"{today} hoje (ontem até esta hora: {yday})"
    if today and p.get("groupField"):
        top = list(col.aggregate([{"$match": {**base, f: {"$gte": midnight}}},
                                  {"$group": {"_id": "$" + p["groupField"], "n": {"$sum": 1}}},
                                  {"$sort": {"n": -1}}, {"$limit": 1}], maxTimeMS=10000))
        if top and top[0]["_id"] not in (None, ""):
            text += f" · mais comum: {str(top[0]['_id'])[:80]} ({top[0]['n']})"
    err, warn = p.get("errorPerDay"), p.get("warnPerDay")
    if err and today >= int(err):
        status = "error"
    elif (warn and today >= int(warn)) or (not warn and today >= max(20, 3 * yday)):
        status = "warn"
    else:
        status = "ok"
    return {"status": status, "text": text, "value": today}


RUNNERS: dict[str, Callable[[dict, dict], dict]] = {
    "http": _run_http, "mongo": _run_mongo, "ssh": _run_ssh, "k8s": _run_k8s, "bot": _run_bot,
    "dead_letters": _run_dead_letters,
}
HISTORY_LABEL = {"http": "tempo de resposta (ms)", "ssh": "CPU · %", "k8s": "reinícios em 1 h", "mongo": "",
                 "bot": "mensagens por janela", "dead_letters": "falhas no dia"}


# ---- recomendadas ("Usar as recomendadas") ----

_IDENTITY = {"http": ("url",), "mongo": ("metric",), "ssh": ("server",), "k8s": ("namespace", "deployment"),
             "bot": ("channelId",), "dead_letters": ("collection",)}


def _identity(kind: str, params: dict) -> tuple:
    return (kind, *(str(params.get(k) or "") for k in _IDENTITY.get(kind, ())))


def _existing() -> set:
    with store.connect() as c:
        return {_identity(r["kind"], json.loads(r["params"] or "{}"))
                for r in c.execute("SELECT kind, params FROM health_checks")}


def recommended() -> tuple[list[dict], list[str]]:
    """O que dá para monitorar com as conexões configuradas. ``(specs, avisos do que ficou de fora)``."""
    from agent.secret_scope import get_secret_str

    cfg, specs, skipped = settings(), [], []
    for s in cfg["services"]:
        specs.append({"group": "services", "name": s["name"], "kind": "http", "params": {"url": s["url"]},
                      "interval_sec": 300, "detail": s["url"]})
    if not cfg["services"]:
        skipped.append("Microserviços: cadastre os endereços de /health em Saúde › Conexões")
    for srv in cfg["servers"]:
        specs.append({"group": "servers", "name": srv["name"], "kind": "ssh", "params": {"server": srv["name"]},
                      "interval_sec": 300, "detail": srv["host"]})
    if not cfg["servers"]:
        skipped.append("Servidores: cadastre as VPS (host, usuário e chave SSH) em Saúde › Conexões")
    if get_secret_str(cfg["mongo"]["uri_env"]):
        for metric, name, label, sev in (("replica", "Réplicas", "réplicas no ar", "critical"),
                                         ("latency", "Velocidade das consultas", "ms por consulta", "warning"),
                                         ("space", "Espaço em disco", "% do disco", "warning")):
            specs.append({"group": "mongo", "name": name, "kind": "mongo", "params": {"metric": metric},
                          "interval_sec": 300, "severity": sev, "history_label": label, "detail": cfg["mongo"]["db"]})
        for dl in cfg["deadLetters"]:
            specs.append({"group": "dead_letters", "name": dl["name"], "kind": "dead_letters", "interval_sec": 900,
                          "severity": "warning", "detail": dl["collection"],
                          "params": {k: dl[k] for k in ("collection", "dateField", "groupField")}})
        try:
            specs += _bot_specs()
        except Exception as e:  # noqa: BLE001
            skipped.append(f"Bots: não consegui listar os canais ({_why(e)})")
    else:
        skipped.append(f"Banco, bots e filas de falha: adicione {cfg['mongo']['uri_env']} em Chaves deste perfil")
    k8s = cfg["k8s"]
    if k8s.get("server") and get_secret_str(k8s["token_env"]):
        try:
            for ns in _namespaces():
                for dep in _k8s_get(f"/apis/apps/v1/namespaces/{ns}/deployments").get("items") or []:
                    name = dep["metadata"]["name"]
                    specs.append({"group": "k8s", "name": name, "kind": "k8s", "interval_sec": 300, "detail": ns,
                                  "params": {"namespace": ns, "deployment": name}})
        except Exception as e:  # noqa: BLE001
            skipped.append(f"Kubernetes: não consegui listar os deployments ({_why(e)})")
    else:
        skipped.append("Kubernetes: configure o endereço do cluster e o token de leitura em Saúde › Conexões")
    return specs, skipped


_ENGINE = {"baileys": "Baileys", "wwebjs": "wwebjs", "official": "API oficial"}
STALE_BOT_DAYS = 7  # canal caído há mais que isso é abandonado, não incidente: fica fora das recomendadas


def _bot_specs() -> list[dict]:
    """Um bot por canal de WhatsApp ativo de cliente ativo (diretório sincronizado em Canais)."""
    cfg = settings()["bots"]
    db = _db()
    engines = {d.get("name"): d.get("engine")
               for d in db[cfg["instances"]].find({}, {"name": 1, "engine": 1}, max_time_ms=5000)}
    from datetime import datetime, timedelta

    out = []
    stale = datetime.utcnow() - timedelta(days=STALE_BOT_DAYS)
    for ch in db[cfg["channels"]].find(
            {"type": "whatsapp", "$or": [{"status": {"$in": ["ready", "waiting", "reconnecting"]}},
                                         {"status": {"$ne": "inactive"}, "updatedAt": {"$gte": stale}}]},
            {"id": 1, "systemClientId": 1, "source": 1, "instance": 1}, max_time_ms=8000):
        client = store.get_client(str(ch.get("systemClientId") or ""))
        if not client or not ch.get("id"):
            continue  # cliente desativado ou fora do diretório
        engine = _ENGINE.get(engines.get(ch.get("instance")) or "", "")
        phone = str(ch.get("source") or "")
        detail = " · ".join(x for x in (engine, str(ch.get("instance") or "")) if x)
        name = f"{client['name']} · {phone}" if len(phone) > 4 else client["name"]
        out.append({"group": "whatsapp_bots", "name": name, "kind": "bot", "interval_sec": 300,
                    "client_id": client["system_client_id"], "params": {"channelId": ch["id"]}, "detail": detail})
    return out


def create_recommended() -> dict:
    specs, skipped = recommended()
    have = _existing()
    created = []
    for sp in specs:
        key = _identity(sp["kind"], sp["params"])
        if key in have:
            continue
        created.append(add_check(**sp))
        have.add(key)
    return {"created": created, "skipped": skipped}


# ---- criar em linguagem natural ("Entendi assim") ----

PARSE_PROMPT = """Transforme o pedido em UMA verificação de monitoramento. Responda só com um objeto JSON.
Tipos ("kind") e campos:
- "bot": bot de WhatsApp de um cliente. {"client": "nome do cliente como escrito", "silenceMin": minutos sem mensagem ou null}
- "http": um endereço precisa responder. {"url": "https://...", "slowMs": milissegundos ou null}
- "ssh": recursos de um servidor (SERVERS). {"server": "nome", "metric": "cpu|ram|disk"}
- "mongo": o banco. {"metric": "replica|latency|space"}
- "k8s": um deployment do cluster. {"deployment": "nome", "namespace": "nome ou null"}
- "dead_letters": filas de falha (DEAD). {"collection": "uma das coleções", "errorPerDay": número ou null}
Campos comuns: "kind"; "name" (nome curto em português); "severity": "critical" (algo parou) ou "warning";
"only": {"from": "HH:MM", "to": "HH:MM", "days": [1..7, 1=segunda]} ou null (horário comercial = 08:00-18:00, dias 1-5).
Sem dar para saber o que medir ou quando avisar: {"ok": false, "reason": "o que faltou, em uma frase"}."""


def _llm(text: str) -> str:
    from agent.auxiliary_client import call_llm

    cfg = settings()
    prompt = PARSE_PROMPT.replace("SERVERS", ", ".join(s["name"] for s in cfg["servers"]) or "nenhum cadastrado") \
        .replace("DEAD", ", ".join(d["collection"] for d in cfg["deadLetters"]) or "nenhuma")
    resp = call_llm(task="health_parse", messages=[{"role": "system", "content": prompt},
                                                   {"role": "user", "content": text}],
                    temperature=0, max_tokens=500, timeout=60)
    return resp.choices[0].message.content or ""


_DAYS = ("", "seg", "ter", "qua", "qui", "sex", "sáb", "dom")
_INTERVAL_LABEL = {60: "a cada 1 min", 300: "a cada 5 min", 900: "a cada 15 min", 3600: "a cada 1 hora",
                   86400: "1 vez por dia"}
_GROUP = {"bot": "whatsapp_bots", "http": "services", "ssh": "servers", "mongo": "mongo", "k8s": "k8s",
          "dead_letters": "dead_letters"}
GROUP_LABEL = {"servers": "Servidores", "mongo": "Banco · MongoDB", "whatsapp_bots": "Bots de WhatsApp",
               "k8s": "Kubernetes", "dead_letters": "Filas de falha", "services": "Microserviços"}


def _spec_from(d: dict, interval: int) -> dict:
    """Resposta do modelo → verificação pronta para ``add_check`` (resolve cliente e canal). ``ValueError`` legível."""
    kind = d.get("kind")
    if kind not in _GROUP:
        raise ValueError("não entendi o que medir")
    params: dict[str, Any] = {}
    client_id = None
    if kind == "bot":
        hits = store.list_clients(str(d.get("client") or ""), None, 5)["items"] if d.get("client") else []
        if not hits:
            raise ValueError(f"não achei o cliente “{d.get('client') or '?'}” no diretório (sincronize em Canais)")
        client = hits[0]
        client_id = client["systemClientId"]
        ch = _db()[settings()["bots"]["channels"]].find_one(
            {"systemClientId": client_id, "type": "whatsapp", "status": {"$ne": "inactive"}}, {"id": 1},
            max_time_ms=5000)
        if not ch:
            raise ValueError(f"{client['name']} não tem bot de WhatsApp ativo")
        params = {"channelId": ch["id"], "silenceMin": int(d["silenceMin"]) if d.get("silenceMin") else None}
        d["_client"] = client["name"]
    elif kind == "http":
        if not re.match(r"https?://", str(d.get("url") or "")):
            raise ValueError("faltou o endereço (https://…)")
        params = {"url": d["url"], "slowMs": int(d["slowMs"]) if d.get("slowMs") else None}
    elif kind == "ssh":
        if not any(s["name"] == d.get("server") for s in settings()["servers"]):
            raise ValueError("não sei qual servidor; cadastre-o em Saúde › Conexões")
        params = {"server": d["server"], "metric": d.get("metric") if d.get("metric") in ("cpu", "ram", "disk") else "cpu"}
    elif kind == "mongo":
        params = {"metric": d.get("metric") if d.get("metric") in ("replica", "latency", "space") else "replica"}
    elif kind == "k8s":
        if not d.get("deployment"):
            raise ValueError("faltou o nome do deployment")
        params = {"deployment": str(d["deployment"]), "namespace": d.get("namespace") or _namespaces()[0]}
    else:  # dead_letters
        dl = next((x for x in settings()["deadLetters"] if x["collection"] == d.get("collection")), None)
        if not dl:
            raise ValueError("não sei qual fila de falha")
        params = {k: dl[k] for k in ("collection", "dateField", "groupField")}
        if d.get("errorPerDay"):
            params["errorPerDay"] = int(d["errorPerDay"])
    only = d.get("only")
    if isinstance(only, dict) and only.get("from") and only.get("to"):
        params["only"] = {"from": str(only["from"]), "to": str(only["to"]),
                          "days": [int(x) for x in only.get("days") or [] if 1 <= int(x) <= 7]}
    params = {k: v for k, v in params.items() if v is not None}
    return {"group": _GROUP[kind], "name": str(d.get("name") or d.get("_client") or kind)[:120], "kind": kind,
            "params": params, "interval_sec": int(interval), "client_id": client_id,
            "severity": d.get("severity") if d.get("severity") in SEVERITIES else "critical"}


_METRIC = {"cpu": "CPU", "ram": "memória", "disk": "disco", "replica": "as réplicas",
           "latency": "a velocidade das consultas", "space": "o espaço em disco"}


def describe(spec: dict, client_name: str = "") -> dict:
    """Cartão "Entendi assim": Vou checar · Avisar quando · Só em · Frequência · Grupo · Avisa em."""
    k, p = spec["kind"], spec["params"]
    if k == "bot":
        target = f"o bot de WhatsApp de {client_name or spec['name']}"
        cond = (f"ficar mais de {p['silenceMin']} min sem mensagens, cair ou desconectar" if p.get("silenceMin")
                else "cair ou desconectar")
    elif k == "http":
        target = p.get("url", "")
        cond = "não responder ou responder com erro" + (f" (atenção se passar de {p['slowMs']} ms)" if p.get("slowMs") else "")
    elif k == "ssh":
        target, cond = f"{_METRIC.get(p.get('metric'), 'CPU')} do servidor {p.get('server')}", "passar de 90% (atenção a partir de 80%)"
    elif k == "mongo":
        target, cond = f"{_METRIC.get(p.get('metric'), '')} do MongoDB", "sair do normal"
    elif k == "k8s":
        target = f"o deployment {p.get('deployment')} ({p.get('namespace')})"
        cond = "ficar sem pods prontos ou reiniciar 3+ vezes em 1 h"
    else:
        target = f"a fila de falha {p.get('collection')}"
        cond = f"passar de {p['errorPerDay']} no dia" if p.get("errorPerDay") else "o volume do dia disparar (3× o de ontem)"
    window = "sempre"
    only = p.get("only")
    if only:
        days = only.get("days") or []
        if len(days) > 1 and days == list(range(days[0], days[-1] + 1)):
            span = f"{_DAYS[days[0]]}–{_DAYS[days[-1]]}"
        else:
            span = ", ".join(_DAYS[x] for x in days)
        window = f"{span + ', ' if span else ''}{only['from']}–{only['to']}"
    return {"target": target, "condition": cond, "window": window,
            "frequency": _INTERVAL_LABEL.get(spec["interval_sec"], ""), "group": spec["group"],
            "groupLabel": GROUP_LABEL[spec["group"]], "severity": spec["severity"],
            "notify": _notify_target(spec["severity"])}


def _notify_target(severity: str) -> str:
    from ops_center import notify

    if not notify.is_configured():
        return "nenhum lugar ainda: configure Avisos"
    row = notify.routes()["infra"][severity]
    if row["topic"] == "off":
        return "não envia (Avisos › infra)"
    topic = next((t.get("name") for t in notify._topics() if t.get("id") == row["topic"]), None)
    return "Telegram" + (f" · {topic}" if topic else "")


def parse_text(text: str, interval: int = 300, *, llm: Callable[[str], str] = _llm) -> dict:
    """``{ok, check:{target, condition, window, frequency, group, severity, notify, spec}}`` ou ``{ok: false, reason}``."""
    text = (text or "").strip()
    if int(interval) not in INTERVALS:
        raise ValueError("frequência inválida")
    if len(text) < 8:
        return {"ok": False, "reason": "Escreva o que medir e quando avisar."}
    try:
        m = re.search(r"\{.*\}", llm(text[:1000]) or "", re.S)
        d = json.loads(m.group(0)) if m else {}
    except Exception as e:  # noqa: BLE001
        logger.info("ops_center: interpretação da verificação falhou: %s", type(e).__name__)
        return {"ok": False, "reason": "Não consegui interpretar agora (modelo indisponível). Tente de novo."}
    if d.get("ok") is False or not d.get("kind"):
        return {"ok": False, "reason": d.get("reason") or "Não entendi o que medir ou quando avisar. Diga o alvo "
                                                         "(bot, servidor, endereço…) e a condição."}
    try:
        spec = _spec_from(d, interval)
    except ValueError as e:
        msg = str(e)
        return {"ok": False, "reason": msg[:1].upper() + msg[1:] + "."}
    except Exception as e:  # noqa: BLE001 — banco fora do ar ao resolver o canal
        return {"ok": False, "reason": f"Não consegui consultar o banco para achar o bot ({_why(e)})."}
    return {"ok": True, "check": {**describe(spec, d.get("_client", "")), "spec": spec}}


def create_from_parsed(body: dict) -> dict:
    spec = (body.get("parsed") or {}).get("spec") or {}
    return add_check(group=spec.get("group") or "", name=spec.get("name") or "", kind=spec.get("kind") or "",
                     params=spec.get("params") or {},
                     interval_sec=int(body.get("interval") or spec.get("interval_sec") or 300),
                     severity=spec.get("severity") or "critical", client_id=spec.get("client_id"),
                     source_text=str(body.get("text") or "")[:1000], parsed=body.get("parsed"))
