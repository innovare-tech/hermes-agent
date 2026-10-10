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


ops = APIRouter(prefix="/api/ops")
clients_router = APIRouter(prefix="/api/clients")


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


_MODES = ("Observar", "Rascunhar", "Autônomo", "Escutar")  # índice = modo no ops.db
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


@ops.get("/businesses")
async def list_businesses():
    return await _run(_store().list_businesses)


@ops.post("/businesses")
async def create_business(body: BusinessBody):
    b = await _run(_store().save_business, body.name, body.color)
    await _act(f"Criou o negócio “{b['name']}”", business_id=b["id"])
    return b


@ops.put("/businesses/{bid}")
async def update_business(bid: str, body: BusinessBody):
    b = await _run(_store().save_business, body.name, body.color, bid)
    await _act(f"Editou o negócio “{b['name']}”", business_id=bid)
    return b


@ops.delete("/businesses/{bid}")
async def delete_business(bid: str):
    name = next((b["name"] for b in await _run(_store().list_businesses) if b["id"] == bid), bid)
    await _run(_store().delete_business, bid)
    await _act(f"Removeu o negócio “{name}”")
    return {"ok": True}


# ---- canais ----

class WindowBody(BaseModel):
    useDefault: bool = False
    silenceMin: Optional[int] = None
    maxMin: Optional[int] = None


class ChannelBody(BaseModel):
    mode: Optional[int] = None
    business_id: Optional[str] = ""  # "" = não mexe; null = sem negócio
    name: Optional[str] = None
    clientId: Optional[str] = None  # ausente = não mexe; null = desvincula
    notClient: Optional[bool] = None
    window: Optional[WindowBody] = None  # ausente = não mexe; null ou {useDefault:true} = janela padrão
    confirm: bool = False  # exigido ao pôr um grupo em Autônomo


def _channels_with_groups():
    from ops_center import wa_groups

    return wa_groups.with_discovery(_store().channels_view())


@ops.get("/channels")
async def list_channels():
    return await _run(_channels_with_groups)


class WhatsAppListenBody(BaseModel):
    chatId: str
    on: bool


@ops.get("/whatsapp/groups")
async def whatsapp_groups_status():
    """Última descoberta da ponte (quantos grupos o número tem, quando) e a política de grupos do perfil."""
    from ops_center import wa_groups

    return await _run(wa_groups.discovery_status)


@ops.post("/whatsapp/groups/listen")
async def whatsapp_group_listen(body: WhatsAppListenBody):
    """Libera (Escutar) ou corta um grupo na ponte do WhatsApp — sem reiniciar nada. Nunca envia ao grupo."""
    from ops_center import wa_groups

    out = await _run(wa_groups.set_listening, body.chatId, body.on)
    name = next((c["name"] for c in await _run(_channels_with_groups) if c.get("chat_id") == body.chatId), body.chatId)
    await _act(f"{name}: " + ("Hermes passou a escutar o grupo" if body.on else "Hermes parou de escutar o grupo"))
    return out


@ops.put("/channels/{cid:path}")
@ops.patch("/channels/{cid:path}")
async def update_channel(cid: str, body: ChannelBody):
    sent = body.model_fields_set
    patch: dict[str, Any] = {"mode": body.mode, "business_id": body.business_id, "name": body.name}
    if "notClient" in sent:
        patch["notClient"] = body.notClient
    if "clientId" in sent:
        patch["clientId"] = body.clientId
    if "window" in sent:
        patch["window"] = body.window.model_dump() if body.window else None
    ch = await _run(_store().patch_channel, cid, patch, confirm=body.confirm)
    label = ch.get("name") or cid
    biz = ch.get("business_id")
    if body.mode is not None:
        await _act(f"{label}: autonomia → {_MODES[body.mode]}", business_id=biz)
    if body.business_id != "":
        await _act(f"{label}: negócio alterado", business_id=biz)
    if "clientId" in sent:
        await _act(f"{label}: vinculado ao cliente {ch['clientName']}" if body.clientId else f"{label}: cliente desvinculado", business_id=biz)
    if sent & {"notClient"} and body.notClient:
        await _act(f"{label}: marcado como “não é cliente”", business_id=biz)
    if "window" in sent:
        w = ch["window"]
        await _act(f"{label}: janela de análise → " + ("padrão" if w["useDefault"] else f"{w['silenceMin']} min de silêncio, no máximo a cada {w['maxMin']} min"), business_id=biz)
    return ch


class OpsSettings(BaseModel):
    default_mode: int


@ops.get("/settings")
async def get_settings():
    return {"default_mode": await _run(_store().default_mode)}


@ops.put("/settings")
async def put_settings(body: OpsSettings):
    mode = await _run(_store().set_default_mode, body.default_mode)
    await _act(f"Canais novos passam a começar em {_MODES[mode]}")
    return {"default_mode": mode}


# ---- Escutar (janela do lote, triagem, destino do aviso) ----

@ops.get("/listen")
async def get_listen():
    return await _run(_store().listen_settings)


@ops.put("/listen")
async def put_listen(body: dict):
    out = await _run(_store().set_listen_settings, body)
    await _act("Configuração do Escutar atualizada")
    return out


# ---- Equipe e participantes dos grupos ----

def _participants(cid: str, profile: Optional[str]) -> dict:
    """Participantes do grupo pelo gateway (verbo ``ops-participants``) + quem é da equipe + nomes já vistos."""
    from gateway.control_socket import query_gateway_control
    from hermes_constants import get_process_hermes_home

    store = _store()
    platform, _, chat_id = cid.partition(":")
    if not chat_id:
        raise KeyError(cid)
    answer = query_gateway_control(get_process_hermes_home(), "ops-participants", timeout=50.0,
                                   params={"platform": platform, "chat_id": chat_id, "profile": profile or ""})
    if answer is None:
        raise ValueError("o gateway não está rodando: ligue-o para ver os participantes")
    if not answer.get("ok"):
        raise ValueError(answer.get("error") or "o gateway não listou os participantes")
    keys = store.team_keys()
    with store.connect() as c:  # nome com que cada pessoa já apareceu nas mensagens deste canal
        seen = {store._person_key(r[0]): r[1] for r in c.execute(
            "SELECT sender_id, sender_name FROM inbox WHERE channel_id=? AND COALESCE(sender_name,'')<>'' "
            "GROUP BY sender_id", (cid,))}
    people = []
    for p in answer.get("participants") or []:
        ids = [p.get("phone"), p.get("jid"), p.get("lid"), p.get("id")]
        key = next((store._person_key(i) for i in ids if store._person_key(i)), "")
        people.append({**p, "key": key, "name": p.get("name") or next((seen[store._person_key(i)] for i in ids
                       if store._person_key(i) in seen), ""),
                       "team": any(store.is_team(i, keys) for i in ids if i)})
    people.sort(key=lambda x: (not x["team"], not x.get("admin"), (x.get("name") or x["key"]).lower()))
    return {"name": answer.get("name") or "", "size": answer.get("size") or len(people), "participants": people}


@ops.get("/channels/{cid}/participants")
async def channel_participants(cid: str):
    return await _run(_participants, cid, _PROFILE.get())


@ops.get("/team")
async def get_team():
    return await _run(_store().list_team)


class TeamBody(BaseModel):
    id: str
    name: str = ""
    aliases: list[str] = []
    photo: Optional[str] = None


@ops.post("/team")
async def add_team(body: TeamBody):
    out = await _run(_store().add_team_member, body.id, body.name, body.aliases, body.photo)
    await _act(f"Marcou {out['name'] or out['id']} como equipe (vale em todos os grupos)")
    return out


@ops.delete("/team/{member_id}")
async def remove_team(member_id: str):
    await _run(_store().remove_team_member, member_id)
    await _act(f"Tirou {member_id} da equipe")
    return {"ok": True}


# ---- Permissões (design A6) ----

_HARD_DENY_EXAMPLES = {
    "Apagar banco ou tabela": ["DROP TABLE", "TRUNCATE", "db.dropDatabase()"],
    "Apagar ou alterar em massa": ["DELETE sem WHERE", "UPDATE sem WHERE", "deleteMany({})"],
    "Apagar arquivos em massa": ["rm -rf", "find … -delete"],
    "Apagar partes do cluster": ["kubectl delete namespace", "kubectl delete pvc", "kubectl drain"],
    "Mexer em chaves e acessos": ["kubectl … secret", ".env", "authorized_keys", "createUser"],
    "Mexer na configuração do Hermes pelo chat": ["ops.db", "permissões"],
}


def _mcp_connectors(matrix: dict) -> tuple[list[dict], list[dict]]:
    """Conectores MCP do perfil → (ferramentas, servidores) sem conectar a ninguém.

    Servidores vêm do ``mcp_servers`` da config; ferramentas, do cache de esquema que a última conexão
    gravou (``tools/mcp_schema_cache``, com o ``readOnlyHint`` de cada uma). Sem cache válido o servidor
    entra sem ferramentas (``discovered: False``) e elas aparecem depois da primeira conexão. A chave é
    ``mcp.<servidor>.<ferramenta>`` com os nomes que a checagem recebe (``mcp__servidor__ferramenta``).
    """
    tools: dict[str, dict] = {}
    servers: dict[str, dict] = {}
    try:
        from hermes_cli.mcp_config import _get_mcp_servers
        from tools.mcp_schema_cache import config_fingerprint, get_cached_entry, tools_from_cache_entry
        from tools.mcp_tool_schema import mcp_prefixed_tool_name, sanitize_mcp_name_component

        for name, cfg in _get_mcp_servers().items():
            if not isinstance(cfg, dict) or cfg.get("enabled") is False:
                continue
            entry = get_cached_entry(name, config_fingerprint(cfg))
            rows = [t for t in tools_from_cache_entry(entry) if isinstance(t, dict) and t.get("name")] if entry else []
            server = sanitize_mcp_name_component(name)
            for t in rows:  # nome exato que a checagem recebe (sanitizado e, se longo, encurtado com hash)
                tool = mcp_prefixed_tool_name(name, t["name"])[len("mcp__") + len(server) + 2:]
                ann = t.get("annotations") if isinstance(t.get("annotations"), dict) else {}
                tools[f"mcp.{server}.{tool}"] = {
                    "key": f"mcp.{server}.{tool}", "group": "mcp:" + server, "label": t["name"],
                    "writes": ann.get("readOnlyHint") is not True, "description": str(t.get("description") or "")[:240]}
            servers[server] = {"id": server, "label": name, "discovered": bool(rows), "tools": len(rows)}
    except Exception:
        pass  # sem config/cache legível: só entram os conectores que já têm regra salva
    for k in matrix:  # regra salva de ferramenta que o cache não conhece (servidor removido, cache velho)
        if k.startswith("mcp.") and k.count(".") >= 2 and k not in tools:
            server = k.split(".")[1]
            tools[k] = {"key": k, "group": "mcp:" + server, "label": k.split(".", 2)[2], "writes": True}
            servers.setdefault(server, {"id": server, "label": server, "discovered": True, "tools": 0})
    return list(tools.values()), list(servers.values())


def _permissions_payload() -> dict:
    from ops_center import guardrails

    cfg = guardrails.settings()
    mcp_tools, mcp_servers = _mcp_connectors(cfg["matrix"])
    return {
        "enabled": cfg["enabled"], "origins": list(guardrails.ORIGINS), "originLabels": guardrails.ORIGIN_LABEL,
        "actions": guardrails.ACTIONS + mcp_tools, "mcpServers": mcp_servers,
        "matrix": cfg["matrix"], "approvers": cfg["approvers"], "approvalTarget": cfg["approval_target"],
        "allowSelfApproval": cfg["allow_self_approval"],
        "approvalTtlMin": cfg["approvalTtlMin"],
        "hardDeny": [{"label": r["label"], "patterns": _HARD_DENY_EXAMPLES.get(r["label"], [])} for r in guardrails.HARD_DENY],
    }


@ops.get("/permissions")
async def get_permissions():
    return await _run(_permissions_payload)


@ops.put("/permissions")
async def put_permissions(body: dict):
    from ops_center import guardrails

    patch = {k: body[k] for k in ("enabled", "matrix", "approvers") if k in body}
    if "approvalTarget" in body:
        patch["approval_target"] = str(body["approvalTarget"] or "")
    if "allowSelfApproval" in body:
        patch["allow_self_approval"] = bool(body["allowSelfApproval"])
    await _run(guardrails.save_settings, patch)
    await _act("Permissões atualizadas (valem a partir do próximo pedido)")
    return await _run(_permissions_payload)


@ops.get("/approvals")
async def get_approvals(status: Optional[str] = None, limit: int = Query(100, ge=1, le=500)):
    return await _run(_store().list_approvals, status, limit)


class DecideBody(BaseModel):
    approve: bool
    note: str = ""


@ops.post("/approvals/{approval_id}/decide")
async def decide_approval(approval_id: int, body: DecideBody):
    """Decisão pelo painel (vale a primeira, painel ou Telegram). Aprovado: executa em segundo plano."""
    from ops_center import guardrails

    out = await _run(guardrails.decide, approval_id, body.approve, "Você (painel)", "dashboard", body.note)
    if not out.get("ok"):
        raise HTTPException(status_code=409, detail=out.get("error") or "não deu para decidir")
    if body.approve:
        # No escopo do perfil (home + segredos); o resultado fica no histórico e vai ao chat de origem.
        asyncio.get_running_loop().create_task(_scoped(guardrails.execute_and_announce, approval_id))
    else:
        await _run(guardrails.announce, out["approval"])
    await _act(f"{'Aprovou' if body.approve else 'Negou'} o pedido #{approval_id}: {out['approval'].get('summary')}")
    return out["approval"]


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


@ops.get("/pause")
async def get_profile_pause():
    return await _run(_profile_pause_state)


@ops.put("/pause")
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


@ops.get("/inbox")
async def list_inbox(include_done: bool = False):
    return await _run(_store().list_inbox, include_done)


@ops.patch("/inbox/{item_id}")
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


@ops.post("/inbox/{item_id}/reply")
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


@ops.get("/activity")
async def list_activity(limit: int = 300):
    return await _run(_store().list_activity, min(max(limit, 1), 1000))


@ops.post("/activity")
async def log_activity(body: ActivityBody):
    if body.kind not in {"msg", "cmd", "pay", "mem", "tkt", "cfg"}:
        raise HTTPException(400, "tipo inválido")
    return await _run(_store().log_activity, body.kind, body.action, body.why,
                      business_id=body.business_id, reversible=body.reversible, ref=body.ref)


@ops.post("/activity/{activity_id}/undo")
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


@ops.get("/watches")
async def list_watches():
    return await _run(_store().list_watches)


@ops.put("/watches")
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


@ops.get("/people")
async def list_people():
    return await _run(_store().list_people)


@ops.put("/people")
async def save_person(body: PersonBody):
    p = await _run(_store().save_person, body.model_dump())
    await _act(f"{'Editou' if body.id else 'Adicionou'} o contato {p['name']}", business_id=p.get("business_id"))
    return p


@ops.delete("/people/{pid}")
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


@ops.get("/playbooks")
async def list_playbooks():
    return await _run(_playbooks().list_all)


@ops.put("/playbooks")
async def save_playbook(body: PlaybookBody):
    data = body.model_dump(exclude={"schedule", "deliver"})
    p = await _run(_playbooks().save, data, body.schedule, body.deliver)
    when = f" · {_human_schedule(p['schedule'])}" if p.get("schedule") else ""
    await _act(f"{'Salvou' if body.id else 'Criou'} o playbook “{p['name']}”{when}{'' if p['enabled'] else ' (desligado)'}", business_id=p.get("business_id"))
    return p


@ops.post("/playbooks/{pid}/run")
async def run_playbook(pid: str):
    from agent.estop import is_engaged

    if is_engaged():
        raise HTTPException(409, "Hermes está pausado — nada roda até retomar")
    result = await _run(_playbooks().run_now, pid)
    return {**result, "gateway_running": await _scoped(_gateway_running)}


@ops.delete("/playbooks/{pid}")
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


@ops.get("/memory")
async def get_memory():
    return await _run(_memory_snapshot)


@ops.post("/memory")
async def add_memory(body: MemoryAdd):
    target = _memory_target(body.target)
    snap = await _run(_memory_apply, lambda s: s.add(target, body.content))
    await _act(f"Guardou na memória: “{_clip(body.content)}”", kind="mem")
    return snap


@ops.put("/memory")
async def edit_memory(body: MemoryEdit):
    target = _memory_target(body.target)
    if not (body.content or "").strip():
        raise HTTPException(400, "conteúdo vazio — use DELETE para remover")
    snap = await _run(_memory_apply, lambda s: s.replace(target, body.entry, body.content, matched_entry=body.entry))
    await _act(f"Editou a memória: “{_clip(body.content or '')}”", kind="mem")
    return snap


@ops.delete("/memory")
async def remove_memory(body: MemoryEdit):
    target = _memory_target(body.target)
    snap = await _run(_memory_apply, lambda s: s.remove(target, body.entry, matched_entry=body.entry))
    await _act(f"Esqueceu: “{_clip(body.entry)}”", kind="mem")
    return snap


# ---- diretório de clientes (por perfil; mesma escolha de perfil de /api/ops) ----

@clients_router.get("")
async def list_clients(q: str = "", cursor: Optional[str] = None, limit: int = 30):
    return await _run(_store().list_clients, q, cursor, limit)


@clients_router.get("/with-analyses")
async def clients_with_analyses():
    return await _run(_store().clients_with_analyses)


@clients_router.post("/import")
async def import_clients(body: list[dict[str, Any]]):
    out = await _run(_store().import_clients, body)
    await _act(f"Diretório de clientes atualizado: {out['imported']} importados")
    return out


@clients_router.get("/sync")
async def clients_sync_status():
    from ops_center import clients_sync

    return await _run(clients_sync.status)


@clients_router.post("/sync")
async def clients_sync_now(body: Optional[dict] = None):
    """Lê o diretório do banco do negócio (só leitura). ``body`` opcional ajusta banco/coleção/variável."""
    from ops_center import clients_sync

    if body:
        await _run(clients_sync.set_source, body)
    out = await _run(clients_sync.sync)
    await _act(f"Clientes sincronizados do banco: {out['imported']} lidos, {out['total']} no diretório")
    return out


# ---- Saúde (A7): verificações e incidentes, por perfil ----

health_router = APIRouter(prefix="/api/health")
incidents_router = APIRouter(prefix="/api/incidents")


def _health():
    from ops_center import health

    return health


@health_router.get("/checks")
async def health_checks():
    return await _run(_health().list_checks)


@health_router.get("/overview")
async def health_overview():
    return await _run(_health().overview)


@health_router.post("/checks/{cid}/run")
async def health_run(cid: str):
    return await _run(_health().run_check, cid)


class ParseBody(BaseModel):
    text: str
    interval: int = 300


@health_router.post("/checks/parse")
async def health_parse(body: ParseBody):
    return await _run(_health().parse_text, body.text, body.interval)


@health_router.post("/checks")
async def health_create(body: dict[str, Any]):
    """``{text, interval, parsed}`` (do "Entendi assim") ou ``{group, name, kind, params, intervalSec, ...}``."""
    h = _health()
    out = await _run(h.create_from_parsed, body) if body.get("parsed") else await _run(
        lambda: h.add_check(group=body.get("group") or "", name=body.get("name") or "", kind=body.get("kind") or "",
                            params=body.get("params") or {}, interval_sec=int(body.get("intervalSec") or 300),
                            detail=body.get("detail") or "", severity=body.get("severity") or "critical",
                            client_id=body.get("clientId")))
    await _act(f"Saúde: nova verificação “{out['name']}”")
    return out


@health_router.post("/checks/recommended")
async def health_recommended():
    out = await _run(_health().create_recommended)
    await _act(f"Saúde: {len(out['created'])} verificações recomendadas criadas")
    return out


@health_router.patch("/checks/{cid}")
async def health_update(cid: str, body: dict[str, Any]):
    return await _run(_health().update_check, cid, body)


@health_router.delete("/checks/{cid}")
async def health_delete(cid: str):
    await _run(_health().delete_check, cid)
    await _act("Saúde: verificação removida")
    return {"ok": True}


@health_router.get("/settings")
async def health_settings():
    return await _run(_health().settings_view)


@health_router.put("/settings")
async def health_save_settings(body: dict[str, Any]):
    out = await _run(_health().save_settings, body)
    await _act("Saúde: conexões atualizadas")
    return out


@incidents_router.get("")
async def incidents(status: str = "open"):
    return await _run(_health().list_incidents, status)


class WhoBody(BaseModel):
    by: str = "Equipe (painel)"
    note: str = ""


@incidents_router.post("/{iid}/ack")
async def incident_ack(iid: int, body: Optional[WhoBody] = None):
    body = body or WhoBody()
    out = await _run(_health().ack, iid, body.by)
    await _act(f"{out['code']} reconhecido")
    return out


@incidents_router.post("/{iid}/resolve")
async def incident_resolve(iid: int, body: Optional[WhoBody] = None):
    body = body or WhoBody()
    out = await _run(_health().resolve, iid, body.by, body.note)
    await _act(f"{out['incident']['code']} resolvido" + (f": {body.note}" if body.note else ""))
    return out


@incidents_router.post("/{iid}/action")
async def incident_action(iid: int, body: Optional[WhoBody] = None):
    body = body or WhoBody()
    out = await _run(_health().request_action, iid, body.by)
    await _act(f"{out['code']}: correção enviada para aprovação")
    return out


# ---- Copiloto do Gestor (A8): clientes, chaves, plano, consumo e auditoria (perfil que administra) ----

copilot_router = APIRouter(prefix="/api/copilot")
aibiz_router = APIRouter(prefix="/api/aibiz")


def _copilot():
    from ops_center import copilot

    return copilot


@copilot_router.get("/clients")
async def copilot_clients(q: str = "", status: str = "", plan: str = "", cursor: Optional[str] = None, limit: int = 20):
    return await _run(_copilot().list_clients, q, status, plan, cursor, max(1, min(int(limit), 50)))


@copilot_router.get("/clients/{sid}")
async def copilot_client(sid: str):
    return await _run(_copilot().get, sid)


@copilot_router.get("/clients/{sid}/audit")
async def copilot_audit(sid: str, cursor: Optional[str] = None):
    return await _run(_copilot().audit, sid, cursor)


class CopilotCreate(BaseModel):
    systemClientId: str
    plan: str = "starter"


@copilot_router.post("/clients")
async def copilot_create(body: CopilotCreate):
    out = await _run(_copilot().create, body.systemClientId, body.plan, "painel")
    await _act(f"Copiloto criado para {out['client']['name']} (plano {body.plan})")
    return out


class RotateBody(BaseModel):
    graceHours: int = 0


@copilot_router.post("/clients/{sid}/rotate-key")
async def copilot_rotate(sid: str, body: Optional[RotateBody] = None):
    out = await _run(_copilot().rotate_key, sid, (body or RotateBody()).graceHours)
    await _act(f"Copiloto: chave rotacionada ({out['client']['name']})")
    return out


class RevokeBody(BaseModel):
    confirm: str
    reason: str = ""


@copilot_router.post("/clients/{sid}/revoke")
async def copilot_revoke(sid: str, body: RevokeBody):
    out = await _run(_copilot().revoke, sid, body.confirm, "painel", body.reason)
    await _act(f"Copiloto revogado: {out['name']}")
    return out


@copilot_router.post("/clients/{sid}/reactivate")
async def copilot_reactivate(sid: str):
    out = await _run(_copilot().reactivate, sid)
    await _act(f"Copiloto reativado: {out['client']['name']}")
    return out


class PlanBody(BaseModel):
    plan: str


@copilot_router.patch("/clients/{sid}")
async def copilot_plan(sid: str, body: PlanBody):
    out = await _run(_copilot().set_plan, sid, body.plan)
    await _act(f"Copiloto: {out['name']} mudou para o plano {body.plan}")
    return out


@copilot_router.get("/settings")
async def copilot_settings():
    c = _copilot()
    return await _run(lambda: {**c.settings(), "catalog": c.CATALOG, "planLabels": {k: v["label"] for k, v in c.PLANS.items()}})


@copilot_router.put("/settings")
async def copilot_save_settings(body: dict[str, Any]):
    return await _run(_copilot().save_settings, body)


@aibiz_router.get("/clients")
async def aibiz_clients(q: str = "", cursor: Optional[str] = None):
    return await _run(_copilot().aibiz_clients, q, cursor)


# ``router`` é o que o servidor monta: /api/ops/*, /api/clients/*, /api/health/* e /api/incidents, com o escopo de perfil.
router = APIRouter(dependencies=[Depends(_capture_profile)])
router.include_router(ops)
router.include_router(clients_router)
router.include_router(health_router)
router.include_router(incidents_router)
router.include_router(copilot_router)
router.include_router(aibiz_router)
