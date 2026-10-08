"""``/api/providers``, ``/api/models/routing``, ``/api/usage/spend`` e ``/api/limits`` (design A5)."""

import http.server
import json
import threading

import pytest

GOOD = "sk-good-1234abcd"
MODELS = ["alpha-1", "vision-x"]


class _Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        ok = self.headers.get("Authorization") == f"Bearer {GOOD}" and self.path == "/v1/models"
        self.send_response(200 if ok else 401)
        self.end_headers()
        if ok:
            self.wfile.write(json.dumps({"data": [{"id": m} for m in MODELS]}).encode())

    def log_message(self, *a):
        pass


@pytest.fixture
def url():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_port}/v1"
    srv.shutdown()
    srv.server_close()


@pytest.fixture
def client(tmp_path, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from hermes_cli.web_routers.ops_models import router
    from ops_center import models

    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))
    monkeypatch.setattr(models, "_builtin_providers", lambda cfg, st: [])

    def set_default(provider, model):  # a escrita nativa completa do padrão é testada em tests/ops_center
        from hermes_cli.config import load_config, save_config

        cfg = load_config()
        cfg["model"] = {"provider": provider, "default": model}
        save_config(cfg)

    monkeypatch.setattr(models, "_set_default", set_default)
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _add(client, url, name="Together AI", key=GOOD):
    return client.post("/api/providers", json={"name": name, "baseUrl": url, "apiKey": key})


def test_connection_test_is_always_200_with_the_reason(client, url):
    ok = client.post("/api/providers/test", json={"baseUrl": url, "apiKey": GOOD})
    assert ok.status_code == 200 and ok.json()["ok"] and ok.json()["models"] == MODELS
    bad = client.post("/api/providers/test", json={"baseUrl": url, "apiKey": "sk-x"})
    assert bad.status_code == 200 and bad.json()["code"] == "unauthorized"
    gone = client.post("/api/providers/test", json={"baseUrl": "http://127.0.0.1:1/v1", "apiKey": GOOD})
    assert gone.status_code == 200 and gone.json()["code"] == "unreachable"


def test_provider_crud_never_returns_the_key(client, url):
    assert client.get("/api/providers").json() == []
    r = _add(client, url)
    assert r.status_code == 200 and GOOD not in r.text
    p = r.json()
    assert p["id"] == "custom:together-ai" and p["keyHint"] == "…abcd" and p["status"] == "ok"
    assert GOOD not in client.get("/api/providers").text
    # Criar exige teste ok no backend: chave errada e nome repetido são 400, com o motivo.
    bad = _add(client, url, "Outro", "sk-x")
    assert bad.status_code == 400 and "401" in bad.json()["detail"]
    assert _add(client, url).status_code == 400
    assert client.post("/api/providers", json={"name": "X", "baseUrl": url, "apiKey": GOOD, "kind": "boom"}).status_code == 400
    # Renomear não precisa de teste; trocar a chave precisa e a errada não passa.
    assert client.patch("/api/providers/custom:together-ai", json={"name": "Together"}).json()["name"] == "Together"
    assert client.patch("/api/providers/custom:together-ai", json={"apiKey": "sk-x"}).status_code == 400
    assert client.patch("/api/providers/custom:nao-existe", json={"name": "A"}).status_code == 404
    t = client.post("/api/providers/custom:together-ai/test")
    assert t.status_code == 200 and t.json()["ok"]
    assert client.post("/api/providers/custom:nao-existe/test").status_code == 404
    d = client.delete("/api/providers/custom:together-ai")
    assert d.status_code == 200 and d.json() == {"ok": True, "affected": []}
    assert client.get("/api/providers").json() == []
    assert client.delete("/api/providers/custom:together-ai").status_code == 404


def test_routing_get_put_and_capability_check(client, url):
    _add(client, url)
    r = client.get("/api/models/routing").json()
    assert r["default"] is None
    assert set(r["tasks"]) == {"main", "channel.telegram", "channel.whatsapp", "channel.api", "group_analysis", "triage_jev",
                               "vision", "transcription", "compaction", "scheduled"}
    assert r["tasks"]["main"] == {"inherit": True} and r["tasks"]["triage_jev"]["provider"] == ""
    assert r["taskMeta"]["vision"]["unit"] == "mil imagens" and r["taskMeta"]["vision"]["measured"] is False

    out = client.put("/api/models/routing", json={
        "default": {"provider": "custom:together-ai", "model": "alpha-1"},
        "tasks": {"vision": {"provider": "custom:together-ai", "model": "vision-x"}, "group_analysis": {"provider": "custom:together-ai", "model": "alpha-1"},
                  "channel.api": {"provider": "custom:together-ai", "model": "alpha-1"}}})
    assert out.status_code == 200
    assert out.json()["tasks"]["vision"] == {"provider": "custom:together-ai", "model": "vision-x"}
    assert out.json()["tasks"]["channel.api"]["model"] == "alpha-1" and out.json()["tasks"]["main"] == {"inherit": True}
    # Pedido inválido é recusado inteiro: nada muda.
    bad = client.put("/api/models/routing", json={"tasks": {"vision": {"inherit": True}, "transcription": {"provider": "custom:together-ai", "model": "alpha-1"}}})
    assert bad.status_code == 400 and "transcrição" in bad.json()["detail"]
    assert client.get("/api/models/routing").json()["tasks"]["vision"]["model"] == "vision-x"
    assert client.put("/api/models/routing", json={"tasks": {"triage_jev": {"inherit": True}}}).status_code == 400
    assert client.put("/api/models/routing", json={"tasks": {"nada": {"inherit": True}}}).status_code == 400
    # Remover o provedor devolve as tarefas ao padrão.
    assert set(client.delete("/api/providers/custom:together-ai").json()["affected"]) == {"vision", "group_analysis", "channel.api"} | {"default"}
    after = client.get("/api/models/routing").json()
    assert after["default"] is None and after["tasks"]["vision"] == {"inherit": True}


def test_spend_and_limits(client):
    s = client.get("/api/usage/spend").json()
    assert s["today"] == 0 and s["month"] == 0 and 1 <= s["dayOfMonth"] <= s["daysInMonth"] <= 31
    d = client.get("/api/limits").json()
    assert (d["dailyUsd"], d["monthlyUsd"], d["alertPct"], d["onLimit"], d["saved"]) == (15.0, 300.0, 80, "pause_non_urgent", False)
    p = client.put("/api/limits", json={"dailyUsd": 25, "monthlyUsd": 500, "alertPct": 90, "onLimit": "pause_profile"}).json()
    assert (p["dailyUsd"], p["monthlyUsd"], p["alertPct"], p["onLimit"], p["saved"]) == (25.0, 500.0, 90, "pause_profile", True)
    assert client.get("/api/limits").json()["onLimit"] == "pause_profile"
    assert client.put("/api/limits", json={"alertPct": 150}).status_code == 400
    assert client.put("/api/limits", json={"onLimit": "boom"}).status_code == 400
    assert client.put("/api/limits", json={"dailyUsd": -1}).status_code == 400
    assert client.get("/api/limits").json()["alertPct"] == 90
