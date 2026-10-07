"""``/api/ops/*``: CRUD de negócios/canais/caixa/atividade/pessoas/playbooks sobre ops_center.store."""

import pytest


@pytest.fixture
def client(tmp_path, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from hermes_cli.web_routers.ops_center import router

    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_businesses_and_channels(client):
    from ops_center import store

    b = client.post("/api/ops/businesses", json={"name": "Unic", "color": "#3fd0b0"}).json()
    assert client.get("/api/ops/businesses").json() == [b]
    assert client.post("/api/ops/businesses", json={"name": " "}).status_code == 400

    store.touch_channel("telegram", "-100", "Grupo VIP", "group")
    r = client.put("/api/ops/channels/telegram:-100", json={"mode": 1, "business_id": b["id"]})
    assert r.status_code == 200 and r.json()["mode"] == 1 and r.json()["business_id"] == b["id"]
    assert client.put("/api/ops/channels/telegram:-100", json={"mode": 9}).status_code == 400
    assert client.put("/api/ops/channels/nope:1", json={"mode": 1}).status_code == 404


def test_inbox_patch_and_activity_undo(client):
    from ops_center import store

    item = store.record_inbound("whatsapp", "55", "oi", sender_name="Ana")["item_id"]
    r = client.patch(f"/api/ops/inbox/{item}", json={"status": "archived"})
    assert r.json()["status"] == "archived"
    assert client.get("/api/ops/inbox").json() == []
    assert client.patch(f"/api/ops/inbox/{item}", json={"status": "bogus"}).status_code == 400

    a = client.post("/api/ops/activity", json={"kind": "msg", "action": "Respondeu Ana", "reversible": True}).json()
    assert client.post(f"/api/ops/activity/{a['id']}/undo").json()["undone"] == 1
    b = client.post("/api/ops/activity", json={"kind": "cmd", "action": "Rodou backup"}).json()
    assert client.post(f"/api/ops/activity/{b['id']}/undo").status_code == 409
    assert client.post("/api/ops/activity", json={"kind": "x", "action": "?"}).status_code == 400


def test_watches_people_playbooks(client):
    assert client.put("/api/ops/watches", json={"words": ["Urgente", "urgente", "boleto"]}).json() == ["boleto", "urgente"]
    p = client.put("/api/ops/people", json={"name": "Carla", "pending": ["Responder"]}).json()
    assert client.get("/api/ops/people").json()[0]["pending"] == ["Responder"]
    client.delete(f"/api/ops/people/{p['id']}")
    assert client.get("/api/ops/people").json() == []
    pb = client.put("/api/ops/playbooks", json={"name": "Boleto", "trigger": "2ª via", "nodes": []}).json()
    assert client.put("/api/ops/playbooks", json={**pb, "enabled": False}).json()["enabled"] is False


def test_memory_add_edit_remove(client):
    r = client.post("/api/ops/memory", json={"target": "memory", "content": "Prefere squash merge."})
    assert r.status_code == 200 and r.json()["memory"] == ["Prefere squash merge."]
    r = client.put("/api/ops/memory", json={"target": "memory", "entry": "Prefere squash merge.", "content": "Prefere rebase."})
    assert r.json()["memory"] == ["Prefere rebase."]
    client.post("/api/ops/memory", json={"target": "user", "content": "Fuso America/Sao_Paulo."})
    r = client.request("DELETE", "/api/ops/memory", json={"target": "memory", "entry": "Prefere rebase."})
    assert r.json()["memory"] == [] and r.json()["user"] == ["Fuso America/Sao_Paulo."]
    assert client.post("/api/ops/memory", json={"target": "x", "content": "a"}).status_code == 400
    assert client.post("/api/ops/memory", json={"target": "memory", "content": "   "}).status_code == 400


def test_reply_sends_marks_sent_and_respects_pause(client, monkeypatch):
    from hermes_cli.web_routers import ops_center as routes
    from ops_center import store

    sent = []
    monkeypatch.setattr(routes, "_send_reply", lambda *a: sent.append(a))
    item = store.record_inbound("telegram", "-100", "oi", sender_name="Ana")["item_id"]
    assert client.post(f"/api/ops/inbox/{item}/reply", json={"text": " "}).status_code == 400
    r = client.post(f"/api/ops/inbox/{item}/reply", json={"text": "Olá!"})
    assert r.status_code == 200 and r.json()["status"] == "sent" and r.json()["draft"] == "Olá!"
    assert sent == [("telegram", "-100", "Olá!")]

    monkeypatch.setattr("agent.estop.is_engaged", lambda: True)
    assert client.post(f"/api/ops/inbox/{item}/reply", json={"text": "de novo"}).status_code == 409
    assert len(sent) == 1

    def boom(*_a):
        raise RuntimeError("sem adaptador")

    monkeypatch.setattr("agent.estop.is_engaged", lambda: False)
    monkeypatch.setattr(routes, "_send_reply", boom)
    r = client.post(f"/api/ops/inbox/{item}/reply", json={"text": "x"})
    assert r.status_code == 502 and "sem adaptador" in r.json()["detail"]


def test_default_mode_for_new_channels(client):
    assert client.get("/api/ops/settings").json() == {"default_mode": 1}  # Rascunhar de fábrica
    assert client.put("/api/ops/settings", json={"default_mode": 0}).json() == {"default_mode": 0}
    assert client.put("/api/ops/settings", json={"default_mode": 3}).status_code == 400
