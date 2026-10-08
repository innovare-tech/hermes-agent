"""``/api/notify/*``: Telegram, rotas, teste e resumo (design A4) com a Bot API simulada."""

import pytest

CHAT = "-1001820044"


@pytest.fixture
def client(tmp_path, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from hermes_cli.web_routers.ops_notify import router
    from ops_center import notify

    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:SECRET")
    monkeypatch.delenv("TELEGRAM_HOME_CHANNEL", raising=False)
    calls, fail = [], {}

    def fake(tok, method, payload=None, timeout=10):
        calls.append((method, payload or {}))
        if method in fail:
            raise fail[method]
        return {
            "getMe": {"id": 9, "username": "hermes_bot"},
            "getChat": {"id": int(CHAT), "title": "Equipe Aibiz", "is_forum": True},
            "getChatMemberCount": 6,
            "getChatMember": {"status": "administrator", "can_manage_topics": True},
            "getChatAdministrators": [{"status": "creator", "user": {"id": 1, "first_name": "Luana", "username": "luareis"}}],
            "createForumTopic": {"message_thread_id": 31, "name": (payload or {}).get("name"), "icon_color": 0x6FB9F0},
            "sendMessage": {"message_id": 7},
        }[method]

    monkeypatch.setattr(notify, "_post", fake)
    app = FastAPI()
    app.include_router(router)
    c = TestClient(app)
    c.calls, c.fail = calls, fail
    return c


def test_telegram_states_and_chat_flow(client, monkeypatch):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN")
    assert client.get("/api/notify/telegram").json()["status"] == "no_token"
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:SECRET")
    assert client.get("/api/notify/telegram").json()["status"] == "no_chat"
    assert client.put("/api/notify/telegram", json={"chatId": "grupo"}).status_code == 400
    r = client.put("/api/notify/telegram", json={"chatId": CHAT}).json()
    assert r["connected"] and r["chat"]["title"] == "Equipe Aibiz" and r["members"][0]["username"] == "luareis"
    assert client.get("/api/notify/routes").json()["chatId"] == CHAT
    assert "SECRET" not in client.get("/api/notify/telegram").text


def test_refresh_topics_create_and_permission_error(client):
    from ops_center.notify import TelegramError

    client.put("/api/notify/telegram", json={"chatId": CHAT})
    r = client.post("/api/notify/telegram/topics/refresh", json={"create": True}).json()
    assert [t["name"] for t in r["topics"]] == ["Alertas de infra", "Grupos de clientes", "Conversa"]
    assert client.get("/api/notify/telegram").json()["topics"][0]["threadId"] == 31
    assert client.post("/api/notify/telegram/topics/refresh").json()["status"] == "ok"  # sem corpo
    client.fail["createForumTopic"] = TelegramError("no_permission", "not enough rights to create a topic")
    client.post("/api/notify/telegram/topics/refresh", json={"topics": [{"threadId": 5, "name": "x"}]})
    bad = client.post("/api/notify/telegram/topics/refresh", json={"create": True})
    assert bad.status_code == 200  # nada faltando: os 3 já existem
    client.put("/api/notify/telegram", json={"chatId": "-1009"})  # outro grupo zera os tópicos
    err = client.post("/api/notify/telegram/topics/refresh", json={"create": True})
    assert err.status_code == 502 and "not enough rights" in err.json()["detail"]


def test_routes_roundtrip_and_validation(client):
    r = client.get("/api/notify/routes").json()
    assert r["analyses"]["critical"] == {"topic": None, "quiet": False}
    body = {"analyses": {"critical": {"topic": 11, "quiet": False}, "low": {"topic": "off", "quiet": True}, "mentions": [1, 2]},
            "infra": {"critical": {"topic": 10}}, "digest": {"time": "09:00", "days": [1, 2, 3]},
            "quietHours": {"from": "21:00", "to": "07:30", "weekend": False}}
    saved = client.put("/api/notify/routes", json=body)
    assert saved.status_code == 200
    got = client.get("/api/notify/routes").json()
    assert got == saved.json()
    assert got["analyses"]["critical"]["topic"] == 11 and got["analyses"]["low"] == {"topic": "off", "quiet": True}
    assert got["analyses"]["mentions"] == [1, 2] and got["quietHours"]["from"] == "21:00" and got["digest"]["days"] == [1, 2, 3]
    for sec in ("analyses", "infra"):
        bad = client.put("/api/notify/routes", json={sec: {"critical": {"topic": 1, "quiet": True}}})
        assert bad.status_code == 400 and "crítico" in bad.json()["detail"]
    assert client.put("/api/notify/routes", json={"digest": {"time": "99:99"}}).status_code == 400
    assert client.get("/api/notify/routes").json() == got  # inválido não grava


def test_test_endpoint(client):
    from ops_center.notify import TelegramError

    client.put("/api/notify/telegram", json={"chatId": CHAT})
    client.put("/api/notify/routes", json={"analyses": {"critical": {"topic": 11}}, "infra": {"critical": {"topic": "off"}}})
    ok = client.post("/api/notify/test", json={"type": "analyses"}).json()
    assert ok["ok"] and ok["topic"] == 11 and ok["messageUrl"] == "https://t.me/c/1820044/11/7" and ok["latencyMs"] >= 0
    off = client.post("/api/notify/test", json={"type": "infra"}).json()
    assert off["ok"] is False and off["code"] == "topic_off"
    draft = client.post("/api/notify/test", json={"type": "infra", "draft": {"infra": {"critical": {"topic": 10}}}}).json()
    assert draft["ok"] and draft["topic"] == 10  # usa o rascunho, mesmo sem salvar
    client.fail["sendMessage"] = TelegramError("no_permission", "Forbidden: not enough rights")
    denied = client.post("/api/notify/test", json={"type": "analyses"}).json()
    assert denied["ok"] is False and denied["code"] == "no_permission" and "permissão" in denied["message"]
    assert client.post("/api/notify/test", json={"type": "nada"}).status_code == 400


def test_digest_send_now_and_quiet_flush(client):
    client.put("/api/notify/telegram", json={"chatId": CHAT})
    client.put("/api/notify/routes", json={"digest": {"topic": 12}})
    r = client.post("/api/notify/digest/send-now").json()
    assert r == {"ok": True, "topic": 12, "messageUrl": "https://t.me/c/1820044/12/7"}
    sent = [p for m, p in client.calls if m == "sendMessage"][-1]
    assert sent["text"].startswith("☀️ Resumo de ontem") and sent["message_thread_id"] == 12
    client.put("/api/notify/routes", json={"digest": {"topic": "off"}})
    assert client.post("/api/notify/digest/send-now").status_code == 400
    assert client.post("/api/notify/quiet/flush").json() == {"flushed": 0}
