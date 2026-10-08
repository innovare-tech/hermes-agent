"""Blindagem: canal fora do Autônomo não recebe nada gerado pelo Hermes (gateway.outbound_guard)."""

import asyncio
import json
from types import SimpleNamespace

import pytest

GROUP = "120363@g.us"


@pytest.fixture(autouse=True)
def _home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))


def _event(text="", chat_id=GROUP, message_type="text", media=()):
    source = SimpleNamespace(platform=SimpleNamespace(value="whatsapp"), chat_id=chat_id, chat_name="Cliente X",
                             chat_type="group", user_id="55", user_name="Ana")
    event = SimpleNamespace(text=text, message_id="m1", message_type=SimpleNamespace(value=message_type),
                            media_urls=list(media), source=source)
    return event, source


def _channel(mode, chat_id=GROUP):
    from ops_center import store

    store.touch_channel("whatsapp", chat_id, "Cliente X", "group")
    store.update_channel(f"whatsapp:{chat_id}", mode=mode)


class _Adapter:
    platform = SimpleNamespace(value="whatsapp")

    def __init__(self):
        self.calls = []

    async def send(self, chat_id, content, reply_to=None, metadata=None):
        self.calls.append(("send", chat_id))
        return "real"

    async def send_typing(self, chat_id, metadata=None):
        self.calls.append(("typing", chat_id))

    async def send_voice(self, chat_id, audio_path, caption=None, **kw):
        self.calls.append(("voice", chat_id))
        return "real"

    async def edit_message(self, chat_id, message_id, content, *, finalize=False):
        self.calls.append(("edit", chat_id))
        return "real"

    async def on_processing_start(self, event):
        self.calls.append(("react", event.source.chat_id))


def _guarded():
    from gateway import outbound_guard

    return outbound_guard.install(_Adapter())


def _drive(adapter, chat_id):
    event, _ = _event(chat_id=chat_id)

    async def go():
        return [
            await adapter.send(chat_id, "oi"),
            await adapter.send_typing(chat_id),
            await adapter.send_voice(chat_id=chat_id, audio_path="/tmp/a.ogg"),
            await adapter.edit_message(chat_id, "1", "x"),
            await adapter.on_processing_start(event),
        ]

    return asyncio.run(go())


@pytest.mark.parametrize("mode", [0, 1, 3])  # Observar, Rascunhar, Escutar
def test_nothing_reaches_a_channel_outside_autonomous(mode):
    from gateway.platforms.base import SendResult

    _channel(mode)
    adapter = _guarded()
    results = _drive(adapter, GROUP)
    assert adapter.calls == []  # nem "digitando", nem reação, nem edição
    assert isinstance(results[0], SendResult) and results[0].success and results[0].message_id is None


def test_autonomous_and_unknown_non_group_channels_pass():
    _channel(2)
    adapter = _guarded()
    _drive(adapter, GROUP)
    assert len(adapter.calls) == 5

    adapter = _guarded()
    _drive(adapter, "5511999@s.whatsapp.net")  # DM nunca vista (destino de cron etc.)
    assert len(adapter.calls) == 5


def test_draft_dm_keeps_working_and_unknown_group_is_not_touched():
    """DM em Rascunhar: só autorizados falam ali — comandos e "digitando" seguem; a resposta final
    vira rascunho no run_turn. Grupo nunca visto: a 1ª mensagem o registra no modo padrão."""
    from gateway import ops_hooks

    dm = "5511999@s.whatsapp.net"
    from ops_center import store

    store.touch_channel("whatsapp", dm, "Ana", "dm")
    store.update_channel(f"whatsapp:{dm}", mode=1)
    adapter = _guarded()
    _drive(adapter, dm)
    assert len(adapter.calls) == 5
    event, source = _event(text="/status", chat_id=dm)
    source.chat_type = "dm"
    assert not ops_hooks.mutes_turn(ops_hooks.record(event, source))

    adapter = _guarded()
    _drive(adapter, "999@g.us")
    assert len(adapter.calls) == 5


def test_unreadable_ops_db_mutes_whatsapp_groups_only(monkeypatch):
    from gateway import outbound_guard

    monkeypatch.setattr(outbound_guard, "channel", lambda *a, **k: (_ for _ in ()).throw(OSError("db")))
    assert outbound_guard.blocked("whatsapp", GROUP)
    assert outbound_guard.blocked("telegram", "42") is None


def test_install_is_idempotent():
    from gateway import outbound_guard

    adapter = _guarded()
    send = adapter.send
    assert outbound_guard.install(adapter).send is send


def test_approved_window_opens_draft_but_never_listen():
    from gateway import outbound_guard

    _channel(1)
    adapter = _guarded()
    with outbound_guard.approved("whatsapp", GROUP):
        assert asyncio.run(adapter.send(GROUP, "resposta aprovada")) == "real"
    assert asyncio.run(adapter.send(GROUP, "depois da janela")) != "real"

    _channel(3)
    with outbound_guard.approved("whatsapp", GROUP):
        assert outbound_guard.blocked("whatsapp", GROUP)


def test_ops_send_verb_refuses_listen_and_sends_approved_draft(monkeypatch):
    from gateway import ops_hooks

    monkeypatch.setattr("agent.estop.is_engaged", lambda: False)
    sent = []
    monkeypatch.setattr(ops_hooks, "send_text", lambda p, c, t: sent.append(t) or {"message_id": "9"})
    handler = ops_hooks.ops_send_verb(runner=None)

    _channel(3)
    out = handler({"platform": "whatsapp", "chat_id": GROUP, "text": "oi"})
    assert out["sent"] is False and "Escutar" in out["error"] and sent == []

    _channel(1)
    assert handler({"platform": "whatsapp", "chat_id": GROUP, "text": "oi"})["sent"] is True
    assert sent == ["oi"]


def test_send_message_tool_refuses_muted_channel(monkeypatch):
    from tools import send_message_tool as smt

    _channel(3)
    monkeypatch.setattr(smt, "_resolve_platform_config", lambda name, cfg: (SimpleNamespace(value=name), SimpleNamespace(token=None), None, None))
    monkeypatch.setattr(smt, "_authorize_relay_target", lambda *a, **k: None)
    monkeypatch.setattr(smt, "_send_to_platform", lambda *a, **k: pytest.fail("não podia enviar"))
    out = json.loads(smt._handle_send({"target": f"whatsapp:{GROUP}", "message": "olá grupo"}))
    assert "Escutar" in out["error"]


def test_media_only_and_commands_in_client_groups():
    """Nota de voz sem legenda vira item; "/help" no grupo não roda; Escutar não roda turno."""
    from gateway import ops_hooks
    from ops_center import store

    _channel(3)
    ops = ops_hooks.record(*_event(message_type="voice", media=["/tmp/v.ogg"]))
    assert store.get_inbox(ops["item_id"])["text"] == "[áudio]" and ops_hooks.mutes_turn(ops)
    ops = ops_hooks.record(*_event(text="olha isso", message_type="photo", media=["/tmp/i.jpg"]))
    assert store.get_inbox(ops["item_id"])["text"] == "[imagem] olha isso"

    for mode in (0, 1, 3):
        _channel(mode)
        assert ops_hooks.mutes_turn(ops_hooks.record(*_event(text="/help")))
    _channel(2)
    assert not ops_hooks.mutes_turn(ops_hooks.record(*_event(text="/help")))
