"""Permissões por origem (A6): classificação, sempre bloqueado, matriz, aprovação por botão."""

from contextlib import contextmanager

import pytest


@pytest.fixture(autouse=True)
def _home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))


@contextmanager
def session(**values):
    """Simula o contexto de sessão do gateway (plataforma, tipo de chat, usuário…)."""
    from gateway.session_context import _VAR_MAP

    tokens = [(_VAR_MAP[f"HERMES_SESSION_{k.upper()}" if k != "cron" else "HERMES_CRON_SESSION"], v) for k, v in values.items()]
    tokens = [(var, var.set(v)) for var, v in tokens]
    try:
        yield
    finally:
        for var, tok in reversed(tokens):
            var.reset(tok)


@pytest.mark.parametrize("cmd,key", [
    ("kubectl get pods -n bots", "cluster.read"),
    ("kubectl logs deploy/bot-x --tail=50", "cluster.read"),
    ("kubectl scale deploy/bot-x --replicas=4", "cluster.write"),
    ("kubectl rollout restart deploy/bot-x", "cluster.write"),
    ("mongosh $URI --eval 'db.system_client.find({createdAt: {$gt: 1}}).limit(5)'", "db.read"),
    ("mongosh $URI --eval 'db.x.updateOne({_id: 1}, {$set: {a: 1}})'", "db.write"),
    ("df -h && free -m | head", "server.read"),
    ("ssh vps1 'docker ps && docker logs bot --tail 20'", "server.read"),
    ("ssh vps1 'systemctl restart nginx'", "server.write"),
    ("echo oi > /etc/motd", "server.write"),
    ("sed -i 's/a/b/' conf", "server.write"),
    ("python script.py", "server.write"),
])
def test_classify_command(cmd, key):
    from ops_center.guardrails import classify_command

    assert classify_command(cmd) == key


@pytest.mark.parametrize("text,writes,rule", [
    ("psql -c 'DROP TABLE clients'", True, "Apagar banco ou tabela"),
    ("mongosh --eval 'db.dropDatabase()'", True, "Apagar banco ou tabela"),
    ("mongosh --eval 'db.x.deleteMany({})'", True, "Apagar ou alterar em massa"),
    ("psql -c 'DELETE FROM clients;'", True, "Apagar ou alterar em massa"),
    ("rm -rf /var/lib/app", True, "Apagar arquivos em massa"),
    ("kubectl delete namespace bots", True, "Apagar partes do cluster"),
    ("kubectl drain node-1", True, "Apagar partes do cluster"),
    ("kubectl create secret generic x --from-literal=a=b", True, "Mexer em chaves e acessos"),
    ("cat /srv/app/.env", False, "Mexer em chaves e acessos"),
    ("sqlite3 ~/.hermes/ops.db \"update meta set value=1 where key='x'\"", True, "Mudar estas permissões pelo chat"),
])
def test_hard_deny(text, writes, rule):
    from ops_center.guardrails import hard_deny

    assert hard_deny(text, writes) == rule


@pytest.mark.parametrize("text,writes", [
    ("kubectl delete pod bot-x-123", True),
    ("psql -c 'DELETE FROM clients WHERE id = 3'", True),
    ('mcp__mongo__find {"filter": {}}', False),
    ("rm /tmp/a.txt", True),
])
def test_not_hard_deny(text, writes):
    from ops_center.guardrails import hard_deny

    assert hard_deny(text, writes) is None


def test_origin_from_session():
    from ops_center import guardrails

    assert guardrails.origin() is None
    with session(platform="whatsapp", chat_type="group"):
        assert guardrails.origin() == "whatsapp_group"
    with session(platform="whatsapp", chat_type="dm"):
        assert guardrails.origin() is None
    with session(platform="telegram", chat_type="group"):
        assert guardrails.origin() == "telegram_team"
    with session(cron="1"):
        assert guardrails.origin() == "scheduled"
        with guardrails.as_origin("whatsapp_group"):
            assert guardrails.origin() == "whatsapp_group"


def test_whatsapp_group_never_writes_even_without_configuration():
    from ops_center import guardrails, store

    with session(platform="whatsapp", chat_type="group", user_name="Cliente"):
        msg = guardrails.check("terminal", {"command": "kubectl rollout restart deploy/bot"})
        assert msg and "grupo de cliente" in msg
        assert guardrails.check("terminal", {"command": "kubectl get pods"}) is None
        assert guardrails.check("write_file", {"path": "/tmp/x", "content": "a"})
        assert guardrails.check("read_file", {"path": "/tmp/x"}) is None  # fora das permissões
    assert store.list_approvals("blocked")[0]["requested_by"] == "Cliente"


def test_owner_untouched_until_enabled_then_hard_deny_only():
    from ops_center import guardrails

    assert guardrails.check("terminal", {"command": "psql -c 'DROP TABLE x'"}) is None
    guardrails.save_settings({"enabled": True})
    assert "sempre bloqueado" in guardrails.check("terminal", {"command": "psql -c 'DROP TABLE x'"})
    assert guardrails.check("terminal", {"command": "kubectl scale deploy/x --replicas=2"}) is None


def test_telegram_write_becomes_button_approval(monkeypatch):
    from ops_center import guardrails, store

    guardrails.save_settings({"enabled": True})
    sent = []
    monkeypatch.setattr(guardrails, "_send_approval_prompt", lambda aid, chat, thread: sent.append((aid, chat, thread)) or True)
    cmd = "kubectl scale deploy/bot-x --replicas=4"
    with session(platform="telegram", chat_type="group", chat_id="-100", thread_id="7", user_id="11", user_name="Ivair"):
        msg = guardrails.check("terminal", {"command": cmd})
        assert "Pedi aprovação" in msg and "#1" in msg
        assert "sempre bloqueado" in guardrails.check("terminal", {"command": "kubectl delete ns bots"})
    a = store.get_approval(1)
    assert sent == [(1, "-100", "7")]
    assert a["status"] == "pending" and a["command"] == cmd and a["target"] == "telegram:-100:7"
    assert "<pre>kubectl scale" in guardrails.approval_text(a)


def test_decide_rules_and_exact_execution(monkeypatch):
    from ops_center import guardrails, store

    guardrails.save_settings({"enabled": True, "approvers": ["22", "33"]})
    monkeypatch.setattr(guardrails, "_send_approval_prompt", lambda *a: True)
    with session(platform="telegram", chat_type="group", chat_id="-100", user_id="11", user_name="Ivair"):
        guardrails.check("terminal", {"command": "kubectl scale deploy/x --replicas=4"})

    assert guardrails.decide(1, True, "Ivair", "11")["error"] == "quem pediu não aprova o próprio pedido"
    assert "aprovadores" in guardrails.decide(1, True, "Zé", "99")["error"]
    assert guardrails.decide(1, True, "Kelvin", "22")["ok"]
    assert "já está approved" in guardrails.decide(1, False, "Bruna", "33")["error"]

    calls = []

    def fake_call(name, args, task_id=None):
        # a chamada exata passa pela checagem; outra qualquer, não
        calls.append(guardrails.check(name, args))
        calls.append(guardrails.check(name, {"command": "kubectl scale deploy/x --replicas=40"}))
        return '{"output": "scaled"}'

    monkeypatch.setattr("model_tools.handle_function_call", fake_call)
    assert "scaled" in guardrails.execute_approved(1)
    assert calls[0] is None and calls[1]  # outros argumentos não pegam carona na aprovação
    assert "scaled" in store.get_approval(1)["result"]


def test_approval_expires_as_denied(monkeypatch):
    from ops_center import guardrails, store

    guardrails.save_settings({"enabled": True})
    monkeypatch.setattr(guardrails, "_send_approval_prompt", lambda *a: True)
    with session(platform="telegram", chat_type="group", chat_id="-100", user_id="11"):
        guardrails.check("terminal", {"command": "systemctl restart nginx"})
    store.expire_approvals(now=10**12)
    assert store.get_approval(1)["status"] == "expired"
    assert not guardrails.decide(1, True, "Kelvin", "22")["ok"]


def test_no_target_or_send_failure_blocks(monkeypatch):
    from ops_center import guardrails

    guardrails.save_settings({"enabled": True})
    with session(cron="1"):
        guardrails.save_settings({"matrix": {"server.write": {"scheduled": "approve"}}})
        assert "não há um chat de aprovação" in guardrails.check("terminal", {"command": "systemctl restart x"})
    guardrails.save_settings({"approval_target": "telegram:-100:3"})
    monkeypatch.setattr(guardrails, "_send_approval_prompt", lambda *a: False)
    with session(cron="1"):
        assert "não consegui enviar" in guardrails.check("terminal", {"command": "systemctl restart x"})


def test_matrix_rules_and_fixed_whatsapp_rule():
    from ops_center import guardrails

    with pytest.raises(ValueError, match="nunca alteram"):
        guardrails.save_settings({"matrix": {"db.write": {"whatsapp_group": "allow"}}})
    with pytest.raises(ValueError):
        guardrails.save_settings({"matrix": {"db.read": {"telegram_team": "talvez"}}})
    cfg = guardrails.save_settings({"enabled": True, "matrix": {"db.read": {"api_copilot": "allow"}}})
    assert cfg["matrix"]["db.read"]["api_copilot"] == "allow" and cfg["matrix"]["db.write"]["telegram_team"] == "approve"
    with session(platform="api_server"):
        assert "não é permitido" in guardrails.check("terminal", {"command": "kubectl get pods"})


def test_mcp_tool_without_rule_needs_approval_unless_read_only(monkeypatch):
    from ops_center import guardrails

    guardrails.save_settings({"enabled": True})
    monkeypatch.setattr(guardrails, "_send_approval_prompt", lambda *a: True)
    monkeypatch.setattr(guardrails, "_mcp_read_only", lambda s, t: t == "list_charges")
    with session(platform="telegram", chat_type="group", chat_id="-100", user_id="11"):
        assert guardrails.check("mcp__asaas__list_charges", {}) is None
        assert "Pedi aprovação" in guardrails.check("mcp__asaas__refund", {"id": "pay_1"})
    with session(platform="whatsapp", chat_type="group"):
        assert "grupo de cliente" in guardrails.check("mcp__asaas__refund", {"id": "pay_1"})


def test_core_pre_tool_call_path_enforces_it():
    from hermes_cli.plugins import _get_pre_tool_call_directive_details

    with session(platform="whatsapp", chat_type="group"):
        d = _get_pre_tool_call_directive_details("terminal", {"command": "kubectl scale deploy/x --replicas=0"})
    assert d.action == "block" and "grupo de cliente" in d.message
