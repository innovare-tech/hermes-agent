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
    assert sent == [("telegram", "-100", "Olá!", None)]

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
    assert client.put("/api/ops/settings", json={"default_mode": 9}).status_code == 400


def test_config_actions_land_in_activity(client):
    from ops_center import store

    b = client.post("/api/ops/businesses", json={"name": "Loja"}).json()
    client.put("/api/ops/settings", json={"default_mode": 2})
    client.put("/api/ops/watches", json={"words": ["boleto"]})
    client.delete(f"/api/ops/businesses/{b['id']}")
    actions = [a["action"] for a in store.list_activity()]
    assert "Criou o negócio “Loja”" in actions and "Removeu o negócio “Loja”" in actions
    assert "Canais novos passam a começar em Autônomo" in actions and "Palavras vigiadas: boleto" in actions
    assert client.post("/api/ops/activity", json={"kind": "cfg", "action": "x"}).status_code == 200


def test_activity_middleware_rules_never_log_secrets():
    from hermes_cli.web_routers.ops_activity import match

    assert match("PUT", "/api/estop", {"paused": True}) == "Pausou tudo"
    assert match("PUT", "/api/skills/toggle", {"name": "ascii-art", "enabled": False}) == "Desligou a skill /ascii-art"
    assert match("PUT", "/api/tools/toolsets/todo", {"enabled": False}) == "Desligou a ferramenta Plano de tarefas"
    assert match("POST", "/api/gateway/restart", {}) == "Reiniciou o gateway"
    action = match("PUT", "/api/env", {"key": "OPENROUTER_API_KEY", "value": "sk-segredo"})
    assert action == "Salvou a chave OPENROUTER_API_KEY" and "sk-segredo" not in action
    creds = match("PUT", "/api/messaging/platforms/telegram", {"env": {"TELEGRAM_BOT_TOKEN": "123:abc"}})
    assert "TELEGRAM_BOT_TOKEN" in creds and "123:abc" not in creds
    assert match("PUT", "/api/messaging/platforms/telegram", {"enabled": False}) == "Desligou o canal Telegram"
    assert match("GET", "/api/estop", {}) is None and match("PUT", "/api/ops/inbox/1", {}) is None


def test_human_schedule_in_activity():
    from hermes_cli.web_routers.ops_center import _human_schedule

    assert _human_schedule("0 18 * * 5") == "toda sexta às 18:00"
    assert _human_schedule("30 7 * * 1-5") == "dias úteis às 07:30"
    assert _human_schedule("every 2h") == "every 2h"


def test_profile_query_scopes_ops_data(client, tmp_path):
    """?profile=aibiz lê e grava no ops.db da Aibiz; o perfil padrão não vê nada."""
    from hermes_cli.profiles import _get_profiles_root, create_profile

    root = _get_profiles_root()
    assert tmp_path in root.parents  # nunca tocar o ~/.hermes real
    create_profile("aibiz", no_skills=True)
    b = client.post("/api/ops/businesses?profile=aibiz", json={"name": "Aibiz"}).json()
    assert client.get("/api/ops/businesses?profile=aibiz").json() == [b]
    assert client.get("/api/ops/businesses").json() == []
    assert (root / "aibiz" / "ops.db").exists()
    assert client.get("/api/ops/businesses?profile=naoexiste").status_code == 404
    acts = client.get("/api/ops/activity?profile=aibiz").json()
    assert any("Aibiz" in a["action"] for a in acts) and client.get("/api/ops/activity").json() == []


def test_profile_pause_is_local_and_never_lifts_global(client):
    from agent.estop import engage, is_engaged
    from hermes_cli.profiles import create_profile, get_profile_dir

    # padrão = raiz: só pausa pelo "Pausar tudo"
    assert client.get("/api/ops/pause").json() == {"paused": False, "can_pause": False}
    assert client.put("/api/ops/pause", json={"paused": True}).status_code == 400

    create_profile("aibiz", no_skills=True)
    assert client.put("/api/ops/pause?profile=aibiz", json={"paused": True}).json() == {"paused": True, "can_pause": True}
    assert (get_profile_dir("aibiz") / "ESTOP").exists()
    assert not is_engaged()  # o padrão segue rodando

    engage(reason="pausa geral")  # "Pausar tudo"
    client.put("/api/ops/pause?profile=aibiz", json={"paused": False})
    assert not (get_profile_dir("aibiz") / "ESTOP").exists()
    assert is_engaged()  # retomar o perfil não levanta a pausa global


def test_listen_settings_route(client):
    assert client.get("/api/ops/listen").json()["max_min"] == 30
    out = client.put("/api/ops/listen", json={"silence_min": 10, "notify_target": "telegram:-100:7"}).json()
    assert out["silence_min"] == 10 and out["notify_target"] == "telegram:-100:7"
    assert client.put("/api/ops/listen", json={"max_min": 1000}).status_code == 400


def test_permissions_and_approvals_routes(client, monkeypatch):
    perms = client.get("/api/ops/permissions").json()
    assert perms["enabled"] is False and "whatsapp_group" in perms["origins"]
    assert any(h["label"] == "Apagar banco ou tabela" for h in perms["hardDeny"])
    bad = client.put("/api/ops/permissions", json={"matrix": {"db.write": {"whatsapp_group": "allow"}}})
    assert bad.status_code == 400 and "nunca alteram" in bad.json()["detail"]
    ok = client.put("/api/ops/permissions", json={"enabled": True, "approvalTarget": "telegram:-100:3"}).json()
    assert ok["enabled"] and ok["approvalTarget"] == "telegram:-100:3"

    from ops_center import guardrails, store

    aid = store.add_approval(origin="telegram_team", requested_by="Ivair", requested_by_id="11", summary="Mudar cluster",
                             command="kubectl scale deploy/x --replicas=2", tool="terminal",
                             args={"command": "kubectl scale deploy/x --replicas=2"}, status="pending",
                             expires_at=10**12)
    ran = []
    monkeypatch.setattr(guardrails, "execute_approved", lambda i: ran.append(i) or "ok")
    assert client.get("/api/ops/approvals", params={"status": "pending"}).json()[0]["id"] == aid
    out = client.post(f"/api/ops/approvals/{aid}/decide", json={"approve": True}).json()
    assert out["status"] == "approved" and out["decided_by"] == "Você (painel)"
    assert client.post(f"/api/ops/approvals/{aid}/decide", json={"approve": False}).status_code == 409


def test_channels_a2_contract_and_clients_directory(client):
    from ops_center import store

    imp = client.post("/api/clients/import", json=[
        {"systemClientId": "c-sol", "name": "Padaria Sol", "plan": "Pro"},
        {"systemClientId": "c-lumen", "name": "Lumen Contábil", "plan": "Basic"},
    ])
    assert imp.status_code == 200 and imp.json() == {"imported": 2, "total": 2}
    assert client.post("/api/clients/import", json=[{"systemClientId": "x"}]).status_code == 400
    page = client.get("/api/clients", params={"q": "contabil"}).json()
    assert [c["systemClientId"] for c in page["items"]] == ["c-lumen"] and page["total"] == 1 and page["nextCursor"] is None
    assert client.get("/api/clients", params={"cursor": "zzz"}).status_code == 400
    assert client.get("/api/clients/with-analyses").json() == {"items": [], "total": 0, "nextCursor": None}

    store.touch_channel("whatsapp", "g1", "Padaria Sol - Suporte", "group")
    ch = client.get("/api/ops/channels").json()[0]
    assert ch["section"] == "group" and ch["suggestion"]["clientId"] == "c-sol" and ch["requiresConfirm"] is True

    # vínculo, janela por canal, "não é cliente" — PATCH e PUT são o mesmo contrato
    r = client.patch("/api/ops/channels/whatsapp:g1", json={"clientId": "c-sol", "window": {"silenceMin": 8, "maxMin": 40}})
    assert r.status_code == 200
    assert (r.json()["clientName"], r.json()["window"]) == ("Padaria Sol", {"useDefault": False, "silenceMin": 8, "maxMin": 40})
    assert client.get("/api/clients").json()["items"][1]["channelCount"] == 1
    assert client.patch("/api/ops/channels/whatsapp:g1", json={"window": {"silenceMin": 0, "maxMin": 40}}).status_code == 400
    assert client.patch("/api/ops/channels/whatsapp:g1", json={"clientId": "nope"}).status_code == 400
    r = client.put("/api/ops/channels/whatsapp:g1", json={"clientId": None, "notClient": True, "window": None})
    assert (r.json()["clientId"], r.json()["notClient"], r.json()["window"]["useDefault"]) == (None, True, True)

    # Autônomo em grupo pede confirm; Escutar é aceito; canal de avisos não escuta
    r = client.patch("/api/ops/channels/whatsapp:g1", json={"mode": 2})
    assert r.status_code == 400 and "confirm" in r.json()["detail"]
    assert client.patch("/api/ops/channels/whatsapp:g1", json={"mode": 3}).json()["mode"] == 3
    assert client.patch("/api/ops/channels/whatsapp:g1", json={"mode": 2, "confirm": True}).json()["mode"] == 2
    store.touch_channel("telegram", "-100", "Equipe Aibiz", "group")
    client.put("/api/ops/listen", json={"notify_target": "telegram:-100:45"})
    assert client.patch("/api/ops/channels/telegram:-100", json={"mode": 3}).status_code == 400
    assert client.patch("/api/ops/channels/nope:1", json={"notClient": True}).status_code == 404
    acts = [a["action"] for a in client.get("/api/ops/activity").json()]
    assert any("vinculado ao cliente Padaria Sol" in a for a in acts) and any("janela de análise" in a for a in acts)
