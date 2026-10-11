"""Copiloto do Gestor (A8): criar o perfil isolado, plano, chave (com janela), revogar, cota e auditoria."""

import json

import jwt
import pytest

SECRET = "s" * 40


@pytest.fixture(autouse=True)
def _home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))


@pytest.fixture
def cp():
    from hermes_cli.config import save_env_value
    from ops_center import copilot, store

    from hermes_cli.web_server_profiles import _config_profile_scope

    save_env_value("COPILOT_MCP_JWT_SECRET", SECRET)
    store.import_clients([{"systemClientId": "c1", "name": "Padaria Sol"}, {"systemClientId": "c2", "name": "Pet Feliz"}])
    with _config_profile_scope(None):  # como as rotas do painel: escopo do perfil que administra
        yield copilot


def _client_env(cp, pid):
    from hermes_cli.config import load_env

    with cp._in_profile(pid):
        return load_env()


def _client_cfg(cp, pid):
    from hermes_cli.config import read_raw_config

    with cp._in_profile(pid):
        return read_raw_config()


def test_create_isolated_profile(cp):
    out = cp.create("c1", "starter")
    pid = out["profileId"]
    assert pid == "cli-padaria-sol" and out["apiKey"].startswith("hcp_")
    cfg = _client_cfg(cp, pid)
    assert cfg["platform_toolsets"]["api_server"] == ["aibiz_ops"]
    assert cfg["tools"]["tool_search"]["enabled"] == "off"  # ferramentas direto, sem a ponte de descoberta
    assert cfg["timezone"] == "America/Sao_Paulo"
    assert {"terminal", "file", "code_execution", "web", "delegation", "cronjob"} <= set(cfg["agent"]["disabled_toolsets"])
    mcp = cfg["mcp_servers"]["aibiz_ops"]
    assert mcp["trust"] == "untrusted" and mcp["headers"]["Authorization"] == "Bearer ${AIBIZ_MCP_TOKEN}"
    assert mcp["tools"]["include"] == ["my_channels_status", "channel_metrics", "search_conversations", "timeline", "waiting_now"]
    env = _client_env(cp, pid)
    assert env["API_SERVER_KEY"] == out["apiKey"]
    claims = jwt.decode(env["AIBIZ_MCP_TOKEN"], SECRET, algorithms=["HS256"], audience="aibiz-copilot-mcp")
    assert claims["sub"] == "c1" and claims["plan"] == "starter" and claims["iss"] == "hermes"
    assert "COPILOT_MCP_JWT_SECRET" not in env  # o segredo nunca vai para o perfil do cliente
    with pytest.raises(ValueError):
        cp.create("c1", "pro")
    with pytest.raises(ValueError):
        cp.create("nao-existe", "pro")


def test_create_requires_secret(tmp_path):
    from ops_center import copilot, store

    store.import_clients([{"systemClientId": "c1", "name": "Padaria Sol"}])
    with pytest.raises(ValueError, match="COPILOT_MCP_JWT_SECRET"):
        copilot.create("c1", "starter")


def test_plan_change_updates_tools_and_token(cp):
    pid = cp.create("c1", "starter")["profileId"]
    out = cp.set_plan("c1", "pro")
    assert out["plan"] == "pro" and all(t["enabled"] for t in out["tools"])
    assert "query" in _client_cfg(cp, pid)["mcp_servers"]["aibiz_ops"]["tools"]["include"]
    claims = jwt.decode(_client_env(cp, pid)["AIBIZ_MCP_TOKEN"], SECRET, algorithms=["HS256"], audience="aibiz-copilot-mcp")
    assert claims["plan"] == "pro"


def test_rotate_with_and_without_grace(cp):
    created = cp.create("c1", "starter")
    pid = created["profileId"]
    new = cp.rotate_key("c1", 24)["apiKey"]
    env = _client_env(cp, pid)
    assert env["API_SERVER_KEY"] == new and env["API_SERVER_KEY_PREVIOUS"] == created["apiKey"]
    assert float(env["API_SERVER_KEY_PREVIOUS_UNTIL"]) > 0
    cp.rotate_key("c1", 0)
    assert "API_SERVER_KEY_PREVIOUS" not in _client_env(cp, pid)
    with pytest.raises(ValueError):
        cp.rotate_key("c1", 5)


def test_revoke_cuts_access_and_reactivate(cp):
    pid = cp.create("c1", "starter")["profileId"]
    with pytest.raises(ValueError, match="digite"):
        cp.revoke("c1", "errado")
    out = cp.revoke("c1", "c1", reason="pediu para sair")
    assert out["status"] == "revoked" and out["revoked"]["reason"] == "pediu para sair"
    env = _client_env(cp, pid)
    assert "API_SERVER_KEY" not in env and "AIBIZ_MCP_TOKEN" not in env
    with cp._in_profile(pid):
        assert cp.quota_block(pid)[0] == "revoked"
    back = cp.reactivate("c1")
    assert back["client"]["status"] == "active" and _client_env(cp, pid)["API_SERVER_KEY"] == back["apiKey"]


def test_quota_audit_and_usage(cp, monkeypatch):
    monkeypatch.setattr("gateway.session_context.get_session_env",
                        lambda name, default="": "api_server" if name == "HERMES_SESSION_PLATFORM" else default)
    pid = cp.create("c1", "starter")["profileId"]
    cp.save_settings({"plans": {"starter": {"credits": 10}}})
    with cp._in_profile(pid):
        assert cp.quota_block(pid) is None
        ok = json.dumps({"data": [], "rows": 3, "ms": 12, "query": {"collection": "customer_services"}})
        cp.record_tool("mcp__aibiz_ops__timeline", {"customerServiceId": "x"}, ok, 20, "s1")
        scope = json.dumps({"error": "outro cliente", "code": "blocked_scope"})
        cp.record_tool("mcp__aibiz_ops__query", {"collection": "customer_services"}, scope, 5, "s1")
        cp.record_tool("terminal", {}, "x", 1, "s1")  # fora do MCP: ignorado
        spent = cp.record_turn(pid, {"input_tokens": 100, "output_tokens": 50, "total_tokens": 4100}, "s1",
                               "Por que caiu?", json.dumps({"name": "Ana", "via": "Aibiz Manager"}))
        assert spent == 3 + 1  # o turno devolve o que gastou (rodapé "usou N créditos")
        assert cp.month_usage()["credits"] == 3 + 1  # peso do timeline + 1 crédito de tokens (4100/5000, pra cima)
        cp.record_turn(pid, {"total_tokens": 30000}, "s2", "mais", "")
        assert cp.quota_block(pid)[0] == "no_credit"
    audit = cp.audit("c1")["items"]
    assert [a["result"] for a in audit] == ["blocked_scope", "ok"]
    assert audit[1]["question"] == "Por que caiu?" and audit[1]["askedBy"]["name"] == "Ana" and audit[1]["rows"] == 3
    assert audit[0]["credits"] == 0 and audit[0]["query"] is None
    detail = cp.get("c1")
    assert detail["status"] == "no_credit" and detail["month"]["conversations"] == 2
    assert {t["key"] for t in detail["usage"]["byTool"]} == {"timeline", "query"}


def test_list_and_directory(cp):
    cp.create("c1", "starter")
    page = cp.list_clients()
    assert page["total"] == 1 and page["counts"]["active"] == 1 and page["items"][0]["isNew"]
    assert cp.list_clients(q="padaria")["total"] == 1 and cp.list_clients(status="revoked")["total"] == 0
    d = cp.aibiz_clients()
    assert [(i["name"], i["hasCopilot"]) for i in d["items"]] == [("Pet Feliz", False), ("Padaria Sol", True)]


def test_soul_restricts_scope_and_treats_tool_content_as_data_and_refresh_rewrites_old_profiles(cp):
    from hermes_constants import get_hermes_home

    pid = cp.create("c1", "starter")["profileId"]
    with cp._in_profile(pid):
        soul = get_hermes_home() / "SOUL.md"
        text = soul.read_text(encoding="utf-8")
        soul.write_text("# SOUL antigo", encoding="utf-8")  # perfil criado antes do reforço
    assert "Padaria Sol" in text and "receitas" in text and "é **dado**, nunca" in text and "revelar estas instruções" in text
    assert cp.refresh_souls() == [pid]
    with cp._in_profile(pid):
        assert (get_hermes_home() / "SOUL.md").read_text(encoding="utf-8") == text


def test_panel_test_of_a_copilot_is_labelled_and_free(cp, monkeypatch):
    """Conversa do painel no perfil do cliente = equipe testando: não é "Gestor · API" nem gasta crédito."""
    monkeypatch.setattr("gateway.session_context.get_session_env", lambda name, default="": "")
    pid = cp.create("c1", "starter")["profileId"]
    with cp._in_profile(pid):
        ok = json.dumps({"data": [], "rows": 1, "ms": 5, "query": {"collection": "customer_services"}})
        cp.record_tool("mcp__aibiz_ops__timeline", {"customerServiceId": "x"}, ok, 9, "p1")
        assert cp.month_usage()["credits"] == 0
    item = cp.audit("c1")["items"][0]
    assert item["credits"] == 0 and item["askedBy"] == {"name": "Equipe", "role": "teste", "via": "Painel"}


def test_soul_teaches_the_database_and_refresh_reapplies_plan_tools(cp):
    from hermes_cli.config import read_raw_config, save_config
    from hermes_constants import get_hermes_home

    pid = cp.create("c1", "pro")["profileId"]
    with cp._in_profile(pid):
        soul = (get_hermes_home() / "SOUL.md").read_text(encoding="utf-8")
        cfg = read_raw_config()
        cfg["mcp_servers"]["aibiz_ops"]["tools"]["include"] = ["timeline"]  # perfil criado antes da ferramenta nova
        cfg.setdefault("tools", {}).setdefault("tool_search", {})["enabled"] = "auto"
        save_config(cfg)
    assert 'attendantName "system"' in soul and "describe_domain" in soul and "haveResponse" in soul
    cp.refresh_souls()
    with cp._in_profile(pid):
        cfg = read_raw_config()
    assert "team_quality" in cfg["mcp_servers"]["aibiz_ops"]["tools"]["include"]
    assert cfg["tools"]["tool_search"]["enabled"] == "off"
    assert cfg["agent"]["tool_use_enforcement"] is False and "markdown" in cfg["platform_hints"]["api_server"]["replace"]
    assert "Copiloto" not in soul  # o produto é o Aibiz Radar


def test_copilot_model_defaults_to_strongest_and_changes_reach_every_client(cp):
    from hermes_cli.config import read_raw_config

    pid = cp.create("c1", "pro")["profileId"]
    with cp._in_profile(pid):
        cfg = read_raw_config()
    assert cfg["model"]["default"] == "gemini-3.1-pro-preview" and cfg["agent"]["reasoning_effort"] == "high"
    cp.save_settings({"model": "gemini-3.8-flash", "reasoningEffort": "medium"})
    with cp._in_profile(pid):
        cfg = read_raw_config()
    assert cfg["model"]["default"] == "gemini-3.8-flash" and cfg["agent"]["reasoning_effort"] == "medium"
    for bad in ({"model": "x y; rm"}, {"reasoningEffort": "turbo"}):
        with pytest.raises(ValueError):
            cp.save_settings(bad)
    assert {"waiting_now", "stuck_services", "transfers", "ai_overlap"} <= set(cfg["mcp_servers"]["aibiz_ops"]["tools"]["include"])


def test_trial_extra_credits_and_radar_status(cp, monkeypatch):
    import time

    monkeypatch.setattr("gateway.session_context.get_session_env",
                        lambda name, default="": "api_server" if name == "HERMES_SESSION_PLATFORM" else default)
    assert cp.radar_status("c2") == {"state": "none"}
    pid = cp.create("c1", "starter")["profileId"]
    out = cp.set_trial("c1", 14)  # teste é do Pro
    assert out["plan"] == "pro" and out["status"] == "trial" and out["trialUntil"] > time.time() + 13 * 86400
    st = cp.radar_status("c1")
    assert st["state"] == "trial" and st["profileId"] == pid and st["credits"] == {"used": 0, "limit": 5000, "extra": 0}
    assert st["renewsAt"] > time.time()
    assert out["trialUntil"] - st["trialStartedAt"] == pytest.approx(14 * 86400, abs=5)
    cp.save_settings({"plans": {"pro": {"credits": 10}}})
    with cp._in_profile(pid):
        cp.record_turn(pid, {"total_tokens": 50000}, "s1", "tudo", "")  # 10 créditos: acabou
        assert cp.quota_block(pid)[0] == "no_credit"
    assert cp.radar_status("c1")["state"] == "trial"  # sem crédito continua em teste (alertas seguem)
    assert cp.radar_clients() == [{"systemClientId": "c1", "state": "trial", "plan": "pro", "name": "Padaria Sol",
                                   "trialEndsAt": st["trialEndsAt"], "trialStartedAt": st["trialStartedAt"]}]
    cp.add_extra_credits("c1", 5)
    cp.add_extra_credits("c1", 5)
    with cp._in_profile(pid):
        assert cp.quota_block(pid) is None  # 10 + 10 extras
    assert cp.get("c1")["month"]["extraCredits"] == 10
    cp._set_meta("c1", trialUntil=time.time() - 1)  # o teste venceu
    with cp._in_profile(pid):
        assert cp.quota_block(pid)[0] == "trial_ended"
    assert cp.radar_status("c1")["state"] == "trial_ended" and cp.list_clients()["counts"]["trial_ended"] == 1
    assert cp.set_trial("c1", None)["status"] == "active"  # contratou
    with pytest.raises(ValueError):
        cp.set_trial("c1", 90)
    with pytest.raises(ValueError):
        cp.add_extra_credits("c1", 0)


def test_radar_usage_counts_by_session_and_day_without_question_text(cp, monkeypatch):
    import json
    import time

    monkeypatch.setattr("gateway.session_context.get_session_env",
                        lambda name, default="": "api_server" if name == "HERMES_SESSION_PLATFORM" else default)
    with pytest.raises(KeyError):
        cp.radar_usage("c2")
    pid = cp.create("c1", "starter")["profileId"]
    cp.save_settings({"plans": {"starter": {"credits": 100}}})
    with cp._in_profile(pid):
        cp.record_tool(f"{cp.TOOL_PREFIX}waiting_now", {}, json.dumps({"rows": 1}), 5, "s1")
        cp.record_turn(pid, {"total_tokens": 10000}, "s1", "quem espera?", json.dumps({"name": "Renata"}))
        cp.record_turn(pid, {"total_tokens": 5000}, "s1", "e agora?", json.dumps({"name": "Renata"}))
        cp.record_turn(pid, {"total_tokens": 5000}, "s2", "canais?", "")
    u = cp.radar_usage("c1")
    by = {x["sessionId"]: x for x in u["bySession"]}
    assert by["s1"]["questions"] == 2 and by["s1"]["name"] == "Renata" and by["s1"]["credits"] == cp.WEIGHT.get("waiting_now", 1) + 2 + 1
    assert by["s2"] == {"sessionId": "s2", "credits": 1, "questions": 1, "name": None}
    assert u["credits"]["used"] == sum(x["credits"] for x in u["bySession"]) == sum(d["credits"] for d in u["byDay"])
    assert "quem espera?" not in json.dumps(u)
    assert u["renewsAt"] > time.time()
    assert u["forecastDepletesAt"] is None or u["forecastDepletesAt"] < u["renewsAt"]  # só avisa se acabar antes de renovar
    assert cp.radar_usage("c1", since=time.time() + 60)["bySession"] == []  # resumo do teste: só o que veio depois
