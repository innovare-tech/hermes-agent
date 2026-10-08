"""``/api/ops/*``: Central de Operações do dashboard (negócios, canais e autonomia, caixa de entrada,
atividade, palavras vigiadas, pessoas e playbooks). Estado em ``ops_center.store`` ($HERMES_HOME/ops.db),
compartilhado com o gateway, que grava as mensagens recebidas e respeita a autonomia de cada canal.
"""

from __future__ import annotations

import asyncio
from contextvars import ContextVar
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

# Perfil pedido pelo painel (``?profile=``, o seletor de perfil): cada rota lê e grava o ops.db,
# a memória e o cron DAQUELE perfil — um processo de dashboard serve todos.
_PROFILE: ContextVar[Optional[str]] = ContextVar("ops_profile", default=None)


async def _capture_profile(profile: Optional[str] = Query(None)) -> None:
    _PROFILE.set(profile)


router = APIRouter(prefix="/api/ops", dependencies=[Depends(_capture_profile)])


async def _scoped(fn, *args, **kwargs):
    """``fn`` numa thread, dentro do escopo (home + segredos) do perfil pedido."""
    from hermes_cli.web_routers._common import config_scoped_to_thread

    return await config_scoped_to_thread(_PROFILE.get(), lambda: fn(*args, **kwargs))


def _store():
    from ops_center import store

    return store


async def _act(action: str, *, kind: str = "cfg", business_id: Optional[str] = None) -> None:
    """Registra na Atividade (fail-open) — o painel não precisa lembrar de logar."""
    from hermes_cli.web_routers.ops_activity import log

    await _scoped(log, action, kind=kind, business_id=business_id)


_MODES = ("Observar", "Rascunhar", "Autônomo")
_DOW = ("domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado")


def _human_schedule(s: str) -> str:
    """Cron de 5 campos → português para a Atividade ("0 18 * * 5" → "toda sexta às 18:00")."""
    import re

    m = re.fullmatch(r"(\d+) (\d+) (\*|\d+) \* (\*|[\d,-]+)", s.strip())
    if not m:
        return s
    at = f"{int(m[2]):02d}:{int(m[1]):02d}"
    if m[3] != "*":
        return f"todo dia {m[3]} às {at}"
    if m[4] == "*":
        return f"todo dia às {at}"
    if m[4] == "1-5":
        return f"dias úteis às {at}"
    if m[4].isdigit() and int(m[4]) < 7:
        d = int(m[4])
        return f"{'todo' if d in (0, 6) else 'toda'} {_DOW[d]} às {at}"
    return s


def _clip(t: str, n: int = 60) -> str:
    t = " ".join(str(t).split())
    return t if len(t) <= n else t[: n - 1] + "…"


async def _run(fn, *args, **kwargs):
    try:
        return await _scoped(fn, *args, **kwargs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except KeyError as e:
        raise HTTPException(status_code=404, detail=f"não encontrado: {e}") from e


# ---- negócios ----

class BusinessBody(BaseModel):
    name: str
    color: str = "#a395ff"


@router.get("/businesses")
async def list_businesses():
    return await _run(_store().list_businesses)


@router.post("/businesses")
async def create_business(body: BusinessBody):
    b = await _run(_store().save_business, body.name, body.color)
    await _act(f"Criou o negócio “{b['name']}”", business_id=b["id"])
    return b


@router.put("/businesses/{bid}")
async def update_business(bid: str, body: BusinessBody):
    b = await _run(_store().save_business, body.name, body.color, bid)
    await _act(f"Editou o negócio “{b['name']}”", business_id=bid)
    return b


@router.delete("/businesses/{bid}")
async def delete_business(bid: str):
    name = next((b["name"] for b in await _run(_store().list_businesses) if b["id"] == bid), bid)
    await _run(_store().delete_business, bid)
    await _act(f"Removeu o negócio “{name}”")
    return {"ok": True}


# ---- canais ----

class ChannelBody(BaseModel):
    mode: Optional[int] = None
    business_id: Optional[str] = ""  # "" = não mexe; null = sem negócio
    name: Optional[str] = None


@router.get("/channels")
async def list_channels():
    return await _run(_store().list_channels)


@router.put("/channels/{cid:path}")
async def update_channel(cid: str, body: ChannelBody):
    ch = await _run(_store().update_channel, cid, mode=body.mode, business_id=body.business_id, name=body.name)
    label = ch.get("name") or cid
    if body.mode is not None:
        await _act(f"{label}: autonomia → {_MODES[body.mode]}", business_id=ch.get("business_id"))
    if body.business_id != "":
        await _act(f"{label}: negócio alterado", business_id=ch.get("business_id"))
    return ch


class OpsSettings(BaseModel):
    default_mode: int


@router.get("/settings")
async def get_settings():
    return {"default_mode": await _run(_store().default_mode)}


@router.put("/settings")
async def put_settings(body: OpsSettings):
    mode = await _run(_store().set_default_mode, body.default_mode)
    await _act(f"Canais novos passam a começar em {_MODES[mode]}")
    return {"default_mode": mode}


# ---- pausa do perfil ----
# Diferente do "Pausar tudo" (/api/estop, frota inteira): o ESTOP fica só na pasta DESTE perfil, e
# retomar remove só ele — nunca levanta a pausa global. O perfil padrão É a raiz: pausá-lo sozinho
# pausaria todos, então ele só pausa pelo "Pausar tudo".

class PauseBody(BaseModel):
    paused: bool


def _profile_pause_state() -> dict:
    from agent.estop import sentinel_path
    from hermes_constants import get_process_hermes_home

    path = sentinel_path()
    try:
        is_root = path.parent.resolve() == get_process_hermes_home().resolve()
    except OSError:
        is_root = False
    return {"paused": path.exists(), "can_pause": not is_root}


def _set_profile_pause(paused: bool) -> dict:
    from agent.estop import engage, sentinel_path

    state = _profile_pause_state()
    if not state["can_pause"]:
        raise ValueError("o perfil padrão só pausa pelo “Pausar tudo”")
    if paused:
        engage(reason="perfil pausado pelo painel")
    else:
        sentinel_path().unlink(missing_ok=True)
    return _profile_pause_state()


@router.get("/pause")
async def get_profile_pause():
    return await _run(_profile_pause_state)


@router.put("/pause")
async def put_profile_pause(body: PauseBody):
    state = await _run(_set_profile_pause, body.paused)
    await _act("Pausou este perfil" if body.paused else "Retomou este perfil")
    return state


# ---- caixa de entrada ----

class InboxPatch(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    draft: Optional[str] = None


_INBOX_STATUS = {"new", "drafted", "kept", "archived", "sent", "auto"}
_PRIORITIES = {"urgente", "voce", "resolve", "ignorar"}


@router.get("/inbox")
async def list_inbox(include_done: bool = False):
    return await _run(_store().list_inbox, include_done)


@router.patch("/inbox/{item_id}")
async def patch_inbox(item_id: int, body: InboxPatch):
    if body.status is not None and body.status not in _INBOX_STATUS:
        raise HTTPException(400, "status inválido")
    if body.priority is not None and body.priority not in _PRIORITIES:
        raise HTTPException(400, "prioridade inválida")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    await _run(_store().update_inbox, item_id, **fields)
    item = await _run(_store().get_inbox, item_id)
    if not item:
        raise HTTPException(404, "item não encontrado")
    return item


class ReplyBody(BaseModel):
    text: str


def _send_reply(platform: str, chat_id: str, text: str, profile: Optional[str] = None) -> None:
    """Gateway rodando → envia pelo adaptador vivo (verbo ``ops-send``); senão, mesmo caminho do ``hermes send``."""
    from gateway.control_socket import query_gateway_control
    from gateway.ops_hooks import send_text
    from hermes_constants import get_process_hermes_home

    # O socket de controle é do processo do gateway (home de lançamento), não do perfil; o perfil
    # vai no pedido para o gateway escolher o bot certo.
    params = {"platform": platform, "chat_id": chat_id, "text": text, "profile": profile or ""}
    answer = query_gateway_control(get_process_hermes_home(), "ops-send", params=params, timeout=30.0)
    if answer is None:
        send_text(platform, chat_id, text)
    elif not answer.get("sent"):
        raise RuntimeError(answer.get("error") or "o gateway não enviou")


@router.post("/inbox/{item_id}/reply")
async def reply_inbox(item_id: int, body: ReplyBody):
    from agent.estop import is_engaged

    text = body.text.strip()
    if not text:
        raise HTTPException(400, "resposta vazia")
    if is_engaged():
        raise HTTPException(409, "Hermes está pausado — nada é enviado até retomar")
    item = await _run(_store().get_inbox, item_id)
    if not item:
        raise HTTPException(404, "item não encontrado")
    try:
        await _scoped(_send_reply, item["platform"], item["chat_id"], text, _PROFILE.get())
    except Exception as e:  # noqa: BLE001 — motivo vai pro toast
        raise HTTPException(502, f"Falha ao enviar: {e}") from e
    await _run(_store().mark_sent, item_id, text)
    return await _run(_store().get_inbox, item_id)


# ---- atividade ----

class ActivityBody(BaseModel):
    kind: str
    action: str
    why: str = ""
    business_id: Optional[str] = None
    reversible: bool = False
    ref: Optional[dict[str, Any]] = None


@router.get("/activity")
async def list_activity(limit: int = 300):
    return await _run(_store().list_activity, min(max(limit, 1), 1000))


@router.post("/activity")
async def log_activity(body: ActivityBody):
    if body.kind not in {"msg", "cmd", "pay", "mem", "tkt", "cfg"}:
        raise HTTPException(400, "tipo inválido")
    return await _run(_store().log_activity, body.kind, body.action, body.why,
                      business_id=body.business_id, reversible=body.reversible, ref=body.ref)


@router.post("/activity/{activity_id}/undo")
async def undo_activity(activity_id: int):
    row = await _run(_store().mark_undone, activity_id)
    if not row:
        raise HTTPException(404, "atividade não encontrada")
    if not row["undone"]:
        raise HTTPException(409, "essa ação não pode ser desfeita")
    return row


# ---- palavras vigiadas ----

class WatchesBody(BaseModel):
    words: list[str]


@router.get("/watches")
async def list_watches():
    return await _run(_store().list_watches)


@router.put("/watches")
async def set_watches(body: WatchesBody):
    words = await _run(_store().set_watches, body.words)
    await _act("Palavras vigiadas: " + (", ".join(words) if words else "nenhuma"))
    return words


# ---- pessoas ----

class PersonBody(BaseModel):
    id: Optional[str] = None
    name: str
    role: str = ""
    business_id: Optional[str] = None
    tone: str = ""
    channels: str = ""
    notes: str = ""
    pending: list[str] = []
    waiting_since: Optional[float] = None
    handles: dict[str, str] = {}  # phone / telegram / email — liga o contato às mensagens


@router.get("/people")
async def list_people():
    return await _run(_store().list_people)


@router.put("/people")
async def save_person(body: PersonBody):
    p = await _run(_store().save_person, body.model_dump())
    await _act(f"{'Editou' if body.id else 'Adicionou'} o contato {p['name']}", business_id=p.get("business_id"))
    return p


@router.delete("/people/{pid}")
async def delete_person(pid: str):
    name = next((p["name"] for p in await _run(_store().list_people) if p["id"] == pid), pid)
    await _run(_store().delete_person, pid)
    await _act(f"Removeu o contato {name}")
    return {"ok": True}


# ---- playbooks ----

class PlaybookBody(BaseModel):
    id: Optional[str] = None
    name: str
    business_id: Optional[str] = None
    trigger: str
    nodes: list[dict[str, Any]] = []
    enabled: bool = True
    schedule: str = ""  # vazio = só manual; senão sintaxe do cron ("every day 9am", "0 9 * * *", "2h")
    deliver: str = "local"  # "local" = só registra; ou "plataforma:chat_id"
    trigger_kind: str = "manual"  # manual | schedule | keyword
    keywords: str = ""  # separadas por vírgula (gatilho keyword)
    channel_id: Optional[str] = None  # restringe o gatilho keyword a um canal


def _playbooks():
    from ops_center import playbooks

    return playbooks


def _gateway_running() -> bool:
    from gateway.control_socket import identify_gateway
    from hermes_constants import get_process_hermes_home

    return identify_gateway(get_process_hermes_home(), timeout=2.0) is not None


@router.get("/playbooks")
async def list_playbooks():
    return await _run(_playbooks().list_all)


@router.put("/playbooks")
async def save_playbook(body: PlaybookBody):
    data = body.model_dump(exclude={"schedule", "deliver"})
    p = await _run(_playbooks().save, data, body.schedule, body.deliver)
    when = f" · {_human_schedule(p['schedule'])}" if p.get("schedule") else ""
    await _act(f"{'Salvou' if body.id else 'Criou'} o playbook “{p['name']}”{when}{'' if p['enabled'] else ' (desligado)'}", business_id=p.get("business_id"))
    return p


@router.post("/playbooks/{pid}/run")
async def run_playbook(pid: str):
    from agent.estop import is_engaged

    if is_engaged():
        raise HTTPException(409, "Hermes está pausado — nada roda até retomar")
    result = await _run(_playbooks().run_now, pid)
    return {**result, "gateway_running": await _scoped(_gateway_running)}


@router.delete("/playbooks/{pid}")
async def delete_playbook(pid: str):
    name = next((p["name"] for p in await _run(_store().list_playbooks) if p["id"] == pid), pid)
    await _run(_playbooks().delete, pid)
    await _act(f"Removeu o playbook “{name}”")
    return {"ok": True}


# ---- memória (MEMORY.md / USER.md) ----
# Mesmo MemoryStore do agente (limites da config, varredura de conteúdo malicioso, trava de arquivo).

class MemoryAdd(BaseModel):
    target: str = "memory"
    content: str


class MemoryEdit(BaseModel):
    target: str = "memory"
    entry: str
    content: Optional[str] = None


def _memory_target(target: str) -> str:
    if target not in ("memory", "user"):
        raise HTTPException(400, "target deve ser 'memory' ou 'user'")
    return target


def _memory_snapshot() -> dict:
    from tools.memory_tool import load_on_disk_store

    store = load_on_disk_store()
    return {
        "memory": list(store.memory_entries),
        "user": list(store.user_entries),
        "limits": {"memory": store.memory_char_limit, "user": store.user_char_limit},
        "enabled": {"memory": store.memory_enabled, "user": store.user_profile_enabled},
    }


def _memory_apply(fn) -> dict:
    from tools.memory_tool import load_on_disk_store

    result = fn(load_on_disk_store())
    if not result.get("success", False):
        raise ValueError(result.get("error") or result.get("message") or "a memória recusou a alteração")
    return _memory_snapshot()


@router.get("/memory")
async def get_memory():
    return await _run(_memory_snapshot)


@router.post("/memory")
async def add_memory(body: MemoryAdd):
    target = _memory_target(body.target)
    snap = await _run(_memory_apply, lambda s: s.add(target, body.content))
    await _act(f"Guardou na memória: “{_clip(body.content)}”", kind="mem")
    return snap


@router.put("/memory")
async def edit_memory(body: MemoryEdit):
    target = _memory_target(body.target)
    if not (body.content or "").strip():
        raise HTTPException(400, "conteúdo vazio — use DELETE para remover")
    snap = await _run(_memory_apply, lambda s: s.replace(target, body.entry, body.content, matched_entry=body.entry))
    await _act(f"Editou a memória: “{_clip(body.content or '')}”", kind="mem")
    return snap


@router.delete("/memory")
async def remove_memory(body: MemoryEdit):
    target = _memory_target(body.target)
    snap = await _run(_memory_apply, lambda s: s.remove(target, body.entry, matched_entry=body.entry))
    await _act(f"Esqueceu: “{_clip(body.entry)}”", kind="mem")
    return snap
