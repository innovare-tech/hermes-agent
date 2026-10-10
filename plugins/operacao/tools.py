"""Ferramentas da Operação (só leitura). Horários sempre em Brasília.

Mensagens de grupo: o número de suporte também é canal da plataforma Aibiz, que grava TUDO em
``aibiz_mrz.whatsapp_socket_messages`` (inclusive o que chegou antes do Hermes ou se perdeu). Essa é a fonte
principal; a caixa de entrada do Hermes (``ops.db``) completa com transcrições de áudio e cobre o Telegram.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
from typing import Any, Optional
from zoneinfo import ZoneInfo

from tools.registry import tool_error, tool_result

logger = logging.getLogger(__name__)
BRT = ZoneInfo("America/Sao_Paulo")
_MODES = {0: "Observar", 1: "Rascunhar", 2: "Autônomo", 3: "Escutar"}
MAX_MESSAGES = 400
MAX_TEXT = 600


def available() -> bool:
    """Nunca em perfil de cliente do Copiloto; nos demais, só se a Central existe no perfil."""
    from hermes_constants import get_hermes_home

    home = get_hermes_home()
    return not home.name.startswith("cli-") and (home / "ops.db").exists()


# ---- utilidades ----

def _fmt(ts: Optional[float]) -> Optional[str]:
    return dt.datetime.fromtimestamp(ts, BRT).strftime("%d/%m %H:%M") if ts else None


def _parse_when(value: Optional[str], *, end: bool = False) -> Optional[float]:
    """``hoje``/``ontem``/``AAAA-MM-DD``/``AAAA-MM-DD HH:MM`` (Brasília) → epoch. Dia sem hora = início (ou fim)."""
    if not value:
        return None
    v = str(value).strip().lower()
    today = dt.datetime.now(BRT).replace(hour=0, minute=0, second=0, microsecond=0)
    day = {"hoje": today, "ontem": today - dt.timedelta(days=1)}.get(v)
    if day is None:
        for f in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%d/%m/%Y %H:%M", "%Y-%m-%d", "%d/%m/%Y"):
            try:
                parsed = dt.datetime.strptime(v, f).replace(tzinfo=BRT)
            except ValueError:
                continue
            if "%H" in f:
                return parsed.timestamp()
            day = parsed
            break
        else:
            raise ValueError(f"data inválida: {value!r} (use hoje, ontem, AAAA-MM-DD ou AAAA-MM-DD HH:MM)")
    return (day + dt.timedelta(days=1)).timestamp() - 1 if end else day.timestamp()


def _channels() -> list[dict]:
    from ops_center import store, wa_groups

    return wa_groups.with_discovery(store.channels_view())


def _resolve(query: str) -> tuple[Optional[dict], list[dict]]:
    """Canal por nome do grupo, nome do cliente ou chat id; ``(canal, candidatos)``."""
    from ops_center import store

    chans = _channels()
    q = str(query or "").strip()
    exact = [c for c in chans if q and q in (c.get("chat_id"), c.get("id"))]
    if exact:
        return exact[0], []
    nq = store._norm(q)
    hits = [c for c in chans if nq and (nq in store._norm(c.get("name") or "") or nq in store._norm(c.get("clientName") or ""))]
    return (hits[0], []) if len(hits) == 1 else (None, hits)


def _brief(c: dict) -> dict:
    return {"grupo": c.get("name"), "plataforma": c.get("platform"), "chatId": c.get("chat_id"),
            "cliente": c.get("clientName"), "modo": _MODES.get(c.get("mode")),
            "escutando": c.get("listening", True) if c.get("platform") == "whatsapp" else None,
            "mensagensHoje": c.get("todayCount"), "participantes": c.get("size") or c.get("members"),
            "ultimaMensagem": _fmt((c.get("last") or {}).get("at"))}


# ---- ops_groups ----

GROUPS_SCHEMA = {
    "name": "ops_groups",
    "description": ("Lista os grupos e canais acompanhados pela Central (grupos de clientes no WhatsApp, equipe no Telegram): "
                    "cliente vinculado, modo, se o Hermes está escutando, mensagens de hoje e última mensagem. "
                    "Use primeiro para achar o grupo certo de um cliente."),
    "parameters": {"type": "object", "properties": {
        "busca": {"type": "string", "description": "Parte do nome do grupo ou do cliente (opcional)."}}, "required": []},
}


def groups(args: dict, **_kw) -> str:
    try:
        from ops_center import store

        nq = store._norm(args.get("busca") or "")
        rows = [_brief(c) for c in _channels()
                if not nq or nq in store._norm(c.get("name") or "") or nq in store._norm(c.get("clientName") or "")]
        return tool_result({"total": len(rows), "grupos": rows})
    except Exception as e:  # noqa: BLE001 — ferramenta nunca derruba o turno
        logger.warning("ops_groups falhou", exc_info=True)
        return tool_error(f"não consegui listar os grupos: {e}")


# ---- ops_group_messages ----

MESSAGES_SCHEMA = {
    "name": "ops_group_messages",
    "description": ("Mensagens de um grupo/canal num período (horário de Brasília), em ordem. No WhatsApp lê o histórico "
                    "COMPLETO da plataforma Aibiz (inclui o que chegou antes do Hermes); completa com transcrições de "
                    "áudio do Hermes. Use para resumir o que houve num cliente, achar quem pediu o quê, etc."),
    "parameters": {"type": "object", "properties": {
        "grupo": {"type": "string", "description": "Nome do grupo, nome do cliente ou chatId (…@g.us)."},
        "desde": {"type": "string", "description": "hoje | ontem | AAAA-MM-DD | AAAA-MM-DD HH:MM (padrão: hoje 00:00)."},
        "ate": {"type": "string", "description": "Mesmo formato (padrão: agora)."},
        "limite": {"type": "integer", "description": f"Máximo de mensagens (padrão 200, máx. {MAX_MESSAGES}); pega as mais recentes."}},
        "required": ["grupo"]},
}


def _wa_text(msg: dict) -> Optional[str]:
    """Texto legível de um ``payload.message`` do Baileys; ``None`` = não é conteúdo (protocolo, chave, reação vazia)."""
    if not isinstance(msg, dict):
        return None
    if msg.get("conversation"):
        return msg["conversation"]
    if (m := msg.get("extendedTextMessage")) and m.get("text"):
        return m["text"]
    for kind, label in (("imageMessage", "imagem"), ("videoMessage", "vídeo"), ("documentMessage", "documento")):
        if (m := msg.get(kind)) is not None:
            extra = (m or {}).get("caption") or (m or {}).get("fileName") or ""
            return f"[{label}]" + (f" {extra}" if extra else "")
    if "audioMessage" in msg:
        return "[áudio]"
    if "stickerMessage" in msg:
        return "[figurinha]"
    if (m := msg.get("reactionMessage")) and m.get("text"):
        return f"[reagiu {m['text']}]"
    if (m := msg.get("pollCreationMessage") or msg.get("pollCreationMessageV3")) and m.get("name"):
        return f"[enquete] {m['name']}"
    for wrap in ("ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "documentWithCaptionMessage"):
        if isinstance(msg.get(wrap), dict):
            return _wa_text(msg[wrap].get("message") or {})
    return None


def _from_aibiz(jid: str, since: float, until: float) -> Optional[list[dict]]:
    """Histórico da plataforma Aibiz; ``None`` se o Mongo não estiver configurado/alcançável."""
    from agent.secret_scope import get_secret_str
    from ops_center import health

    if not get_secret_str(health.settings()["mongo"]["uri_env"]):
        return None
    col = health._db()["whatsapp_socket_messages"]
    q = {"chatJid": jid, "createdAt": {"$gte": dt.datetime.fromtimestamp(since, dt.timezone.utc),
                                       "$lte": dt.datetime.fromtimestamp(until, dt.timezone.utc)}}
    out, seen = [], set()
    for d in col.find(q, {"key": 1, "payload": 1, "pushName": 1, "createdAt": 1}).sort("createdAt", 1).limit(5000):
        key = d.get("key") or {}
        mid = key.get("id")
        if not mid or mid in seen:
            continue  # a mesma mensagem é gravada por mais de um armazenamento
        seen.add(mid)
        payload = d.get("payload") or {}
        text = _wa_text(payload.get("message") or {})
        if text is None:
            continue
        ts = payload.get("messageTimestamp")
        ts = float(ts) if isinstance(ts, (int, float)) else d["createdAt"].replace(tzinfo=dt.timezone.utc).timestamp()
        who = "Suporte (número da Aibiz)" if key.get("fromMe") else (d.get("pushName") or payload.get("pushName")
                                                                    or str((payload.get("key") or {}).get("participant") or "?"))
        out.append({"id": mid, "ts": ts, "de": who, "texto": text})
    return out


def _from_inbox(channel_id: str, since: float, until: float) -> list[dict]:
    from ops_center import store

    with store.connect() as c:
        rows = c.execute("SELECT message_id, received_at, sender_name, text FROM inbox WHERE channel_id=? "
                         "AND received_at BETWEEN ? AND ? ORDER BY received_at", (channel_id, since, until)).fetchall()
    return [{"id": r["message_id"], "ts": r["received_at"], "de": r["sender_name"] or "?", "texto": r["text"] or ""} for r in rows]


def group_messages(args: dict, **_kw) -> str:
    try:
        ch, candidates = _resolve(args.get("grupo") or "")
        if ch is None:
            if candidates:
                return tool_error("mais de um grupo bate com a busca; repita com o nome exato",
                                  candidatos=[_brief(c) for c in candidates[:15]])
            return tool_error("grupo não encontrado; use ops_groups para ver os nomes")
        since = _parse_when(args.get("desde") or "hoje")
        until = _parse_when(args.get("ate"), end=True) or dt.datetime.now(BRT).timestamp()
        limit = max(1, min(int(args.get("limite") or 200), MAX_MESSAGES))
        inbox = _from_inbox(ch["id"], since, until) if not ch.get("discovered") else []
        source, msgs = "caixa de entrada do Hermes", inbox
        if ch.get("platform") == "whatsapp":
            try:
                aibiz = _from_aibiz(ch["chat_id"], since, until)
            except Exception:  # noqa: BLE001 — Mongo fora: cai para a caixa de entrada
                logger.warning("ops_group_messages: Mongo da Aibiz indisponível", exc_info=True)
                aibiz = None
            if aibiz is not None:
                # Transcrição/descrição do Hermes vale mais que o "[áudio]" cru da plataforma.
                richer = {m["id"]: m["texto"] for m in inbox if m["id"]}
                for m in aibiz:
                    if m["id"] in richer and m["texto"].startswith("["):
                        m["texto"] = richer[m["id"]]
                source, msgs = "histórico da plataforma Aibiz (completo)", aibiz
        total = len(msgs)
        msgs = msgs[-limit:]
        return tool_result({
            "grupo": ch.get("name"), "cliente": ch.get("clientName"), "fonte": source,
            "periodo": f"{_fmt(since)} até {_fmt(until)} (Brasília)", "total": total,
            "mostrando": len(msgs), "cortado": total > len(msgs),
            "mensagens": [{"quando": _fmt(m["ts"]), "de": m["de"], "texto": (m["texto"] or "")[:MAX_TEXT]} for m in msgs],
        })
    except ValueError as e:
        return tool_error(str(e))
    except Exception as e:  # noqa: BLE001
        logger.warning("ops_group_messages falhou", exc_info=True)
        return tool_error(f"não consegui ler as mensagens: {e}")


# ---- ops_analyses ----

ANALYSES_SCHEMA = {
    "name": "ops_analyses",
    "description": ("Análises que o Hermes fez dos grupos em Escutar (resumo, categoria, urgência, hipótese, resposta "
                    "sugerida, se já foi resolvida). Filtre por grupo/cliente e período."),
    "parameters": {"type": "object", "properties": {
        "grupo": {"type": "string", "description": "Nome do grupo ou do cliente (opcional)."},
        "status": {"type": "string", "enum": ["abertas", "resolvidas", "todas"], "description": "Padrão: todas."},
        "desde": {"type": "string", "description": "hoje | ontem | AAAA-MM-DD (padrão: últimos 7 dias)."}},
        "required": []},
}


def analyses(args: dict, **_kw) -> str:
    try:
        from ops_center import store

        since = _parse_when(args.get("desde")) or (dt.datetime.now(BRT) - dt.timedelta(days=7)).timestamp()
        sql, params = "SELECT a.*, ch.name AS channel_name FROM analyses a LEFT JOIN channels ch ON ch.id=a.channel_id WHERE a.created_at>=?", [since]
        status = args.get("status") or "todas"
        if status == "abertas":
            sql += " AND a.resolved IS NULL AND a.irrelevant IS NULL"
        elif status == "resolvidas":
            sql += " AND a.resolved IS NOT NULL"
        if args.get("grupo"):
            ch, cands = _resolve(args["grupo"])
            ids = [ch["id"]] if ch else [c["id"] for c in cands]
            if not ids:
                return tool_error("grupo não encontrado; use ops_groups")
            sql += f" AND a.channel_id IN ({','.join('?' * len(ids))})"
            params += ids
        with store.connect() as c:
            rows = [dict(r) for r in c.execute(sql + " ORDER BY a.created_at DESC LIMIT 50", params)]
        return tool_result({"total": len(rows), "analises": [{
            "id": r["id"], "quando": _fmt(r["created_at"]), "grupo": r.get("channel_name"), "cliente": r.get("client_name"),
            "status": "resolvida" if r.get("resolved") else "irrelevante" if r.get("irrelevant") else r.get("status"),
            "categoria": r.get("category"), "urgencia": r.get("urgency"), "mensagens": r.get("message_count"),
            "resumo": r.get("summary"), "hipotese": r.get("hypothesis"), "respostaSugerida": r.get("suggested_reply"),
            "erro": r.get("error")} for r in rows]})
    except ValueError as e:
        return tool_error(str(e))
    except Exception as e:  # noqa: BLE001
        logger.warning("ops_analyses falhou", exc_info=True)
        return tool_error(f"não consegui ler as análises: {e}")


# ---- ops_incidents ----

INCIDENTS_SCHEMA = {
    "name": "ops_incidents",
    "description": ("Saúde da infraestrutura: incidentes (abertos ou todos, com hipótese e linha do tempo) e o estado "
                    "atual de cada verificação (servidores, Mongo, bots por cliente, filas de falha)."),
    "parameters": {"type": "object", "properties": {
        "status": {"type": "string", "enum": ["abertos", "todos"], "description": "Padrão: abertos."},
        "verificacoes": {"type": "boolean", "description": "Incluir o estado de cada verificação (padrão: true)."}},
        "required": []},
}


def incidents(args: dict, **_kw) -> str:
    try:
        from ops_center import health

        status = "open" if (args.get("status") or "abertos") == "abertos" else "all"
        out: dict[str, Any] = {"incidentes": health.list_incidents(status)}
        if args.get("verificacoes", True):
            out["verificacoes"] = [{"nome": c.get("name"), "grupo": c.get("group"), "status": c.get("status"),
                                    "detalhe": (c.get("result") or {}).get("text") or c.get("detail"),
                                    "ultimaExecucao": _fmt(c.get("lastRunAt"))} for c in health.list_checks()]
        return tool_result(json.loads(json.dumps(out, default=str)))
    except Exception as e:  # noqa: BLE001
        logger.warning("ops_incidents falhou", exc_info=True)
        return tool_error(f"não consegui ler a Saúde: {e}")
