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
    assert mcp["tools"]["include"] == ["my_channels_status", "channel_metrics", "search_conversations", "timeline", "waiting_now", "remember"]
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


def test_remember_is_in_every_plan_and_soul_explains_memory(cp):
    from hermes_constants import get_hermes_home

    pid = cp.create("c1", "starter")["profileId"]
    assert "remember" in _client_cfg(cp, pid)["mcp_servers"]["aibiz_ops"]["tools"]["include"]
    with cp._in_profile(pid):
        soul = (get_hermes_home() / "SOUL.md").read_text(encoding="utf-8")
    assert "Memória da empresa" in soul and "remember" in soul and "falta o" in soul


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


def test_pause_reset_and_flexible_credits(cp, monkeypatch):
    monkeypatch.setattr("gateway.session_context.get_session_env",
                        lambda name, default="": "api_server" if name == "HERMES_SESSION_PLATFORM" else default)
    pid = cp.create("c1", "starter")["profileId"]
    assert cp.get("c1")["monthlyCredits"] is None  # recém-criado: vale a do plano, nada combinado
    cp.save_settings({"plans": {"starter": {"credits": 10}}})
    with cp._in_profile(pid):
        cp.record_turn(pid, {"total_tokens": 50000}, "s1", "tudo", "")  # 10 créditos: acabou
        assert cp.quota_block(pid)[0] == "no_credit"
    # Franquia combinada com o cliente vale no lugar da do plano; None volta à do plano.
    assert cp.set_monthly_credits("c1", 30)["month"]["creditsLimit"] == 30
    with cp._in_profile(pid):
        assert cp.quota_block(pid) is None
    assert cp.get("c1")["monthlyCredits"] == 30
    cp.save_settings({"plans": {"starter": {"credits": 12}}})  # mudar a franquia do plano não apaga a combinada
    assert cp.get("c1")["month"]["creditsLimit"] == 30
    assert cp.set_monthly_credits("c1", None)["month"]["creditsLimit"] == 12
    assert cp.get("c1")["monthlyCredits"] is None
    cp.save_settings({"plans": {"starter": {"credits": 10}}})
    # Extras com valor exato (corrige um pacote lançado errado).
    cp.add_extra_credits("c1", 50)
    assert cp.set_extra_credits("c1", 5)["month"]["extraCredits"] == 5
    with pytest.raises(ValueError):
        cp.set_extra_credits("c1", -1)
    # Zerar o consumo do mês: conta de novo a partir de agora, o histórico continua.
    out = cp.reset_month_credits("c1")
    assert out["month"]["credits"] == 0 and out["status"] == "active" and out["creditsResetAt"]
    assert cp.radar_usage("c1")["bySession"] == []
    # Pausar não revoga: a chave fica, mas o Radar para; retomar volta ao normal.
    p = cp.pause("c1", "conversa com o financeiro")
    assert p["status"] == "paused" and p["paused"]["reason"] == "conversa com o financeiro"
    with cp._in_profile(pid):
        assert cp.quota_block(pid) == ("paused", "O Aibiz Radar está pausado. Fale com a Aibiz para reativar.")
    assert cp.radar_status("c1")["state"] == "paused" and cp.list_clients()["counts"]["paused"] == 1
    assert cp.resume("c1")["status"] == "active"


# ---- juiz da Saúde da IA ----

class _Resp:
    def __init__(self, text, total=10_000):
        self.choices = [type("C", (), {"message": type("M", (), {"content": text})()})()]
        self.usage = type("U", (), {"prompt_tokens": total - 500, "completion_tokens": 500, "total_tokens": total})()


CONV = [{"id": "m1", "role": "client", "text": "quanto custa?"},
        {"id": "m2", "role": "ia", "text": "A consulta custa R$ 80."},
        {"id": "m3", "role": "human", "text": "Corrigindo: a consulta custa R$ 120."}]
GOOD = ('Aqui: {"findings":[{"type":"stale_price","messageId":"m2","confidence":0.93,"expected":"R$ 120","ruleRef":"m3",'
        '"excerptRange":[20,25]},{"type":"stale_price","messageId":"m3","confidence":0.9},'  # m3 não é da IA
        '{"type":"outro","messageId":"m2","confidence":0.9},{"type":"hallucination","messageId":"m2","confidence":7}]}')


def _usage_rows(cp, pid):
    from ops_center.copilot import _db, _profile_home

    with _db(_profile_home(pid) / "ops.db") as c:
        return [tuple(r) for r in c.execute("SELECT credits, total_tokens, question FROM copilot_usage")]


def test_judge_keeps_only_valid_findings_and_is_free_for_the_client_unless_charged(cp, monkeypatch):
    import agent.auxiliary_client as aux

    calls = []
    monkeypatch.setattr(aux, "call_llm", lambda **kw: calls.append(kw) or _Resp(GOOD))
    pid = cp.create("c1", "pro")["profileId"]
    with cp._in_profile(pid):
        free = cp.judge(pid, {"conversation": CONV, "memory": "Consulta: R$ 120", "types": ["stale_price", "hallucination"]})
        paid = cp.judge(pid, {"conversation": CONV, "types": ["stale_price"], "charge": True})
        rows = _usage_rows(cp, pid)
    # só a resposta da IA, tipo pedido; confiança fora de 0–1 vira 1; o resto some
    assert [(f["type"], f["messageId"]) for f in free["findings"]] == [("stale_price", "m2"), ("hallucination", "m2")]
    assert free["findings"][1]["confidence"] == 1.0 and free["findings"][0]["excerptRange"] == [20, 25]
    assert free["credits"] == 0 and paid["credits"] == 2  # 10 mil tokens ÷ 5 mil
    assert sorted(rows) == [(0, 10000, "radar_audit"), (2, 10000, "radar_audit")]
    assert calls[0]["temperature"] == 0 and "tools" not in calls[0] and calls[0]["task"] == "radar_audit"
    assert "[m2] ia: A consulta custa R$ 80." in calls[0]["messages"][1]["content"]


def test_judge_skips_the_model_without_ia_replies_retries_once_and_refuses_other_profiles(cp, monkeypatch):
    import agent.auxiliary_client as aux

    pid = cp.create("c1", "pro")["profileId"]
    boom = []

    def flaky(**kw):
        boom.append(1)
        if len(boom) == 1:
            raise TimeoutError("ReadTimeout")
        return _Resp('{"findings":[]}')

    monkeypatch.setattr(aux, "call_llm", flaky)
    with cp._in_profile(pid):
        assert cp.judge(pid, {"conversation": [CONV[0]], "types": ["stale_price"]})["findings"] == []
        assert boom == []  # nada da IA para julgar: não chama o modelo
        assert cp.judge(pid, {"conversation": CONV})["findings"] == [] and len(boom) == 2  # 1ª falha, 2ª ok
        monkeypatch.setattr(aux, "call_llm", lambda **kw: (_ for _ in ()).throw(TimeoutError("x")))
        with pytest.raises(RuntimeError):
            cp.judge(pid, {"conversation": CONV})
        with pytest.raises(ValueError):
            cp.judge(pid, {"conversation": [], "types": ["stale_price"]})
    with pytest.raises(PermissionError):
        cp.judge("aibiz", {"conversation": CONV})
