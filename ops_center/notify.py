"""Avisos da equipe (design A4): para qual tópico do supergrupo do Telegram cada aviso vai.

Fala com a Bot API do Telegram direto por HTTP (``urllib``), com o token do perfil
(``TELEGRAM_BOT_TOKEN`` no escopo de segredos). O token nunca sai daqui.

Estado no ``ops.db`` (``store.get_meta/set_meta``):
- ``notify_routes``: o contrato de rotas (``chatId`` + análises, infra, resumo, silêncio);
- ``notify_topics``: tópicos que o próprio bot criou ou que o usuário registrou (a Bot API não lista tópicos);
- ``notify_members``: cache de quem já apareceu (administradores; a API só devolve esses);
- ``notify_queue``: avisos segurados pelo horário de silêncio, que saem num resumo quando ele acaba;
- ``notify_digest_last``: dia (AAAA-MM-DD) do último resumo diário enviado.

Agendamento: ``tick()`` faz o que depende de relógio (descarrega o silêncio e manda o resumo diário no horário).
Quem roda o ticker/cron do gateway só precisa chamar ``notify.tick()`` a cada minuto, no escopo do perfil.
"""

from __future__ import annotations

import html
import json
import logging
import re
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from ops_center import store

logger = logging.getLogger(__name__)

API = "https://api.telegram.org"

ANALYSES = ("critical", "high", "medium", "low")
INFRA = ("critical", "warning", "info")
_ALIAS = {"critica": "critical", "alta": "high", "media": "medium", "baixa": "low", "aviso": "warning"}

# Telegram só aceita estas cores de ícone de tópico.
DEFAULT_TOPICS = (
    ("Alertas de infra", 0xFB6F5F, "server"),
    ("Grupos de clientes", 0x6FB9F0, "users-round"),
    ("Conversa", 0x8EEE98, "message-circle"),
)

DEFAULT_ROUTES: dict[str, Any] = {
    "chatId": None,
    "analyses": {"critical": {"topic": None, "quiet": False}, "high": {"topic": None, "quiet": False},
                 "medium": {"topic": None, "quiet": True}, "low": {"topic": None, "quiet": True}, "mentions": []},
    "infra": {"critical": {"topic": None, "quiet": False}, "warning": {"topic": None, "quiet": True},
              "info": {"topic": "off", "quiet": True}, "mentions": []},
    "digest": {"topic": None, "time": "08:30", "days": [1, 2, 3, 4, 5]},
    "quietHours": {"from": "20:00", "to": "08:00", "weekend": True, "tz": "America/Sao_Paulo"},
}

_HHMM = re.compile(r"([01]\d|2[0-3]):[0-5]\d")
_qlock = threading.Lock()
_QUEUE_MAX = 200


class TelegramError(Exception):
    """Erro da Bot API (ou de rede). ``code``: no_token | no_chat | no_permission | telegram_error."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message


# ---- Bot API ----

def token() -> str:
    from agent.secret_scope import get_secret_str

    return get_secret_str("TELEGRAM_BOT_TOKEN").strip()


def _classify(error_code: int, desc: str) -> str:
    d = desc.lower()
    if error_code == 401:
        return "no_token"
    if error_code == 403 or any(s in d for s in ("not enough rights", "have no rights", "chat_write_forbidden",
                                                 "topic_closed", "administrator rights")):
        return "no_permission"
    if "chat not found" in d:
        return "no_chat"
    return "telegram_error"


def _post(tok: str, method: str, payload: Optional[dict] = None, timeout: float = 10) -> Any:
    """Chama um método da Bot API e devolve ``result``. Levanta ``TelegramError``."""
    req = urllib.request.Request(f"{API}/bot{tok}/{method}", data=json.dumps(payload or {}).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 — host fixo
            body = json.load(r)
    except urllib.error.HTTPError as e:
        try:
            body = json.load(e)
        except Exception:  # noqa: BLE001
            body = {"ok": False, "error_code": e.code, "description": f"HTTP {e.code}"}
    except Exception as e:  # noqa: BLE001
        raise TelegramError("telegram_error", f"Não consegui falar com o Telegram: {str(e).replace(tok, '***')}") from None
    if not body.get("ok"):
        desc = str(body.get("description") or "erro desconhecido").replace(tok, "***")
        raise TelegramError(_classify(int(body.get("error_code") or 0), desc), desc)
    return body.get("result")


def _call(method: str, payload: Optional[dict] = None) -> Any:
    tok = token()
    if not tok:
        raise TelegramError("no_token", "O Telegram ainda não está conectado.")
    return _post(tok, method, payload)


# ---- rotas (configuração) ----

def _hhmm(v: Any, what: str) -> str:
    if not isinstance(v, str) or not _HHMM.fullmatch(v):
        raise ValueError(f"{what}: horário inválido (use HH:MM)")
    return v


def _topic(v: Any) -> Any:
    if v is None or v == "off":
        return v
    if isinstance(v, bool) or not isinstance(v, int) or v <= 0:
        raise ValueError("tópico inválido (número do tópico, null para Geral ou 'off')")
    return v


def _mentions(v: Any) -> list[int]:
    out: list[int] = []
    for x in v or []:
        try:
            i = int(x)
        except (TypeError, ValueError):
            raise ValueError("menção inválida (id numérico do Telegram)") from None
        if i not in out:
            out.append(i)
    return out


def _tz(v: Any) -> str:
    if not isinstance(v, str) or not v:
        raise ValueError("fuso horário inválido")
    try:
        from zoneinfo import ZoneInfo

        ZoneInfo(v)
    except Exception as e:  # noqa: BLE001
        # sem o banco de fusos (Windows sem tzdata) só o de Brasília tem fallback fixo
        if v != "America/Sao_Paulo":
            raise ValueError(f"fuso horário desconhecido: {v}") from e
    return v


def normalize(doc: dict, base: Optional[dict] = None) -> dict:
    """Valida ``doc`` (pode ser parcial) em cima de ``base`` (padrão: as rotas atuais). Levanta ``ValueError``."""
    cur = json.loads(json.dumps(base if base is not None else routes()))
    doc = doc or {}
    if "chatId" in doc:
        cid = doc["chatId"]
        cur["chatId"] = None if cid in (None, "") else str(cid).strip()
    for sec, levels in (("analyses", ANALYSES), ("infra", INFRA)):
        src = doc.get(sec) or {}
        for lv in levels:
            if lv not in src:
                continue
            row = src[lv] or {}
            new = {"topic": _topic(row["topic"]) if "topic" in row else cur[sec][lv]["topic"],
                   "quiet": bool(row.get("quiet", cur[sec][lv]["quiet"]))}
            if lv == "critical" and new["quiet"]:
                raise ValueError("O nível crítico nunca fica em silêncio.")
            cur[sec][lv] = new
        if "mentions" in src:
            cur[sec]["mentions"] = _mentions(src["mentions"])
    if "digest" in doc:
        d, c = doc["digest"] or {}, cur["digest"]
        if "topic" in d:
            c["topic"] = _topic(d["topic"])
        if "time" in d:
            c["time"] = _hhmm(d["time"], "resumo")
        if "days" in d:
            days = d["days"]
            if not isinstance(days, list) or any(isinstance(x, bool) or not isinstance(x, int) or not 0 <= x <= 6 for x in days):
                raise ValueError("dias do resumo: números de 0 (domingo) a 6 (sábado)")
            c["days"] = sorted(set(days))
    if "quietHours" in doc:
        q, c = doc["quietHours"] or {}, cur["quietHours"]
        for k in ("from", "to"):
            if k in q:
                c[k] = _hhmm(q[k], "silêncio")
        if "weekend" in q:
            c["weekend"] = bool(q["weekend"])
        if "tz" in q:
            c["tz"] = _tz(q["tz"])
    return cur


def routes_saved() -> bool:
    return bool(store.get_meta("notify_routes"))


def routes() -> dict:
    """Rotas salvas por cima do padrão."""
    saved = store.get_meta("notify_routes") or {}
    if not saved:
        return json.loads(json.dumps(DEFAULT_ROUTES))
    return normalize(saved, json.loads(json.dumps(DEFAULT_ROUTES)))


def save_routes(doc: dict) -> dict:
    cur = normalize(doc)
    store.set_meta("notify_routes", cur)
    return cur


_TARGET = re.compile(r"telegram:(-?\d+)(?::\d+)?")


def chat_id() -> Optional[str]:
    """Supergrupo da equipe: o salvo nas rotas; senão deduzido de ``notify_target``/``approval_target``/canal inicial."""
    saved = (store.get_meta("notify_routes") or {}).get("chatId")
    if saved:
        return str(saved)
    cands = [store.listen_settings().get("notify_target")]
    try:
        from ops_center import guardrails

        cands.append(guardrails.settings().get("approval_target"))
    except Exception:  # noqa: BLE001
        pass
    for t in cands:
        m = _TARGET.fullmatch(str(t or "").strip())
        if m:
            return m[1]
    from agent.secret_scope import get_secret_str

    home = get_secret_str("TELEGRAM_HOME_CHANNEL").strip()
    return home if re.fullmatch(r"-?\d+", home) else None


def is_configured() -> bool:
    """Há rotas salvas, token e grupo: ``send`` passa a valer no lugar do ``notify_target`` antigo."""
    return routes_saved() and bool(token()) and bool(chat_id())


# ---- tópicos e membros ----

def _topics() -> list[dict]:
    return list(store.get_meta("notify_topics") or [])


def _fmt_color(c: Any) -> str:
    return c if isinstance(c, str) else "#%06x" % int(c or 0x7F91A4)


def _remember_members(members: list[dict]) -> None:
    store.set_meta("notify_members", members)


def _member_name(u: dict) -> str:
    return " ".join(x for x in (u.get("first_name"), u.get("last_name")) if x) or u.get("title") or u.get("username") or str(u.get("id"))


def telegram() -> dict:
    """Estado do Telegram para a tela: ``status`` = ok | no_token | no_chat | error."""
    base: dict[str, Any] = {"connected": False, "status": "no_token", "bot": None, "chat": None, "topics": [], "members": [], "chatId": None}
    if not token():
        return base
    cid = chat_id()
    if not cid:
        return {**base, "status": "no_chat"}
    base["chatId"] = cid
    try:
        me = _call("getMe")
        chat = _call("getChat", {"chat_id": cid})
        count = _call("getChatMemberCount", {"chat_id": cid})
        admins = _call("getChatAdministrators", {"chat_id": cid})
        mine = _call("getChatMember", {"chat_id": cid, "user_id": me["id"]})
    except TelegramError as e:
        status = e.code if e.code in ("no_token", "no_chat") else "error"
        return {**base, "status": status, "error": {"code": e.code, "message": e.message}}
    is_admin = mine.get("status") in ("administrator", "creator")
    members = [{"id": a["user"]["id"], "name": _member_name(a["user"]), "username": a["user"].get("username"),
                "role": "Dono" if a.get("status") == "creator" else (a.get("custom_title") or "Admin")}
               for a in admins if not a["user"].get("is_bot")]
    seen = {m["id"] for m in members}
    members += [m for m in (store.get_meta("notify_members") or []) if m.get("role") == "Membro" and m["id"] not in seen]
    _remember_members(members)
    return {
        "connected": True, "status": "ok", "chatId": cid, "bot": {"username": me.get("username")},
        "chat": {"id": cid, "title": chat.get("title") or "", "members": count, "isForum": bool(chat.get("is_forum")),
                 "botIsAdmin": is_admin, "canManageTopics": mine.get("status") == "creator" or bool(mine.get("can_manage_topics"))},
        "topics": _topics(), "members": members,
    }


def learn_member(user_id: int, name: str, username: Optional[str] = None) -> None:
    """Guarda quem escreveu no grupo (a Bot API só lista administradores). Para o adaptador do Telegram chamar
    quando vier mensagem do grupo da equipe; hoje nada chama (ver spec 11)."""
    with _qlock:
        members = list(store.get_meta("notify_members") or [])
        if any(m["id"] == user_id for m in members):
            return
        store.set_meta("notify_members", members + [{"id": user_id, "name": name, "username": username, "role": "Membro"}])


def set_chat(chat: Any) -> dict:
    """Define o supergrupo da equipe (confere que o bot enxerga o grupo antes de salvar)."""
    cid = str(chat or "").strip()
    if not re.fullmatch(r"-?\d+", cid):
        raise ValueError("ID do grupo inválido (ex.: -1001234567890)")
    _call("getChat", {"chat_id": cid})
    if cid != chat_id():
        store.set_meta("notify_topics", [])  # outro grupo: os tópicos conhecidos não valem
    cur = store.get_meta("notify_routes") or json.loads(json.dumps(DEFAULT_ROUTES))
    store.set_meta("notify_routes", {**cur, "chatId": cid})
    return telegram()


def refresh_topics(create: bool = False, add: Optional[list[dict]] = None) -> dict:
    """Relê o grupo (getChat, administradores) e devolve o estado. A Bot API não lista tópicos, então:
    ``add`` registra tópicos que já existiam (``[{threadId, name}]``) e ``create`` cria os 3 padrão que faltarem."""
    info = telegram()
    if info["status"] != "ok":
        return info
    topics = _topics()
    for t in add or []:
        tid, name = t.get("threadId"), str(t.get("name") or "").strip()
        if isinstance(tid, bool) or not isinstance(tid, int) or tid <= 0 or not name:
            raise ValueError("tópico inválido (threadId e nome)")
        topics = [x for x in topics if x["threadId"] != tid] + [{"threadId": tid, "name": name, "color": "#7f91a4", "icon": "hash"}]
    if create:
        if not info["chat"]["isForum"]:
            raise ValueError("O grupo não tem tópicos ativados. Ative em Gerenciar grupo › Tópicos.")
        have = {t["name"].lower() for t in topics}
        for name, color, icon in DEFAULT_TOPICS:
            if name.lower() in have:
                continue
            r = _call("createForumTopic", {"chat_id": info["chatId"], "name": name, "icon_color": color})
            topics.append({"threadId": r["message_thread_id"], "name": name, "color": _fmt_color(r.get("icon_color", color)), "icon": icon})
    store.set_meta("notify_topics", topics)
    return {**info, "topics": topics}


def _topic_name(topic: Any) -> str:
    if topic is None:
        return "Geral"
    return next((t["name"] for t in _topics() if t["threadId"] == topic), f"Tópico {topic}")


# ---- horário de silêncio ----

def _local(now: float, tz: str) -> datetime:
    try:
        from zoneinfo import ZoneInfo

        z: Any = ZoneInfo(tz)
    except Exception:  # noqa: BLE001
        z = timezone(timedelta(hours=-3))  # ponytail: Brasília fixa (sem horário de verão desde 2019) se faltar tzdata
    return datetime.fromtimestamp(now, z)


def _min(hm: str) -> int:
    h, m = hm.split(":")
    return int(h) * 60 + int(m)


def in_quiet(q: dict, now: Optional[float] = None) -> bool:
    d = _local(now if now is not None else time.time(), q["tz"])
    if q["weekend"] and d.weekday() >= 5:
        return True
    a, b, m = _min(q["from"]), _min(q["to"]), d.hour * 60 + d.minute
    if a == b:
        return False
    return a <= m < b if a < b else (m >= a or m < b)


# ---- envio ----

def _level(kind: str, level: str) -> str:
    key = _ALIAS.get(level, level)
    if kind not in ("analyses", "infra") or key not in (ANALYSES if kind == "analyses" else INFRA):
        raise ValueError(f"nível inválido: {kind}/{level}")
    return key


def _mention_text(ids: list[int]) -> str:
    cache = {m["id"]: m for m in store.get_meta("notify_members") or []}
    out = []
    for i in ids:
        m = cache.get(i) or {}
        out.append("@" + html.escape(m["username"]) if m.get("username")
                   else f'<a href="tg://user?id={i}">{html.escape(m.get("name") or "equipe")}</a>')
    return " ".join(out)


def _url(cid: str, topic: Any, mid: Any) -> Optional[str]:
    m = re.fullmatch(r"-100(\d+)", str(cid))
    if not m or not mid:
        return None
    return "https://t.me/c/" + "/".join(str(x) for x in (m[1], topic, mid) if x)


def _deliver(cid: str, topic: Any, text: str, mentions: Optional[list[int]] = None) -> dict:
    body = html.escape(text)[:3800]
    if mentions:
        body += "\n\n" + _mention_text(mentions)
    payload: dict[str, Any] = {"chat_id": cid, "text": body, "parse_mode": "HTML", "disable_web_page_preview": True}
    if isinstance(topic, int):
        payload["message_thread_id"] = topic
    r = _call("sendMessage", payload)
    mid = r.get("message_id")
    return {"sentAt": time.time(), "messageId": mid, "url": _url(cid, topic, mid), "topic": topic,
            "target": f"telegram:{cid}" + (f":{topic}" if isinstance(topic, int) else "")}


def _enqueue(item: dict) -> None:
    with _qlock:
        q = list(store.get_meta("notify_queue") or [])
        store.set_meta("notify_queue", (q + [item])[-_QUEUE_MAX:])


def send(kind: str, level: str, text: str, now: Optional[float] = None) -> Optional[dict]:
    """Aplica a rota do nível e envia. ``kind``: ``analyses`` (critica|alta|media|baixa) ou ``infra`` (critical|warning|info).

    Devolve ``{sentAt, messageId, url, topic, target}``; ``None`` se não enviou (sem rotas/token/grupo, "Não enviar",
    segurado pelo silêncio — fica na fila — ou falha do Telegram, que só é registrada no log)."""
    key = _level(kind, level)
    if not routes_saved():
        return None
    r = routes()
    row = r[kind][key]
    if row["topic"] == "off":
        return None
    cid = chat_id()
    if not (token() and cid):
        return None
    now = time.time() if now is None else now
    if key != "critical" and row["quiet"] and in_quiet(r["quietHours"], now):
        _enqueue({"at": now, "kind": kind, "level": key, "topic": row["topic"], "text": text[:300]})
        return None
    try:
        return _deliver(cid, row["topic"], text, r[kind]["mentions"] if key == "critical" else None)
    except TelegramError as e:
        logger.warning("ops_center: aviso %s/%s não saiu: %s", kind, key, e.message)
        return None


def flush_quiet(now: Optional[float] = None) -> int:
    """Quando o silêncio acabou, manda um resumo por tópico com o que ficou guardado. Devolve quantos avisos saíram."""
    now = time.time() if now is None else now
    r = routes()
    cid = chat_id()
    if in_quiet(r["quietHours"], now) or not (token() and cid):
        return 0
    with _qlock:
        queue = list(store.get_meta("notify_queue") or [])
        if not queue:
            return 0
        store.set_meta("notify_queue", [])
    by_topic: dict[Any, list[dict]] = {}
    for it in queue:
        by_topic.setdefault(it["topic"], []).append(it)
    sent, back = 0, []
    for topic, items in by_topic.items():
        shown = [f"• {_local(i['at'], r['quietHours']['tz']):%H:%M} · {' '.join(i['text'].split())[:140]}" for i in items[:15]]
        more = f"\n…e mais {len(items) - 15}." if len(items) > 15 else ""
        msg = f"🌙 Enquanto você estava em silêncio ({len(items)} aviso{'s' if len(items) != 1 else ''})\n\n" + "\n".join(shown) + more
        try:
            _deliver(cid, topic, msg)
            sent += len(items)
        except TelegramError as e:
            logger.warning("ops_center: resumo do silêncio não saiu: %s", e.message)
            back += items
    if back:
        with _qlock:
            store.set_meta("notify_queue", (back + list(store.get_meta("notify_queue") or []))[-_QUEUE_MAX:])
    return sent


# ---- resumo diário ----

def digest_text(now: Optional[float] = None) -> str:
    """Contagens de ontem (no fuso do silêncio): análises por urgência, abertas e mensagens sociais ignoradas."""
    now = time.time() if now is None else now
    tz = routes()["quietHours"]["tz"]
    today0 = _local(now, tz).replace(hour=0, minute=0, second=0, microsecond=0)
    start, end = (today0 - timedelta(days=1)).timestamp(), today0.timestamp()
    rows = store.list_analyses(None, limit=5000)
    day = [a for a in rows if start <= a["created_at"] < end]
    real = [a for a in day if a["status"] in ("open", "failed", "resolved", "irrelevant")]
    ignored = sum(a.get("message_count") or 0 for a in day if a["status"] == "ignored")
    opened = [a for a in rows if a["status"] in ("open", "failed")]
    labels = {"critica": ("crítica", "críticas"), "alta": ("alta", "altas"), "media": ("média", "médias"), "baixa": ("baixa", "baixas")}
    parts = []
    for u, (one, many) in labels.items():
        n = sum(1 for a in real if a.get("urgency") == u)
        if n:
            parts.append(f"{n} {one if n == 1 else many}")
    resolved = sum(1 for a in real if a["status"] == "resolved")
    lines = [f"☀️ Resumo de ontem · {_local(now, tz):%H:%M}",
             f"• {len(real)} análise{'s' if len(real) != 1 else ''}" + (f" ({', '.join(parts)})" if parts else "")
             + f", {resolved} resolvida{'s' if resolved != 1 else ''}"]
    names = list(dict.fromkeys(a.get("client_name") or a.get("group_name") or a["channel_id"] for a in opened))
    lines.append(f"• Abertas ({len(opened)}): " + (", ".join(names[:4]) + (f" e mais {len(names) - 4}" if len(names) > 4 else "") if names else "nenhuma"))
    lines.append(f"• {ignored} mensagens sociais ignoradas")
    lines.append("Abrir o painel: Análises dos grupos.")
    return "\n".join(lines)


def send_digest(now: Optional[float] = None) -> dict:
    """Manda o resumo agora (ignora dia/horário). Levanta ``TelegramError``/``ValueError``."""
    r = routes()
    topic = r["digest"]["topic"]
    if topic == "off":
        raise ValueError("O resumo diário está como “Não enviar”.")
    cid = chat_id()
    if not (token() and cid):
        raise TelegramError("no_token" if not token() else "no_chat", "O Telegram ainda não está conectado.")
    return _deliver(cid, topic, digest_text(now))


def tick(now: Optional[float] = None) -> dict:
    """Para o ticker/cron (1x por minuto, no escopo do perfil): descarrega o silêncio e manda o resumo diário na hora."""
    now = time.time() if now is None else now
    out = {"flushed": 0, "digest": False}
    if not is_configured():
        return out
    out["flushed"] = flush_quiet(now)
    r = routes()
    d, d0 = r["digest"], _local(now, r["quietHours"]["tz"])
    today = d0.strftime("%Y-%m-%d")
    due = (d["topic"] != "off" and (d0.isoweekday() % 7) in d["days"] and d0.hour * 60 + d0.minute >= _min(d["time"])
           and store.get_meta("notify_digest_last") != today)
    if due:
        store.set_meta("notify_digest_last", today)  # antes de enviar: falha não vira rajada a cada minuto
        try:
            send_digest(now)
            out["digest"] = True
        except (TelegramError, ValueError) as e:
            logger.warning("ops_center: resumo diário não saiu: %s", getattr(e, "message", e))
    return out


# ---- teste ----

_SAMPLES = {
    "analyses": "🔴 Urgência crítica · Teste — Cliente de exemplo\n\nEste é um aviso de teste do Hermes. Se você está lendo isto, as análises dos grupos chegam aqui.",
    "infra": "🔴 Infra crítica · Teste\n\nEste é um aviso de teste do Hermes. Se você está lendo isto, os alertas de infra chegam aqui.",
    "digest": "☀️ Resumo diário · Teste\n\nEste é um aviso de teste do Hermes. O resumo de verdade traz as contagens do dia anterior.",
}


def _human(e: TelegramError, topic_name: str) -> str:
    if e.code == "no_permission":
        return f"O Telegram recusou: o bot não tem permissão para postar em “{topic_name}”. Dê permissão de administrador e teste de novo."
    if e.code == "no_token":
        return "O Telegram recusou o token do bot. Confira a conexão em Gateways."
    if e.code == "no_chat":
        return "O Telegram não achou o grupo. Confira se o bot ainda está nele."
    if "thread not found" in e.message.lower():
        return f"O tópico “{topic_name}” não existe mais no grupo. Escolha outro e teste de novo."
    return f"O Telegram não aceitou o teste: {e.message}"


def test(kind: str, draft: Optional[dict] = None) -> dict:
    """Envia de verdade uma mensagem de teste ao tópico do nível mais alto do tipo (``draft`` = rotas ainda não salvas)."""
    if kind not in _SAMPLES:
        raise ValueError(f"tipo inválido: {kind}")
    r = normalize(draft, routes()) if draft else routes()
    topic = r["digest"]["topic"] if kind == "digest" else r[kind]["critical"]["topic"]
    if topic == "off":
        return {"ok": False, "code": "topic_off", "message": "Este aviso está como “Não enviar”. Escolha um tópico para testar."}
    if not token():
        return {"ok": False, "code": "no_token", "message": "O Telegram ainda não está conectado. Conecte o bot em Gateways."}
    cid = r.get("chatId") or chat_id()
    if not cid:
        return {"ok": False, "code": "no_chat", "message": "Falta escolher o grupo da equipe."}
    name = _topic_name(topic)
    t0 = time.perf_counter()
    try:
        sent = _deliver(str(cid), topic, "🧪 " + _SAMPLES[kind], None if kind == "digest" else r[kind]["mentions"])
    except TelegramError as e:
        return {"ok": False, "code": e.code, "message": _human(e, name)}
    return {"ok": True, "topic": topic, "topicName": name, "latencyMs": round((time.perf_counter() - t0) * 1000), "messageUrl": sent["url"]}
