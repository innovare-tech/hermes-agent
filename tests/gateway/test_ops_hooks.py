"""gateway.ops_hooks: registro na caixa, rascunho, resposta autônoma e verbo ops-send."""

from types import SimpleNamespace

import pytest


@pytest.fixture(autouse=True)
def _home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))


def _msg(text, chat_id="42"):
    source = SimpleNamespace(platform=SimpleNamespace(value="telegram"), chat_id=chat_id, chat_name="Ana",
                             chat_type="dm", user_id="7", user_name="Ana")
    return SimpleNamespace(text=text, message_id="m1"), source


def test_record_skips_commands_and_follows_channel_mode():
    from gateway import ops_hooks
    from ops_center import store

    assert ops_hooks.record(*_msg("/status")) is None
    ops = ops_hooks.record(*_msg("oi"))
    assert ops["mode"] == ops_hooks.AUTONOMOUS and ops["sender"] == "Ana"

    store.update_channel("telegram:42", mode=ops_hooks.DRAFT)
    ops = ops_hooks.record(*_msg("pode ver o boleto?"))
    assert ops["mode"] == ops_hooks.DRAFT
    ops_hooks.save_draft(ops["item_id"], "Claro, vejo hoje.")
    assert store.get_inbox(ops["item_id"])["status"] == "drafted"


def test_autonomous_reply_is_logged():
    from gateway import ops_hooks
    from ops_center import store

    event, source = _msg("oi")
    ops = ops_hooks.record(event, source)
    ops_hooks.mark_replied(ops, source, "Olá, Ana!")
    item = store.get_inbox(ops["item_id"])
    assert item["status"] == "auto" and item["draft"] == "Olá, Ana!"
    assert "Respondeu Ana via Telegram" in store.list_activity()[0]["action"]


def test_ops_send_verb_validates_and_honors_pause(monkeypatch):
    from gateway import ops_hooks

    handler = ops_hooks.ops_send_verb(runner=None)
    assert handler({"platform": "telegram"})["sent"] is False

    monkeypatch.setattr("agent.estop.is_engaged", lambda: True)
    assert "pausado" in handler({"platform": "telegram", "chat_id": "1", "text": "oi"})["error"]

    monkeypatch.setattr("agent.estop.is_engaged", lambda: False)
    monkeypatch.setattr(ops_hooks, "send_text", lambda p, c, t: {"message_id": "99"})
    assert handler({"platform": "telegram", "chat_id": "1", "text": "oi"}) == {"sent": True, "message_id": "99"}
