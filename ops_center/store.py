"""SQLite store da Central de Operações (``$HERMES_HOME/ops.db``).

Uma conexão por chamada (WAL + busy timeout): o gateway grava mensagens recebidas e envios, o
dashboard lê e configura. Nada aqui importa o resto do Hermes além de ``hermes_constants`` (lazy),
para o gateway poder chamar sem custo de import.

Modos de autonomia por canal: 0 = Observar (só lê), 1 = Rascunhar (resposta fica aguardando
aprovação), 2 = Autônomo (envia sozinho). Canal novo nasce Autônomo: é o comportamento atual do
Hermes, nada muda até o usuário configurar.
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

OBSERVE, DRAFT, AUTONOMOUS = 0, 1, 2
DEFAULT_MODE = AUTONOMOUS

SCHEMA = """
CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY, platform TEXT NOT NULL, chat_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'dm', business_id TEXT, mode INTEGER NOT NULL DEFAULT 2, last_seen REAL
);
CREATE TABLE IF NOT EXISTS inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT NOT NULL, message_id TEXT,
  sender_id TEXT, sender_name TEXT, text TEXT NOT NULL, received_at REAL NOT NULL,
  priority TEXT NOT NULL DEFAULT 'voce', summary TEXT, draft TEXT,
  status TEXT NOT NULL DEFAULT 'new', session_id TEXT, sent_at REAL
);
CREATE INDEX IF NOT EXISTS inbox_status ON inbox(status, received_at);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at REAL NOT NULL, business_id TEXT, kind TEXT NOT NULL,
  action TEXT NOT NULL, why TEXT NOT NULL DEFAULT '', reversible INTEGER NOT NULL DEFAULT 0,
  undone INTEGER NOT NULL DEFAULT 0, ref TEXT
);
CREATE TABLE IF NOT EXISTS watches (word TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT '', business_id TEXT,
  tone TEXT NOT NULL DEFAULT '', channels TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  pending TEXT NOT NULL DEFAULT '[]', waiting_since REAL, updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS playbooks (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, business_id TEXT, trigger TEXT NOT NULL,
  nodes TEXT NOT NULL DEFAULT '[]', enabled INTEGER NOT NULL DEFAULT 1, runs INTEGER NOT NULL DEFAULT 0,
  last_run REAL, cron_job_id TEXT
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


def db_path() -> Path:
    from hermes_constants import get_hermes_home

    return get_hermes_home() / "ops.db"


@contextmanager
def connect(path: Optional[Path] = None) -> Iterator[sqlite3.Connection]:
    p = path or db_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(p), timeout=10)
    try:
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA busy_timeout=10000")
        con.executescript(SCHEMA)
        yield con
        con.commit()
    finally:
        con.close()


def _rows(cur: sqlite3.Cursor) -> list[dict[str, Any]]:
    return [dict(r) for r in cur.fetchall()]


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


# ---- negócios ----

def list_businesses() -> list[dict]:
    with connect() as c:
        return _rows(c.execute("SELECT id, name, color FROM businesses ORDER BY created_at"))


def save_business(name: str, color: str, id: Optional[str] = None) -> dict:
    name = name.strip()
    if not name:
        raise ValueError("nome do negócio é obrigatório")
    bid = id or _new_id()
    with connect() as c:
        c.execute(
            "INSERT INTO businesses(id, name, color, created_at) VALUES(?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color",
            (bid, name, color, time.time()),
        )
    return {"id": bid, "name": name, "color": color}


def delete_business(bid: str) -> None:
    with connect() as c:
        c.execute("DELETE FROM businesses WHERE id=?", (bid,))
        for table in ("channels", "people", "playbooks", "activity"):
            c.execute(f"UPDATE {table} SET business_id=NULL WHERE business_id=?", (bid,))


# ---- canais (autonomia) ----

def channel_id(platform: str, chat_id: str) -> str:
    return f"{platform}:{chat_id}"


def touch_channel(platform: str, chat_id: str, name: str = "", kind: str = "dm") -> dict:
    """Registra/atualiza um canal visto pelo gateway e devolve sua política atual."""
    cid = channel_id(platform, chat_id)
    with connect() as c:
        c.execute(
            "INSERT INTO channels(id, platform, chat_id, name, kind, mode, last_seen) VALUES(?,?,?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen, "
            "name=CASE WHEN excluded.name<>'' THEN excluded.name ELSE channels.name END, kind=excluded.kind",
            (cid, platform, str(chat_id), name or "", kind, DEFAULT_MODE, time.time()),
        )
        return dict(c.execute("SELECT * FROM channels WHERE id=?", (cid,)).fetchone())


def channel_mode(platform: str, chat_id: str) -> int:
    with connect() as c:
        row = c.execute("SELECT mode FROM channels WHERE id=?", (channel_id(platform, chat_id),)).fetchone()
    return int(row["mode"]) if row else DEFAULT_MODE


def list_channels() -> list[dict]:
    with connect() as c:
        return _rows(c.execute("SELECT * FROM channels ORDER BY last_seen DESC"))


def update_channel(cid: str, *, mode: Optional[int] = None, business_id: Optional[str] = "", name: Optional[str] = None) -> dict:
    if mode is not None and mode not in (OBSERVE, DRAFT, AUTONOMOUS):
        raise ValueError("modo inválido")
    with connect() as c:
        if mode is not None:
            c.execute("UPDATE channels SET mode=? WHERE id=?", (mode, cid))
        if business_id != "":
            c.execute("UPDATE channels SET business_id=? WHERE id=?", (business_id, cid))
        if name is not None:
            c.execute("UPDATE channels SET name=? WHERE id=?", (name, cid))
        row = c.execute("SELECT * FROM channels WHERE id=?", (cid,)).fetchone()
    if not row:
        raise KeyError(cid)
    return dict(row)


# ---- caixa de entrada ----

def record_inbound(platform: str, chat_id: str, text: str, *, chat_name: str = "", kind: str = "dm",
                   sender_id: str = "", sender_name: str = "", message_id: str = "",
                   session_id: str = "") -> dict:
    """Mensagem recebida num gateway → item da caixa. Devolve {item_id, mode}."""
    ch = touch_channel(platform, chat_id, chat_name, kind)
    priority = "urgente" if _matches_watch(text) else "voce"
    with connect() as c:
        cur = c.execute(
            "INSERT INTO inbox(channel_id, message_id, sender_id, sender_name, text, received_at, priority, status, session_id) "
            "VALUES(?,?,?,?,?,?,?,?,?)",
            (ch["id"], message_id, sender_id, sender_name, text, time.time(), priority,
             "new" if ch["mode"] != AUTONOMOUS else "auto", session_id),
        )
        return {"item_id": cur.lastrowid, "mode": int(ch["mode"])}


def set_draft(item_id: int, draft: str) -> None:
    """Modo Rascunhar: a resposta do agente vira rascunho (não é enviada)."""
    with connect() as c:
        c.execute("UPDATE inbox SET draft=?, status='drafted' WHERE id=?", (draft, item_id))


def mark_sent(item_id: int, reply: str, status: str = "sent") -> None:
    """Resposta entregue: ``sent`` (aprovada por você) ou ``auto`` (Hermes respondeu sozinho)."""
    with connect() as c:
        c.execute("UPDATE inbox SET draft=?, status=?, sent_at=? WHERE id=?", (reply, status, time.time(), item_id))


def list_inbox(include_done: bool = False, limit: int = 200) -> list[dict]:
    where = "" if include_done else "WHERE i.status NOT IN ('archived')"
    with connect() as c:
        return _rows(c.execute(
            "SELECT i.*, ch.platform, ch.chat_id, ch.name AS chat_name, ch.kind, ch.mode, ch.business_id "
            f"FROM inbox i JOIN channels ch ON ch.id=i.channel_id {where} ORDER BY i.received_at DESC LIMIT ?",
            (limit,),
        ))


def get_inbox(item_id: int) -> Optional[dict]:
    with connect() as c:
        row = c.execute(
            "SELECT i.*, ch.platform, ch.chat_id, ch.name AS chat_name, ch.kind, ch.mode, ch.business_id "
            "FROM inbox i JOIN channels ch ON ch.id=i.channel_id WHERE i.id=?", (item_id,)).fetchone()
    return dict(row) if row else None


def update_inbox(item_id: int, **fields: Any) -> None:
    allowed = {"status", "priority", "draft", "sent_at", "summary"}
    sets = {k: v for k, v in fields.items() if k in allowed}
    if not sets:
        return
    with connect() as c:
        c.execute(f"UPDATE inbox SET {', '.join(k + '=?' for k in sets)} WHERE id=?", (*sets.values(), item_id))


# ---- atividade ----

def log_activity(kind: str, action: str, why: str = "", *, business_id: Optional[str] = None,
                 reversible: bool = False, ref: Optional[dict] = None) -> dict:
    with connect() as c:
        cur = c.execute(
            "INSERT INTO activity(at, business_id, kind, action, why, reversible, ref) VALUES(?,?,?,?,?,?,?)",
            (time.time(), business_id, kind, action, why, int(reversible), json.dumps(ref) if ref else None),
        )
        return dict(c.execute("SELECT * FROM activity WHERE id=?", (cur.lastrowid,)).fetchone())


def list_activity(limit: int = 300) -> list[dict]:
    with connect() as c:
        return _rows(c.execute("SELECT * FROM activity ORDER BY at DESC LIMIT ?", (limit,)))


def mark_undone(activity_id: int) -> Optional[dict]:
    with connect() as c:
        c.execute("UPDATE activity SET undone=1 WHERE id=? AND reversible=1", (activity_id,))
        row = c.execute("SELECT * FROM activity WHERE id=?", (activity_id,)).fetchone()
    return dict(row) if row else None


# ---- palavras vigiadas ----

def list_watches() -> list[str]:
    with connect() as c:
        return [r["word"] for r in c.execute("SELECT word FROM watches ORDER BY word")]


def set_watches(words: list[str]) -> list[str]:
    clean = sorted({w.strip().lower() for w in words if w and w.strip()})
    with connect() as c:
        c.execute("DELETE FROM watches")
        c.executemany("INSERT INTO watches(word) VALUES(?)", [(w,) for w in clean])
    return clean


def _matches_watch(text: str) -> bool:
    low = (text or "").lower()
    return any(w in low for w in list_watches())


# ---- pessoas ----

def list_people() -> list[dict]:
    with connect() as c:
        rows = _rows(c.execute("SELECT * FROM people ORDER BY name"))
    for r in rows:
        r["pending"] = json.loads(r["pending"] or "[]")
    return rows


def save_person(data: dict) -> dict:
    pid = data.get("id") or _new_id()
    name = (data.get("name") or "").strip()
    if not name:
        raise ValueError("nome é obrigatório")
    with connect() as c:
        c.execute(
            "INSERT INTO people(id, name, role, business_id, tone, channels, notes, pending, waiting_since, updated_at) "
            "VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, "
            "business_id=excluded.business_id, tone=excluded.tone, channels=excluded.channels, notes=excluded.notes, "
            "pending=excluded.pending, waiting_since=excluded.waiting_since, updated_at=excluded.updated_at",
            (pid, name, data.get("role", ""), data.get("business_id"), data.get("tone", ""), data.get("channels", ""),
             data.get("notes", ""), json.dumps(data.get("pending") or []), data.get("waiting_since"), time.time()),
        )
    return next(p for p in list_people() if p["id"] == pid)


def delete_person(pid: str) -> None:
    with connect() as c:
        c.execute("DELETE FROM people WHERE id=?", (pid,))


# ---- playbooks ----

def list_playbooks() -> list[dict]:
    with connect() as c:
        rows = _rows(c.execute("SELECT * FROM playbooks ORDER BY rowid DESC"))
    for r in rows:
        r["nodes"] = json.loads(r["nodes"] or "[]")
        r["enabled"] = bool(r["enabled"])
    return rows


def save_playbook(data: dict) -> dict:
    pid = data.get("id") or _new_id()
    with connect() as c:
        c.execute(
            "INSERT INTO playbooks(id, name, business_id, trigger, nodes, enabled, runs, last_run, cron_job_id) "
            "VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, business_id=excluded.business_id, "
            "trigger=excluded.trigger, nodes=excluded.nodes, enabled=excluded.enabled, cron_job_id=excluded.cron_job_id",
            (pid, data["name"], data.get("business_id"), data["trigger"], json.dumps(data.get("nodes") or []),
             int(bool(data.get("enabled", True))), int(data.get("runs") or 0), data.get("last_run"), data.get("cron_job_id")),
        )
    return next(p for p in list_playbooks() if p["id"] == pid)


def mark_playbook_run(pid: str) -> None:
    with connect() as c:
        c.execute("UPDATE playbooks SET runs=runs+1, last_run=? WHERE id=?", (time.time(), pid))


def delete_playbook(pid: str) -> None:
    with connect() as c:
        c.execute("DELETE FROM playbooks WHERE id=?", (pid,))


# ---- meta (config simples: conectores, limites) ----

def get_meta(key: str, default: Any = None) -> Any:
    with connect() as c:
        row = c.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    return json.loads(row["value"]) if row else default


def set_meta(key: str, value: Any) -> None:
    with connect() as c:
        c.execute("INSERT INTO meta(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                  (key, json.dumps(value)))
