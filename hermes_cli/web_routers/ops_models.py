"""``/api/providers``, ``/api/models/routing``, ``/api/usage/spend`` e ``/api/limits``: Modelos (design A5).

Quem faz o quê, provedores compatíveis com OpenAI, gasto e limites de um perfil. A lógica e o mapa
tarefa → chave nativa moram em ``ops_center.models``; aqui só o contrato HTTP. Escopo de perfil igual
ao ``/api/ops`` (``?profile=``, ver ``ops_center._capture_profile``). A chave de API nunca volta:
só ``keyHint`` (últimos 4).
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from hermes_cli.web_routers.ops_center import _PROFILE, _capture_profile, _run

router = APIRouter(dependencies=[Depends(_capture_profile)])


def _models():
    from ops_center import models

    return models


def _state_db(fn, default: Any = None):
    """Roda ``fn(conexão)`` no state.db do perfil (somente leitura). ``default`` se não abrir."""
    from hermes_cli.web_server_sessions import _open_session_db_for_profile

    try:
        db = _open_session_db_for_profile(_PROFILE.get(), read_only=True)
    except Exception:  # noqa: BLE001 — sem state.db a tela ainda funciona, só sem gasto
        return default
    try:
        return fn(db._conn)
    finally:
        db.close()


# ---- provedores ----

class TestBody(BaseModel):
    baseUrl: str
    apiKey: str
    kind: str = "openai"


class ProviderBody(BaseModel):
    name: str
    baseUrl: str
    apiKey: str
    kind: str = "openai"


class ProviderPatch(BaseModel):
    name: Optional[str] = None
    baseUrl: Optional[str] = None
    apiKey: Optional[str] = None


@router.get("/api/providers")
async def list_providers():
    return await _run(_models().providers)


@router.post("/api/providers/test")
async def test_connection(body: TestBody):
    """Teste antes de salvar: sempre 200, com ``ok`` e o motivo (``unauthorized``/``unreachable``)."""
    return await _run(lambda: _models().probe(body.baseUrl, body.apiKey, kind=body.kind))


@router.post("/api/providers")
async def create_provider(body: ProviderBody):
    return await _run(_models().create_provider, body.name, body.baseUrl, body.apiKey, body.kind)


@router.patch("/api/providers/{pid}")
async def update_provider(pid: str, body: ProviderPatch):
    return await _run(_models().update_provider, pid, body.name, body.baseUrl, body.apiKey)


@router.delete("/api/providers/{pid}")
async def delete_provider(pid: str):
    return await _run(_models().delete_provider, pid)


@router.post("/api/providers/{pid}/test")
async def test_provider(pid: str):
    return await _run(_models().test_provider, pid)


# ---- quem faz o quê ----

class RoutingBody(BaseModel):
    default: Optional[dict] = None
    tasks: dict = {}


def _routing() -> dict:
    m = _models()
    measured = _state_db(m.measured_tokens, {})
    return {**m.routing(), "taskMeta": m.task_meta(measured)}


@router.get("/api/models/routing")
async def get_routing():
    return await _run(_routing)


@router.put("/api/models/routing")
async def put_routing(body: RoutingBody):
    def go() -> dict:
        m = _models()
        m.apply_routing(m.validate_routing(body.model_dump(), m.providers()))
        return _routing()

    return await _run(go)


@router.put("/api/models/transcription-language")
async def put_transcription_language(body: dict):
    """Idioma dos áudios (``stt.language``); vazio = o Whisper detecta (e em áudio curto erra para inglês)."""
    def go() -> dict:
        from hermes_cli.config import load_config, save_config
        from hermes_cli.web_routers._common import _CONFIG_MUTATION_LOCK

        lang = str(body.get("language") or "").strip().lower()
        if lang and not (2 <= len(lang) <= 3 and lang.isalpha()):
            raise ValueError("use o código ISO do idioma (pt, en, es…) ou vazio para detectar")
        with _CONFIG_MUTATION_LOCK:
            cfg = load_config()
            stt = cfg.get("stt") if isinstance(cfg.get("stt"), dict) else {}
            stt["language"] = lang  # "" grava "detectar" de verdade (apagar faria voltar o padrão do Hermes)
            cfg["stt"] = stt
            save_config(cfg)
        return {"language": lang}

    return await _run(go)


# ---- gasto e limites ----

@router.get("/api/usage/spend")
async def get_spend():
    m = _models()
    return await _run(lambda: _state_db(m.spend, None) or {"today": 0.0, "month": 0.0, **_calendar()})


def _calendar() -> dict:
    from calendar import monthrange
    from datetime import datetime

    n = datetime.now()
    return {"dayOfMonth": n.day, "daysInMonth": monthrange(n.year, n.month)[1]}


class LimitsBody(BaseModel):
    dailyUsd: Optional[float] = None
    monthlyUsd: Optional[float] = None
    alertPct: Optional[int] = None
    onLimit: Optional[str] = None


@router.get("/api/limits")
async def get_limits():
    return await _run(_models().limits)


@router.put("/api/limits")
async def put_limits(body: LimitsBody):
    return await _run(_models().set_limits, body.model_dump())
