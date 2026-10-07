"""ops_center.store: negócios, canais/autonomia, caixa de entrada, atividade e configs."""

import pytest


@pytest.fixture(autouse=True)
def _home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))


def test_new_channel_defaults_to_draft_and_default_is_configurable():
    from ops_center import store

    assert store.channel_mode("telegram", "42") == store.DRAFT  # de fábrica: nada sai sem aprovação
    ch = store.touch_channel("telegram", "42", "Família", "group")
    assert (ch["mode"], ch["name"], ch["kind"]) == (store.DRAFT, "Família", "group")
    store.set_default_mode(store.AUTONOMOUS)  # muda só canais novos
    assert store.touch_channel("telegram", "43")["mode"] == store.AUTONOMOUS
    assert store.channel_mode("telegram", "42") == store.DRAFT
    with pytest.raises(ValueError):
        store.set_default_mode(5)
    store.update_channel(ch["id"], mode=store.DRAFT)
    assert store.channel_mode("telegram", "42") == store.DRAFT
    # revisitar o canal não reseta a política
    assert store.touch_channel("telegram", "42", "")["mode"] == store.DRAFT
    with pytest.raises(ValueError):
        store.update_channel(ch["id"], mode=7)


def test_inbound_respects_mode_and_watches():
    from ops_center import store

    store.set_watches(["Urgente", "reembolso", ""])
    assert store.list_watches() == ["reembolso", "urgente"]
    ch = store.touch_channel("whatsapp", "5511", "Ana")
    store.update_channel(ch["id"], mode=store.DRAFT)
    r = store.record_inbound("whatsapp", "5511", "Quero um reembolso", sender_name="Ana")
    assert r["mode"] == store.DRAFT
    store.set_draft(r["item_id"], "Oi Ana, já vejo isso.")
    item = store.get_inbox(r["item_id"])
    assert (item["status"], item["priority"], item["draft"], item["chat_name"]) == ("drafted", "urgente", "Oi Ana, já vejo isso.", "Ana")
    # canal autônomo: entra como 'auto' (o agente responde sozinho)
    store.touch_channel("telegram", "9")
    store.update_channel("telegram:9", mode=store.AUTONOMOUS)
    auto = store.record_inbound("telegram", "9", "oi")
    assert store.get_inbox(auto["item_id"])["status"] == "auto"


def test_business_delete_detaches_references():
    from ops_center import store

    b = store.save_business("Innovare", "#9d8cff")
    ch = store.touch_channel("telegram", "1")
    store.update_channel(ch["id"], business_id=b["id"])
    store.delete_business(b["id"])
    assert store.list_businesses() == []
    assert store.list_channels()[0]["business_id"] is None
    with pytest.raises(ValueError):
        store.save_business("  ", "#fff")


def test_activity_undo_only_when_reversible():
    from ops_center import store

    a = store.log_activity("msg", "Respondeu Ana", "aprovado", reversible=True)
    b = store.log_activity("cmd", "Reiniciou worker", reversible=False)
    assert store.mark_undone(a["id"])["undone"] == 1
    assert store.mark_undone(b["id"])["undone"] == 0
    assert [x["action"] for x in store.list_activity()] == ["Reiniciou worker", "Respondeu Ana"]


def test_people_playbooks_meta_roundtrip():
    from ops_center import store

    p = store.save_person({"name": "Carla", "pending": ["Responder proposta"]})
    assert store.list_people()[0]["pending"] == ["Responder proposta"]
    store.delete_person(p["id"])
    pb = store.save_playbook({"name": "Boleto", "trigger": "pedido de 2ª via", "nodes": [{"kind": "trigger", "text": "x"}]})
    assert store.list_playbooks()[0]["nodes"][0]["kind"] == "trigger"
    store.save_playbook({**pb, "enabled": False})
    assert store.list_playbooks()[0]["enabled"] is False
    store.set_meta("support", {"provider": "linear"})
    assert store.get_meta("support") == {"provider": "linear"}
    assert store.get_meta("missing", 3) == 3
