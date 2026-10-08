"""SQLite store da Central de Operações (``$HERMES_HOME/ops.db``).

Uma conexão por chamada (WAL + busy timeout): o gateway grava mensagens recebidas e envios, o
dashboard lê e configura. Nada aqui importa o resto do Hermes além de ``hermes_constants`` (lazy),
para o gateway poder chamar sem custo de import.

Modos de autonomia por canal: 0 = Observar (só lê), 1 = Rascunhar (resposta fica aguardando
aprovação), 2 = Autônomo (envia sozinho), 3 = Escutar (analisa e avisa a equipe em outro canal).
Canal novo nasce no modo padrão (``default_mode``; de fábrica, Rascunhar). Em Observar, Escutar e grupo em Rascunhar a trava
de saída (``gateway/outbound_guard.py``, ``is_muted``) impede o Hermes de enviar qualquer coisa.
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

OBSERVE, DRAFT, AUTONOMOUS, LISTEN = 0, 1, 2, 3
# Escutar: lê e analisa (lote + triagem), avisa a equipe em outro canal; nunca envia nada no canal.
MODES = (OBSERVE, DRAFT, AUTONOMOUS, LISTEN)
# Padrão de fábrica para canais nunca vistos: Rascunhar (nada sai sem você aprovar). Configurável.
FACTORY_DEFAULT_MODE = DRAFT

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
  pending TEXT NOT NULL DEFAULT '[]', waiting_since REAL, updated_at REAL NOT NULL,
  handles TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS playbooks (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, business_id TEXT, trigger TEXT NOT NULL,
  nodes TEXT NOT NULL DEFAULT '[]', enabled INTEGER NOT NULL DEFAULT 1, runs INTEGER NOT NULL DEFAULT 0,
  last_run REAL, cron_job_id TEXT,
  trigger_kind TEXT NOT NULL DEFAULT 'manual', keywords TEXT NOT NULL DEFAULT '', channel_id TEXT,
  deliver TEXT NOT NULL DEFAULT 'local'
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  created_at REAL NOT NULL, period_from REAL, period_to REAL, message_count INTEGER NOT NULL DEFAULT 0,
  client_id TEXT, client_name TEXT, category TEXT, urgency TEXT, confidence REAL, social REAL,
  summary TEXT, participants TEXT NOT NULL DEFAULT '[]', evidence TEXT NOT NULL DEFAULT '{}',
  checks TEXT NOT NULL DEFAULT '[]', hypothesis TEXT, suggested_reply TEXT, telegram TEXT,
  seen_by TEXT NOT NULL DEFAULT '[]', resolved TEXT, irrelevant TEXT, error TEXT
);
CREATE INDEX IF NOT EXISTS analyses_status ON analyses(status, created_at);
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
        _migrate(con)
        yield con
        con.commit()
    finally:
        con.close()


def _migrate(con: sqlite3.Connection) -> None:
    """Colunas novas em bancos criados antes delas (idempotente)."""
    cols = {r[1] for r in con.execute("PRAGMA table_info(people)")}
    if "handles" not in cols:
        con.execute("ALTER TABLE people ADD COLUMN handles TEXT NOT NULL DEFAULT '{}'")
    cols = {r[1] for r in con.execute("PRAGMA table_info(inbox)")}
    for name, ddl in (("media", "TEXT NOT NULL DEFAULT '[]'"), ("analysis_id", "INTEGER")):
        if name not in cols:
            con.execute(f"ALTER TABLE inbox ADD COLUMN {name} {ddl}")
    cols = {r[1] for r in con.execute("PRAGMA table_info(channels)")}
    for name, ddl in (("client_id", "TEXT"), ("client_name", "TEXT"), ("listen_silence_min", "INTEGER"),
                      ("listen_max_min", "INTEGER")):
        if name not in cols:
            con.execute(f"ALTER TABLE channels ADD COLUMN {name} {ddl}")
    cols = {r[1] for r in con.execute("PRAGMA table_info(playbooks)")}
    for name, ddl in (("trigger_kind", "TEXT NOT NULL DEFAULT 'manual'"), ("keywords", "TEXT NOT NULL DEFAULT ''"),
                      ("channel_id", "TEXT"), ("deliver", "TEXT NOT NULL DEFAULT 'local'")):
        if name not in cols:
            con.execute(f"ALTER TABLE playbooks ADD COLUMN {name} {ddl}")


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


def default_mode() -> int:
    """Modo aplicado a canais novos (Aprovações → Autonomia). Canais já registrados não mudam."""
    mode = get_meta("default_mode", FACTORY_DEFAULT_MODE)
    return mode if mode in MODES else FACTORY_DEFAULT_MODE


def set_default_mode(mode: int) -> int:
    if mode not in MODES:
        raise ValueError("modo inválido")
    set_meta("default_mode", mode)
    return mode


def touch_channel(platform: str, chat_id: str, name: str = "", kind: str = "dm") -> dict:
    """Registra/atualiza um canal visto pelo gateway e devolve sua política atual."""
    cid = channel_id(platform, chat_id)
    mode = default_mode()
    with connect() as c:
        c.execute(
            "INSERT INTO channels(id, platform, chat_id, name, kind, mode, last_seen) VALUES(?,?,?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen, "
            "name=CASE WHEN excluded.name<>'' THEN excluded.name ELSE channels.name END, kind=excluded.kind",
            (cid, platform, str(chat_id), name or "", kind, mode, time.time()),
        )
        return dict(c.execute("SELECT * FROM channels WHERE id=?", (cid,)).fetchone())


def channel_mode(platform: str, chat_id: str) -> int:
    with connect() as c:
        row = c.execute("SELECT mode FROM channels WHERE id=?", (channel_id(platform, chat_id),)).fetchone()
    return int(row["mode"]) if row else default_mode()


def is_muted(mode: int, kind: str) -> bool:
    """Canal onde nada gerado pelo Hermes sai: Observar/Escutar, ou grupo em Rascunhar. DM em
    Rascunhar segue normal (só fala ali quem é autorizado); só a resposta final vira rascunho."""
    return mode in (OBSERVE, LISTEN) or (mode == DRAFT and kind != "dm")


def registered_channel(platform: str, chat_id: str) -> Optional[dict]:
    """``{mode, kind}`` de um canal já visto pelo gateway; ``None`` = desconhecido (destino de cron etc.)."""
    with connect() as c:
        row = c.execute("SELECT mode, kind FROM channels WHERE id=?", (channel_id(platform, chat_id),)).fetchone()
    return {"mode": int(row["mode"]), "kind": row["kind"]} if row else None


def list_channels() -> list[dict]:
    with connect() as c:
        return _rows(c.execute("SELECT * FROM channels ORDER BY last_seen DESC"))


def update_channel(cid: str, *, mode: Optional[int] = None, business_id: Optional[str] = "", name: Optional[str] = None) -> dict:
    if mode is not None and mode not in MODES:
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
                   session_id: str = "", media: Optional[list] = None) -> dict:
    """Mensagem recebida num gateway → item da caixa. Devolve {item_id, mode, kind}.

    Em Escutar o item nasce ``listen``: não pede decisão na caixa, entra no próximo lote de análise."""
    ch = touch_channel(platform, chat_id, chat_name, kind)
    priority = "urgente" if _matches_watch(text) else "voce"
    status = {AUTONOMOUS: "auto", LISTEN: "listen"}.get(ch["mode"], "new")
    with connect() as c:
        cur = c.execute(
            "INSERT INTO inbox(channel_id, message_id, sender_id, sender_name, text, received_at, priority, status, "
            "session_id, media) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (ch["id"], message_id, sender_id, sender_name, text, time.time(), priority, status, session_id,
             json.dumps(media or [])),
        )
        return {"item_id": cur.lastrowid, "mode": int(ch["mode"]), "kind": ch["kind"]}


def set_draft(item_id: int, draft: str) -> None:
    """Modo Rascunhar: a resposta do agente vira rascunho (não é enviada)."""
    with connect() as c:
        c.execute("UPDATE inbox SET draft=?, status='drafted' WHERE id=?", (draft, item_id))


def mark_sent(item_id: int, reply: str, status: str = "sent") -> None:
    """Resposta entregue: ``sent`` (aprovada por você) ou ``auto`` (Hermes respondeu sozinho)."""
    with connect() as c:
        c.execute("UPDATE inbox SET draft=?, status=?, sent_at=? WHERE id=?", (reply, status, time.time(), item_id))


def list_inbox(include_done: bool = False, limit: int = 200) -> list[dict]:
    where = "WHERE i.status <> 'listen'" if include_done else "WHERE i.status NOT IN ('archived', 'listen')"
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
        r["handles"] = json.loads(r.get("handles") or "{}")
    return rows


def save_person(data: dict) -> dict:
    pid = data.get("id") or _new_id()
    name = (data.get("name") or "").strip()
    if not name:
        raise ValueError("nome é obrigatório")
    with connect() as c:
        c.execute(
            "INSERT INTO people(id, name, role, business_id, tone, channels, notes, pending, waiting_since, updated_at, handles) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, "
            "business_id=excluded.business_id, tone=excluded.tone, channels=excluded.channels, notes=excluded.notes, "
            "pending=excluded.pending, waiting_since=excluded.waiting_since, updated_at=excluded.updated_at, handles=excluded.handles",
            (pid, name, data.get("role", ""), data.get("business_id"), data.get("tone", ""), data.get("channels", ""),
             data.get("notes", ""), json.dumps(data.get("pending") or []), data.get("waiting_since"), time.time(),
             json.dumps({k: str(v).strip() for k, v in (data.get("handles") or {}).items() if str(v or "").strip()})),
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
            "INSERT INTO playbooks(id, name, business_id, trigger, nodes, enabled, runs, last_run, cron_job_id, "
            "trigger_kind, keywords, channel_id, deliver) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET "
            "name=excluded.name, business_id=excluded.business_id, trigger=excluded.trigger, nodes=excluded.nodes, "
            "enabled=excluded.enabled, cron_job_id=excluded.cron_job_id, trigger_kind=excluded.trigger_kind, "
            "keywords=excluded.keywords, channel_id=excluded.channel_id, deliver=excluded.deliver",
            (pid, data["name"], data.get("business_id"), data["trigger"], json.dumps(data.get("nodes") or []),
             int(bool(data.get("enabled", True))), int(data.get("runs") or 0), data.get("last_run"), data.get("cron_job_id"),
             data.get("trigger_kind") or "manual", data.get("keywords") or "", data.get("channel_id") or None,
             data.get("deliver") or "local"),
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


# ---- Escutar: lotes e análises ----

LISTEN_DEFAULTS = {
    "silence_min": 5,          # fecha o lote quando o grupo fica X min em silêncio…
    "max_min": 30,             # …ou no máximo Y min depois da 1ª mensagem do lote
    "min_confidence": 0.7,     # triagem: abaixo disso o lote vai para a análise completa
    "toolsets": ["vision", "video", "no_mcp"],  # análise: só leitura; MCP só listado de propósito
    "notify_target": "",       # ex.: telegram:-100123:45 (tópico "Grupos de clientes")
    "triage": {"base_url": "", "model": "jev-latest", "api_key_env": "TYPESAFE_API_KEY"},
}
_ANALYSIS_JSON = ("participants", "evidence", "checks", "telegram", "seen_by", "resolved", "irrelevant")


def listen_settings() -> dict:
    saved = get_meta("listen", {}) or {}
    return {**LISTEN_DEFAULTS, **saved, "triage": {**LISTEN_DEFAULTS["triage"], **(saved.get("triage") or {})}}


def set_listen_settings(patch: dict) -> dict:
    cur = listen_settings()
    merged = {**cur, **{k: v for k, v in patch.items() if k in LISTEN_DEFAULTS and k != "triage"}}
    if isinstance(patch.get("triage"), dict):
        merged["triage"] = {**cur["triage"], **patch["triage"]}
    if not (1 <= int(merged["silence_min"]) <= 60 and 5 <= int(merged["max_min"]) <= 240):
        raise ValueError("janela inválida: silêncio 1–60 min, máximo 5–240 min")
    if not 0.5 <= float(merged["min_confidence"]) <= 0.95:
        raise ValueError("confiança mínima entre 50% e 95%")
    set_meta("listen", merged)
    return merged


def due_listen_channels(now: Optional[float] = None) -> list[str]:
    """Canais em Escutar com lote pronto: silêncio ≥ X min, ou 1ª mensagem há ≥ Y min."""
    now = now or time.time()
    cfg = listen_settings()
    with connect() as c:
        rows = c.execute(
            "SELECT ch.id, MIN(i.received_at) AS first, MAX(i.received_at) AS last, "
            "COALESCE(ch.listen_silence_min, ?) AS silence, COALESCE(ch.listen_max_min, ?) AS maxw "
            "FROM inbox i JOIN channels ch ON ch.id=i.channel_id "
            "WHERE i.status='listen' AND i.analysis_id IS NULL AND ch.mode=? GROUP BY ch.id",
            (cfg["silence_min"], cfg["max_min"], LISTEN)).fetchall()
    return [r["id"] for r in rows if now - r["last"] >= r["silence"] * 60 or now - r["first"] >= r["maxw"] * 60]


def open_batch(channel_id: str) -> Optional[int]:
    """Fecha o lote do canal numa análise ``pending`` (os itens passam a apontar para ela)."""
    with connect() as c:
        c.execute("BEGIN IMMEDIATE")
        items = c.execute("SELECT id, received_at FROM inbox WHERE channel_id=? AND status='listen' "
                          "AND analysis_id IS NULL ORDER BY received_at", (channel_id,)).fetchall()
        if not items:
            return None
        ch = c.execute("SELECT client_id, client_name FROM channels WHERE id=?", (channel_id,)).fetchone()
        cur = c.execute(
            "INSERT INTO analyses(channel_id, created_at, period_from, period_to, message_count, client_id, client_name) "
            "VALUES(?,?,?,?,?,?,?)",
            (channel_id, time.time(), items[0]["received_at"], items[-1]["received_at"], len(items),
             ch["client_id"] if ch else None, ch["client_name"] if ch else None))
        aid = cur.lastrowid
        c.executemany("UPDATE inbox SET analysis_id=? WHERE id=?", [(aid, r["id"]) for r in items])
        return aid


def batch_items(analysis_id: int) -> list[dict]:
    with connect() as c:
        rows = _rows(c.execute("SELECT * FROM inbox WHERE analysis_id=? ORDER BY received_at", (analysis_id,)))
    for r in rows:
        r["media"] = json.loads(r.get("media") or "[]")
    return rows


def _analysis(row: sqlite3.Row) -> dict:
    a = dict(row)
    for k in _ANALYSIS_JSON:
        if a.get(k) is not None:
            a[k] = json.loads(a[k])
    return a


def get_analysis(analysis_id: int) -> Optional[dict]:
    with connect() as c:
        row = c.execute("SELECT a.*, ch.name AS group_name, ch.platform, ch.chat_id FROM analyses a "
                        "JOIN channels ch ON ch.id=a.channel_id WHERE a.id=?", (analysis_id,)).fetchone()
    return _analysis(row) if row else None


def list_analyses(status: Optional[str] = None, limit: int = 200) -> list[dict]:
    where, args = ("WHERE a.status=?", [status]) if status else ("", [])
    with connect() as c:
        rows = c.execute("SELECT a.*, ch.name AS group_name, ch.platform, ch.chat_id FROM analyses a "
                         f"JOIN channels ch ON ch.id=a.channel_id {where} ORDER BY a.created_at DESC LIMIT ?",
                         (*args, limit)).fetchall()
    return [_analysis(r) for r in rows]


def update_analysis(analysis_id: int, **fields: Any) -> None:
    cols = {"status", "category", "urgency", "confidence", "social", "summary", "participants", "evidence", "checks",
            "hypothesis", "suggested_reply", "telegram", "seen_by", "resolved", "irrelevant", "error",
            "client_id", "client_name"}
    bad = set(fields) - cols
    if bad:
        raise ValueError(f"campos inválidos: {sorted(bad)}")
    if not fields:
        return
    vals = [json.dumps(v) if k in _ANALYSIS_JSON and v is not None else v for k, v in fields.items()]
    with connect() as c:
        c.execute(f"UPDATE analyses SET {', '.join(f'{k}=?' for k in fields)} WHERE id=?", (*vals, analysis_id))
