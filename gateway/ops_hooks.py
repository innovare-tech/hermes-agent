"""Ganchos do gateway para a Central de Operações (``ops_center.store``).

Tudo aqui é fail-open: um erro no ops.db nunca bloqueia nem altera uma mensagem — o gateway segue
como antes. Pontos de uso:

- ``record``: cada mensagem real admitida vira item da caixa de entrada; devolve a autonomia do canal.
- ``save_draft``: canal em Rascunhar — a resposta final do turno vira rascunho (não é enviada).
- ``mark_replied``: canal Autônomo — registra a resposta enviada e a Atividade.
- ``ops_send_verb``: verbo ``ops-send`` do socket de controle; o dashboard pede o envio de uma
  resposta aprovada e o gateway entrega pelo adaptador vivo.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

OBSERVE, DRAFT, AUTONOMOUS = 0, 1, 2


def _platform_name(source: Any) -> str:
    platform = getattr(source, "platform", "")
    return str(getattr(platform, "value", platform) or "")


def record(event: Any, source: Any) -> Optional[dict]:
    """Grava a mensagem recebida. ``None`` = não registrado (comando, vazio ou erro)."""
    text = (getattr(event, "text", None) or "").strip()
    if not text or text.startswith("/"):
        return None
    try:
        from ops_center import store

        chat_type = str(getattr(source, "chat_type", "") or "dm")
        result = store.record_inbound(
            _platform_name(source),
            str(getattr(source, "chat_id", "") or ""),
            text,
            chat_name=str(getattr(source, "chat_name", "") or ""),
            kind="group" if chat_type in ("group", "channel", "thread") else "dm",
            sender_id=str(getattr(source, "user_id", "") or ""),
            sender_name=str(getattr(source, "user_name", "") or ""),
            message_id=str(getattr(event, "message_id", "") or ""),
        )
        return {**result, "sender": str(getattr(source, "user_name", "") or getattr(source, "chat_name", "") or "")}
    except Exception:
        logger.debug("ops_center: falha ao registrar mensagem recebida", exc_info=True)
        return None


def save_draft(item_id: int, text: str) -> None:
    try:
        from ops_center import store

        store.set_draft(item_id, text)
    except Exception:
        logger.debug("ops_center: falha ao salvar rascunho %s", item_id, exc_info=True)


def mark_replied(ops: dict, source: Any, reply: Optional[str]) -> None:
    """Canal Autônomo: registra que o Hermes respondeu (texto completo quando não foi streaming)."""
    try:
        from ops_center import store

        item = store.get_inbox(int(ops["item_id"]))
        if reply:
            store.mark_sent(int(ops["item_id"]), reply, "auto")
        who = ops.get("sender") or "contato"
        preview = (reply or "").strip().replace("\n", " ")
        store.log_activity(
            "msg",
            f"Respondeu {who} via {_platform_name(source).capitalize()}" + (f": “{preview[:70]}{'…' if len(preview) > 70 else ''}”" if preview else ""),
            "canal em modo Autônomo.",
            business_id=(item or {}).get("business_id"),
        )
    except Exception:
        logger.debug("ops_center: falha ao registrar resposta autônoma", exc_info=True)


def send_text(platform: str, chat_id: str, text: str) -> dict:
    """Envia pelo mesmo caminho do ``hermes send`` / ferramenta send_message."""
    from tools.send_message_tool import send_message_tool

    raw = send_message_tool({"action": "send", "target": f"{platform}:{chat_id}", "message": text})
    try:
        result = json.loads(raw) if isinstance(raw, str) else dict(raw or {})
    except (TypeError, ValueError):
        result = {"error": str(raw)}
    if result.get("error"):
        raise RuntimeError(str(result["error"]))
    return result


def ops_send_verb(runner: Any) -> Callable[..., dict]:
    """``ops-send``: ``{"platform", "chat_id", "text"}`` → envia pelo adaptador vivo deste gateway."""

    def _handler(params: Optional[dict] = None) -> dict:
        params = params or {}
        platform, chat_id, text = (str(params.get(k) or "") for k in ("platform", "chat_id", "text"))
        if not (platform and chat_id and text.strip()):
            return {"sent": False, "error": "platform, chat_id e text são obrigatórios"}
        try:
            from agent.estop import is_engaged

            if is_engaged():
                return {"sent": False, "error": "Hermes está pausado — nada é enviado até retomar"}
            result = send_text(platform, chat_id, text)
            return {"sent": True, "message_id": result.get("message_id")}
        except Exception as e:  # noqa: BLE001 — devolve o motivo ao dashboard
            return {"sent": False, "error": str(e)[:300]}

    return _handler
