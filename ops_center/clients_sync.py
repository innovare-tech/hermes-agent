"""Diretório de clientes lido do MongoDB do negócio (só leitura) → tabela ``clients`` do ``ops.db``.

Fonte configurável por perfil (meta ``clients_source``): a conexão fica no ``.env`` do perfil
(``uri_env``, padrão ``AIBIZ_MONGO_URI``), nunca no ``ops.db``; banco e coleção vêm da config
(padrão ``aibiz_mrz`` / ``system_client``). O id do cliente é o campo ``id`` (o ``system_client.id``
que o negócio usa), não o ``_id`` do Mongo. Só clientes com ``status: active``; quem foi desativado
sai do diretório na sincronização seguinte. Só faz ``find`` com projeção: nada é escrito no banco.

Usado pelo botão "Sincronizar clientes" (``POST /api/clients/sync``) e pelo ticker do gateway
(``maybe_sync``, a cada ``SYNC_EVERY_S``), para a sugestão de vínculo em Canais e os avisos com
nome e id do cliente.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

from ops_center import store

logger = logging.getLogger(__name__)

DEFAULTS = {"uri_env": "AIBIZ_MONGO_URI", "db": "aibiz_mrz", "collection": "system_client"}
ACTIVE_FILTER = {"status": "active"}  # só clientes ativos; desativados saem do diretório
SYNC_EVERY_S = 6 * 3600
_FIELDS = {"id": 1, "_id": 1, "name": 1, "shortName": 1, "status": 1}


def source() -> dict:
    return {**DEFAULTS, **(store.get_meta("clients_source") or {})}


def set_source(patch: dict) -> dict:
    cur = source()
    for k in DEFAULTS:
        if k in patch:
            v = str(patch[k] or "").strip()
            if not v:
                raise ValueError(f"{k} não pode ficar vazio")
            cur[k] = v
    store.set_meta("clients_source", cur)
    return cur


def status() -> dict:
    from agent.secret_scope import get_secret_str

    src = source()
    return {**src, "configured": bool(get_secret_str(src["uri_env"])), "last": store.get_meta("clients_sync_last")}


def _mongo() -> Any:
    from pm.extras import available

    if not available("mongo"):
        import pm  # extra "mongo" (pymongo): instalado pelo gerenciador do Hermes na 1ª sincronização

        pm.sync_venv(["mongo"], explicit=True)
    import pymongo

    return pymongo


def to_clients(docs: Any) -> list[dict]:
    """Documentos do Mongo → itens do diretório (``systemClientId`` = ``id``; sem ``id``, o ``_id``)."""
    out = []
    for d in docs:
        cid = str(d.get("id") or d.get("_id") or "").strip()
        name = str(d.get("name") or d.get("shortName") or "").strip()
        if cid and name:
            out.append({"systemClientId": cid, "name": name})
    return out


def sync(*, fetch: Optional[Any] = None) -> dict:
    """Busca os clientes e grava no diretório. ``{imported, total, at, db}``; erro vira ``ValueError`` legível."""
    from agent.secret_scope import get_secret_str

    src = source()
    if fetch is None:
        uri = get_secret_str(src["uri_env"])
        if not uri:
            raise ValueError(f"falta a conexão do banco: adicione {src['uri_env']} em Chaves de API deste perfil")
        pymongo = _mongo()
        try:
            client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=8000, readPreference="secondaryPreferred",
                                         appname="hermes-clients-sync")
            docs = list(client[src["db"]][src["collection"]].find(ACTIVE_FILTER, _FIELDS))
            client.close()
        except Exception as e:  # noqa: BLE001 — a mensagem vai para a tela, sem a URI
            raise ValueError(f"não consegui ler {src['db']}.{src['collection']}: {type(e).__name__}") from e
    else:
        docs = fetch(src)
    items = to_clients(d for d in docs if d.get("status", "active") == "active")
    out = store.import_clients(items)
    removed = store.prune_clients([it["systemClientId"] for it in items])
    last = {"at": time.time(), "imported": out["imported"], "removed": removed, "total": out["total"] - removed,
            "db": src["db"]}
    store.set_meta("clients_sync_last", last)
    return last


def maybe_sync() -> None:
    """Para o ticker: sincroniza se há conexão configurada e a última foi há mais de ``SYNC_EVERY_S``."""
    try:
        st = status()
        last_try = float(store.get_meta("clients_sync_try") or 0)
        if not st["configured"] or time.time() - max(float((st["last"] or {}).get("at") or 0), last_try) < SYNC_EVERY_S:
            return
        store.set_meta("clients_sync_try", time.time())  # falha não vira nova tentativa a cada ciclo
        sync()
    except Exception:
        logger.warning("ops_center: sincronização de clientes falhou", exc_info=True)
