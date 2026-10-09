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
    assert {"terminal", "file", "code_execution", "web", "delegation", "cronjob"} <= set(cfg["agent"]["disabled_toolsets"])
    mcp = cfg["mcp_servers"]["aibiz_ops"]
    assert mcp["trust"] == "untrusted" and mcp["headers"]["Authorization"] == "Bearer ${AIBIZ_MCP_TOKEN}"
    assert mcp["tools"]["include"] == ["my_channels_status", "channel_metrics", "search_conversations", "timeline"]
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
        assert cp.quota_block(pid) == "Copiloto indisponível para esta empresa."
    back = cp.reactivate("c1")
    assert back["client"]["status"] == "active" and _client_env(cp, pid)["API_SERVER_KEY"] == back["apiKey"]


def test_quota_audit_and_usage(cp):
    pid = cp.create("c1", "starter")["profileId"]
    cp.save_settings({"plans": {"starter": {"credits": 10}}})
    with cp._in_profile(pid):
        assert cp.quota_block(pid) is None
        ok = json.dumps({"data": [], "rows": 3, "ms": 12, "query": {"collection": "customer_services"}})
        cp.record_tool("mcp__aibiz_ops__timeline", {"customerServiceId": "x"}, ok, 20, "s1")
        scope = json.dumps({"error": "outro cliente", "code": "blocked_scope"})
        cp.record_tool("mcp__aibiz_ops__query", {"collection": "customer_services"}, scope, 5, "s1")
        cp.record_tool("terminal", {}, "x", 1, "s1")  # fora do MCP: ignorado
        cp.record_turn(pid, {"input_tokens": 100, "output_tokens": 50, "total_tokens": 4100}, "s1", "Por que caiu?",
                       json.dumps({"name": "Ana", "via": "Aibiz Manager"}))
        assert cp.month_usage()["credits"] == 3 + 3  # peso do timeline + 3 créditos de tokens (4100/2000, pra cima)
        cp.record_turn(pid, {"total_tokens": 9000}, "s2", "mais", "")
        assert "Sem saldo" in cp.quota_block(pid)
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
