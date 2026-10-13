"""Pedido das Permissões aprovado no Telegram: o resultado volta para a conversa que pediu (turno interno),
e só sem ela vira mensagem — legível, sem o JSON cru."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from gateway.config import Platform, PlatformConfig
from plugins.platforms.telegram.adapter import TelegramAdapter

SRC = {"platform": "telegram", "chat_id": "-100", "chat_type": "group", "thread_id": "1", "user_id": "11",
       "user_name": "Kelvin", "profile": "aibiz"}


async def _approve(adapter, approval):
    query = SimpleNamespace(from_user=SimpleNamespace(first_name="Kelvin", id=11), answer=AsyncMock(),
                            edit_message_text=AsyncMock())
    cb = {"chat_id": -100, "thread_id": None}
    with patch.object(adapter, "_callback_authorized", AsyncMock(return_value=True)), \
         patch("gateway.outbound_guard._adapter_home", return_value=None), \
         patch("ops_center.guardrails.decide", return_value={"ok": True, "approval": approval}), \
         patch("ops_center.guardrails.execute_approved", return_value='{"result": "linha 1\\nlinha 2"}'):
        await adapter._handle_ops_approval_callback(query, f"oa:y:{approval['id']}", cb)


@pytest.mark.asyncio
async def test_result_goes_back_to_the_conversation():
    adapter = TelegramAdapter(PlatformConfig(enabled=True, token="t"))
    adapter.send = AsyncMock()
    with patch("gateway.wake.deliver_wake", AsyncMock()) as wake:
        await _approve(adapter, {"id": 9, "summary": "vps_aibiz · run_command", "command": "pm2 restart x",
                                 "session_source": SRC})
    source, text = wake.call_args.kwargs["source"], wake.call_args.kwargs["text"]
    assert (source.platform, source.chat_id, source.chat_type, source.thread_id, source.profile) == \
        (Platform.TELEGRAM, "-100", "group", "1", "aibiz")
    assert "Pedido #9 aprovado por Kelvin" in text and "linha 1\nlinha 2" in text
    adapter.send.assert_not_called()


@pytest.mark.asyncio
async def test_without_conversation_sends_readable_result():
    adapter = TelegramAdapter(PlatformConfig(enabled=True, token="t"))
    adapter.send = AsyncMock()
    with patch("gateway.wake.deliver_wake", AsyncMock(side_effect=RuntimeError("fora"))):
        await _approve(adapter, {"id": 9, "summary": "x", "command": "y", "session_source": SRC})
    assert adapter.send.call_args.args[1] == "Resultado do pedido #9:\nlinha 1\nlinha 2"
