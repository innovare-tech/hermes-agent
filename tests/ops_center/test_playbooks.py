"""ops_center.playbooks: horário e destino vivem no job do cron; sem horário = só manual."""

import pytest


@pytest.fixture(autouse=True)
def _home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))


PB = {"name": "Boletos", "trigger": "Todo dia útil", "business_id": None, "enabled": True,
      "nodes": [{"kind": "trigger", "text": "Todo dia útil"}, {"kind": "action", "text": "Listar boletos vencendo"},
                {"kind": "cond", "text": "Algum vence hoje?", "elseText": "encerrar"}]}


def test_schedule_creates_updates_pauses_and_removes_cron_job():
    from cron import jobs
    from ops_center import playbooks

    p = playbooks.save(PB, "0 9 * * 1-5", "telegram:-100")
    job = jobs.get_job(p["cron_job_id"])
    assert job["deliver"] == "telegram:-100" and job["enabled"]
    assert "1. Listar boletos vencendo" in job["prompt"] and "Se não: encerrar" in job["prompt"]
    assert p["schedule"] and p["next_run"]

    p = playbooks.save({**PB, "id": p["id"], "name": "Boletos 2", "enabled": False}, "every 2h", "local")
    job = jobs.get_job(p["cron_job_id"])
    assert job["name"] == "Playbook · Boletos 2" and not job["enabled"] and job["deliver"] == "local"

    p = playbooks.save({**PB, "id": p["id"]}, "", "local")  # sem horário: só manual
    assert p["cron_job_id"] is None and jobs.get_job(job["id"]) is None

    with pytest.raises(ValueError):
        playbooks.save(PB, "quando der", "local")


def test_run_now_creates_one_shot_and_counts():
    from cron import jobs
    from ops_center import playbooks

    p = playbooks.save(PB, "", "local")
    r = playbooks.run_now(p["id"])
    job = jobs.get_job(r["job_id"])
    assert job["schedule"]["kind"] == "once" and job["next_run_at"]
    assert r["playbook"]["runs"] == 1 and r["playbook"]["last_run"]

    playbooks.delete(p["id"])
    assert playbooks.list_all() == []
    with pytest.raises(KeyError):
        playbooks.run_now(p["id"])


def test_keyword_trigger_respects_mode_channel_and_pause(monkeypatch):
    from cron import jobs
    from ops_center import playbooks, store

    kw = {**PB, "name": "Orçamentos", "trigger_kind": "keyword", "keywords": "orcamento, cotação", "enabled": True}
    p = playbooks.save(kw, "", "telegram:-100")
    assert p["trigger_kind"] == "keyword" and p["deliver"] == "telegram:-100" and p["cron_job_id"] is None

    assert playbooks.fire_keyword("whatsapp", "55", "Me manda um ORÇAMENTO?", sender="Ana", mode=store.AUTONOMOUS) == ["Orçamentos"]
    job = [j for j in jobs.list_jobs(include_disabled=True) if "(mensagem)" in j["name"]][-1]
    assert job["deliver"] == "telegram:-100" and "ORÇAMENTO" in job["prompt"]
    # Rascunhar: roda, mas só registra; Observar: não roda; sem palavra: não roda
    playbooks.fire_keyword("whatsapp", "55", "cotação nova", mode=store.DRAFT)
    assert [j for j in jobs.list_jobs(include_disabled=True) if "(mensagem)" in j["name"]][-1]["deliver"] == "local"
    assert playbooks.fire_keyword("whatsapp", "55", "orcamento", mode=store.OBSERVE) == []
    assert playbooks.fire_keyword("whatsapp", "55", "bom dia", mode=store.AUTONOMOUS) == []
    # restrito a um canal; kill switch bloqueia
    playbooks.save({**kw, "id": p["id"], "channel_id": "telegram:1"}, "", "local")
    assert playbooks.fire_keyword("whatsapp", "55", "orcamento", mode=store.AUTONOMOUS) == []
    monkeypatch.setattr("agent.estop.is_engaged", lambda: True)
    assert playbooks.fire_keyword("telegram", "1", "orcamento", mode=store.AUTONOMOUS) == []
    assert "disparado por mensagem de Ana" in store.list_activity()[-1]["action"] or any("disparado" in a["action"] for a in store.list_activity())

    with pytest.raises(ValueError):
        playbooks.save({**kw, "keywords": " , "}, "", "local")
