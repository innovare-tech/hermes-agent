"""Trava de saída da Central de Operações: só canal Autônomo recebe o que o Hermes gera.

Canal registrado em Observar ou Escutar, ou grupo em Rascunhar (``store.is_muted``), não recebe
nada vindo do Hermes — resposta, "digitando", aviso de ocupado, erro, eco de transcrição, pergunta,
reação, ``send_message`` do agente ou do cron. A única exceção é uma resposta aprovada por uma
pessoa no painel (``approved``), e nem ela passa em Escutar. Canal nunca visto pelo gateway
(destino de cron, home channel) não é afetado: grupo não recebe resposta de admissão (pareamento
é só por DM) e a primeira mensagem já o registra no modo padrão.

Dois pontos de aplicação, um só critério (``blocked``):
- ``install(adapter)``: embrulha os métodos de saída de cada adaptador (``_create_adapter``).
- ``tools/send_message_tool.py``: envios do agente/cron, inclusive os que não passam pelo adaptador.

Falha ao consultar o ``ops.db``: bloqueia só grupos de WhatsApp (fail-closed onde o risco é o
cliente); o resto segue (fail-open, como os outros ganchos da Central).
"""

from __future__ import annotations

import functools
import inspect
import logging
import threading
from contextlib import contextmanager
from typing import Any, Iterator, Optional

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_approved: dict[str, int] = {}

# Métodos de saída fora do padrão ``send*`` (que é embrulhado inteiro).
_EXTRA = ("edit_message", "delete_message", "on_processing_start", "on_processing_complete",
          "add_reaction", "remove_reaction", "_add_reaction", "_remove_reaction")


def _key(platform: str, chat_id: str) -> str:
    return f"{platform}:{chat_id}"


@contextmanager
def approved(platform: str, chat_id: str) -> Iterator[None]:
    """Libera a saída para este canal enquanto envia uma resposta aprovada no painel.

    ponytail: janela por canal, não por mensagem — algo gerado no mesmo canal durante esses
    milissegundos também passaria; marcar a mensagem se Rascunhar ganhar turnos concorrentes."""
    k = _key(platform, chat_id)
    with _lock:
        _approved[k] = _approved.get(k, 0) + 1
    try:
        yield
    finally:
        with _lock:
            if _approved.get(k, 0) <= 1:
                _approved.pop(k, None)
            else:
                _approved[k] -= 1


def channel(platform: str, chat_id: str, home: Any = None) -> Optional[dict]:
    """``{mode, kind}`` do canal no ``ops.db`` do perfil (``home``; ``None`` = home atual)."""
    from gateway.ops_hooks import _home
    from ops_center import store

    with _home(home):
        return store.registered_channel(platform, str(chat_id))


def blocked(platform: str, chat_id: Any, home: Any = None) -> Optional[str]:
    """Motivo do bloqueio, ou ``None`` quando pode enviar."""
    from ops_center.store import LISTEN, is_muted

    if not platform or chat_id in (None, ""):
        return None
    chat_id = str(chat_id)
    try:
        ch = channel(platform, chat_id, home)
    except Exception:
        logger.warning("ops_center: não consegui ler o modo de %s:%s", platform, chat_id, exc_info=True)
        if platform == "whatsapp" and chat_id.endswith("@g.us"):
            return "não consegui confirmar o modo deste grupo; nada é enviado"
        return None
    if ch is None or not is_muted(ch["mode"], ch["kind"]):
        return None
    if ch["mode"] == LISTEN:
        return "canal em Escutar: o Hermes nunca envia aqui"
    with _lock:
        if _approved.get(_key(platform, chat_id)):
            return None
    return "canal não está em Autônomo: só sai resposta aprovada no painel"


def _chat_id_of(args: tuple, kwargs: dict) -> Any:
    if "chat_id" in kwargs:
        return kwargs["chat_id"]
    if not args:
        return None
    first = args[0]
    if isinstance(first, (str, int)):
        return first
    source = getattr(first, "source", None)  # MessageEvent (on_processing_*)
    return getattr(source, "chat_id", None) or getattr(first, "chat_id", None)


def _adapter_home(adapter: Any) -> Any:
    """Home do perfil dono do adaptador (gateway multiplexado); ``None`` = home do processo."""
    runner = getattr(adapter, "gateway_runner", None)
    for name, by_platform in (getattr(runner, "_profile_adapters", None) or {}).items():
        if any(a is adapter for a in by_platform.values()):
            from hermes_cli.profiles import get_profile_dir

            return get_profile_dir(name)
    return None


def _muted_result(method: str, reason: str) -> Any:
    if not method.startswith(("send", "edit_message")):
        return None
    from gateway.platforms.base import SendResult

    # Sucesso silencioso: falha dispararia retry, fallback ou reentrega depois de um restart.
    return SendResult(success=True, message_id=None, raw_response={"ops_muted": reason})


def install(adapter: Any) -> Any:
    """Embrulha os métodos de saída do adaptador com a trava. Idempotente."""
    if adapter is None or getattr(adapter, "_ops_outbound_guard", False):
        return adapter
    platform = getattr(getattr(adapter, "platform", None), "value", None) or str(getattr(adapter, "platform", "") or "")
    names = {n for n in dir(type(adapter)) if n.startswith("send")} | set(_EXTRA)
    for name in names:
        fn = getattr(adapter, name, None)
        if fn is None or not inspect.iscoroutinefunction(fn):
            continue
        setattr(adapter, name, _guarded(adapter, platform, name, fn))
    adapter._ops_outbound_guard = True
    return adapter


def _guarded(adapter: Any, platform: str, name: str, fn: Any) -> Any:
    @functools.wraps(fn)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        chat_id = _chat_id_of(args, kwargs)
        reason = blocked(platform, chat_id, _adapter_home(adapter)) if chat_id is not None else None
        if reason:
            logger.info("ops_center: saída %s bloqueada para %s:%s (%s)", name, platform, chat_id, reason)
            return _muted_result(name, reason)
        return await fn(*args, **kwargs)

    return wrapper
