"""``/api/ops/profiles``: agregado de perfis do painel Aurora (lista, cor/ícone, criar/clonar, editar)."""

import json
import sqlite3
import time

import pytest


@pytest.fixture
def client(tmp_path, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from hermes_cli import profiles as profiles_mod
    from hermes_cli.web_routers import ops_profiles
    from hermes_cli.web_routers.ops_center import router as center

    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))
    # Nunca tocar o ~/.local/bin real (atalhos) nem baixar skills; a raiz de perfis fica no tmp_path (assert abaixo).
    monkeypatch.setattr(profiles_mod, "create_wrapper_script", lambda *a, **k: None)
    monkeypatch.setattr(profiles_mod, "check_alias_collision", lambda *a, **k: True)
    monkeypatch.setattr(profiles_mod, "seed_profile_skills", lambda *a, **k: None)
    assert tmp_path in profiles_mod._get_profiles_root().parents
    app = FastAPI()
    app.include_router(ops_profiles.router)
    app.include_router(center)
    return TestClient(app)


def _make(name, **kw):
    from hermes_cli.profiles import create_profile, get_profile_dir

    create_profile(name, no_skills=True, **kw)
    return get_profile_dir(name)


def _by_id(client):
    return {p["id"]: p for p in client.get("/api/ops/profiles").json()}


def test_slug_and_unique_id():
    from hermes_cli.web_routers.ops_profiles import slugify, unique_id

    assert slugify("Padaria do Zé!") == "padaria-do-ze"
    assert slugify("  Ótica   Visão ") == "otica-visao"
    assert slugify("???") == "perfil"
    assert unique_id("Aibiz", set()) == "aibiz"
    assert unique_id("Aibiz", {"aibiz"}) == "aibiz-2"
    assert unique_id("Aibiz", {"aibiz", "aibiz-2"}) == "aibiz-3"


def test_list_defaults_and_groups(client):
    _make("aibiz")
    _make("cli-padaria-sol")
    _make("outro")
    got = _by_id(client)
    assert set(got) == {"default", "aibiz", "cli-padaria-sol", "outro"}
    d = got["default"]
    assert d["name"] == "Pessoal" and d["isDefault"] is True and d["group"] is None
    assert (d["color"], d["icon"]) == ("violeta", "user")
    assert d["status"] == "ok" and d["channels"] == [] and d["canPause"] is False
    assert d["usageToday"] == {"msgs": 0, "costUsd": 0.0}
    assert (got["aibiz"]["color"], got["aibiz"]["icon"]) == ("coral", "message-circle")
    assert got["aibiz"]["isDefault"] is False and got["aibiz"]["canPause"] is True
    assert got["aibiz"]["name"] == "Aibiz"  # sem nome de exibição: o id com a inicial maiúscula
    assert got["cli-padaria-sol"]["group"] == "copiloto"
    assert (got["outro"]["color"], got["outro"]["icon"]) == ("violeta", "user")


def test_patch_look_name_desc_and_validation(client):
    home = _make("aibiz")
    r = client.patch("/api/ops/profiles/aibiz", json={"color": "lima", "icon": "store"})
    assert r.status_code == 200 and (r.json()["color"], r.json()["icon"]) == ("lima", "store")
    assert json.loads((home / "aurora.json").read_text(encoding="utf-8")) == {"color": "lima", "icon": "store"}

    assert client.patch("/api/ops/profiles/aibiz", json={"color": "#fff"}).status_code == 400
    assert client.patch("/api/ops/profiles/aibiz", json={"icon": "rocket"}).status_code == 400
    assert client.patch("/api/ops/profiles/aibiz", json={"name": "   "}).status_code == 400
    assert client.patch("/api/ops/profiles/aibiz", json={"name": "x" * 41}).status_code == 400
    assert client.patch("/api/ops/profiles/aibiz", json={"desc": "x" * 81}).status_code == 400
    assert client.patch("/api/ops/profiles/nao-existe", json={"color": "azul"}).status_code == 404

    # renomear muda só o nome de exibição: a pasta (id) fica
    r = client.patch("/api/ops/profiles/aibiz", json={"name": "Aibiz SaaS", "desc": "Atendimento por WhatsApp"}).json()
    assert r["id"] == "aibiz" and r["name"] == "Aibiz SaaS" and r["desc"] == "Atendimento por WhatsApp"
    assert home.is_dir() and (home / "aurora.json").is_file()
    _make("outro")
    assert client.patch("/api/ops/profiles/outro", json={"name": "aibiz saas"}).status_code == 409  # sem diferenciar maiúsculas
    assert client.patch("/api/ops/profiles/default", json={"name": "Pessoal"}).status_code == 200  # o próprio nome não conflita


def test_patch_is_logged_in_the_affected_profile_only(client):
    _make("aibiz")
    client.patch("/api/ops/profiles/aibiz", json={"color": "azul"})
    acts = client.get("/api/ops/activity?profile=aibiz").json()
    assert any("Editou este perfil" in a["action"] and "cor" in a["action"] for a in acts)
    assert client.get("/api/ops/activity").json() == []


def test_status_paused_and_global(client):
    from agent.estop import engage

    _make("aibiz")
    assert client.put("/api/ops/pause?profile=aibiz", json={"paused": True}).status_code == 200
    got = _by_id(client)
    assert got["aibiz"]["status"] == "paused" and got["aibiz"]["pausedBy"] == "profile"
    assert got["default"]["status"] == "ok"

    engage(reason="pausa geral")  # "Pausar tudo": todos pausam, ninguém "pausou sozinho"
    got = _by_id(client)
    assert got["default"]["status"] == "paused" and got["default"]["pausedBy"] == "all"
    client.put("/api/ops/pause?profile=aibiz", json={"paused": False})
    assert _by_id(client)["aibiz"]["pausedBy"] == "all"


def test_status_err_when_gateway_down_or_channel_failing(client, monkeypatch):
    from hermes_cli.web_routers import ops_profiles

    _make("aibiz")

    async def fake(pid):
        if pid == "aibiz":
            return [{"id": "whatsapp", "name": "WhatsApp", "enabled": True, "configured": True, "gateway_running": False}]
        return [
            {"id": "telegram", "name": "Telegram", "enabled": True, "configured": True, "gateway_running": True, "error_message": "token inválido"},
            {"id": "email", "name": "E-mail", "enabled": False, "configured": True, "gateway_running": True},
        ]

    monkeypatch.setattr(ops_profiles, "_platforms", fake)
    got = _by_id(client)
    assert got["aibiz"]["status"] == "err" and got["aibiz"]["issueKind"] == "gateway"
    assert got["aibiz"]["issue"] == "Gateway parado com 1 canal ligado" and got["aibiz"]["channels"] == ["whatsapp"]
    assert got["default"]["status"] == "err" and got["default"]["issueKind"] == "channel"
    assert got["default"]["issue"] == "Telegram: token inválido" and got["default"]["channels"] == ["telegram"]


def test_usage_today_reads_sessions(client):
    home = _make("aibiz")
    con = sqlite3.connect(home / "state.db")
    con.execute("CREATE TABLE sessions (started_at REAL, message_count INTEGER, actual_cost_usd REAL, estimated_cost_usd REAL)")
    now = time.time()
    con.executemany("INSERT INTO sessions VALUES (?,?,?,?)", [(now, 10, None, 0.25), (now, 5, 0.1, 9.0), (now - 3 * 86400, 99, 5.0, 5.0)])
    con.commit()
    con.close()
    assert _by_id(client)["aibiz"]["usageToday"] == {"msgs": 15, "costUsd": 0.35}


def test_create_fresh_profile(client):
    r = client.post("/api/ops/profiles", json={"name": "Padaria Sol", "desc": "Pedidos", "color": "ambar", "icon": "croissant"})
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["id"] == "padaria-sol" and p["name"] == "Padaria Sol" and p["desc"] == "Pedidos"
    assert (p["color"], p["icon"]) == ("ambar", "croissant") and p["status"] == "ok" and p["channels"] == []

    from hermes_cli.profiles import get_profile_dir

    assert (get_profile_dir("padaria-sol") / "aurora.json").is_file()
    assert any("Criou este perfil" in a["action"] for a in client.get("/api/ops/activity?profile=padaria-sol").json())
    # mesmo nome (sem diferenciar maiúsculas) → 409; mesmo id por outro nome → -2
    assert client.post("/api/ops/profiles", json={"name": "padaria sol"}).status_code == 409
    assert client.post("/api/ops/profiles", json={"name": "Padaria-Sol!"}).json()["id"] == "padaria-sol-2"
    assert client.post("/api/ops/profiles", json={"name": ""}).status_code == 400
    assert client.post("/api/ops/profiles", json={"name": "x", "color": "preto"}).status_code == 400
    assert client.post("/api/ops/profiles", json={"name": "x", "icon": "rocket"}).status_code == 400
    assert client.post("/api/ops/profiles", json={"name": "y", "copyFrom": "naoexiste"}).status_code == 404


def _seed_source():
    """Perfil de origem com tudo o que um clone poderia carregar: chave de API, canal, memória, skill, ferramentas."""
    import yaml

    from hermes_cli.profiles import get_profile_dir

    home = _make("origem")
    (home / ".env").write_text("OPENAI_API_KEY=sk-segredo\nTELEGRAM_BOT_TOKEN=123:abc\n", encoding="utf-8")
    (home / "memories").mkdir(exist_ok=True)
    (home / "memories" / "MEMORY.md").write_text("Prefere squash merge.", encoding="utf-8")
    (home / "skills" / "minha-skill").mkdir(parents=True, exist_ok=True)
    (home / "skills" / "minha-skill" / "SKILL.md").write_text("---\nname: minha-skill\n---\n", encoding="utf-8")
    cfg = {"model": {"default": "m", "provider": "p"}, "toolsets": ["web", "terminal"], "mcp_servers": {"x": {"command": "x"}}}
    (home / "config.yaml").write_text(yaml.safe_dump(cfg), encoding="utf-8")
    return get_profile_dir("origem")


def _cfg(home):
    import yaml

    return yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8")) or {}


def test_clone_copies_only_what_was_asked_and_never_keys_or_channels(client):
    from hermes_cli.profiles import get_profile_dir

    _seed_source()
    r = client.post("/api/ops/profiles", json={"name": "Tudo", "copyFrom": "origem", "copy": {"skills": True, "memory": True, "tools": True}})
    assert r.status_code == 200, r.text
    home = get_profile_dir("tudo")
    assert (home / "memories" / "MEMORY.md").read_text(encoding="utf-8") == "Prefere squash merge."
    assert (home / "skills" / "minha-skill" / "SKILL.md").is_file()
    assert _cfg(home)["toolsets"] == ["web", "terminal"] and "x" in _cfg(home)["mcp_servers"]
    env = (home / ".env").read_text(encoding="utf-8")
    assert "sk-segredo" not in env and "TELEGRAM_BOT_TOKEN" not in env  # chaves e canais: nunca

    r = client.post("/api/ops/profiles", json={"name": "Nada", "copyFrom": "origem", "copy": {"skills": False, "memory": False, "tools": False}})
    assert r.status_code == 200, r.text
    home = get_profile_dir("nada")
    assert not (home / "memories" / "MEMORY.md").exists()
    assert not (home / "skills" / "minha-skill").exists()
    cfg = _cfg(home)
    assert "toolsets" not in cfg and "mcp_servers" not in cfg
    assert "sk-segredo" not in (home / ".env").read_text(encoding="utf-8")
    # a origem não foi tocada
    src = get_profile_dir("origem")
    assert "sk-segredo" in (src / ".env").read_text(encoding="utf-8") and (src / "memories" / "MEMORY.md").exists()


def test_failed_finish_rolls_back(client, monkeypatch):
    from hermes_cli.profiles import profile_exists
    from hermes_cli.web_routers import ops_profiles

    def boom(*a, **k):
        raise OSError("disco cheio")

    monkeypatch.setattr(ops_profiles, "_write_look", boom)
    r = client.post("/api/ops/profiles", json={"name": "Quebrado"})
    assert r.status_code == 500 and "Nada foi criado" in r.json()["detail"]
    assert not profile_exists("quebrado")
