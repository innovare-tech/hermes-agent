"""``/api/estop``: the dashboard's "Pausar tudo" kill switch.

The same sentinel as ``hermes pause`` / ``hermes resume`` (``agent.estop``): while engaged the cron
scheduler, kanban dispatcher and new gateway turns hold new work; in-flight work keeps running.
Fleet-wide on purpose — no ``?profile=``: pausing "everything" must not depend on which profile the
dashboard happens to be managing.
"""

from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class EstopBody(BaseModel):
    paused: bool
    reason: Optional[str] = None


def _state() -> dict:
    from agent.estop import get_state

    s = get_state()
    return {"paused": s is not None, "reason": (s or {}).get("reason"), "engaged_at": (s or {}).get("engaged_at")}


@router.get("/api/estop")
async def get_estop():
    return await asyncio.to_thread(_state)


@router.put("/api/estop")
async def put_estop(body: EstopBody):
    from agent.estop import disengage, engage

    def _write() -> dict:
        if body.paused:
            engage(reason=body.reason or "pausado pelo dashboard")
        else:
            disengage()
        return _state()

    return await asyncio.to_thread(_write)
