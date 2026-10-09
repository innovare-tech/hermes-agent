"""Saúde (A7): verificações, incidentes (abrir, fechar sozinho, reabrir), investigação e "Entendi assim"."""

import json

import pytest


@pytest.fixture(autouse=True)
def _home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))


@pytest.fixture
def h(monkeypatch):
    from ops_center import health

    sent = []
    monkeypatch.setattr(health, "_notify", lambda level, text: sent.append((level, text)))
    health.sent = sent
    results = []
    monkeypatch.setitem(health.RUNNERS, "http", lambda p, prev: results.pop(0))
    health.results = results
    return health


def _check(h, **kw):
    return h.add_check(**{"group": "services", "name": "events", "kind": "http",
                          "params": {"url": "https://x/health"}, **kw})


def test_add_check_validates(h):
    with pytest.raises(ValueError):
        _check(h, interval_sec=42)
    with pytest.raises(ValueError):
        _check(h, kind="nope")
    c = _check(h)
    assert c["status"] == "pending" and c["historyLabel"] == "tempo de resposta (ms)"


def test_two_errors_open_incident_then_recovers_and_reopens(h):
    c = _check(h)
    h.results += [{"status": "error", "text": "respondeu 502", "value": 30}] * 2
    h.run_check(c["id"], now=1000)
    assert h.list_incidents() == []  # um soluço não acorda ninguém
    h.run_check(c["id"], now=1060)
    [inc] = h.list_incidents()
    assert inc["code"] == f"INC-{inc['id']}" and inc["investigating"] and h.sent[-1][0] == "critical"
    assert h.list_checks()[0]["history"][-1]["value"] == 30

    h.results.append({"status": "ok", "text": "respondeu 200", "value": 20})
    h.run_check(c["id"], now=1120)
    assert h.list_incidents() == [] and h.list_incidents("resolved")[0]["resolvedBy"] == "Hermes"

    h.results += [{"status": "error", "text": "não respondeu"}] * 2
    h.run_check(c["id"], now=1180)
    h.run_check(c["id"], now=1240)
    [again] = h.list_incidents()
    assert again["id"] == inc["id"] and "Reaberto" in again["timeline"][-1]["text"]


def test_manual_resolve_warns_when_still_failing(h):
    c = _check(h)
    h.results += [{"status": "error", "text": "x"}] * 2
    h.run_check(c["id"])
    h.run_check(c["id"])
    [inc] = h.list_incidents()
    out = h.resolve(inc["id"], "Kelvin", "reiniciei")
    assert out["stillFailing"] and out["incident"]["status"] == "resolved"
    with pytest.raises(ValueError):
        h.ack(inc["id"], "Kelvin")


def test_investigation_fills_timeline_and_drops_hard_denied_fix(h):
    c = _check(h)
    h.results += [{"status": "error", "text": "x"}] * 2
    h.run_check(c["id"])
    h.run_check(c["id"])
    [inc] = h.list_incidents()
    reply = {"timeline": [{"result": "problem", "text": "pod OOMKilled"}, {"result": "zzz", "text": "rede ok"}],
             "hypothesis": "faltou memória", "impact": "3 clientes",
             "suggested_action": {"label": "Reiniciar", "command": "kubectl rollout restart deploy/wa"}}
    out = h.investigate(inc["id"], run=lambda ctx, cfg: "```json\n" + json.dumps(reply) + "\n```")
    assert out["hypothesis"] == "faltou memória" and out["impact"] == "3 clientes" and not out["investigating"]
    assert [e["result"] for e in out["timeline"][-2:]] == ["problem", "signal"]
    assert out["suggestedAction"]["needsApproval"] is True

    reply["suggested_action"]["command"] = "kubectl delete namespace default"
    out = h.investigate(inc["id"], run=lambda ctx, cfg: json.dumps(reply))
    assert out["suggestedAction"] is None  # "sempre bloqueado" nem vira sugestão


def test_action_becomes_approval_request(h, monkeypatch):
    from ops_center import guardrails, store

    c = _check(h)
    h.results += [{"status": "error", "text": "x"}] * 2
    h.run_check(c["id"])
    h.run_check(c["id"])
    [inc] = h.list_incidents()
    with pytest.raises(ValueError):
        h.request_action(inc["id"], "Kelvin")  # sem correção sugerida
    h._save_inc(inc["id"], suggested_action={"label": "Reiniciar", "command": "pm2 restart events"})
    calls = []

    def fake(command, *, label, by, context):
        calls.append(command)
        return store.add_approval(origin="dashboard", requested_by=by, command=command, tool="terminal",
                                  args={"command": command}, status="pending", target="telegram:-1:2")

    monkeypatch.setattr(guardrails, "request_panel_approval", fake)
    out = h.request_action(inc["id"], "Kelvin")
    assert out["approval"]["status"] == "pending" and calls == ["pm2 restart events"]
    h.request_action(inc["id"], "Kelvin")
    assert len(calls) == 1  # pedido pendente não duplica


def test_health_probe_origin_only_reads():
    from ops_center import guardrails

    with guardrails.as_origin("health_probe"):
        assert guardrails.check("terminal", {"command": "kubectl get pods -n default"}) is None
        assert "Bloqueado" in guardrails.check("terminal", {"command": "kubectl rollout restart deploy/x"})
        assert "Bloqueado" in guardrails.check("terminal", {"command": "cat ~/.ssh/id_rsa"})


def test_parse_resources():
    from ops_center.health import parse_resources

    out = """ 1  0      0 812345  1234 99999    0    0     1     2  100  200  7  3 88  2  0
Mem:     8000000000  6000000000  500000000  1000  1500000000  1600000000
/dev/sda1  100000  91000  9000  91% /"""
    assert parse_resources(out) == {"cpu": 12, "ram": 80, "disk": 91}


def test_parse_text_builds_check_and_describes(h):
    h.save_settings({"servers": [{"name": "vps1", "host": "1.2.3.4", "user": "root"}]})
    llm = lambda _t: json.dumps({"kind": "ssh", "server": "vps1", "metric": "disk", "name": "Disco da VPS1",
                                 "only": {"from": "08:00", "to": "18:00", "days": [1, 2, 3, 4, 5]}})
    out = h.parse_text("avise se o disco da vps1 encher em horário comercial", 900, llm=llm)
    assert out["ok"] and out["check"]["window"] == "seg–sex, 08:00–18:00"
    assert out["check"]["frequency"] == "a cada 15 min" and out["check"]["groupLabel"] == "Servidores"
    created = h.create_from_parsed({"text": "x", "interval": 900, "parsed": out["check"]})
    assert created["kind"] == "ssh" and created["sourceText"] == "x"

    vague = h.parse_text("fica de olho aí", 300, llm=lambda _t: '{"ok": false, "reason": "Não sei o que medir."}')
    assert vague == {"ok": False, "reason": "Não sei o que medir."}
    unknown = h.parse_text("avise se a vps9 cair", 300, llm=lambda _t: '{"kind": "ssh", "server": "vps9"}')
    assert not unknown["ok"] and "servidor" in unknown["reason"]


def test_within_business_hours(h):
    from datetime import datetime, timezone

    seg_10h = datetime(2026, 10, 5, 13, 0, tzinfo=timezone.utc).timestamp()  # segunda 10:00 em Brasília
    dom_10h = datetime(2026, 10, 4, 13, 0, tzinfo=timezone.utc).timestamp()
    only = {"from": "08:00", "to": "18:00", "days": [1, 2, 3, 4, 5]}
    assert h._within(only, seg_10h) and not h._within(only, dom_10h) and h._within(None, dom_10h)


def test_recommended_dedupes_and_lists_what_is_missing(h):
    h.save_settings({"services": [{"name": "events", "url": "https://x/events/v1/health"}]})
    first = h.create_recommended()
    assert [c["name"] for c in first["created"]] == ["events"]
    assert any("MongoDB" in s or "Chaves" in s for s in first["skipped"])
    assert h.create_recommended()["created"] == []


def test_overview_availability(h):
    from ops_center import store

    now = 100 * 86400.0
    with store.connect() as c:
        c.execute("INSERT INTO incidents(severity, title, started_at, resolved_at, status) VALUES('critical','x',?,?,'resolved')",
                  (now - 3600 * 7.2, now))
    assert h.overview(now)["availability30d"] == 99.0


def test_pem_accepts_base64_and_escaped_newlines():
    import base64

    from ops_center.health import _pem

    pem = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----"
    assert _pem(base64.b64encode(pem.encode()).decode()) == pem + "\n"
    assert _pem(pem.replace("\n", "\n")) == pem + "\n" and _pem("") == ""
    with pytest.raises(ValueError):
        _pem("não é base64 !!")


def test_investigate_pending_runs_in_background_once(h, monkeypatch):
    c = _check(h)
    h.results += [{"status": "error", "text": "x"}] * 2
    h.run_check(c["id"])
    h.run_check(c["id"])
    seen = []
    monkeypatch.setattr(h, "investigate", lambda iid: (seen.append(iid), (_ for _ in ()).throw(RuntimeError("boom"))))
    t = h.investigate_pending(wait=True)
    assert t is not None and len(seen) == 1
    assert h.list_incidents()[0]["investigating"] is False  # quebrou: não tenta de novo a cada ciclo
    assert h.investigate_pending(wait=True) is None


def test_pause_closes_incident_and_stops_running(h):
    c = _check(h)
    h.results += [{"status": "error", "text": "x"}] * 2
    h.run_check(c["id"])
    h.run_check(c["id"])
    assert len(h.list_incidents()) == 1
    out = h.update_check(c["id"], {"paused": True})
    assert out["status"] == "paused" and h.list_incidents() == []
    assert h.tick(investigate=False) == []
    with pytest.raises(ValueError):
        h.run_check(c["id"])
    back = h.update_check(c["id"], {"paused": False})
    assert back["status"] == "error" and back["lastRunAt"] is None
