"""Permissões por origem (design A6): o que o Hermes pode fazer depende de quem pediu.

Chamado em ``hermes_cli.plugins._get_pre_tool_call_directive_details`` antes de qualquer plugin, para
toda chamada de ferramenta. Ordem de avaliação:

1. **Sempre bloqueado** (``HARD_DENY``): apagar banco/tabela, apagar em massa, ``rm -rf``, apagar
   partes do cluster, mexer em chaves e acessos, mudar estas permissões pelo chat.
2. **Execução aprovada**: a chamada exata que um humano aprovou (``executing_approval``) passa.
3. **Matriz** ação × origem (``allow``/``approve``/``deny``); ferramenta MCP sem regra = ``approve``
   (só leitura declarada = ``allow``).

Invariante, ligada mesmo sem configuração: **pedido vindo de grupo de WhatsApp nunca altera nada**
(nem com aprovação, a menos que o dono escolha "pede aprovação" na matriz). O resto (sempre bloqueado
e matriz) vale quando o perfil liga as permissões (``permissions.enabled`` no ``ops.db``).

``approve`` não usa o portão nativo (que tem "sempre permitir", yolo e auto-aprovação no cron): a
chamada é recusada para o modelo, vira um pedido com o **comando exato** e vai para o Telegram com os
botões Aprovar/Negar. Aprovado, o próprio Hermes executa aquela chamada (``execute_approved``) e
publica o resultado — o modelo nunca a refaz por conta própria.
"""

from __future__ import annotations

import json
import logging
import re
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Iterator, Optional

logger = logging.getLogger(__name__)

ORIGINS = ("whatsapp_group", "telegram_team", "api_copilot", "scheduled")
ORIGIN_LABEL = {"whatsapp_group": "WhatsApp (grupo de cliente)", "telegram_team": "Telegram (equipe)",
                "api_copilot": "API (Copiloto)", "scheduled": "tarefa agendada"}
ACTIONS = [
    {"key": "db.read", "group": "db", "label": "Ler banco", "writes": False},
    {"key": "db.write", "group": "db", "label": "Escrever banco", "writes": True},
    {"key": "cluster.read", "group": "cluster", "label": "Ler cluster", "writes": False},
    {"key": "cluster.write", "group": "cluster", "label": "Mudar cluster", "writes": True},
    {"key": "server.read", "group": "server", "label": "Comandos de leitura", "writes": False},
    {"key": "server.write", "group": "server", "label": "Comandos de escrita", "writes": True},
    {"key": "files", "group": "files", "label": "Arquivos", "writes": True},
    {"key": "web", "group": "web", "label": "Buscar na web", "writes": False},
]
_ACTION = {a["key"]: a for a in ACTIONS}
DEFAULT_MATRIX = {
    "db.read": {"whatsapp_group": "allow", "telegram_team": "allow", "api_copilot": "deny", "scheduled": "allow"},
    "db.write": {"whatsapp_group": "deny", "telegram_team": "approve", "api_copilot": "deny", "scheduled": "deny"},
    "cluster.read": {"whatsapp_group": "allow", "telegram_team": "allow", "api_copilot": "deny", "scheduled": "allow"},
    "cluster.write": {"whatsapp_group": "deny", "telegram_team": "approve", "api_copilot": "deny", "scheduled": "deny"},
    "server.read": {"whatsapp_group": "allow", "telegram_team": "allow", "api_copilot": "deny", "scheduled": "allow"},
    "server.write": {"whatsapp_group": "deny", "telegram_team": "approve", "api_copilot": "deny", "scheduled": "deny"},
    "files": {"whatsapp_group": "deny", "telegram_team": "approve", "api_copilot": "deny", "scheduled": "deny"},
    "web": {"whatsapp_group": "allow", "telegram_team": "allow", "api_copilot": "deny", "scheduled": "allow"},
}
LEVELS = ("allow", "approve", "deny")
APPROVAL_TTL_MIN = 15

_I = re.I
HARD_DENY = [
    {"label": "Apagar banco ou tabela", "reads": False, "patterns": [
        re.compile(r"\b(drop|truncate)\s+(table|database|schema|collection)\b", _I),
        re.compile(r"\bdropDatabase\s*\(|\.drop\s*\(\s*\)|\bdrop_?collection\b|\bdrop_?database\b", _I)]},
    {"label": "Apagar ou alterar em massa", "reads": False, "patterns": [
        re.compile(r"\bdelete\s+from\s+[\w.\"`]+\s*(;|$|\)|')", _I),
        re.compile(r"\bupdate\s+[\w.\"`]+\s+set\b(?![^;]*\bwhere\b)", _I),
        re.compile(r"\b(deleteMany|updateMany|remove)\s*\(\s*\{\s*\}", _I),
        re.compile(r"\"(filter|query)\"\s*:\s*\{\s*\}", _I)]},
    {"label": "Apagar arquivos em massa", "reads": False, "patterns": [
        re.compile(r"\brm\s+(-\w*r\w*f\w*|-\w*f\w*r\w*|--recursive\s+--force|--force\s+--recursive)\b", _I),
        re.compile(r"\bfind\b.*\s-delete\b", _I), re.compile(r"\bmkfs(\.\w+)?\b|\bdd\s+if=.*\bof=/dev/", _I)]},
    {"label": "Apagar partes do cluster", "reads": False, "patterns": [
        re.compile(r"\bkubectl\b.*\b(delete)\s+(ns|namespace|namespaces|pvc|pv|persistentvolume\w*|node|nodes|crd)\b", _I),
        re.compile(r"\bkubectl\b.*\b(drain|cordon)\b", _I), re.compile(r"\bkubectl\b.*\bdelete\b.*\s--all\b", _I),
        re.compile(r"\bhelm\s+(uninstall|delete)\b", _I), re.compile(r"\bgcloud\b.*\bclusters?\s+delete\b", _I)]},
    {"label": "Mexer em chaves e acessos", "reads": True, "patterns": [
        re.compile(r"\bkubectl\b.*\b(create|delete|edit|patch|apply|replace)\b.*\b(secrets?|roles?|rolebindings?|clusterroles?|clusterrolebindings?|serviceaccounts?|sa)\b", _I),
        re.compile(r"\bgcloud\s+(iam|auth|secrets)\b", _I),
        re.compile(r"\b(createUser|dropUser|dropAllUsers|updateUser|grantRolesToUser|revokeRolesFromUser|changeUserPassword)\b", _I),
        re.compile(r"\b(passwd|chpasswd|useradd|usermod|userdel|visudo|ssh-keygen|ssh-copy-id)\b", _I),
        re.compile(r"authorized_keys|/\.ssh/|(^|[\s/'\"])\.env\b|\bsudoers\b", _I)]},
    {"label": "Mudar estas permissões pelo chat", "reads": True, "patterns": [
        re.compile(r"\bops\.db\b|aurora\.json|\bpermissions?\b.*\b(matrix|enabled)\b", _I)]},
]

_ORIGIN: ContextVar[Optional[str]] = ContextVar("ops_origin", default=None)
_EXECUTING: ContextVar[Optional[int]] = ContextVar("ops_executing_approval", default=None)


@contextmanager
def as_origin(origin: str) -> Iterator[None]:
    """Força a origem (ex.: a análise do Escutar roda pelo cron, mas vem de um grupo de cliente)."""
    token = _ORIGIN.set(origin)
    try:
        yield
    finally:
        _ORIGIN.reset(token)


def _session(name: str) -> str:
    try:
        from gateway.session_context import get_session_env

        return str(get_session_env(name, "") or "")
    except Exception:
        return ""


def origin() -> Optional[str]:
    """Origem do pedido atual; ``None`` = o dono, direto (painel, CLI, DM fora destas origens)."""
    forced = _ORIGIN.get()
    if forced:
        return forced
    platform, chat_type = _session("HERMES_SESSION_PLATFORM"), _session("HERMES_SESSION_CHAT_TYPE")
    if platform == "whatsapp" and chat_type in ("group", "channel", "thread"):
        return "whatsapp_group"
    if _session("HERMES_CRON_SESSION"):
        return "scheduled"
    if platform == "telegram":
        return "telegram_team"
    if platform == "api_server":
        return "api_copilot"
    return None


# ---- classificação da chamada ----

_READ_CMDS = {"ls", "cat", "head", "tail", "less", "grep", "rg", "egrep", "find", "wc", "df", "du", "free", "uptime",
              "ps", "top", "htop", "pwd", "whoami", "id", "date", "hostname", "uname", "env", "printenv", "which",
              "journalctl", "dmesg", "netstat", "ss", "ip", "ping", "curl", "dig", "nslookup", "stat", "file", "tree",
              "echo", "jq", "sort", "uniq", "awk", "sed", "lsof", "vmstat", "iostat", "nproc", "lscpu", "lsblk"}
_READ_SUBCMDS = {
    "kubectl": {"get", "describe", "logs", "top", "explain", "version", "api-resources", "events", "auth", "cluster-info", "config"},
    "helm": {"list", "ls", "status", "get", "history", "show", "search", "version", "template", "lint"},
    "docker": {"ps", "logs", "stats", "inspect", "images", "version", "info", "top", "events"},
    "systemctl": {"status", "list-units", "list-timers", "is-active", "is-enabled", "show", "cat"},
    "git": {"status", "log", "diff", "show", "branch", "remote", "rev-parse", "ls-files", "blame"},
    "gcloud": {"list", "describe", "get-credentials", "info", "version", "config"},
}
_DB_WRITE = re.compile(
    r"\.(insert(One|Many)?|update(One|Many)?|delete(One|Many)?|remove|drop(Database|Indexes|Index)?|replaceOne|"
    r"createCollection|createIndex(es)?|renameCollection|bulkWrite|findAndModify|findOneAnd(Update|Replace|Delete)|"
    r"createUser|dropUser|updateUser)\s*\(|"
    r"\b(insert\s+into|update\s+[\w.\"`]+\s+set|delete\s+from|drop\s+\w+|truncate|alter\s+\w+|create\s+\w+|"
    r"grant|revoke|merge\s+into)\b|\b(set|del|hset|hdel|flushall|flushdb|expire|lpush|rpush|sadd|srem|zadd)\s", _I)
_SED_INPLACE = re.compile(r"\bsed\b[^|;&]*\s-\w*i", _I)
_WRITE_REDIRECT = re.compile(r"(^|[^>&0-9])>>?\s*[^&\s]")


def _segments(command: str) -> list[str]:
    return [s.strip() for s in re.split(r"\|\||&&|;|\||\n", command) if s.strip()]


def _words(segment: str) -> list[str]:
    words = segment.replace("'", " ").replace('"', " ").split()
    while words and (words[0] in ("sudo", "env", "nohup", "time", "exec") or "=" in words[0]):
        words = words[1:]
    return words


def classify_command(command: str) -> str:
    """Comando de terminal → ``db.*``/``cluster.*``/``server.*`` (escrita se qualquer trecho escreve)."""
    if re.search(r"\b(mongosh|mongo|psql|mysql|redis-cli|sqlite3)\b", command, _I):
        return "db.write" if _DB_WRITE.search(command) else "db.read"
    group = "cluster" if re.search(r"\b(kubectl|helm|gcloud)\b", command, _I) else "server"
    if _WRITE_REDIRECT.search(command) or _SED_INPLACE.search(command):
        return f"{group}.write"
    for seg in _segments(command):
        words = _words(seg)
        if not words:
            continue
        cmd = words[0].rsplit("/", 1)[-1]
        if cmd == "ssh":  # ssh host 'comando': julga o comando remoto
            rest = [w for w in words[1:] if not w.startswith("-")]
            if len(rest) >= 2 and classify_command(" ".join(rest[1:])).endswith(".write"):
                return f"{group}.write"
            continue
        subs = _READ_SUBCMDS.get(cmd)
        if subs is not None:
            sub = next((w for w in words[1:] if not w.startswith("-")), "")
            if sub not in subs:
                return f"{group}.write"
            continue
        if cmd not in _READ_CMDS:
            return f"{group}.write"
    return f"{group}.read"


def _mcp_parts(tool_name: str) -> Optional[tuple[str, str]]:
    if not tool_name.startswith("mcp__"):
        return None
    rest = tool_name[len("mcp__"):]
    server, _, tool = rest.partition("__")
    return (server, tool) if server and tool else None


def _mcp_read_only(server: str, tool: str) -> bool:
    try:
        from tools.mcp_tool_handlers import _tool_is_read_only

        return _tool_is_read_only(server, tool)
    except Exception:
        return False


def classify(tool_name: str, args: dict) -> Optional[dict]:
    """``{key, label, writes, command}`` da chamada, ou ``None`` (ferramenta fora das permissões)."""
    if tool_name == "terminal":
        command = str(args.get("command") or "")
        key = classify_command(command)
        return {**_ACTION[key], "command": command}
    if tool_name in ("write_file", "patch"):
        return {**_ACTION["files"], "command": f"{tool_name} {args.get('path') or ''}".strip()}
    if tool_name == "execute_code":
        return {**_ACTION["server.write"], "label": "Executar código", "command": str(args.get("code") or "")[:4000]}
    if tool_name in ("web_search", "web_extract") or tool_name.startswith("browser_"):
        return {**_ACTION["web"], "command": json.dumps(args, ensure_ascii=False)[:500]}
    mcp = _mcp_parts(tool_name)
    if mcp:
        server, tool = mcp
        writes = not _mcp_read_only(server, tool)
        return {"key": f"mcp.{server}.{tool}", "group": f"mcp:{server}", "label": f"{server} · {tool}",
                "writes": writes, "command": f"{tool_name} {json.dumps(args, ensure_ascii=False)}"[:4000]}
    return None


def hard_deny(text: str, writes: bool = True) -> Optional[str]:
    """Rótulo da regra "sempre bloqueado" que casa; em leitura, só chaves/acessos e as permissões."""
    for rule in HARD_DENY:
        if (writes or rule["reads"]) and any(p.search(text) for p in rule["patterns"]):
            return rule["label"]
    return None


# ---- configuração ----

def settings() -> dict:
    from ops_center import store

    saved = store.get_meta("permissions", {}) or {}
    matrix = {k: {**v, **(saved.get("matrix") or {}).get(k, {})} for k, v in DEFAULT_MATRIX.items()}
    for k, v in (saved.get("matrix") or {}).items():
        matrix.setdefault(k, dict(v))
    return {"enabled": bool(saved.get("enabled")), "matrix": matrix, "approvers": list(saved.get("approvers") or []),
            "approval_target": str(saved.get("approval_target") or ""), "approvalTtlMin": APPROVAL_TTL_MIN}


def save_settings(patch: dict) -> dict:
    """Valida e grava. Regra fixa: nada que altera fica "allow" para grupo de WhatsApp."""
    from ops_center import store

    cur = store.get_meta("permissions", {}) or {}
    if "matrix" in patch:
        for key, row in (patch.get("matrix") or {}).items():
            for org, level in (row or {}).items():
                if org not in ORIGINS or level not in LEVELS:
                    raise ValueError(f"regra inválida: {key} · {org} = {level}")
                writes = _ACTION.get(key, {"writes": True})["writes"]
                if org == "whatsapp_group" and writes and level == "allow":
                    raise ValueError("Grupos de clientes nunca alteram nada sem um humano.")
        merged = {k: dict(v) for k, v in (cur.get("matrix") or {}).items()}
        for key, row in patch["matrix"].items():
            merged.setdefault(key, {}).update(row)
        cur["matrix"] = merged
    for k in ("enabled", "approvers", "approval_target"):
        if k in patch:
            cur[k] = patch[k]
    store.set_meta("permissions", cur)
    return settings()


# ---- decisão ----

def _level(cfg: dict, action: dict, org: str) -> str:
    row = cfg["matrix"].get(action["key"])
    if row and org in row:
        level = row[org]
    elif org == "whatsapp_group" and action["writes"]:
        level = "deny"  # grupo de cliente: só pede aprovação se o dono escolher isso explicitamente
    elif action["key"].startswith("mcp."):
        level = "approve" if action["writes"] else "allow"  # ferramenta nova: pede aprovação até alguém decidir
    else:
        level = "approve"
    if org == "whatsapp_group" and action["writes"] and level == "allow":
        level = "deny"  # regra fixa, mesmo com config adulterada
    return level


def check(tool_name: str, args: dict) -> Optional[str]:
    """Mensagem de bloqueio para o modelo, ou ``None`` para seguir. Fail-closed em origem controlada."""
    org = origin()
    try:
        return _check(tool_name, args or {}, org)
    except Exception:
        logger.exception("ops_center: falha ao checar permissões de %s", tool_name)
        if org is None:
            return None
        return "Não consegui checar as permissões agora; por segurança, não executei. Tente de novo em instantes."


def _check(tool_name: str, args: dict, org: Optional[str]) -> Optional[str]:
    action = classify(tool_name, args)
    if action is None:
        return None
    if org is None or org == "whatsapp_group":
        # Dono direto: só vale o que o perfil ligou. Grupo de cliente: invariante sem depender do ops.db.
        if org == "whatsapp_group" and action["writes"]:
            cfg = _safe_settings()
            if not (cfg and cfg["enabled"] and _level(cfg, action, org) == "approve"):
                _record_blocked(org, action, "Grupos de clientes nunca alteram nada sem um humano.")
                return (f"Bloqueado: pedidos vindos de grupo de cliente não podem {action['label'].lower()}. "
                        "Avise a equipe no Telegram se for necessário.")
        if org is None:
            cfg = _safe_settings()
            if not (cfg and cfg["enabled"]):
                return None
            rule = hard_deny(action["command"], action["writes"])
            if rule:
                _record_blocked(org, action, rule)
                return f"Bloqueado (sempre bloqueado: {rule.lower()}). Isso nunca é feito pelo Hermes."
            return None
    cfg = settings()
    if not cfg["enabled"] and org != "whatsapp_group":
        return None
    rule = hard_deny(action["command"], action["writes"])
    if rule:
        _record_blocked(org, action, rule)
        _alert_hard_deny(org, action, rule)
        return f"Bloqueado (sempre bloqueado: {rule.lower()}). Isso nunca é feito pelo Hermes, nem com aprovação."
    executing = _EXECUTING.get()
    if executing is not None and _matches_approval(executing, tool_name, args):
        return None
    level = _level(cfg, action, org)
    if level == "allow":
        return None
    if level == "deny":
        _record_blocked(org, action, f"matriz: {action['label']} · {ORIGIN_LABEL.get(org, org)} = bloqueado")
        return f"Bloqueado pelas permissões: {action['label'].lower()} não é permitido para pedidos de {ORIGIN_LABEL.get(org, org)}."
    return _request_approval(cfg, org, action, tool_name, args)


def _safe_settings() -> Optional[dict]:
    try:
        return settings()
    except Exception:
        logger.warning("ops_center: permissões ilegíveis", exc_info=True)
        return None


def _requester() -> tuple[str, str, str]:
    name = _session("HERMES_SESSION_USER_NAME") or _session("HERMES_SESSION_USER_ID") or "?"
    chat = _session("HERMES_SESSION_CHAT_NAME") or _session("HERMES_SESSION_CHAT_ID")
    platform = _session("HERMES_SESSION_PLATFORM")
    return name, _session("HERMES_SESSION_USER_ID"), (f"{platform} · {chat}" if chat else platform)


def _record_blocked(org: Optional[str], action: dict, rule: str) -> None:
    try:
        from ops_center import store

        who, who_id, ctx = _requester()
        store.add_approval(origin=org, requested_by=who, requested_by_id=who_id, context=ctx, action=action["key"],
                           summary=action["label"], command=action["command"], status="blocked", rule=rule)
    except Exception:
        logger.debug("ops_center: histórico de bloqueio não gravado", exc_info=True)


def _alert_hard_deny(org: Optional[str], action: dict, rule: str) -> None:
    """Sempre bloqueado também avisa a equipe (destino das aprovações)."""
    try:
        target = settings()["approval_target"]
        if not target:
            return
        from tools.send_message_tool import send_message_tool

        who, _id, ctx = _requester()
        send_message_tool({"action": "send", "target": target, "message": (
            f"🛑 Bloqueado · {rule}\nOrigem: {ORIGIN_LABEL.get(org or '', 'painel')} ({ctx}) · pedido de {who}\n"
            f"Comando: {action['command'][:1500]}")})
    except Exception:
        logger.debug("ops_center: alerta de bloqueio não enviado", exc_info=True)


def _approval_target() -> tuple[str, Optional[str], Optional[str]]:
    """(plataforma, chat, tópico): o próprio chat da equipe no Telegram, senão o destino configurado."""
    if _session("HERMES_SESSION_PLATFORM") == "telegram" and _session("HERMES_SESSION_CHAT_ID"):
        return "telegram", _session("HERMES_SESSION_CHAT_ID"), _session("HERMES_SESSION_THREAD_ID") or None
    target = settings()["approval_target"]
    parts = target.split(":") if target else []
    if len(parts) >= 2 and parts[0] == "telegram":
        return "telegram", parts[1], (parts[2] if len(parts) > 2 else None)
    return "", None, None


def _args_key(tool_name: str, args: dict) -> str:
    return json.dumps({"tool": tool_name, "args": args}, sort_keys=True, ensure_ascii=False, default=str)


def _matches_approval(approval_id: int, tool_name: str, args: dict) -> bool:
    from ops_center import store

    a = store.get_approval(approval_id)
    return bool(a) and a["status"] == "approved" and a["tool"] == tool_name and \
        _args_key(tool_name, a["args"]) == _args_key(tool_name, args)


def _request_approval(cfg: dict, org: str, action: dict, tool_name: str, args: dict) -> str:
    from ops_center import store

    platform, chat_id, thread_id = _approval_target()
    who, who_id, ctx = _requester()
    if not chat_id:
        _record_blocked(org, action, "sem destino de aprovação configurado")
        return ("Isto precisa de aprovação, mas não há um chat de aprovação configurado (Permissões › destino). "
                "Não executei.")
    aid = store.add_approval(
        origin=org, requested_by=who, requested_by_id=who_id, context=ctx, action=action["key"],
        summary=action["label"], command=action["command"], tool=tool_name, args=args, status="pending",
        target=f"{platform}:{chat_id}" + (f":{thread_id}" if thread_id else ""),
        expires_at=time.time() + APPROVAL_TTL_MIN * 60)
    sent = _send_approval_prompt(aid, chat_id, thread_id)
    if not sent:
        store.update_approval(aid, status="blocked", note="não consegui enviar o pedido ao Telegram")
        return "Isto precisa de aprovação, mas não consegui enviar o pedido ao Telegram. Não executei."
    return (f"Pedi aprovação no Telegram (pedido #{aid}) para: {action['label'].lower()}. "
            f"Quando alguém aprovar, eu mesmo executo exatamente este comando e mostro o resultado no chat. "
            f"Expira em {APPROVAL_TTL_MIN} min. Não tente executar de novo nem por outro caminho.")


def approval_text(a: dict) -> str:
    import html

    return (f"🟡 <b>Pedido de aprovação · {html.escape(a['summary'] or '')}</b>\n"
            f"Origem: {html.escape(ORIGIN_LABEL.get(a.get('origin') or '', 'painel'))} · pedido de "
            f"{html.escape(a.get('requested_by') or '?')}\n\n<pre>{html.escape((a.get('command') or '')[:3000])}</pre>\n"
            f"Expira em {APPROVAL_TTL_MIN} min (sem resposta = negado). Quem pediu não aprova o próprio pedido.")


def _send_approval_prompt(aid: int, chat_id: str, thread_id: Optional[str]) -> bool:
    from ops_center import store

    try:
        from gateway.config import Platform
        from tools.send_message_senders import _live_adapter

        runner, adapter = _live_adapter(Platform.TELEGRAM)
        loop = getattr(runner, "_gateway_loop", None)
        send = getattr(adapter, "send_ops_approval", None)
        if adapter is None or loop is None or send is None:
            return False
        import asyncio

        fut = asyncio.run_coroutine_threadsafe(send(chat_id, approval_text(store.get_approval(aid)), aid,
                                                    {"thread_id": thread_id} if thread_id else None), loop)
        res = fut.result(timeout=30)
        if not getattr(res, "success", False) or (getattr(res, "raw_response", None) or {}).get("ops_muted"):
            return False
        store.update_approval(aid, message_id=str(getattr(res, "message_id", "") or ""))
        return True
    except Exception:
        logger.warning("ops_center: pedido de aprovação #%s não saiu", aid, exc_info=True)
        return False


# ---- decisão (botão no Telegram ou painel) e execução ----

def decide(approval_id: int, approve: bool, by: str, by_id: str, note: str = "") -> dict:
    """``{ok, error?, approval}``. Quem pediu não decide; com aprovadores configurados, só eles."""
    from ops_center import store

    store.expire_approvals()
    a = store.get_approval(approval_id)
    if not a:
        return {"ok": False, "error": "pedido não encontrado"}
    if a["status"] != "pending":
        return {"ok": False, "error": f"este pedido já está {a['status']}", "approval": a}
    if by_id and a.get("requested_by_id") and str(by_id) == str(a["requested_by_id"]):
        return {"ok": False, "error": "quem pediu não aprova o próprio pedido", "approval": a}
    approvers = [str(x) for x in settings()["approvers"]]
    if approvers and str(by_id) not in approvers:
        return {"ok": False, "error": "você não está entre os aprovadores deste perfil", "approval": a}
    claimed = store.claim_approval(approval_id, approve, by, str(by_id), note)
    if not claimed:
        return {"ok": False, "error": "o pedido expirou ou já foi decidido", "approval": store.get_approval(approval_id)}
    return {"ok": True, "approval": claimed}


def execute_approved(approval_id: int) -> str:
    """Executa exatamente a chamada aprovada (sempre bloqueado é checado de novo). Devolve o resultado."""
    from ops_center import store

    a = store.get_approval(approval_id)
    if not a or a["status"] != "approved":
        return "pedido não está aprovado"
    token = _EXECUTING.set(approval_id)
    origin_token = _ORIGIN.set(a.get("origin") or "telegram_team")
    try:
        from model_tools import handle_function_call

        result = handle_function_call(a["tool"], a["args"], task_id=f"ops-approval-{approval_id}")
    except Exception as e:  # noqa: BLE001
        result = json.dumps({"error": str(e)[:500]})
    finally:
        _ORIGIN.reset(origin_token)
        _EXECUTING.reset(token)
    store.update_approval(approval_id, result=str(result)[:20000])
    return str(result)
