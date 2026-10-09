"""Modelos (A5): teste de provedor, mapa tarefa → chave nativa, capacidade, gasto e limites."""

import http.server
import json
import sqlite3
import threading
from datetime import datetime

import pytest
import yaml

GOOD = "sk-good-1234abcd"
MODELS = ["alpha-1", "vision-x", "whisper-z"]


class _Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.headers.get("Authorization") != f"Bearer {GOOD}":
            self.send_response(401)
            self.end_headers()
            return
        if self.path == "/v1/models":
            body = json.dumps({"data": [{"id": m} for m in self.server.models]}).encode()
        else:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


@pytest.fixture
def provider_server():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    srv.models = list(MODELS)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield srv, f"http://127.0.0.1:{srv.server_port}/v1"
    srv.shutdown()
    srv.server_close()


@pytest.fixture(autouse=True)
def _home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))
    return tmp_path / ".hermes"


def _cfg(home):
    p = home / "config.yaml"
    return yaml.safe_load(p.read_text(encoding="utf-8")) if p.exists() else {}


# ---- limites ----

def test_evaluate_limits_states_and_actions():
    from ops_center.models import evaluate_limits

    lim = {"dailyUsd": 10, "monthlyUsd": 100, "alertPct": 80, "onLimit": "pause_non_urgent"}
    assert evaluate_limits({"today": 3, "month": 20}, lim) == {"state": "ok", "action": None, "windows": {"day": "ok", "month": "ok"}}
    r = evaluate_limits({"today": 8, "month": 20}, lim)  # 80% do dia = alerta
    assert (r["state"], r["action"], r["windows"]["day"]) == ("alert", "notify", "alert")
    r = evaluate_limits({"today": 3, "month": 100}, lim)  # o mês bateu
    assert (r["state"], r["action"], r["windows"]) == ("over", "pause_non_urgent", {"day": "ok", "month": "over"})
    assert evaluate_limits({"today": 10, "month": 0}, {**lim, "onLimit": "pause_profile"})["action"] == "pause_profile"
    assert evaluate_limits({"today": 99, "month": 0}, {**lim, "onLimit": "notify"})["action"] == "notify"
    # Limite zerado/ausente = sem limite naquela janela; spend vazio não quebra.
    assert evaluate_limits({"today": 999, "month": 999}, {"dailyUsd": 0, "monthlyUsd": None})["state"] == "ok"
    assert evaluate_limits({}, lim)["state"] == "ok"
    # Valor de onLimit inválido cai no padrão seguro.
    assert evaluate_limits({"today": 11}, {**lim, "onLimit": "x"})["action"] == "pause_non_urgent"


def test_limits_default_save_and_validation():
    from ops_center import models

    d = models.limits()
    assert (d["dailyUsd"], d["monthlyUsd"], d["alertPct"], d["onLimit"], d["saved"]) == (15.0, 300.0, 80, "pause_non_urgent", False)
    out = models.set_limits({"dailyUsd": 20, "alertPct": 90})
    assert out["dailyUsd"] == 20.0 and out["monthlyUsd"] == 300.0 and out["alertPct"] == 90 and out["saved"] is True
    assert models.limits()["dailyUsd"] == 20.0  # persistiu no ops.db
    for bad in ({"dailyUsd": 0}, {"dailyUsd": "x"}, {"monthlyUsd": -5}, {"alertPct": 100}, {"alertPct": 0}, {"onLimit": "boom"}):
        with pytest.raises(ValueError):
            models.set_limits(bad)
    assert models.limits()["alertPct"] == 90  # inválido não grava nada


# ---- gasto ----

def _state_db():
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE sessions (id TEXT, started_at REAL, estimated_cost_usd REAL, actual_cost_usd REAL)")
    c.execute("CREATE TABLE session_model_usage (session_id TEXT, task TEXT, estimated_cost_usd REAL, input_tokens INT, output_tokens INT, api_call_count INT)")
    return c


def test_spend_today_month_and_aux():
    from ops_center.models import spend

    now = datetime(2026, 10, 8, 15, 0)
    at = lambda d, h=12: datetime(2026, 10, d, h).timestamp()  # noqa: E731
    c = _state_db()
    c.executemany("INSERT INTO sessions VALUES(?,?,?,?)", [
        ("a", at(8, 9), 1.0, None), ("b", at(8, 10), 9.0, 2.5),  # hoje: 1,0 estimado + 2,5 real
        ("c", at(2), 4.0, 0),                                   # só no mês
        ("d", datetime(2026, 9, 30, 23).timestamp(), 50.0, None),  # mês passado: fora
    ])
    c.executemany("INSERT INTO session_model_usage VALUES(?,?,?,?,?,?)", [
        ("a", "vision", 0.5, 100, 10, 1), ("c", "compression", 1.0, 100, 10, 1),
        ("a", "", 7.0, 100, 10, 1),  # uso principal já está em sessions: não soma de novo
    ])
    assert spend(c, now) == {"today": 4.0, "month": 9.0, "dayOfMonth": 8, "daysInMonth": 31}
    # state.db sem a tabela de uso por chamada (versão antiga) ainda soma as sessões.
    c.execute("DROP TABLE session_model_usage")
    assert spend(c, now)["today"] == 3.5


def test_measured_tokens_needs_enough_calls():
    from ops_center.models import measured_tokens, task_meta

    c = _state_db()
    c.execute("INSERT INTO session_model_usage VALUES('a','vision',0,5000,1000,5)")
    c.execute("INSERT INTO session_model_usage VALUES('a','compression',0,900,90,2)")  # poucas chamadas
    m = measured_tokens(c)
    assert m == {"vision": (1000, 200)}
    meta = task_meta(m)
    assert meta["vision"] == {"unit": "mil imagens", "tokensIn": 1000, "tokensOut": 200, "measured": True}
    assert meta["compaction"]["measured"] is False and meta["compaction"]["tokensIn"] == 8000


# ---- teste de conexão ----

def test_probe_ok_unauthorized_unreachable_and_no_models(provider_server):
    from ops_center.models import probe

    srv, url = provider_server
    r = probe(url, GOOD)
    assert r["ok"] and r["models"] == MODELS and r["latencyMs"] >= 0
    bad = probe(url, "sk-errada")
    assert bad["ok"] is False and bad["code"] == "unauthorized" and "401" in bad["message"]
    srv.models = []
    assert probe(url, GOOD)["code"] == "no_models"
    dead = probe("http://127.0.0.1:1/v1", GOOD, timeout=2)
    assert dead["ok"] is False and dead["code"] == "unreachable"
    assert probe("ftp://x/y", GOOD)["code"] == "unreachable"
    assert probe("localhost", GOOD)["code"] == "unreachable"  # sem esquema
    # Rota que não existe (404) não é uma API compatível: erro de endereço, não de chave.
    assert probe(url.replace("/v1", "/v9"), GOOD)["code"] == "unreachable"
    # Provedor de decisão: sem /models mas respondendo, vale como alcançável.
    d = probe(url.replace("/v1", "/v9"), GOOD, kind="decision")
    assert d["ok"] and d["models"] == []
    assert probe(url, "sk-errada", kind="decision")["code"] == "unauthorized"  # chave recusada nunca vale


# ---- capacidade ----

def test_capability_error():
    from ops_center.models import capability_error

    text = {"id": "t", "caps": ["text"], "capsKnown": True}
    vis = {"id": "v", "caps": ["text", "vision"], "capsKnown": True}
    unknown = {"id": "u", "caps": ["text"], "capsKnown": False}
    stt = {"id": "w", "caps": ["audio"], "capsKnown": True}
    jev = {"id": "jev-latest", "caps": ["decision"], "capsKnown": True}
    assert capability_error("vision", vis) is None
    assert capability_error("vision", text) == "t não lê imagens"
    assert capability_error("vision", unknown) is None  # catálogo não sabe: não bloqueia
    assert capability_error("vision", None) is None
    assert capability_error("main", stt) == "w não gera texto"
    assert capability_error("scheduled", vis) is None
    assert capability_error("transcription", stt) is None
    assert capability_error("transcription", text) == "t não ouve áudio"
    assert capability_error("transcription", unknown) == "u não ouve áudio"  # áudio exige modelo conhecido
    assert capability_error("triage_jev", jev) is None
    assert capability_error("triage_jev", text) == "t não é um modelo de decisão"


# ---- provedores e mapa tarefa → chave nativa ----

NATIVE = [
    {"id": "groq", "name": "Groq", "kind": "builtin", "baseUrl": "", "editable": False, "keyHint": "", "status": "ok", "error": None,
     "checkedAt": None, "models": [{"id": "llama-3.1-8b-instant", "caps": ["text"], "capsKnown": True, "priceIn": 0.05, "priceOut": 0.08, "pricePerMin": None, "context": None}]
     + [{"id": m, "caps": ["audio"], "capsKnown": True, "priceIn": None, "priceOut": None, "pricePerMin": 0.0007, "context": None}
        for m in ("whisper-large-v3-turbo", "whisper-large-v3")]},
]


@pytest.fixture
def fake_models(provider_server, monkeypatch):
    """Provedor próprio de verdade (servidor local) + um nativo; a escolha do padrão não sai para a rede."""
    from ops_center import models

    monkeypatch.setattr(models, "_builtin_providers", lambda cfg, st: [dict(p) for p in NATIVE])
    calls = []

    def set_default(provider, model):
        calls.append((provider, model))
        from hermes_cli.config import load_config, save_config

        cfg = load_config()
        cfg["model"] = {**(cfg["model"] if isinstance(cfg.get("model"), dict) else {}), "provider": provider, "default": model}
        save_config(cfg)

    monkeypatch.setattr(models, "_set_default", set_default)
    srv, url = provider_server
    p = models.create_provider("Together AI", url, GOOD)
    return models, p, calls


def test_create_provider_requires_working_test_and_never_returns_key(fake_models, _home, provider_server):
    models, p, _ = fake_models
    _, url = provider_server
    assert p["id"] == "custom:together-ai" and p["name"] == "Together AI" and p["kind"] == "openai" and p["baseUrl"] == url
    assert p["keyHint"] == "…abcd" and p["status"] == "ok"
    assert [m["id"] for m in p["models"]] == MODELS
    # A chave foi para o .env do perfil (key_env), nunca para o config.yaml nem para a resposta.
    entry = _cfg(_home)["providers"]["together-ai"]
    assert entry["key_env"] in (_home / ".env").read_text(encoding="utf-8") and GOOD in (_home / ".env").read_text(encoding="utf-8")
    assert GOOD not in (_home / "config.yaml").read_text(encoding="utf-8")
    assert "api_key" not in entry
    assert GOOD not in json.dumps(models.providers()) and GOOD not in json.dumps(p)
    # Chave errada: nada é gravado.
    with pytest.raises(ValueError, match="401"):
        models.create_provider("Outro", url, "sk-errada")
    with pytest.raises(ValueError, match="já existe"):
        models.create_provider("together ai", url, GOOD)
    with pytest.raises(ValueError):
        models.create_provider("Sem chave", url, "")
    assert [x["id"] for x in models.providers() if x["kind"] == "openai"] == ["custom:together-ai"]


def test_routing_maps_each_task_to_its_native_key(fake_models, _home):
    models, p, calls = fake_models
    plan = models.validate_routing({
        "default": {"provider": "custom:together-ai", "model": "alpha-1"},
        "tasks": {
            "vision": {"provider": "custom:together-ai", "model": "vision-x"},
            "compaction": {"provider": "groq", "model": "llama-3.1-8b-instant"},
            "transcription": {"provider": "groq", "model": "whisper-large-v3"},
            "scheduled": {"provider": "groq", "model": "llama-3.1-8b-instant"},
            "group_analysis": {"provider": "custom:together-ai", "model": "alpha-1"},
            "main": {"provider": "groq", "model": "llama-3.1-8b-instant"},
            "channel.whatsapp": {"provider": "custom:together-ai", "model": "alpha-1"},
        }}, models.providers())
    r = models.apply_routing(plan)
    assert calls == [("custom:together-ai", "alpha-1")]
    cfg = _cfg(_home)
    assert cfg["model"]["provider"] == "custom:together-ai" and cfg["model"]["default"] == "alpha-1"
    assert (cfg["auxiliary"]["vision"]["provider"], cfg["auxiliary"]["vision"]["model"]) == ("custom:together-ai", "vision-x")
    assert (cfg["auxiliary"]["compression"]["provider"], cfg["auxiliary"]["compression"]["model"]) == ("groq", "llama-3.1-8b-instant")
    assert cfg["stt"]["provider"] == "groq" and cfg["stt"]["groq"]["model"] == "whisper-large-v3"
    assert (cfg["cron"]["model_provider"], cfg["cron"]["model"]) == ("groq", "llama-3.1-8b-instant")
    # Sem chave nativa: ops.db.
    from ops_center import store

    assert store.get_meta("models.group_analysis") == {"provider": "custom:together-ai", "model": "alpha-1"}
    assert store.get_meta("models.tasks")["main"]["provider"] == "groq"
    # Leitura devolve o mesmo que foi gravado; o resto herda.
    t = r["tasks"]
    assert r["default"] == {"provider": "custom:together-ai", "model": "alpha-1"}
    assert t["vision"] == {"provider": "custom:together-ai", "model": "vision-x"}
    assert t["compaction"] == {"provider": "groq", "model": "llama-3.1-8b-instant"}
    assert t["transcription"] == {"provider": "groq", "model": "whisper-large-v3", "language": "pt"}
    assert t["scheduled"] == {"provider": "groq", "model": "llama-3.1-8b-instant"}
    assert t["group_analysis"] == {"provider": "custom:together-ai", "model": "alpha-1"}
    assert t["main"] == {"provider": "groq", "model": "llama-3.1-8b-instant"}
    assert t["channel.telegram"] == {"inherit": True} and t["channel.api"] == {"inherit": True}
    # A herança dos canais segue a conversa principal, e a conversa principal segue o padrão.
    assert models.resolved_model("channel.telegram", r) == {"provider": "groq", "model": "llama-3.1-8b-instant"}
    assert models.resolved_model("channel.whatsapp", r) == {"provider": "custom:together-ai", "model": "alpha-1"}
    # A função que o listen usa para a análise dos grupos.
    g = models.group_analysis_model()
    assert g == {"provider": "custom:together-ai", "model": "alpha-1", "base_url": p["baseUrl"]}

    # Voltar a herdar limpa as chaves nativas.
    models.apply_routing(models.validate_routing({"tasks": {k: {"inherit": True} for k in
                         ("vision", "compaction", "transcription", "scheduled", "group_analysis", "main")}}, models.providers()))
    cfg = _cfg(_home)
    assert cfg["auxiliary"]["vision"]["provider"] == "auto" and not cfg["auxiliary"]["vision"].get("model")
    assert cfg["auxiliary"]["compression"]["provider"] == "auto"
    assert "provider" not in cfg.get("stt", {})
    assert not cfg["cron"].get("model") and not cfg["cron"].get("model_provider")
    assert models.group_analysis_model() is None
    assert models.routing()["tasks"]["main"] == {"inherit": True}
    assert models.resolved_model("channel.api") == {"provider": "custom:together-ai", "model": "alpha-1"}  # voltou ao padrão


def test_default_uses_the_native_main_model_assignment(provider_server, _home, monkeypatch):
    """Sem atalho: o padrão passa pelo mesmo caminho do ``/api/model/set`` (provedor próprio, modelo e chave por ``key_env``)."""
    from ops_center import models

    monkeypatch.setattr(models, "_builtin_providers", lambda cfg, st: [])
    srv, url = provider_server
    models.create_provider("Together AI", url, GOOD)
    r = models.apply_routing(models.validate_routing({"default": {"provider": "custom:together-ai", "model": "alpha-1"}}, models.providers()))
    m = _cfg(_home)["model"]
    assert m["default"] == "alpha-1" and m["provider"].endswith("together-ai") and m.get("key_env") and "api_key" not in m
    assert GOOD not in (_home / "config.yaml").read_text(encoding="utf-8")
    assert r["default"] == {"provider": "custom:together-ai", "model": "alpha-1"}


def test_stt_provider_with_key_but_outside_the_chat_catalog_still_offers_audio_models(_home, monkeypatch):
    from ops_center import models

    monkeypatch.setattr(models, "_builtin_providers", lambda cfg, st: [])
    assert models.providers() == []
    _home.mkdir(parents=True, exist_ok=True)
    (_home / ".env").write_text("GROQ_API_KEY=gsk_abcdefgh1234\n", encoding="utf-8")
    p = models.providers()
    assert [x["id"] for x in p] == ["groq"] and p[0]["kind"] == "builtin" and p[0]["editable"] is False
    assert [(m["id"], m["caps"]) for m in p[0]["models"]] == [("whisper-large-v3-turbo", ["audio"]), ("whisper-large-v3", ["audio"])]
    assert "gsk_abcdefgh1234" not in json.dumps(p)
    plan = models.validate_routing({"tasks": {"transcription": {"provider": "groq", "model": "whisper-large-v3"}}}, p)
    assert plan["tasks"]["transcription"] == {"provider": "groq", "model": "whisper-large-v3"}


def test_real_builtin_catalog_never_raises_and_carries_prices(_home, monkeypatch):
    """Sem atalho: o catálogo nativo vem do cache (sem rede) e traz capacidades e preço quando conhece o modelo."""
    from ops_center import models

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test-1234567890")
    rows = models._builtin_providers({}, {})
    assert all(r["kind"] == "builtin" and r["editable"] is False and r["keyHint"] == "" for r in rows)
    for r in rows:
        for m in r["models"]:
            assert m["caps"] and isinstance(m["capsKnown"], bool)


def test_triage_goes_to_listen_settings(fake_models, provider_server):
    models, _, _ = fake_models
    from ops_center import store

    srv, url = provider_server
    # Sem o Jev configurado a triagem está desligada (sem modelo) e não herda.
    assert models.routing()["tasks"]["triage_jev"]["provider"] == ""
    with pytest.raises(ValueError, match="não herda"):
        models.validate_routing({"tasks": {"triage_jev": {"inherit": True}}}, models.providers())
    ts = models.create_provider("TypeSafe", url, GOOD, kind="decision")
    assert ts["id"] == "typesafe" and ts["kind"] == "decision" and ts["models"][0]["caps"] == ["decision"]
    assert store.listen_settings()["triage"]["base_url"] == url
    plan = models.validate_routing({"tasks": {"triage_jev": {"provider": "typesafe", "model": "jev-latest", "minConfidence": 0.85}}}, models.providers())
    r = models.apply_routing(plan)
    assert r["tasks"]["triage_jev"] == {"provider": "typesafe", "model": "jev-latest", "minConfidence": 0.85}
    assert store.listen_settings()["min_confidence"] == 0.85 and store.listen_settings()["triage"]["model"] == "jev-latest"
    # Modelo de texto não serve à triagem (a decisão usa /decisions, não chat) e o Jev não serve ao resto.
    with pytest.raises(ValueError, match="decisão"):
        models.validate_routing({"tasks": {"triage_jev": {"provider": "groq", "model": "llama-3.1-8b-instant"}}}, models.providers())
    with pytest.raises(ValueError, match="só serve à triagem"):
        models.validate_routing({"tasks": {"vision": {"provider": "typesafe", "model": "jev-latest"}}}, models.providers())
    for bad in (0.99, 0.2, "x"):  # fora de 50–95%: recusado na validação, antes de gravar qualquer coisa
        with pytest.raises(ValueError, match="confiança"):
            models.validate_routing({"tasks": {"triage_jev": {"provider": "typesafe", "model": "jev-latest", "minConfidence": bad}}}, models.providers())
    assert store.listen_settings()["min_confidence"] == 0.85
    # Remover o Jev desliga a triagem e apaga a chave.
    assert models.delete_provider("typesafe")["affected"] == ["triage_jev"]
    assert store.listen_settings()["triage"]["base_url"] == "" and models.routing()["tasks"]["triage_jev"]["provider"] == ""


def test_capability_validation_in_routing(fake_models):
    models, _, _ = fake_models
    plist = models.providers()
    v = models.validate_routing
    with pytest.raises(ValueError, match="não lê imagens"):  # groq/llama é texto e o catálogo sabe disso
        v({"tasks": {"vision": {"provider": "groq", "model": "llama-3.1-8b-instant"}}}, plist)
    with pytest.raises(ValueError, match="não gera texto"):  # modelo de áudio como conversa
        v({"default": {"provider": "groq", "model": "whisper-large-v3-turbo"}}, plist)
    with pytest.raises(ValueError, match="não ouve áudio"):
        v({"tasks": {"transcription": {"provider": "groq", "model": "llama-3.1-8b-instant"}}}, plist)
    with pytest.raises(ValueError, match="não oferece transcrição"):  # provedor próprio não é STT do Hermes
        v({"tasks": {"transcription": {"provider": "custom:together-ai", "model": "whisper-z"}}}, plist)
    with pytest.raises(ValueError, match="não está entre os provedores conectados"):
        v({"default": {"provider": "nous", "model": "hermes-4"}}, plist)
    with pytest.raises(ValueError, match="tarefa desconhecida"):
        v({"tasks": {"nada": {"inherit": True}}}, plist)
    with pytest.raises(ValueError, match="obrigatórios"):
        v({"tasks": {"vision": {"provider": "groq"}}}, plist)
    # Modelo sem metadados no catálogo (provedor próprio) passa em visão: o catálogo não sabe, não bloqueia.
    ok = v({"tasks": {"vision": {"provider": "custom:together-ai", "model": "alpha-1"}}}, plist)
    assert ok["tasks"]["vision"] == {"provider": "custom:together-ai", "model": "alpha-1"}


def test_update_test_and_delete_provider(fake_models, _home, provider_server):
    models, p, _ = fake_models
    from ops_center import store

    srv, url = provider_server
    # Testar um provedor salvo: ok e atualiza os modelos que o provedor passou a oferecer.
    srv.models = MODELS + ["novo-2"]
    r = models.test_provider("custom:together-ai")
    assert r["ok"] and "novo-2" in r["models"]
    assert "novo-2" in [m["id"] for m in models.get_provider("custom:together-ai")["models"]]
    # Trocar a chave exige teste ok; a errada não grava nem mexe na boa.
    with pytest.raises(ValueError, match="401"):
        models.update_provider("custom:together-ai", api_key="sk-errada")
    assert models.test_provider("custom:together-ai")["ok"]
    # Chave que o provedor passa a recusar: o estado vira "com problema" e guarda desde quando.
    env = _home / ".env"
    env.write_text(env.read_text(encoding="utf-8").replace(GOOD, "sk-revogada-9999"), encoding="utf-8")
    bad = models.test_provider("custom:together-ai")
    assert bad["code"] == "unauthorized"
    got = models.get_provider("custom:together-ai")
    assert got["status"] == "error" and got["error"]["code"] == "unauthorized" and got["error"]["since"] > 0
    since = got["error"]["since"]
    models.test_provider("custom:together-ai")
    assert models.get_provider("custom:together-ai")["error"]["since"] == since  # continua o mesmo problema
    fixed = models.update_provider("custom:together-ai", name="Together", api_key=GOOD)
    assert fixed["name"] == "Together" and fixed["status"] == "ok" and fixed["keyHint"] == "…abcd"
    assert store.get_meta("models.provider_status") == {}
    # Remover: apaga a chave e devolve quem o usava ao padrão.
    models.apply_routing(models.validate_routing({"default": {"provider": "groq", "model": "llama-3.1-8b-instant"}, "tasks": {
        "vision": {"provider": "custom:together-ai", "model": "alpha-1"}, "group_analysis": {"provider": "custom:together-ai", "model": "alpha-1"}}},
        models.providers()))
    out = models.delete_provider("custom:together-ai")
    assert out["ok"] and set(out["affected"]) == {"vision", "group_analysis"}
    assert "providers" not in _cfg(_home) or "together-ai" not in _cfg(_home)["providers"]
    assert "HERMES_CUSTOM" not in (env.read_text(encoding="utf-8") if env.exists() else "")
    assert models.routing()["tasks"]["vision"] == {"inherit": True} and models.group_analysis_model() is None
    with pytest.raises(KeyError):
        models.delete_provider("custom:together-ai")
    with pytest.raises(ValueError, match="nativo"):
        models.test_provider("groq")


def test_removing_the_default_provider_empties_the_default(fake_models, _home):
    models, p, _ = fake_models
    models.apply_routing(models.validate_routing({"default": {"provider": "custom:together-ai", "model": "alpha-1"}}, models.providers()))
    assert models.routing()["default"] == {"provider": "custom:together-ai", "model": "alpha-1"}
    out = models.delete_provider("custom:together-ai")
    assert out["affected"][0] == "default"
    assert models.routing()["default"] is None
    assert models.resolved_model("main") is None  # tarefas que herdam o padrão ficam sem modelo
