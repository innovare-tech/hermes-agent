"""``/api/analyses/*``: Análises dos grupos (design A3) sobre ``ops_center.store`` (tabela ``analyses``).

Cada análise é um lote de mensagens que o Escutar leu junto (spec 09). O Hermes nunca responde no grupo:
aqui a equipe vê o que ele entendeu, marca como resolvida / não relevante e copia a resposta sugerida.
Escopo de perfil igual ao ``/api/ops`` (``?profile=``, ver ``ops_center._capture_profile``).
"""

from __future__ import annotations

import contextvars
import mimetypes
import re
import threading
import time
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from hermes_cli.web_routers.ops_center import _capture_profile, _run, _store

router = APIRouter(prefix="/api/analyses", dependencies=[Depends(_capture_profile)])

_STATUS = ("open", "unseen", "resolved", "irrelevant", "all")
_CLOSED = {"resolved", "irrelevant"}
_REASONS = ("social", "categoria", "urgencia", "resolvido_fora")
_LISTED = {"open", "failed", "resolved", "irrelevant"}  # pending/ignored não aparecem na lista


def _who(request: Request) -> str:
    """Nome do usuário do painel (modo com login); sem login, "Você"."""
    s = getattr(request.state, "session", None)
    return (getattr(s, "display_name", "") or getattr(s, "email", "") or "").strip() or "Você"


def _open_status(a: dict) -> str:
    return "failed" if a.get("error") and not a.get("summary") else "open"


def _is_open(a: dict) -> bool:
    return a["status"] in ("open", "failed")


def _tg_url(tg: dict) -> Optional[str]:
    m = re.fullmatch(r"telegram:-100(\d+)(?::(\d+))?", str(tg.get("target") or ""))
    mid = tg.get("messageId")
    if not m or not mid:
        return None
    return "https://t.me/c/" + "/".join(x for x in (m[1], m[2], str(mid)) if x)


def _evidence_files(a: dict) -> list[dict]:
    """Arquivos servíveis da análise, na ordem do índice da rota de mídia: áudios, depois imagens/vídeos."""
    ev = a.get("evidence") or {}
    return [{"kind": "audio", **x} for x in ev.get("audios") or []] + [{"kind": "media", **x} for x in ev.get("media") or []]


def _shape(a: dict) -> dict:
    """Linha do ops.db → contrato camelCase do painel."""
    ev = a.get("evidence") or {}
    base, tg = f"/api/analyses/{a['id']}/media/", a.get("telegram") or {}
    files = _evidence_files(a)
    audios, media = [], []
    for i, f in enumerate(files):
        if f["kind"] == "audio":
            audios.append({"author": f.get("author"), "at": f.get("at"), "url": base + str(i),
                           **{k: f[k] for k in ("transcript", "transcriptError") if f.get(k)}})
        else:
            kind = str(f.get("type") or "file")
            media.append({"type": kind, "url": base + str(i), "caption": f.get("caption") or "", "author": f.get("author"),
                          "at": f.get("at"), **({"thumbUrl": base + str(i)} if kind in ("image", "photo", "sticker") else {})})
    return {
        "id": a["id"], "code": f"A-{a['id']}", "status": a["status"], "createdAt": a["created_at"],
        "channelId": a["channel_id"], "groupName": a.get("group_name") or a["channel_id"], "platform": a.get("platform"),
        "clientId": a.get("client_id"), "clientName": a.get("client_name"),
        "period": {"from": a.get("period_from"), "to": a.get("period_to")}, "messageCount": a.get("message_count") or 0,
        "participants": a.get("participants") or [], "category": a.get("category"), "urgency": a.get("urgency"),
        "confidence": a.get("confidence"), "summary": a.get("summary") or "",
        "evidence": {"quotes": ev.get("quotes") or [], "audios": audios, "media": media},
        "checks": a.get("checks") or [], "hypothesis": a.get("hypothesis") or "", "suggestedReply": a.get("suggested_reply") or "",
        "error": a.get("error"),
        "telegram": ({"sentAt": tg.get("sentAt"), **({"url": _tg_url(tg)} if _tg_url(tg) else {})} if tg else None),
        "seenBy": a.get("seen_by") or [], "resolved": a.get("resolved"), "irrelevant": a.get("irrelevant"),
    }


def _csv(values: list[str]) -> set[str]:
    return {p for v in values for p in v.split(",") if p}


def _list(status: str, client_id: list[str], category: list[str], urgency: list[str], limit: int) -> list[dict]:
    if status not in _STATUS:
        raise ValueError(f"status inválido: {status}")
    clients, cats, urgs = _csv(client_id), _csv(category), _csv(urgency)
    keep = {"open": lambda a: _is_open(a), "unseen": lambda a: _is_open(a) and not a.get("seen_by"),
            "resolved": lambda a: a["status"] == "resolved", "irrelevant": lambda a: a["status"] == "irrelevant",
            "all": lambda a: a["status"] in _LISTED}[status]
    rows = [a for a in _store().list_analyses(None, limit=limit)
            if keep(a) and (not clients or a.get("client_id") in clients)
            and (not cats or a.get("category") in cats) and (not urgs or a.get("urgency") in urgs)]
    return [_shape(a) for a in rows]


def _get(aid: int) -> dict:
    a = _store().get_analysis(aid)
    if not a or a["status"] in ("pending", "ignored"):
        raise KeyError(aid)
    return a


def _save(aid: int, **fields: Any) -> dict:
    _store().update_analysis(aid, **fields)
    return _shape(_get(aid))


# ---- ignoradas (conversa social do dia) ----
# Declaradas antes de ``/{aid}``: o literal "ignored" não pode virar id.

def _ignored(day: str) -> list[dict]:
    try:
        d = date.today() if day == "today" else date.fromisoformat(day)
    except ValueError as e:
        raise ValueError("date deve ser 'today' ou AAAA-MM-DD") from e
    start = datetime.combine(d, datetime.min.time()).timestamp()
    groups: dict[str, dict] = {}
    for a in _store().list_analyses("ignored", limit=5000):
        if not start <= a["created_at"] < start + 86400:
            continue
        g = groups.setdefault(a["channel_id"], {"channelId": a["channel_id"], "groupName": a.get("group_name") or a["channel_id"],
                                                "count": 0, "texts": Counter()})
        g["count"] += a.get("message_count") or 0
        g["texts"].update(" ".join(str(q.get("text") or "").split())[:30] for q in (a.get("evidence") or {}).get("quotes") or [])
    out = []
    for g in groups.values():
        texts = g.pop("texts")
        texts.pop("", None)
        g["samples"] = [t if n == 1 else f"{t} ×{n}" for t, n in texts.most_common(3)]
        out.append(g)
    return sorted(out, key=lambda g: -g["count"])


@router.get("/ignored")
async def ignored(day: str = Query("today", alias="date")):
    return await _run(_ignored, day)


def _reanalyze(channel_id: str, ctx: contextvars.Context) -> int:
    """Reabre as ignoradas de hoje do canal e as analisa em segundo plano (sem triagem: o humano já decidiu)."""
    from ops_center import listen

    start = datetime.combine(date.today(), datetime.min.time()).timestamp()
    ids = [a["id"] for a in _store().list_analyses("ignored", limit=5000) if a["channel_id"] == channel_id and a["created_at"] >= start]
    if not ids:
        raise KeyError(channel_id)
    for i in ids:
        _store().update_analysis(i, status="pending")

    def work() -> None:
        for i in ids:
            try:
                listen.analyze(i, triage=lambda _s, _c: None)
            except Exception:  # noqa: BLE001 — falha vira análise "failed", como no ticker
                _store().update_analysis(i, status="failed", error="erro interno ao analisar")

    # O escopo do perfil é contextvar: a thread herda uma cópia tirada ainda dentro dele.
    threading.Thread(target=ctx.run, args=(work,), daemon=True, name="ops-reanalyze").start()
    return len(ids)


@router.post("/ignored/{channel_id:path}/reanalyze")
async def reanalyze(channel_id: str):
    from agent.estop import is_engaged

    if is_engaged():
        raise HTTPException(status_code=409, detail="Hermes pausado: retome para analisar")
    n = await _run(lambda: _reanalyze(channel_id, contextvars.copy_context()))
    return {"ok": True, "queued": n}


# ---- lista e detalhe ----

@router.get("")
async def list_analyses(status: str = "open", clientId: list[str] = Query(default=[]), category: list[str] = Query(default=[]),
                        urgency: list[str] = Query(default=[]), limit: int = Query(500, ge=1, le=2000)):
    return await _run(_list, status, clientId, category, urgency, limit)


@router.get("/{aid}")
async def get_analysis(aid: int):
    return await _run(lambda: _shape(_get(aid)))


# ---- ações ----

def _resolve(aid: int, who: str) -> dict:
    a = _get(aid)
    if a["status"] == "resolved":
        return _shape(a)
    if not _is_open(a):
        raise ValueError("só uma análise aberta pode ser marcada como resolvida")
    seen = a.get("seen_by") or []
    return _save(aid, status="resolved", resolved={"by": who, "at": time.time()},
                 seen_by=seen if any(s.get("name") == who for s in seen) else [*seen, {"name": who, "at": time.time()}])


def _reopen(aid: int, field: str, want: str) -> dict:
    a = _get(aid)
    if a["status"] != want:
        return _shape(a)  # já estava aberta (ou noutro estado): nada a desfazer
    return _save(aid, status=_open_status(a), **{field: None})


@router.post("/{aid}/resolve")
async def resolve(aid: int, request: Request):
    return await _run(_resolve, aid, _who(request))


@router.delete("/{aid}/resolve")
async def reopen(aid: int):
    return await _run(_reopen, aid, "resolved", "resolved")


class IrrelevantBody(BaseModel):
    reason: str
    note: str = ""


def _irrelevant(aid: int, who: str, body: IrrelevantBody) -> dict:
    if body.reason not in _REASONS:
        raise ValueError(f"motivo inválido: use {', '.join(_REASONS)}")
    a = _get(aid)
    if a["status"] == "irrelevant":
        return _shape(a)
    if not _is_open(a):
        raise ValueError("só uma análise aberta pode ser marcada como não relevante")
    # Só persiste: a calibragem da triagem por cliente lê isto depois.
    return _save(aid, status="irrelevant", irrelevant={"reason": body.reason, "note": body.note.strip()[:500], "by": who, "at": time.time()})


@router.post("/{aid}/irrelevant")
async def irrelevant(aid: int, body: IrrelevantBody, request: Request):
    return await _run(_irrelevant, aid, _who(request), body)


@router.delete("/{aid}/irrelevant")
async def undo_irrelevant(aid: int):
    return await _run(_reopen, aid, "irrelevant", "irrelevant")


def _seen(aid: int, who: str) -> dict:
    a = _get(aid)
    seen = a.get("seen_by") or []
    if any(s.get("name") == who for s in seen):
        return _shape(a)
    return _save(aid, seen_by=[*seen, {"name": who, "at": time.time()}])


@router.post("/{aid}/seen")
async def seen(aid: int, request: Request):
    return await _run(_seen, aid, _who(request))


def _transcribe(aid: int) -> dict:
    from ops_center import listen

    a = _get(aid)
    ev = a.get("evidence") or {}
    audios = ev.get("audios") or []
    for au in audios:
        if au.get("path") and not au.get("transcript"):
            res = listen._transcribe(au["path"])
            au.pop("transcriptError", None)
            au.update(res)
    return _save(aid, evidence={**ev, "audios": audios})


@router.post("/{aid}/transcribe")
async def transcribe(aid: int):
    return await _run(_transcribe, aid)


# ---- mídia da evidência ----

_MEDIA_OK = ("image/", "video/", "audio/", "application/pdf")


def _media_file(aid: int, n: int) -> tuple[Path, str]:
    """Arquivo do índice ``n`` da evidência desta análise. O caminho vem SEMPRE do ops.db, nunca do cliente."""
    files = _evidence_files(_get(aid))
    if not 0 <= n < len(files) or not files[n].get("path"):
        raise KeyError(n)
    f = files[n]
    path = Path(str(f["path"]))
    guess = mimetypes.guess_type(path.name)[0] or ("audio/ogg" if f["kind"] == "audio" else "")
    if not guess.startswith(_MEDIA_OK) or not path.is_absolute() or not path.is_file():
        raise KeyError(n)
    return path, guess


@router.get("/{aid}/media/{n}")
async def media(aid: int, n: int):
    path, mime = await _run(_media_file, aid, n)
    return FileResponse(path, media_type=mime, headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})
