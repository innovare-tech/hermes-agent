"""``/api/notify/*``: Avisos da equipe (design A4) sobre ``ops_center.notify``.

Para onde cada aviso vai no supergrupo do Telegram (tópico, silêncio, menções, resumo diário) e o botão
"Enviar teste". Escopo de perfil igual ao ``/api/ops`` (``?profile=``, ver ``ops_center._capture_profile``);
o token do bot vem do escopo de segredos do perfil e nunca volta ao painel.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from hermes_cli.web_routers.ops_center import _act, _capture_profile, _run

router = APIRouter(prefix="/api/notify", dependencies=[Depends(_capture_profile)])


def _notify():
    from ops_center import notify

    return notify


async def _go(fn, *args, **kwargs):
    """``_run`` (escopo do perfil; ValueError → 400) + erro do Telegram → 502 com a mensagem do Telegram."""
    try:
        return await _run(fn, *args, **kwargs)
    except _notify().TelegramError as e:
        raise HTTPException(status_code=502, detail=e.message) from e


class ChatBody(BaseModel):
    chatId: str


class RefreshBody(BaseModel):
    create: bool = False
    topics: Optional[list[dict[str, Any]]] = None  # tópicos que já existiam: [{threadId, name}]


class TestBody(BaseModel):
    type: str
    draft: Optional[dict[str, Any]] = None


@router.get("/telegram")
async def get_telegram():
    return await _go(_notify().telegram)


@router.put("/telegram")
async def put_telegram(body: ChatBody):
    return await _go(_notify().set_chat, body.chatId)


@router.post("/telegram/topics/refresh")
async def refresh_topics(body: Optional[RefreshBody] = None):
    b = body or RefreshBody()
    return await _go(_notify().refresh_topics, b.create, b.topics)


@router.get("/routes")
async def get_routes():
    return await _go(_notify().routes)


@router.put("/routes")
async def put_routes(body: dict[str, Any]):
    saved = await _go(_notify().save_routes, body)
    await _act("Alterou para onde vão os avisos da equipe")
    return saved


@router.post("/test")
async def send_test(body: TestBody):
    return await _go(_notify().test, body.type, body.draft)


@router.post("/digest/send-now")
async def digest_now():
    sent = await _go(_notify().send_digest)
    return {"ok": True, "topic": sent["topic"], "messageUrl": sent["url"]}


@router.post("/quiet/flush")
async def quiet_flush():
    return {"flushed": await _go(_notify().flush_quiet)}
