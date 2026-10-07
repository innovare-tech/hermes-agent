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
