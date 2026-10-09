"""Limites de gasto aplicados: aviso, segurar o não urgente, pausar o perfil — uma vez por dia."""

import pytest


@pytest.fixture(autouse=True)
def _home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))


@pytest.fixture
def warns(monkeypatch):
    from ops_center import spend_guard

    out = []
    monkeypatch.setattr(spend_guard, "_warn", lambda level, text: out.append((level, text)))
    return out


def _limits(on_limit):
    from ops_center import models

    models.set_limits({"dailyUsd": 10, "monthlyUsd": 100, "alertPct": 80, "onLimit": on_limit})


def test_off_until_limits_saved(warns):
    from ops_center import spend_guard

    assert spend_guard.check(spend={"today": 999, "month": 999}) == {"state": "off"} and warns == []


def test_alert_once_per_day(warns):
    from ops_center import spend_guard

    _limits("notify")
    assert spend_guard.check(spend={"today": 8.5, "month": 20})["state"] == "alert"
    spend_guard.check(spend={"today": 9, "month": 20})
    assert [lvl for lvl, _ in warns] == ["warning"]


def test_over_holds_non_urgent(warns):
    from ops_center import spend_guard

    _limits("pause_non_urgent")
    assert not spend_guard.holding_non_urgent()
    spend_guard.check(spend={"today": 12, "month": 20})
    assert spend_guard.holding_non_urgent() and warns[0][0] == "critical"


def test_over_pauses_named_profile_but_not_the_root(warns, tmp_path):
    from agent import estop
    from hermes_constants import reset_hermes_home_override, set_hermes_home_override
    from ops_center import spend_guard

    _limits("pause_profile")
    spend_guard.check(spend={"today": 1, "month": 150})
    assert "não pausa sozinho" in warns[0][1] and not estop.sentinel_path().exists()  # HERMES_HOME é a raiz

    home = tmp_path / ".hermes" / "profiles" / "aibiz"
    home.mkdir(parents=True)
    token = set_hermes_home_override(home)
    try:
        _limits("pause_profile")
        spend_guard.check(spend={"today": 1, "month": 150})
        assert (home / "ESTOP").exists() and "perfil pausado" in warns[1][1]
    finally:
        reset_hermes_home_override(token)
    assert not (tmp_path / ".hermes" / "ESTOP").exists()  # a raiz segue de pé


def test_held_batch_skips_the_model_but_tells_the_team(warns):
    from gateway import ops_hooks
    from ops_center import listen, spend_guard, store
    from tests.gateway.test_ops_listen import _event, _listen

    _limits("pause_non_urgent")
    spend_guard.check(spend={"today": 12, "month": 20})
    _listen()
    ops_hooks.listen_capture(*_event("quando sai a nova versão?"))
    aid = store.open_batch("whatsapp:120363@g.us")
    sent = []
    tri = {"category": "duvida", "urgency": "baixa", "confidence": 0.9, "social": 0.0, "usage": {}}
    a = listen.analyze(aid, triage=lambda s, c: tri, run=lambda *x: pytest.fail("não podia usar o modelo"),
                       notify=lambda a: sent.append(listen.format_notice(a)))
    assert a["status"] == "failed" and "limite de gasto" in a["error"] and "nova versão" in sent[0]

    ops_hooks.listen_capture(*_event("o sistema caiu, ninguém consegue vender"))
    aid = store.open_batch("whatsapp:120363@g.us")
    urgent = {**tri, "category": "bug", "urgency": "critica"}
    a = listen.analyze(aid, triage=lambda s, c: urgent, run=lambda *x: '{"summary": "fora do ar"}', notify=lambda a: None)
    assert a["status"] == "open"


def test_limit_pause_lifts_itself_but_manual_pause_stays(warns, tmp_path):
    from agent import estop
    from hermes_constants import reset_hermes_home_override, set_hermes_home_override
    from ops_center import spend_guard, store

    home = tmp_path / ".hermes" / "profiles" / "aibiz"
    home.mkdir(parents=True)
    token = set_hermes_home_override(home)
    try:
        _limits("pause_profile")
        spend_guard.check(spend={"today": 20, "month": 50})
        assert (home / "ESTOP").exists()
        spend_guard.check(spend={"today": 20, "month": 50})  # ainda estourado: segue pausado
        assert (home / "ESTOP").exists()
        spend_guard.check(spend={"today": 0, "month": 50})  # virou o dia
        assert not (home / "ESTOP").exists() and "retomado" in warns[-1][1]

        estop.engage(reason="pausa manual")
        store.set_meta("limits.paused_profile", "2026-01-01")
        spend_guard.check(spend={"today": 0, "month": 50})
        assert (home / "ESTOP").exists()  # pausa manual nunca é retirada pelo limite
    finally:
        reset_hermes_home_override(token)
