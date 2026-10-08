"""Tela Canais (A2): diretório de clientes, sugestão de vínculo, janela por canal e confirmação de Autônomo."""

import sqlite3

import pytest

CLIENTS = [
    {"systemClientId": "c-sol", "name": "Padaria Sol", "plan": "Pro"},
    {"systemClientId": "c-clinica", "name": "Clínica Bem Viver", "plan": "Basic"},
    {"systemClientId": "c-lumen", "name": "Lumen Contábil", "plan": "Pro"},
]


@pytest.fixture(autouse=True)
def _home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))


def _group(chat_id="g1", name="Padaria Sol - Suporte", platform="whatsapp"):
    from ops_center import store

    return store.touch_channel(platform, chat_id, name, "group")["id"]


def test_import_search_and_pagination():
    from ops_center import store

    assert store.import_clients(CLIENTS) == {"imported": 3, "total": 3}
    store.import_clients([{"systemClientId": "c-sol", "name": "Padaria Sol Ltda", "plan": "Max"}])  # upsert
    page = store.list_clients()
    assert [c["systemClientId"] for c in page["items"]] == ["c-clinica", "c-lumen", "c-sol"]  # por nome
    assert page["total"] == 3 and page["nextCursor"] is None
    assert page["items"][2] == {"systemClientId": "c-sol", "name": "Padaria Sol Ltda", "plan": "Max",
                                "openAnalyses": 0, "channelCount": 0}
    # busca ignora acento e caixa; casa por nome ou id
    assert [c["systemClientId"] for c in store.list_clients("clinica")["items"]] == ["c-clinica"]
    assert [c["systemClientId"] for c in store.list_clients("CONTABIL")["items"]] == ["c-lumen"]
    assert [c["systemClientId"] for c in store.list_clients("c-su")["items"]] == []
    assert [c["systemClientId"] for c in store.list_clients("C-SOL")["items"]] == ["c-sol"]
    first = store.list_clients(limit=2)
    assert len(first["items"]) == 2 and first["total"] == 3 and first["nextCursor"] == "2"
    second = store.list_clients(cursor=first["nextCursor"], limit=2)
    assert [c["systemClientId"] for c in second["items"]] == ["c-sol"] and second["nextCursor"] is None
    with pytest.raises(ValueError):
        store.list_clients(cursor="abc")
    for bad in ([{"systemClientId": "x", "name": " "}], [{"name": "Sem id"}], ["x"], {"a": 1}):
        with pytest.raises(ValueError):
            store.import_clients(bad)


def test_open_analyses_count_per_client_channels():
    from ops_center import store

    store.import_clients(CLIENTS)
    a, b = _group("g1", "Grupo A"), _group("g2", "Grupo B")
    store.patch_channel(a, {"clientId": "c-sol"})
    store.patch_channel(b, {"clientId": "c-sol"})
    for ch, st in ((a, "open"), (a, "open"), (b, "open"), (b, "ignored"), (b, "failed")):
        with store.connect() as c:
            c.execute("INSERT INTO analyses(channel_id, status, created_at) VALUES(?,?,?)", (ch, st, 1.0))
    sol = next(c for c in store.list_clients()["items"] if c["systemClientId"] == "c-sol")
    assert (sol["openAnalyses"], sol["channelCount"]) == (3, 2)
    assert [c["systemClientId"] for c in store.clients_with_analyses()["items"]] == ["c-sol"]


def test_suggestion_threshold():
    from ops_center import store

    store.import_clients(CLIENTS)
    s = store.suggest_client("Clínica Bem Viver – TI")
    assert s["clientId"] == "c-clinica" and s["name"] == "Clínica Bem Viver" and s["confidence"] >= 0.75
    assert store.suggest_client("Padaria Sol - Suporte")["clientId"] == "c-sol"
    assert store.suggest_client("Churrasco da firma") is None
    assert store.suggest_client("") is None


def test_channels_view_contract_and_suggestion():
    from ops_center import store

    store.import_clients(CLIENTS)
    g = _group("g1", "Padaria Sol - Suporte")
    store.record_inbound("whatsapp", "g1", "Boa tarde, o sistema caiu", chat_name="Padaria Sol - Suporte", kind="group",
                         sender_id="u1", sender_name="Dona Ana")
    store.record_inbound("whatsapp", "g1", "Alguém?", kind="group", sender_id="u2", sender_name="Seu João")
    team = _group("-100", "Equipe Aibiz", "telegram")
    dm = store.touch_channel("whatsapp", "55119", "Maria", "dm")["id"]
    store.set_listen_settings({"notify_target": "telegram:-100:45"})
    by_id = {c["id"]: c for c in store.channels_view()}
    v = by_id[g]
    assert v["section"] == "group" and v["clientId"] is None and v["notClient"] is False
    assert v["suggestion"]["clientId"] == "c-sol"
    assert (v["todayCount"], v["members"]) == (2, 2)
    assert v["last"]["from"] == "Seu João" and v["last"]["text"] == "Alguém?"
    assert v["window"] == {"useDefault": True, "silenceMin": 5, "maxMin": 30}
    assert v["problem"] is None and v["requiresConfirm"] is True and v["receivesAlerts"] is False
    assert by_id[team]["section"] == "team" and by_id[team]["receivesAlerts"] is True
    assert by_id[team]["requiresConfirm"] is False and by_id[team]["suggestion"] is None
    assert by_id[dm]["section"] == "direct" and by_id[dm]["requiresConfirm"] is False
    # vinculado ou "não é cliente" deixa de ter sugestão
    assert store.patch_channel(g, {"clientId": "c-sol"})["suggestion"] is None


def test_client_link_not_client_and_unlink():
    from ops_center import store

    store.import_clients(CLIENTS)
    g = _group()
    v = store.patch_channel(g, {"clientId": "c-sol"})
    assert (v["clientId"], v["clientName"], v["notClient"]) == ("c-sol", "Padaria Sol", False)
    v = store.patch_channel(g, {"notClient": True})
    assert (v["clientId"], v["clientName"], v["notClient"]) == (None, None, True)
    v = store.patch_channel(g, {"clientId": "c-lumen"})  # vincular tira o "não é cliente"
    assert (v["clientId"], v["notClient"]) == ("c-lumen", False)
    v = store.patch_channel(g, {"clientId": None})
    assert (v["clientId"], v["clientName"], v["notClient"]) == (None, None, False)
    with pytest.raises(ValueError):
        store.patch_channel(g, {"clientId": "nao-existe"})
    with pytest.raises(ValueError):
        store.patch_channel(g, {"clientId": "c-sol", "notClient": True})
    with pytest.raises(KeyError):
        store.patch_channel("whatsapp:nope", {"notClient": True})
    # renomear o cliente na importação atualiza o nome nos canais vinculados
    store.patch_channel(g, {"clientId": "c-sol"})
    store.import_clients([{"systemClientId": "c-sol", "name": "Padaria do Sol", "plan": "Pro"}])
    assert store.patch_channel(g, {})["clientName"] == "Padaria do Sol"


def test_window_per_channel_validation():
    from ops_center import store

    g = _group()
    v = store.patch_channel(g, {"window": {"useDefault": False, "silenceMin": 10, "maxMin": 45}})
    assert v["window"] == {"useDefault": False, "silenceMin": 10, "maxMin": 45}
    store.set_listen_settings({"silence_min": 7, "max_min": 60})
    assert store.patch_channel(g, {})["window"]["silenceMin"] == 10  # o do canal vence o padrão
    v = store.patch_channel(g, {"window": {"useDefault": True}})
    assert v["window"] == {"useDefault": True, "silenceMin": 7, "maxMin": 60}
    store.patch_channel(g, {"window": {"silenceMin": 3, "maxMin": 20}})
    assert store.patch_channel(g, {"window": None})["window"]["useDefault"] is True
    for bad in ({"silenceMin": 0, "maxMin": 30}, {"silenceMin": 61, "maxMin": 120}, {"silenceMin": 5, "maxMin": 4},
                {"silenceMin": 5, "maxMin": 241}, {"silenceMin": 10, "maxMin": 10}, {"silenceMin": 5}, {"silenceMin": "5", "maxMin": 30}):
        with pytest.raises(ValueError):
            store.patch_channel(g, {"window": bad})
    with pytest.raises(ValueError):  # mesma regra do padrão
        store.set_listen_settings({"silence_min": 30, "max_min": 20})


def test_mode_listen_blocked_on_alert_channel_and_autonomous_needs_confirm():
    from ops_center import store

    g = _group()
    team = _group("-100", "Equipe Aibiz", "telegram")
    dm = store.touch_channel("whatsapp", "55119", "Maria", "dm")["id"]
    store.set_listen_settings({"notify_target": "telegram:-100:45"})
    assert store.patch_channel(g, {"mode": store.LISTEN})["mode"] == store.LISTEN
    with pytest.raises(ValueError, match="avisos"):
        store.patch_channel(team, {"mode": store.LISTEN})
    with pytest.raises(ValueError, match="confirm"):
        store.patch_channel(g, {"mode": store.AUTONOMOUS})
    assert store.channel_mode("whatsapp", "g1") == store.LISTEN  # nada mudou
    assert store.patch_channel(g, {"mode": store.AUTONOMOUS}, confirm=True)["mode"] == store.AUTONOMOUS
    assert store.patch_channel(g, {"mode": store.AUTONOMOUS})["mode"] == store.AUTONOMOUS  # já estava: não pede de novo
    assert store.patch_channel(team, {"mode": store.AUTONOMOUS})["mode"] == store.AUTONOMOUS  # equipe não pede
    assert store.patch_channel(dm, {"mode": store.AUTONOMOUS})["mode"] == store.AUTONOMOUS  # DM não pede
    with pytest.raises(ValueError):
        store.patch_channel(g, {"mode": 9})


def test_last_alert_comes_from_analysis_notice():
    from ops_center import store

    g = _group()
    with store.connect() as c:
        c.execute("INSERT INTO analyses(channel_id, status, created_at, telegram) VALUES(?,?,?,?)",
                  (g, "open", 1.0, '{"sentAt": 1234.5, "target": "telegram:-100:45"}'))
    assert store.channels_view()[0]["lastAlert"] == {"at": 1234.5, "analysisId": 1}


def test_migration_adds_columns_to_old_db(tmp_path):
    """Banco criado antes da tela Canais ganha ``not_client`` e a tabela ``clients`` sem perder canais."""
    from ops_center import store

    db = tmp_path / "old.db"
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE channels (id TEXT PRIMARY KEY, platform TEXT NOT NULL, chat_id TEXT NOT NULL, "
                "name TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'dm', business_id TEXT, "
                "mode INTEGER NOT NULL DEFAULT 2, last_seen REAL)")
    con.execute("INSERT INTO channels(id, platform, chat_id, name, kind, mode) VALUES('whatsapp:1','whatsapp','1','G','group',1)")
    con.commit()
    con.close()
    for _ in range(2):  # idempotente
        with store.connect(db) as c:
            cols = {r[1] for r in c.execute("PRAGMA table_info(channels)")}
            assert {"not_client", "client_id", "listen_silence_min"} <= cols
            assert c.execute("SELECT mode FROM channels").fetchone()[0] == 1
            assert c.execute("SELECT COUNT(*) FROM clients").fetchone()[0] == 0
