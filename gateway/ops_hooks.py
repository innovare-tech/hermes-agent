"""Ganchos do gateway para a Central de Operações (``ops_center.store``).

Tudo aqui é fail-open: um erro no ops.db nunca bloqueia nem altera uma mensagem — o gateway segue
como antes. Pontos de uso:

- ``listen_capture``: grupo em Escutar — grava para o lote de análise antes da autorização e para ali.
- ``record``: cada mensagem real admitida vira item da caixa de entrada; devolve a autonomia do canal.
- ``save_draft``: canal em Rascunhar — a resposta final do turno vira rascunho (não é enviada).
- ``mark_replied``: canal Autônomo — registra a resposta enviada e a Atividade.
- ``ops_send_verb``: verbo ``ops-send`` do socket de controle; o dashboard pede o envio de uma
  resposta aprovada e o gateway entrega pelo adaptador vivo.

Gateway multiplexado: cada operação roda no home do perfil dono do canal (``home``), senão a
mensagem de um perfil cairia no ``ops.db`` do perfil padrão.
"""

from __future__ import annotations

import json
import logging
from contextlib import contextmanager
from typing import Any, Callable, Iterator, Optional

logger = logging.getLogger(__name__)

OBSERVE, DRAFT, AUTONOMOUS, LISTEN = 0, 1, 2, 3

# Mensagem só de mídia (nota de voz, foto sem legenda…) também é registrada, com um marcador.
_MEDIA_MARKERS = {"voice": "[áudio]", "audio": "[áudio]", "photo": "[imagem]", "video": "[vídeo]",
                  "document": "[documento]", "sticker": "[figurinha]", "location": "[localização]"}


@contextmanager
def _home(home: Any) -> Iterator[None]:
    """Roda no ``HERMES_HOME`` do perfil (``runner._resolve_profile_home_for_source``). ``None`` = atual."""
    if not home:
        yield
        return
    from hermes_constants import reset_hermes_home_override, set_hermes_home_override

    token = set_hermes_home_override(home)
    try:
        yield
    finally:
        reset_hermes_home_override(token)


def _platform_name(source: Any) -> str:
    platform = getattr(source, "platform", "")
    return str(getattr(platform, "value", platform) or "")


def _inbound_text(event: Any) -> str:
    text = (getattr(event, "text", None) or "").strip()
    kind = getattr(getattr(event, "message_type", None), "value", getattr(event, "message_type", None))
    marker = _MEDIA_MARKERS.get(str(kind or "")) or ("[mídia]" if getattr(event, "media_urls", None) else "")
    return f"{marker} {text}".strip() if marker else text


def record(event: Any, source: Any, home: Any = None) -> Optional[dict]:
    """Grava a mensagem recebida. ``None`` = não registrado (vazio ou erro).

    Comando (``/…``) não vira item, mas devolve o modo (``command=True``): fora do Autônomo o
    gateway não o executa — senão ``/help`` num grupo de cliente responderia no grupo."""
    text = _inbound_text(event)
    if not text:
        return None
    try:
        with _home(home):
            if text.startswith("/"):
                from ops_center import store

                chat_type = str(getattr(source, "chat_type", "") or "dm")
                ch = store.touch_channel(_platform_name(source), str(getattr(source, "chat_id", "") or ""),
                                         str(getattr(source, "chat_name", "") or ""), _kind(chat_type))
                return {"item_id": None, "mode": int(ch["mode"]), "kind": ch["kind"], "command": True,
                        "home": str(home) if home else None}
            return _record(event, source, text, home)
    except Exception:
        logger.debug("ops_center: falha ao registrar mensagem recebida", exc_info=True)
        return None


def _media(event: Any) -> list:
    kind = getattr(getattr(event, "message_type", None), "value", getattr(event, "message_type", None))
    types = list(getattr(event, "media_types", None) or [])
    return [{"type": str(kind or "file"), "path": str(u), "mime": types[i] if i < len(types) else ""}
            for i, u in enumerate(getattr(event, "media_urls", None) or [])]


def listen_capture(event: Any, source: Any, home: Any = None) -> bool:
    """Grupo em Escutar: grava a mensagem para o próximo lote e diz ao gateway para parar ali.

    Roda ANTES da autorização de remetente: a equipe do cliente não é usuária do Hermes, e ler não
    é rodar turno. ``False`` = siga o fluxo normal (não é grupo, outro modo, ou erro — fail-open:
    a trava de saída ainda protege o grupo)."""
    if _kind(str(getattr(source, "chat_type", "") or "dm")) != "group":
        return False
    try:
        with _home(home):
            from ops_center import store

            platform, chat_id = _platform_name(source), str(getattr(source, "chat_id", "") or "")
            ch = store.touch_channel(platform, chat_id, str(getattr(source, "chat_name", "") or ""), "group")
            if int(ch["mode"]) != LISTEN:
                return False
            text = _inbound_text(event)
            if text:
                store.record_inbound(
                    platform, chat_id, text, chat_name=str(getattr(source, "chat_name", "") or ""), kind="group",
                    sender_id=str(getattr(source, "user_id", "") or ""),
                    sender_name=str(getattr(source, "user_name", "") or ""),
                    message_id=str(getattr(event, "message_id", "") or ""), media=_media(event))
            return True
    except Exception:
        logger.warning("ops_center: falha ao capturar mensagem de grupo em Escutar", exc_info=True)
        return False


def mutes_turn(ops: Optional[dict]) -> bool:
    """O gateway não roda turno: Observar/Escutar, ou comando num canal mudo (grupo em Rascunhar)."""
    if not ops:
        return False
    from ops_center.store import is_muted

    return ops["mode"] in (OBSERVE, LISTEN) or (bool(ops.get("command")) and is_muted(ops["mode"], ops.get("kind", "dm")))


def _kind(chat_type: str) -> str:
    return "group" if chat_type in ("group", "channel", "thread") else "dm"


def _record(event: Any, source: Any, text: str, home: Any) -> dict:
    from ops_center import store

    chat_type = str(getattr(source, "chat_type", "") or "dm")
    chat_id = str(getattr(source, "chat_id", "") or "")
    result = store.record_inbound(
        _platform_name(source),
        chat_id,
        text,
        chat_name=str(getattr(source, "chat_name", "") or ""),
        kind=_kind(chat_type),
        sender_id=str(getattr(source, "user_id", "") or ""),
        sender_name=str(getattr(source, "user_name", "") or ""),
        message_id=str(getattr(event, "message_id", "") or ""),
    )
    sender = str(getattr(source, "user_name", "") or getattr(source, "chat_name", "") or "")
    try:
        from ops_center import playbooks

        playbooks.fire_keyword(_platform_name(source), chat_id, text, sender=sender, mode=result["mode"])
    except Exception:
        logger.debug("ops_center: falha ao disparar playbooks por palavra-chave", exc_info=True)
    return {**result, "sender": sender, "home": str(home) if home else None}


def save_draft(item_id: int, text: str, home: Any = None) -> None:
    try:
        from ops_center import store

        with _home(home):
            store.set_draft(item_id, text)
    except Exception:
        logger.debug("ops_center: falha ao salvar rascunho %s", item_id, exc_info=True)


def mark_replied(ops: dict, source: Any, reply: Optional[str]) -> None:
    """Canal Autônomo: registra que o Hermes respondeu (texto completo quando não foi streaming)."""
    try:
        with _home(ops.get("home")):
            _mark_replied(ops, source, reply)
    except Exception:
        logger.debug("ops_center: falha ao registrar resposta autônoma", exc_info=True)


def _mark_replied(ops: dict, source: Any, reply: Optional[str]) -> None:
    from ops_center import store

    item = store.get_inbox(int(ops["item_id"]))
    if reply:
        store.mark_sent(int(ops["item_id"]), reply, "auto")
    who = ops.get("sender") or "contato"
    preview = " ".join((reply or "").split())
    store.log_activity(
        "msg",
        f"Respondeu {who} via {_platform_name(source).capitalize()}" + (f": “{preview[:70]}{'…' if len(preview) > 70 else ''}”" if preview else ""),
        "canal em modo Autônomo.",
        business_id=(item or {}).get("business_id"),
    )


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


def _send_approved(platform: str, chat_id: str, text: str) -> dict:
    """Resposta aprovada por uma pessoa: passa pela trava de saída, exceto em Escutar."""
    from gateway import outbound_guard

    with outbound_guard.approved(platform, chat_id):
        reason = outbound_guard.blocked(platform, chat_id)
        if reason:
            raise RuntimeError(reason)
        return send_text(platform, chat_id, text)


def ops_send_verb(runner: Any) -> Callable[..., dict]:
    """``ops-send``: ``{"platform", "chat_id", "text", "profile"?}`` → envia pelo adaptador vivo do
    perfil dono do canal (no multiplexado, sem ``profile`` sairia pelo bot do perfil padrão)."""

    def _handler(params: Optional[dict] = None) -> dict:
        params = params or {}
        platform, chat_id, text = (str(params.get(k) or "") for k in ("platform", "chat_id", "text"))
        if not (platform and chat_id and text.strip()):
            return {"sent": False, "error": "platform, chat_id e text são obrigatórios"}
        try:
            from agent.estop import is_engaged

            if is_engaged():
                return {"sent": False, "error": "Hermes está pausado — nada é enviado até retomar"}
            profile = str(params.get("profile") or "").strip()
            if profile and profile != "default":
                from gateway.run import _profile_runtime_scope
                from hermes_cli.profiles import get_profile_dir

                with _profile_runtime_scope(get_profile_dir(profile)):
                    result = _send_approved(platform, chat_id, text)
            else:
                result = _send_approved(platform, chat_id, text)
            return {"sent": True, "message_id": result.get("message_id")}
        except Exception as e:  # noqa: BLE001 — devolve o motivo ao dashboard
            return {"sent": False, "error": str(e)[:300]}

    return _handler


def ops_participants_verb(runner: Any) -> Callable[..., dict]:
    """``ops-participants``: ``{"platform", "chat_id", "profile"?}`` → participantes do grupo pelo adaptador
    vivo do perfil dono do canal (só leitura). ``{ok, name, size, participants[]}`` ou ``{ok: False, error}``."""

    def _handler(params: Optional[dict] = None) -> dict:
        import asyncio

        params = params or {}
        platform, chat_id = str(params.get("platform") or ""), str(params.get("chat_id") or "")
        profile = str(params.get("profile") or "").strip() or None
        if not (platform and chat_id):
            return {"ok": False, "error": "platform e chat_id são obrigatórios"}
        try:
            from gateway.config import Platform

            adapter = runner._authorization_adapter(Platform(platform), None if profile == "default" else profile)
            if adapter is None or not hasattr(adapter, "group_participants"):
                return {"ok": False, "error": f"o {platform} deste perfil não lista participantes"}
            loop = getattr(runner, "_gateway_loop", None)
            # A sessão HTTP do adaptador fica presa ao laço em que ele conectou; agendar em outro laço pendura.
            session_loop = getattr(getattr(adapter, "_http_session", None), "_loop", None)
            if session_loop is not None and session_loop is not loop:
                logger.info("ops_center: adaptador %s/%s vive noutro laço; usando o dele", platform, profile)
                loop = session_loop
            if loop is None:
                return {"ok": False, "error": "o gateway ainda está iniciando"}
            data = asyncio.run_coroutine_threadsafe(adapter.group_participants(chat_id), loop).result(45)
            return {"ok": True, **(data or {})}
        except Exception as e:  # noqa: BLE001 — o motivo vai para a tela
            logger.warning("ops_center: participantes de %s:%s falharam", platform, chat_id, exc_info=True)
            return {"ok": False, "error": (f"{type(e).__name__}: {e}" if str(e) else type(e).__name__)[:300]}

    return _handler
