"""Grupos de WhatsApp do número de suporte: descoberta e liberação pelo painel (Canais).

A ponte grava ``<session>/groups.json`` com todos os grupos em que o número está (só metadados) e
relê ``<session>/group-allowlist.json`` a cada mensagem de grupo. Com ``WHATSAPP_GROUP_POLICY=allowlist``,
só os grupos dessa lista chegam ao Hermes; os outros são descartados na própria ponte. Escutar um grupo
aqui = pôr o JID na lista (e criar o canal em Escutar); parar = tirar. Nada é enviado ao grupo.
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from ops_center import store

GROUPS_FILE = "groups.json"
ALLOWLIST_FILE = "group-allowlist.json"


def _session_dir() -> Path:
    from hermes_constants import get_hermes_dir

    return get_hermes_dir("platforms/whatsapp/session", "whatsapp/session")


def _norm(jid: str) -> str:
    """Mesma normalização da ponte (allowlist.js): sem ``+``, sem ``:device`` e sem ``@domínio``."""
    s = str(jid or "").strip().lstrip("+")
    if ":" in s and "@" in s:
        s = s.split(":", 1)[0] + s[s.index("@"):]
    return s.split("@", 1)[0]


def _secret(name: str) -> str:
    from agent.secret_scope import get_secret_str

    return (get_secret_str(name) or "").strip()


def group_policy() -> str:
    return _secret("WHATSAPP_GROUP_POLICY").lower() or "pairing"


def discovered() -> dict:
    """``{updatedAt, groups:[{id, subject, size}]}`` do último levantamento da ponte (vazio se nunca rodou)."""
    try:
        data = json.loads((_session_dir() / GROUPS_FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"updatedAt": None, "groups": []}
    groups = [g for g in data.get("groups") or [] if isinstance(g, dict) and str(g.get("id", "")).endswith("@g.us")]
    return {"updatedAt": data.get("updatedAt"), "groups": groups}


def _allowlist_raw() -> list[str]:
    """A lista em vigor: o arquivo do painel; sem ele, o ``WHATSAPP_GROUP_ALLOWED_USERS`` do perfil."""
    try:
        ids = json.loads((_session_dir() / ALLOWLIST_FILE).read_text(encoding="utf-8"))
        return [str(i) for i in ids] if isinstance(ids, list) else []
    except FileNotFoundError:
        return [p.strip() for p in _secret("WHATSAPP_GROUP_ALLOWED_USERS").split(",") if p.strip()]
    except (OSError, ValueError):
        return []


def is_listening(jid: str) -> bool:
    policy = group_policy()
    if policy == "open":
        return True
    if policy != "allowlist":
        return False
    raw = _allowlist_raw()
    return "*" in raw or _norm(jid) in {_norm(i) for i in raw}


def _write_allowlist(ids: list[str]) -> None:
    d = _session_dir()
    d.mkdir(parents=True, exist_ok=True)
    # Atômico: a ponte lê a cada mensagem e nunca pode ver o arquivo pela metade.
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".group-allowlist.", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(sorted(set(ids)), f)
    os.replace(tmp, d / ALLOWLIST_FILE)


def set_listening(jid: str, on: bool) -> dict:
    """Libera (``on``) ou corta um grupo na ponte. Ligar também registra o canal em Escutar."""
    jid = str(jid or "").strip()
    if not jid.endswith("@g.us"):
        raise ValueError("isso não é um grupo de WhatsApp")
    if group_policy() != "allowlist":
        raise ValueError("Este perfil não usa lista de grupos (WHATSAPP_GROUP_POLICY precisa ser allowlist)")
    raw = [i for i in _allowlist_raw() if i != "*"]
    keep = [i for i in raw if _norm(i) != _norm(jid)]
    _write_allowlist(keep + [jid] if on else keep)
    subject = next((g.get("subject", "") for g in discovered()["groups"] if _norm(g["id"]) == _norm(jid)), "")
    if on:
        store.touch_channel("whatsapp", jid, subject, "group")  # nasce em Escutar (store.touch_channel)
    return {"chatId": jid, "listening": on}


def with_discovery(channels: list[dict]) -> list[dict]:
    """``channels_view`` + estado de escuta dos grupos de WhatsApp + os grupos do número que ainda não falaram."""
    found = discovered()
    size = {_norm(g["id"]): g.get("size") for g in found["groups"]}
    known = set()
    out: list[dict] = []
    for ch in channels:
        if ch.get("platform") == "whatsapp" and ch.get("kind") == "group":
            known.add(_norm(ch["chat_id"]))
            ch = {**ch, "listening": is_listening(ch["chat_id"]), "size": size.get(_norm(ch["chat_id"]))}
        out.append(ch)
    for g in found["groups"]:
        if _norm(g["id"]) in known:
            continue
        out.append({
            "id": store.channel_id("whatsapp", g["id"]), "platform": "whatsapp", "chat_id": g["id"],
            "name": g.get("subject") or g["id"], "kind": "group", "section": "group", "mode": store.LISTEN,
            "discovered": True,  # nunca falou com o Hermes: só existe no levantamento da ponte
            "listening": is_listening(g["id"]), "size": g.get("size"),
            "clientId": None, "clientName": None, "notClient": False, "suggestion": None, "members": None,
            "todayCount": 0, "last": None, "lastAlert": None, "problem": None, "receivesAlerts": False,
            "requiresConfirm": True, "window": None,
        })
    return out


def discovery_status() -> dict[str, Any]:
    found = discovered()
    return {"policy": group_policy(), "updatedAt": found["updatedAt"], "count": len(found["groups"])}
