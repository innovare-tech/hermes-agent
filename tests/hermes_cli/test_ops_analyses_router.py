"""``/api/analyses/*``: lista, detalhe, ações, ignoradas e mídia da evidência (design A3) sobre ops_center.store."""

import json
import time

import pytest


@pytest.fixture
def client(tmp_path, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from hermes_cli.web_routers.ops_analyses import router

    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _make(status="open", client_id="c1", category="bug", urgency="alta", evidence=None, **kw):
    """Insere uma análise (canal já existente) e devolve o id."""
    from ops_center import store

    store.touch_channel("whatsapp", "g1", "Grupo Rota", "group")
    with store.connect() as c:
        cur = c.execute(
            "INSERT INTO analyses(channel_id, status, created_at, period_from, period_to, message_count, client_id, client_name,"
            " category, urgency, confidence, summary, evidence, checks, suggested_reply, error) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            ("whatsapp:g1", status, kw.get("created_at", time.time()), 100.0, 200.0, kw.get("count", 4), client_id, "Auto Center",
             category, urgency, 0.9, kw.get("summary", "Sem confirmação"), json.dumps(evidence or {}),
             json.dumps([{"result": "problem", "text": "fila cheia"}]), "Oi!", kw.get("error")))
        return cur.lastrowid


def test_list_filters_and_shape(client):
    a = _make()
    _make(client_id="c2", category="duvida", urgency="baixa")
    _make(status="resolved")
    _make(status="ignored")  # nunca aparece na lista
    _make(status="pending")
    assert {x["id"] for x in client.get("/api/analyses?status=all").json()} == {a, a + 1, a + 2}
    rows = client.get("/api/analyses?status=open").json()
    assert [r["id"] for r in rows] == [a + 1, a]  # mais nova primeiro
    r = next(x for x in rows if x["id"] == a)
    assert r["code"] == f"A-{a}" and r["clientName"] == "Auto Center" and r["groupName"] == "Grupo Rota"
    assert r["period"] == {"from": 100.0, "to": 200.0} and r["messageCount"] == 4 and r["suggestedReply"] == "Oi!"
    assert r["checks"][0]["result"] == "problem" and r["seenBy"] == [] and r["telegram"] is None
    assert [x["id"] for x in client.get("/api/analyses?status=open&clientId=c2").json()] == [a + 1]
    assert [x["id"] for x in client.get("/api/analyses?status=open&clientId=c1,c2&urgency=alta").json()] == [a]
    assert [x["id"] for x in client.get("/api/analyses?status=open&category=duvida").json()] == [a + 1]
    assert [x["id"] for x in client.get("/api/analyses?status=resolved").json()] == [a + 2]
    assert client.get("/api/analyses?status=bogus").status_code == 400


def test_open_includes_failed(client):
    ok, bad = _make(), _make(status="failed", error="boom", summary="")
    assert {x["id"] for x in client.get("/api/analyses?status=open").json()} == {ok, bad}
    assert client.get(f"/api/analyses/{bad}").json()["error"] == "boom"


def test_detail_404_for_missing_and_unlisted(client):
    assert client.get("/api/analyses/999").status_code == 404
    assert client.get(f"/api/analyses/{_make(status='ignored')}").status_code == 404


def test_seen_unseen_resolve_reopen(client):
    a = _make()
    assert [x["id"] for x in client.get("/api/analyses?status=unseen").json()] == [a]
    r = client.post(f"/api/analyses/{a}/seen").json()
    assert [s["name"] for s in r["seenBy"]] == ["Você"]
    assert client.post(f"/api/analyses/{a}/seen").json()["seenBy"] == r["seenBy"]  # idempotente
    assert client.get("/api/analyses?status=unseen").json() == []

    r = client.post(f"/api/analyses/{a}/resolve").json()
    assert r["status"] == "resolved" and r["resolved"]["by"] == "Você"
    assert client.get("/api/analyses?status=open").json() == []
    assert client.post(f"/api/analyses/{a}/resolve").json()["status"] == "resolved"  # idempotente
    r = client.delete(f"/api/analyses/{a}/resolve").json()
    assert r["status"] == "open" and r["resolved"] is None
    assert client.delete(f"/api/analyses/{a}/resolve").json()["status"] == "open"


def test_resolved_by_panel_user(client):
    from types import SimpleNamespace

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from hermes_cli.web_routers.ops_analyses import router

    app = FastAPI()

    @app.middleware("http")
    async def _login(request, call_next):
        request.state.session = SimpleNamespace(display_name="Carla", email="c@x.com")
        return await call_next(request)

    app.include_router(router)
    a = _make()
    assert TestClient(app).post(f"/api/analyses/{a}/resolve").json()["resolved"]["by"] == "Carla"


def test_irrelevant_persists_reason_and_undo(client):
    a = _make()
    assert client.post(f"/api/analyses/{a}/irrelevant", json={"reason": "outro"}).status_code == 400
    r = client.post(f"/api/analyses/{a}/irrelevant", json={"reason": "social", "note": " sempre fala assim "}).json()
    assert r["status"] == "irrelevant"
    assert r["irrelevant"]["reason"] == "social" and r["irrelevant"]["note"] == "sempre fala assim" and r["irrelevant"]["by"] == "Você"
    assert [x["id"] for x in client.get("/api/analyses?status=irrelevant").json()] == [a]
    assert client.post(f"/api/analyses/{a}/resolve").status_code == 400  # fechada: reabra antes
    r = client.delete(f"/api/analyses/{a}/irrelevant").json()
    assert r["status"] == "open" and r["irrelevant"] is None
    assert client.post(f"/api/analyses/{_make(status='resolved')}/irrelevant", json={"reason": "social"}).status_code == 400


def test_reopen_failed_goes_back_to_failed(client):
    a = _make(status="failed", error="boom", summary="")
    client.post(f"/api/analyses/{a}/resolve")
    assert client.delete(f"/api/analyses/{a}/resolve").json()["status"] == "failed"


def test_telegram_link(client):
    from ops_center import store

    a = _make()
    store.update_analysis(a, telegram={"sentAt": 5.0, "target": "telegram:-1001820044:7", "messageId": 99})
    assert client.get(f"/api/analyses/{a}").json()["telegram"] == {"sentAt": 5.0, "url": "https://t.me/c/1820044/7/99"}
    store.update_analysis(a, telegram={"sentAt": 5.0, "target": "telegram:-1001820044"})
    assert client.get(f"/api/analyses/{a}").json()["telegram"] == {"sentAt": 5.0}


def test_transcribe_retries_only_failed_audios(client, monkeypatch):
    from ops_center import listen

    ev = {"audios": [{"author": "Ana", "at": "09:21", "path": "/x/a.ogg", "transcript": "já tenho"},
                     {"author": "Bia", "at": "09:30", "path": "/x/b.ogg", "transcriptError": "ruído"}]}
    a = _make(evidence=ev)
    calls = []
    monkeypatch.setattr(listen, "_transcribe", lambda p: calls.append(p) or {"transcript": "agora foi"})
    r = client.post(f"/api/analyses/{a}/transcribe").json()
    assert calls == ["/x/b.ogg"]
    assert [x.get("transcript") for x in r["evidence"]["audios"]] == ["já tenho", "agora foi"]
    assert not any("transcriptError" in x for x in r["evidence"]["audios"])
    monkeypatch.setattr(listen, "_transcribe", lambda p: {"transcriptError": "ainda ruído"})
    b = _make(evidence={"audios": [{"author": "Bia", "at": "09:30", "path": "/x/b.ogg", "transcriptError": "ruído"}]})
    assert client.post(f"/api/analyses/{b}/transcribe").json()["evidence"]["audios"][0]["transcriptError"] == "ainda ruído"


def test_ignored_groups_today_with_samples(client):
    from ops_center import store

    q = lambda *texts: {"quotes": [{"author": "x", "at": "08:00", "text": t} for t in texts]}  # noqa: E731
    _make(status="ignored", count=5, evidence=q("bom dia", "bom dia", "figurinha", "valeu"))
    _make(status="ignored", count=3, evidence=q("bom dia", ""))
    _make(status="ignored", count=9, evidence=q("ontem"), created_at=time.time() - 3 * 86400)
    store.touch_channel("whatsapp", "g2", "Outro", "group")
    r = client.get("/api/analyses/ignored?date=today").json()
    assert len(r) == 1 and r[0]["channelId"] == "whatsapp:g1" and r[0]["groupName"] == "Grupo Rota" and r[0]["count"] == 8
    assert r[0]["samples"][0] == "bom dia ×3" and set(r[0]["samples"]) == {"bom dia ×3", "figurinha", "valeu"}
    assert client.get("/api/analyses/ignored?date=amanha").status_code == 400
    assert client.get("/api/analyses/ignored?date=2001-01-01").json() == []


def test_reanalyze_reopens_and_runs_without_triage(client, monkeypatch):
    from ops_center import listen, store

    a, old = _make(status="ignored"), _make(status="ignored", created_at=time.time() - 3 * 86400)
    done = threading_event()
    seen = []

    def fake(aid, **kw):
        seen.append((aid, kw["triage"]("x", {})))
        store.update_analysis(aid, status="open")
        done.set()

    monkeypatch.setattr(listen, "analyze", fake)
    monkeypatch.setattr("agent.estop.is_engaged", lambda: False)
    r = client.post("/api/analyses/ignored/whatsapp:g1/reanalyze")
    assert r.status_code == 200 and r.json() == {"ok": True, "queued": 1}
    assert done.wait(5) and seen == [(a, None)]  # triagem desligada: o humano já decidiu
    assert store.get_analysis(a)["status"] == "open" and store.get_analysis(old)["status"] == "ignored"
    assert client.post("/api/analyses/ignored/whatsapp:nada/reanalyze").status_code == 404


def test_reanalyze_refused_while_paused(client, monkeypatch):
    from ops_center import store

    a = _make(status="ignored")
    monkeypatch.setattr("agent.estop.is_engaged", lambda: True)
    assert client.post("/api/analyses/ignored/whatsapp:g1/reanalyze").status_code == 409
    assert store.get_analysis(a)["status"] == "ignored"


def threading_event():
    import threading

    return threading.Event()


# ---- mídia: só arquivos que a própria evidência da análise aponta ----

def test_media_serves_evidence_by_index(client, tmp_path):
    voice, shot = tmp_path / "voz.ogg", tmp_path / "print.png"
    voice.write_bytes(b"OggS-audio")
    shot.write_bytes(b"\x89PNG-img")
    a = _make(evidence={"audios": [{"author": "Ana", "at": "09:21", "path": str(voice)}],
                        "media": [{"type": "image", "path": str(shot), "author": "Ana", "at": "09:22", "caption": "print"}]})
    d = client.get(f"/api/analyses/{a}").json()
    assert d["evidence"]["audios"][0]["url"] == f"/api/analyses/{a}/media/0"
    assert d["evidence"]["media"][0]["url"] == f"/api/analyses/{a}/media/1" and d["evidence"]["media"][0]["thumbUrl"]
    assert "path" not in json.dumps(d["evidence"])  # o caminho local nunca sai da API
    r = client.get(f"/api/analyses/{a}/media/0")
    assert r.status_code == 200 and r.content == b"OggS-audio" and r.headers["content-type"].startswith("audio/")
    r = client.get(f"/api/analyses/{a}/media/1")
    assert r.content == b"\x89PNG-img" and r.headers["content-type"] == "image/png"


def test_media_blocks_arbitrary_paths(client, tmp_path):
    secret = tmp_path / ".env"
    secret.write_text("API_KEY=segredo")
    img = tmp_path / "a.png"
    img.write_bytes(b"x")
    a = _make(evidence={"media": [{"type": "file", "path": str(secret)}, {"type": "image", "path": "relativo/a.png"},
                                  {"type": "image", "path": str(tmp_path / "sumiu.png")}, {"type": "image", "path": str(img)}]})
    other = _make(evidence={"media": [{"type": "image", "path": str(img)}]})
    # o caminho nunca vem da requisição: só índice; caminho no lugar do índice não é aceito
    for bad in (str(secret), "../../.env", "..%2F..%2F.env", "%2Fetc%2Fpasswd", "-1", "abc"):
        assert client.get(f"/api/analyses/{a}/media/{bad}").status_code in (404, 422)
    assert client.get(f"/api/analyses/{a}/media/99").status_code == 404
    # entradas da evidência fora do tipo permitido, relativas ou inexistentes não saem
    for n in (0, 1, 2):
        assert client.get(f"/api/analyses/{a}/media/{n}").status_code == 404
    assert client.get(f"/api/analyses/{a}/media/3").content == b"x"
    # índice de outra análise não alcança arquivos desta, e análise inexistente/ignorada dá 404
    assert client.get(f"/api/analyses/{other}/media/1").status_code == 404
    assert client.get(f"/api/analyses/{_make(status='ignored')}/media/0").status_code == 404
