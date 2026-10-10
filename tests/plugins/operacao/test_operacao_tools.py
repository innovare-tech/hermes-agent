"""Plugin operacao: ferramentas de leitura da Central (grupos, mensagens, análises, Saúde)."""
import datetime as dt
import json

import pytest

from plugins.operacao import tools as t


@pytest.fixture(autouse=True)
def _home(tmp_path, monkeypatch):
    home = tmp_path / "aibiz"
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setattr("agent.secret_scope.get_secret_str", lambda name, *a, **k: "")  # sem Mongo
    return home


def test_never_available_in_copilot_client_profiles(tmp_path, monkeypatch):
    from ops_center import store

    store.touch_channel("telegram", "-1", "Equipe", "group")  # cria o ops.db
    assert t.available() is True
    cli = tmp_path / "cli-padaria-sol"
    (cli / "ops.db").parent.mkdir(parents=True)
    (cli / "ops.db").write_text("")
    monkeypatch.setenv("HERMES_HOME", str(cli))
    assert t.available() is False


def test_wa_text_reads_baileys_payloads():
    assert t._wa_text({"conversation": "oi"}) == "oi"
    assert t._wa_text({"extendedTextMessage": {"text": "link"}}) == "link"
    assert t._wa_text({"imageMessage": {"caption": "print do erro"}}) == "[imagem] print do erro"
    assert t._wa_text({"audioMessage": {}}) == "[áudio]"
    assert t._wa_text({"ephemeralMessage": {"message": {"conversation": "some"}}}) == "some"
    assert t._wa_text({"senderKeyDistributionMessage": {}, "messageContextInfo": {}}) is None
    assert t._wa_text({"reactionMessage": {"text": ""}}) is None


def test_parse_when_is_brasilia():
    start = t._parse_when("2026-10-10")
    assert dt.datetime.fromtimestamp(start, t.BRT).strftime("%d/%m %H:%M") == "10/10 00:00"
    assert dt.datetime.fromtimestamp(t._parse_when("2026-10-10", end=True), t.BRT).strftime("%H:%M") == "23:59"
    assert t._parse_when("ontem") < t._parse_when("hoje")
    with pytest.raises(ValueError):
        t._parse_when("semana passada")


def test_group_messages_from_inbox_and_ambiguity():
    from ops_center import store

    store.record_inbound("whatsapp", "1@g.us", "Pode ser quarta?", chat_name="Rewiid & Innovare", kind="group",
                         sender_id="5511", sender_name="Elaine", message_id="m1")
    store.touch_channel("whatsapp", "2@g.us", "Rewiid Marketing", "group")
    out = json.loads(t.group_messages({"grupo": "Rewiid"}))
    assert out["error"].startswith("mais de um grupo") and len(out["candidatos"]) == 2
    out = json.loads(t.group_messages({"grupo": "Rewiid & Innovare"}))
    assert out["fonte"] == "caixa de entrada do Hermes" and out["total"] == 1
    assert out["mensagens"][0]["de"] == "Elaine" and out["mensagens"][0]["texto"] == "Pode ser quarta?"
    assert "error" in json.loads(t.group_messages({"grupo": "Rewiid & Innovare", "desde": "amanhã talvez"}))
    groups = json.loads(t.groups({"busca": "rewiid"}))
    assert groups["total"] == 2 and {g["grupo"] for g in groups["grupos"]} == {"Rewiid & Innovare", "Rewiid Marketing"}


def test_group_messages_prefers_full_aibiz_history_and_hermes_transcripts(monkeypatch):
    from ops_center import store

    store.record_inbound("whatsapp", "9@g.us", "Transcrição: o bot caiu", chat_name="Cliente X", kind="group",
                         sender_id="1", sender_name="Ana", message_id="a2")
    now = dt.datetime.now(t.BRT).timestamp()
    monkeypatch.setattr(t, "_from_aibiz", lambda jid, since, until: [
        {"id": "a1", "ts": now - 60, "de": "Bruno", "texto": "bom dia"},
        {"id": "a2", "ts": now - 30, "de": "Ana", "texto": "[áudio]"}])
    out = json.loads(t.group_messages({"grupo": "Cliente X"}))
    assert out["fonte"].startswith("histórico da plataforma Aibiz") and out["total"] == 2
    assert [m["texto"] for m in out["mensagens"]] == ["bom dia", "Transcrição: o bot caiu"]


def test_analyses_and_incidents_do_not_crash_on_empty_central():
    from ops_center import store

    store.touch_channel("telegram", "-1", "Equipe", "group")
    assert json.loads(t.analyses({}))["total"] == 0
    out = json.loads(t.incidents({}))
    assert out["incidentes"] == [] and isinstance(out["verificacoes"], list)


def test_prompt_guide_only_where_the_central_exists_and_never_for_copilot_clients():
    from ops_center import store
    from plugins import operacao

    assert operacao._guide({"profile_name": "aibiz"}) == ""  # sem Central ainda
    store.touch_channel("telegram", "-1", "Equipe", "group")
    assert "ops_group_messages" in operacao._guide({"profile_name": "aibiz"})
    assert operacao._guide({"profile_name": "cli-padaria-sol"}) == ""
    assert len(operacao.GUIDE) < 1500
