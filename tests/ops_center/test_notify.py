"""ops_center.notify: rotas por nível, silêncio, menções, teste e erros do Telegram (Bot API simulada)."""

import json
import urllib.error
from datetime import datetime, timedelta, timezone

import pytest

CHAT = "-1001820044"
BR = timezone(timedelta(hours=-3))


def ts(day, hm):
    """Instante em Brasília: dia do mês (jan/2026; 5 = segunda) e HH:MM."""
    h, m = map(int, hm.split(":"))
    return datetime(2026, 1, day, h, m, tzinfo=BR).timestamp()


class FakeTelegram:
    def __init__(self):
        self.calls = []
        self.fail = {}  # método → TelegramError
        self.next_thread = 100

    def __call__(self, tok, method, payload=None, timeout=10):
        from ops_center.notify import TelegramError

        assert tok == "123:SECRET"
        self.calls.append((method, payload or {}))
        if method in self.fail:
            raise self.fail[method]
        if method == "getMe":
            return {"id": 9, "username": "hermes_bot"}
        if method == "getChat":
            return {"id": int(CHAT), "title": "Equipe Aibiz", "is_forum": True}
        if method == "getChatMemberCount":
            return 6
        if method == "getChatMember":
            return {"status": "administrator", "can_manage_topics": True}
        if method == "getChatAdministrators":
            return [{"status": "creator", "user": {"id": 1, "first_name": "Luana", "last_name": "Reis", "username": "luareis"}},
                    {"status": "administrator", "custom_title": "Infra", "user": {"id": 2, "first_name": "Bruna"}},
                    {"status": "administrator", "user": {"id": 9, "first_name": "Hermes", "is_bot": True}}]
        if method == "createForumTopic":
            self.next_thread += 1
            return {"message_thread_id": self.next_thread, "name": payload["name"], "icon_color": payload["icon_color"]}
        if method == "sendMessage":
            return {"message_id": 55}
        raise TelegramError("telegram_error", "método inesperado " + method)

    def sent(self):
        return [p for m, p in self.calls if m == "sendMessage"]


@pytest.fixture
def tg(tmp_path, monkeypatch):
    from ops_center import notify

    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:SECRET")
    monkeypatch.delenv("TELEGRAM_HOME_CHANNEL", raising=False)
    fake = FakeTelegram()
    monkeypatch.setattr(notify, "_post", fake)
    return fake


def _save(**over):
    from ops_center import notify

    doc = {"chatId": CHAT, "analyses": {"critical": {"topic": 11}, "high": {"topic": 12, "quiet": False},
                                        "medium": {"topic": 12, "quiet": True}, "low": {"topic": "off"}},
           "infra": {"critical": {"topic": 10}, "warning": {"topic": 10, "quiet": True}}}
    doc.update(over)
    return notify.save_routes(doc)


def test_defaults_and_contract_shape(tg):
    from ops_center import notify

    r = notify.routes()
    assert set(r) == {"chatId", "analyses", "infra", "digest", "quietHours"}
    assert r["analyses"]["critical"] == {"topic": None, "quiet": False} and r["analyses"]["mentions"] == []
    assert r["digest"] == {"topic": None, "time": "08:30", "days": [1, 2, 3, 4, 5]}
    assert r["quietHours"] == {"from": "20:00", "to": "08:00", "weekend": True, "tz": "America/Sao_Paulo"}
    assert not notify.routes_saved()


def test_rejects_quiet_on_critical_and_bad_values(tg):
    from ops_center import notify

    for sec, lv in (("analyses", "critical"), ("infra", "critical")):
        with pytest.raises(ValueError, match="crítico"):
            notify.save_routes({sec: {lv: {"topic": 1, "quiet": True}}})
    for bad in ({"analyses": {"high": {"topic": "xyz"}}}, {"analyses": {"high": {"topic": 0}}}, {"digest": {"time": "25:00"}},
                {"digest": {"days": [7]}}, {"quietHours": {"from": "8h"}}, {"analyses": {"mentions": ["a"]}}):
        with pytest.raises(ValueError):
            notify.save_routes(bad)
    assert not notify.routes_saved()  # nada inválido é gravado


def test_save_merges_and_persists(tg):
    from ops_center import notify

    _save(digest={"time": "09:00", "days": [1, 3]})
    saved = notify.routes()
    assert saved["analyses"]["high"] == {"topic": 12, "quiet": False}
    assert saved["analyses"]["low"]["topic"] == "off" and saved["infra"]["info"]["topic"] == "off"  # padrão preservado
    assert saved["digest"] == {"topic": None, "time": "09:00", "days": [1, 3]}
    notify.save_routes({"analyses": {"mentions": [1, "2", 1]}})
    assert notify.routes()["analyses"]["mentions"] == [1, 2] and notify.routes()["analyses"]["high"]["topic"] == 12


def test_routing_by_level_and_topic_null(tg):
    from ops_center import notify

    _save()
    notify.save_routes({"analyses": {"high": {"topic": None}}})
    seg = ts(5, "12:00")
    out = notify.send("analyses", "critica", "crítico", now=seg)
    assert out["messageId"] == 55 and out["topic"] == 11 and out["target"] == f"telegram:{CHAT}:11"
    assert out["url"] == "https://t.me/c/1820044/11/55"
    assert tg.sent()[-1]["message_thread_id"] == 11
    out = notify.send("analyses", "alta", "alto", now=seg)
    assert out["topic"] is None and out["url"] == "https://t.me/c/1820044/55" and "message_thread_id" not in tg.sent()[-1]
    assert notify.send("infra", "critical", "infra", now=seg)["topic"] == 10
    assert notify.send("infra", "aviso", "infra", now=seg)["topic"] == 10  # alias
    with pytest.raises(ValueError):
        notify.send("analyses", "urgentissima", "x")


def test_topic_off_does_not_send(tg):
    from ops_center import notify

    _save()
    n = len(tg.calls)
    assert notify.send("analyses", "baixa", "x", now=ts(5, "12:00")) is None  # low = off
    assert notify.send("infra", "info", "x", now=ts(5, "12:00")) is None  # padrão do info = off
    assert len(tg.calls) == n


def test_unconfigured_or_without_token_sends_nothing(tg, monkeypatch):
    from ops_center import notify

    assert not notify.is_configured() and notify.send("analyses", "critica", "x") is None
    _save()
    assert notify.is_configured()
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN")
    assert not notify.is_configured() and notify.send("analyses", "critica", "x") is None
    assert tg.sent() == []


def test_quiet_hours_hold_and_critical_never_waits(tg):
    from ops_center import notify, store

    _save()
    night, morning = ts(6, "23:00"), ts(7, "08:30")
    assert notify.send("analyses", "media", "msg das 23h", now=night) is None  # segurado
    assert notify.send("analyses", "alta", "alta na hora", now=night)["topic"] == 12  # quiet=False passa
    assert notify.send("analyses", "critica", "crítico às 23h", now=night)["topic"] == 11  # nunca silencia
    assert tg.sent()[-1]["text"] == "crítico às 23h"
    assert len(store.get_meta("notify_queue")) == 1
    assert notify.flush_quiet(night) == 0  # ainda em silêncio
    n = len(tg.sent())
    assert notify.flush_quiet(morning) == 1
    summary = tg.sent()[n:]
    assert len(summary) == 1 and "silêncio" in summary[0]["text"] and "msg das 23h" in summary[0]["text"]
    assert summary[0]["message_thread_id"] == 12 and "23:00" in summary[0]["text"]
    assert store.get_meta("notify_queue") == [] and notify.flush_quiet(morning) == 0


def test_quiet_window_edges_and_weekend(tg):
    from ops_center import notify

    q = notify.routes()["quietHours"]
    assert notify.in_quiet(q, ts(5, "20:00")) and notify.in_quiet(q, ts(6, "07:59"))
    assert not notify.in_quiet(q, ts(5, "08:00")) and not notify.in_quiet(q, ts(5, "19:59"))
    assert notify.in_quiet(q, ts(10, "12:00"))  # sábado
    assert not notify.in_quiet({**q, "weekend": False}, ts(10, "12:00"))


def test_flush_keeps_queue_when_telegram_fails(tg):
    from ops_center import notify, store
    from ops_center.notify import TelegramError

    _save()
    notify.send("analyses", "media", "guardado", now=ts(6, "23:00"))
    tg.fail["sendMessage"] = TelegramError("telegram_error", "boom")
    assert notify.flush_quiet(ts(7, "09:00")) == 0
    assert len(store.get_meta("notify_queue")) == 1  # não perde
    del tg.fail["sendMessage"]
    assert notify.flush_quiet(ts(7, "09:01")) == 1


def test_mentions_only_on_critical_and_escape_text(tg):
    from ops_center import notify

    notify.save_routes({"chatId": CHAT, "analyses": {"critical": {"topic": 11}, "high": {"topic": 12}, "mentions": [1, 2, 77]}})
    notify.telegram()  # aprende os administradores
    notify.send("analyses", "critica", "bug <b>feio</b> & grave", now=ts(5, "12:00"))
    text = tg.sent()[-1]["text"]
    assert tg.sent()[-1]["parse_mode"] == "HTML" and "bug &lt;b&gt;feio&lt;/b&gt; &amp; grave" in text
    assert "@luareis" in text and '<a href="tg://user?id=2">Bruna</a>' in text and 'tg://user?id=77">equipe</a>' in text
    notify.send("analyses", "alta", "alto", now=ts(5, "12:00"))
    assert "@luareis" not in tg.sent()[-1]["text"]


def test_telegram_state_and_never_leaks_token(tg, monkeypatch):
    from ops_center import notify

    monkeypatch.delenv("TELEGRAM_BOT_TOKEN")
    assert notify.telegram()["status"] == "no_token"
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:SECRET")
    assert notify.telegram()["status"] == "no_chat"
    info = notify.set_chat(CHAT)
    assert info["connected"] and info["status"] == "ok" and info["bot"] == {"username": "hermes_bot"}
    assert info["chat"] == {"id": CHAT, "title": "Equipe Aibiz", "members": 6, "isForum": True, "botIsAdmin": True, "canManageTopics": True}
    assert [(m["id"], m["role"]) for m in info["members"]] == [(1, "Dono"), (2, "Infra")]  # sem bots
    assert "SECRET" not in json.dumps(info)
    notify.learn_member(5, "Carla Mendes", "carlamendes")
    notify.learn_member(5, "Carla Mendes", "carlamendes")  # idempotente
    notify.learn_member(1, "Luana", None)  # já é administrador: não duplica
    again = notify.telegram()["members"]
    assert [(m["id"], m["role"]) for m in again] == [(1, "Dono"), (2, "Infra"), (5, "Membro")]
    with pytest.raises(ValueError):
        notify.set_chat("grupo")


def test_telegram_down_is_an_error_state(tg):
    from ops_center import notify
    from ops_center.notify import TelegramError

    notify.set_chat(CHAT)
    tg.fail["getChat"] = TelegramError("telegram_error", "timeout")
    info = notify.telegram()
    assert info["status"] == "error" and info["connected"] is False and info["error"]["code"] == "telegram_error"
    tg.fail["getChat"] = TelegramError("no_chat", "Bad Request: chat not found")
    assert notify.telegram()["status"] == "no_chat"


def test_refresh_creates_only_missing_default_topics(tg):
    from ops_center import notify

    notify.set_chat(CHAT)
    info = notify.refresh_topics(create=False, add=[{"threadId": 5, "name": "conversa"}])
    assert [t["name"] for t in info["topics"]] == ["conversa"]
    info = notify.refresh_topics(create=True)
    assert [t["name"] for t in info["topics"]] == ["conversa", "Alertas de infra", "Grupos de clientes"]  # "Conversa" já existia
    assert all({"threadId", "name", "color", "icon"} <= set(t) for t in info["topics"]) and info["topics"][1]["color"] == "#fb6f5f"
    assert [p["name"] for m, p in tg.calls if m == "createForumTopic"] == ["Alertas de infra", "Grupos de clientes"]
    n = len(tg.calls)
    notify.refresh_topics(create=True)
    assert not [1 for m, _ in tg.calls[n:] if m == "createForumTopic"]  # nada a criar


def test_refresh_create_surfaces_missing_permission(tg):
    from ops_center import notify
    from ops_center.notify import TelegramError

    notify.set_chat(CHAT)
    tg.fail["createForumTopic"] = TelegramError("no_permission", "not enough rights to create a topic")
    with pytest.raises(TelegramError) as e:
        notify.refresh_topics(create=True)
    assert e.value.code == "no_permission"


def test_test_send_ok_uses_draft_and_reports_latency(tg):
    from ops_center import notify

    _save()
    r = notify.test("analyses", {"analyses": {"critical": {"topic": 11}, "mentions": [1]}})
    assert r["ok"] and r["topic"] == 11 and isinstance(r["latencyMs"], int) and r["messageUrl"] == "https://t.me/c/1820044/11/55"
    assert tg.sent()[-1]["text"].startswith("🧪") and tg.sent()[-1]["message_thread_id"] == 11
    assert notify.test("infra")["topic"] == 10
    assert notify.test("digest")["topic"] is None
    with pytest.raises(ValueError):
        notify.test("outro")
    with pytest.raises(ValueError, match="crítico"):
        notify.test("analyses", {"analyses": {"critical": {"quiet": True}}})


def test_test_send_errors_are_mapped(tg, monkeypatch):
    from ops_center import notify
    from ops_center.notify import TelegramError

    _save()
    off = notify.test("analyses", {"analyses": {"critical": {"topic": "off"}}})
    assert off == {"ok": False, "code": "topic_off", "message": "Este aviso está como “Não enviar”. Escolha um tópico para testar."}
    tg.fail["sendMessage"] = TelegramError("no_permission", "Forbidden: not enough rights to send text messages to the chat")
    r = notify.test("infra")
    assert r["ok"] is False and r["code"] == "no_permission" and "não tem permissão para postar em" in r["message"]
    tg.fail["sendMessage"] = TelegramError("telegram_error", "Bad Request: message thread not found")
    r = notify.test("infra")
    assert r["code"] == "telegram_error" and "não existe mais" in r["message"]
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN")
    assert notify.test("analyses")["code"] == "no_token"


def test_test_without_chat(tg, monkeypatch):
    from ops_center import notify

    monkeypatch.setattr(notify, "chat_id", lambda: None)
    assert notify.test("analyses")["code"] == "no_chat"


def test_bot_api_errors_are_classified_and_token_redacted(monkeypatch):
    from ops_center import notify

    class Resp:
        def __init__(self, body):
            self.body = body

        def __enter__(self):
            return self

        def __exit__(self, *a):
            pass

        def read(self, *a):
            return json.dumps(self.body).encode()

    def http_error(code, desc):
        def fake(req, timeout=0):
            raise urllib.error.HTTPError(req.full_url, code, "x", {}, __import__("io").BytesIO(json.dumps(
                {"ok": False, "error_code": code, "description": desc}).encode()))
        return fake

    cases = [(401, "Unauthorized", "no_token"), (403, "Forbidden: bot was kicked from the supergroup chat", "no_permission"),
             (400, "Bad Request: not enough rights to send text messages to the chat", "no_permission"),
             (400, "Bad Request: chat not found", "no_chat"), (400, "Bad Request: message thread not found", "telegram_error"),
             (429, "Too Many Requests: retry after 5", "telegram_error")]
    for code, desc, want in cases:
        monkeypatch.setattr(notify.urllib.request, "urlopen", http_error(code, desc))
        with pytest.raises(notify.TelegramError) as e:
            notify._post("1:tok", "sendMessage", {})
        assert e.value.code == want, desc

    monkeypatch.setattr(notify.urllib.request, "urlopen", lambda req, timeout=0: Resp({"ok": True, "result": {"message_id": 1}}))
    assert notify._post("1:tok", "sendMessage", {}) == {"message_id": 1}

    def boom(req, timeout=0):
        raise OSError("falha em https://api.telegram.org/bot1:tok/sendMessage")

    monkeypatch.setattr(notify.urllib.request, "urlopen", boom)
    with pytest.raises(notify.TelegramError) as e:
        notify._post("1:tok", "sendMessage", {})
    assert e.value.code == "telegram_error" and "1:tok" not in e.value.message


def test_digest_text_counts_yesterday(tg):
    from ops_center import notify, store

    store.touch_channel("whatsapp", "g1", "Grupo Rota", "group")
    y, t = ts(7, "10:00"), ts(8, "09:00")  # ontem (quarta) e hoje (quinta)
    with store.connect() as c:
        rows = [("open", "critica", y, 3, "Auto Center"), ("open", "alta", y, 2, "Pet Feliz"), ("resolved", "alta", y, 2, None),
                ("ignored", None, y, 40, None), ("ignored", None, y, 2, None), ("open", "baixa", t, 1, "Hoje")]
        for st, urg, at, n, client in rows:
            c.execute("INSERT INTO analyses(channel_id,status,created_at,message_count,urgency,client_name) VALUES(?,?,?,?,?,?)",
                      ("whatsapp:g1", st, at, n, urg, client))
    text = notify.digest_text(now=t)
    assert text.startswith("☀️ Resumo de ontem · 09:00")
    assert "• 3 análises (1 crítica, 2 altas), 1 resolvida" in text
    assert "• Abertas (3): " in text and "Auto Center" in text and "Pet Feliz" in text
    assert "• 42 mensagens sociais ignoradas" in text


def test_tick_flushes_and_sends_digest_once_a_day(tg):
    from ops_center import notify

    assert notify.tick(ts(5, "09:00")) == {"flushed": 0, "digest": False}  # sem rotas
    _save(digest={"topic": 12, "time": "08:30", "days": [1, 2, 3, 4, 5]})
    notify.send("analyses", "media", "guardado", now=ts(5, "06:00"))
    assert notify.tick(ts(5, "07:00")) == {"flushed": 0, "digest": False}  # ainda em silêncio e antes da hora
    out = notify.tick(ts(5, "08:30"))
    assert out == {"flushed": 1, "digest": True}
    assert any("Resumo de ontem" in p["text"] and p["message_thread_id"] == 12 for p in tg.sent())
    assert notify.tick(ts(5, "09:00"))["digest"] is False  # uma vez por dia
    assert notify.tick(ts(10, "09:00"))["digest"] is False  # sábado não está nos dias
    assert notify.tick(ts(6, "09:00"))["digest"] is True  # no dia seguinte volta


def test_send_digest_respects_off(tg):
    from ops_center import notify

    _save(digest={"topic": "off"})
    with pytest.raises(ValueError, match="Não enviar"):
        notify.send_digest()


def test_listen_send_notice_uses_routes_and_falls_back(tg, monkeypatch):
    from ops_center import listen, notify, store

    a = {"id": 7, "status": "open", "urgency": "critica", "category": "bug", "summary": "Fila parada", "message_count": 3,
         "channel_id": "whatsapp:g1", "group_name": "Grupo Rota"}
    monkeypatch.setattr(listen, "format_notice", lambda x: "AVISO " + x["summary"])
    monkeypatch.setattr(listen, "format_notice_html", lambda x: ("<b>AVISO</b> " + x["summary"], [{"text": "📋", "copy_text": {"text": "r"}}]))
    legacy = []
    monkeypatch.setitem(__import__("sys").modules, "tools.send_message_tool",
                        type("M", (), {"send_message_tool": staticmethod(lambda args: legacy.append(args) or json.dumps({"success": True, "message_id": 1}))}))
    store.set_listen_settings({"notify_target": "telegram:-100999:5"})
    sent = listen.send_notice(a)  # sem rotas: caminho antigo
    assert sent["target"] == "telegram:-100999:5" and legacy
    _save()
    legacy.clear()
    sent = listen.send_notice(a)
    assert sent["topic"] == 11 and sent["target"] == f"telegram:{CHAT}:11" and not legacy
    assert tg.sent()[-1]["text"] == "<b>AVISO</b> Fila parada"  # versão HTML, com o botão de copiar
    assert tg.sent()[-1]["reply_markup"] == {"inline_keyboard": [[{"text": "📋", "copy_text": {"text": "r"}}]]}
    notify.save_routes({"analyses": {"critical": {"topic": "off"}}})
    assert listen.send_notice(a) is None and not legacy  # "Não enviar" não cai no destino antigo
    failed = {**a, "status": "failed", "urgency": None}
    assert listen.send_notice(failed)["topic"] == 12  # análise que falhou vale como "alta"


def test_parallel_bot_calls_keep_the_profile_context(tg, monkeypatch):
    """As chamadas em paralelo rodam em threads: precisam do contexto do perfil (segredos), senão o token
    de um perfil nomeado não é lido (500 em Avisos no perfil Aibiz)."""
    import contextvars

    from ops_center import notify

    scope = contextvars.ContextVar("perfil", default=None)
    seen = []
    real = notify._call

    def spy(method, payload=None):
        seen.append(scope.get())
        return real(method, payload)

    notify.set_chat(CHAT)
    monkeypatch.setattr(notify, "_call", spy)
    token = scope.set("aibiz")
    try:
        assert notify.telegram()["status"] == "ok"
    finally:
        scope.reset(token)
    assert seen and set(seen) == {"aibiz"}
