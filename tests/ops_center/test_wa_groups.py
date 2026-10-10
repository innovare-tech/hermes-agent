"""Grupos de WhatsApp: descoberta (groups.json da ponte) e liberação pelo painel (group-allowlist.json)."""
import json

import pytest

G1, G2, G3 = "120363000000000001@g.us", "120363000000000002@g.us", "120363000000000003@g.us"


@pytest.fixture(autouse=True)
def _home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))
    secrets = {"WHATSAPP_GROUP_POLICY": "allowlist", "WHATSAPP_GROUP_ALLOWED_USERS": G1}
    monkeypatch.setattr("agent.secret_scope.get_secret_str", lambda name, *a, **k: secrets.get(name, ""))
    return secrets


def _session(tmp_path):
    from ops_center import wa_groups

    d = wa_groups._session_dir()
    d.mkdir(parents=True, exist_ok=True)
    (d / "groups.json").write_text(json.dumps({"updatedAt": 1, "groups": [
        {"id": G1, "subject": "Cliente Um", "size": 8}, {"id": G2, "subject": "Cliente Dois", "size": 5}]}))
    return d


def test_lists_groups_that_never_spoke_and_marks_listening(tmp_path):
    from ops_center import store, wa_groups

    _session(tmp_path)
    store.touch_channel("whatsapp", G1, "Cliente Um", "group")
    rows = {r["chat_id"]: r for r in wa_groups.with_discovery(store.channels_view())}
    assert rows[G1]["listening"] is True and rows[G1]["size"] == 8 and not rows[G1].get("discovered")
    assert rows[G2]["discovered"] is True and rows[G2]["listening"] is False and rows[G2]["name"] == "Cliente Dois"


def test_listen_seeds_from_env_writes_atomically_and_creates_channel_in_listen(tmp_path):
    from ops_center import store, wa_groups

    d = _session(tmp_path)
    wa_groups.set_listening(G2, True)
    assert set(json.loads((d / "group-allowlist.json").read_text())) == {G1, G2}  # G1 da env não se perde
    assert store.channel_mode("whatsapp", G2) == store.LISTEN
    assert [p.name for p in d.iterdir() if p.name.endswith(".tmp")] == []
    wa_groups.set_listening(G1, False)
    assert json.loads((d / "group-allowlist.json").read_text()) == [G2]
    assert wa_groups.is_listening(G1) is False and wa_groups.is_listening(G2) is True


def test_refuses_non_group_and_profiles_without_allowlist_policy(_home, tmp_path):
    from ops_center import wa_groups

    _session(tmp_path)
    with pytest.raises(ValueError):
        wa_groups.set_listening("5511999999999@s.whatsapp.net", True)
    _home["WHATSAPP_GROUP_POLICY"] = "pairing"
    with pytest.raises(ValueError):
        wa_groups.set_listening(G3, True)
    assert wa_groups.is_listening(G1) is False  # grupos desligados no perfil


def test_no_discovery_yet_keeps_channels_untouched(tmp_path):
    from ops_center import store, wa_groups

    store.touch_channel("telegram", "-100", "Equipe", "group")
    rows = wa_groups.with_discovery(store.channels_view())
    assert [r["chat_id"] for r in rows] == ["-100"] and "listening" not in rows[0]
    assert wa_groups.discovery_status() == {"policy": "allowlist", "updatedAt": None, "count": 0}
