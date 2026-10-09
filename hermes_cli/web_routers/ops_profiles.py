"""``/api/ops/profiles``: agregado de perfis do painel Aurora (seletor da barra lateral e Configurações › Perfis).

Diferente do resto de ``/api/ops/*`` (``ops_center``), este agregado NÃO é escopado por ``?profile=``:
ele lista TODOS os perfis e, para cada um, entra no escopo dele (home + segredos) só para ler o que é
dele — canais, pausa, uso do dia. Cor e ícone ficam em ``<home do perfil>/aurora.json``.

Reusa o que já existe (``POST /api/profiles`` para criar/clonar, ``messaging/platforms`` para os canais,
``/api/ops/pause`` para a pausa); acrescenta só o que o design pede e o backend não tinha: cor/ícone,
nome de exibição sem renomear a pasta e as opções de "Copiar de" (skills / memória / ferramentas), com
canais e chaves NUNCA copiados.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil
import sqlite3
import time
import unicodedata
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ops/profiles")

# Paleta e ícones aprovados no design (A1 - Perfis/PERFIS.md). O front guarda o id, nunca o hex.
COLORS = ("violeta", "azul", "ciano", "coral", "rosa", "lima", "ambar")
ICONS = ("user", "code-xml", "message-circle", "store", "briefcase", "croissant", "glasses", "heart-pulse", "activity", "building-2")
_DEFAULT_LOOK = ("violeta", "user")
# Sugestões para perfis conhecidos que ainda não escolheram aparência.
_SUGGESTED = {"aibiz": ("coral", "message-circle"), "innovare": ("azul", "code-xml")}

_NAME_MAX, _DESC_MAX = 40, 80
# Chaves do config.yaml que dizem "quais ferramentas este perfil usa" (não mexe em aprovações/segurança).
_TOOL_KEYS = ("toolsets", "platform_toolsets", "mcp_servers")


# ---- aparência (aurora.json) ----

def _look(home: Path, pid: str) -> tuple[str, str]:
    color, icon = _SUGGESTED.get(pid, _DEFAULT_LOOK)
    try:
        data = json.loads((home / "aurora.json").read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return color, icon
    if isinstance(data, dict):
        color = data.get("color") if data.get("color") in COLORS else color
        icon = data.get("icon") if data.get("icon") in ICONS else icon
    return color, icon


def _write_look(home: Path, pid: str, color: Optional[str], icon: Optional[str]) -> None:
    cur_color, cur_icon = _look(home, pid)
    payload = {"color": color or cur_color, "icon": icon or cur_icon}
    tmp = home / "aurora.json.tmp"
    tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    tmp.replace(home / "aurora.json")


def slugify(name: str) -> str:
    """Nome → id de pasta: sem acento, minúsculas, só ``a-z0-9-``. Vazio vira ``perfil``."""
    plain = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")[:48].strip("-") or "perfil"


def unique_id(name: str, taken: set[str]) -> str:
    """``slugify`` + sufixo ``-2``, ``-3``… enquanto o id já existir."""
    base = slugify(name)
    pid, n = base, 1
    while pid in taken:
        n += 1
        pid = f"{base}-{n}"
    return pid


# ---- leitura de um perfil (roda no escopo dele) ----

def _scoped_facts() -> dict[str, Any]:
    """Pausa do perfil. Chamado DENTRO do escopo: ``is_engaged`` olha o ESTOP do perfil e o da raiz."""
    from agent.estop import is_engaged
    from hermes_cli.web_routers.ops_center import _profile_pause_state

    st = _profile_pause_state()
    engaged = is_engaged()
    by = None
    if engaged:
        by = "profile" if (st["can_pause"] and st["paused"]) else "all"
    return {"canPause": st["can_pause"], "paused": engaged, "pausedBy": by}


def _usage_today(home: Path) -> dict[str, Any]:
    """Mensagens e custo das sessões iniciadas hoje (state.db do perfil, só leitura)."""
    db = home / "state.db"
    if not db.is_file():
        return {"msgs": 0, "costUsd": 0.0}
    midnight = time.mktime(time.localtime()[:3] + (0, 0, 0, 0, 0, -1))
    try:
        con = sqlite3.connect(f"{db.as_uri()}?mode=ro", uri=True, timeout=2)
        try:
            msgs, cost = con.execute(
                "SELECT COALESCE(SUM(message_count), 0), COALESCE(SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)), 0) "
                "FROM sessions WHERE started_at >= ?",
                (midnight,),
            ).fetchone()
        finally:
            con.close()
    except sqlite3.Error:
        return {"msgs": 0, "costUsd": 0.0}
    return {"msgs": int(msgs or 0), "costUsd": round(float(cost or 0), 4)}


async def _platforms(pid: str) -> list[dict[str, Any]]:
    """Plataformas do perfil (``/api/messaging/platforms`` no escopo dele)."""
    from hermes_cli.web_routers.messaging import get_messaging_platforms

    return (await get_messaging_platforms(profile=pid))["platforms"]


def _health(platforms: list[dict[str, Any]]) -> tuple[list[str], Optional[str], Optional[str]]:
    """(canais ligados, frase do problema, tipo) — mesma regra do ``healthFrom`` do painel."""
    live = [p for p in platforms if p.get("enabled") and p.get("configured")]
    channels = [p["id"] for p in live]
    if live and not any(p.get("gateway_running") for p in live):
        n = len(live)
        return channels, f"Gateway parado com {'1 canal ligado' if n == 1 else f'{n} canais ligados'}", "gateway"
    for p in live:
        if p.get("error_message"):
            return channels, f"{p.get('name') or p['id']}: {p['error_message']}", "channel"
    return channels, None, None


async def _item(info: Any, active: str) -> dict[str, Any]:
    pid = info.name
    home = Path(info.path)
    try:
        platforms = await _platforms(pid)
    except Exception:  # noqa: BLE001 — um perfil ilegível não derruba a lista
        logger.debug("ops profiles: canais de %s indisponíveis", pid, exc_info=True)
        platforms = []
    channels, issue, issue_kind = _health(platforms)

    from hermes_cli.web_routers._common import config_scoped_to_thread

    try:
        facts = await config_scoped_to_thread(pid, _scoped_facts)
    except Exception:  # noqa: BLE001
        logger.debug("ops profiles: pausa de %s indisponível", pid, exc_info=True)
        facts = {"canPause": pid != "default", "paused": False, "pausedBy": None}
    usage = await asyncio.to_thread(_usage_today, home)
    color, icon = await asyncio.to_thread(_look, home, pid)

    status = "paused" if facts["paused"] else "err" if issue else "ok"
    item: dict[str, Any] = {
        "id": pid,
        "name": _label(info),
        "desc": info.description or "",
        "color": color,
        "icon": icon,
        "isDefault": pid == active,
        "group": "copiloto" if pid.startswith("cli-") else None,
        "channels": channels,
        "model": info.model or "",
        "provider": info.provider or "",
        "status": status,
        "canPause": facts["canPause"],
        "pausedBy": facts["pausedBy"],
        "usageToday": usage,
    }
    if issue and status == "err":
        item["issue"] = issue
        item["issueKind"] = issue_kind
    return item


def _roster() -> tuple[list[Any], str]:
    from hermes_cli import profiles as profiles_mod

    return profiles_mod.list_profiles(lazy_skill_count=True), profiles_mod.normalize_profile_name(profiles_mod.get_active_profile())


async def _all_items() -> list[dict[str, Any]]:
    infos, active = await asyncio.to_thread(_roster)
    return list(await asyncio.gather(*(_item(i, active) for i in infos)))


async def _one(pid: str) -> dict[str, Any]:
    infos, active = await asyncio.to_thread(_roster)
    info = next((i for i in infos if i.name == pid), None)
    if info is None:
        raise HTTPException(404, "perfil não encontrado")
    return await _item(info, active)


async def _act(pid: str, text: str) -> None:
    """Registra na Atividade do PERFIL afetado (fail-open)."""
    from hermes_cli.web_routers._common import config_scoped_to_thread
    from hermes_cli.web_routers.ops_activity import log

    try:
        await config_scoped_to_thread(pid, lambda: log(text))
    except Exception:  # noqa: BLE001
        logger.debug("ops profiles: atividade de %s não registrada", pid, exc_info=True)


def _clean(body_name: Optional[str], limit: int, what: str, *, required: bool) -> Optional[str]:
    if body_name is None:
        return None
    text = " ".join(body_name.split())
    if required and not text:
        raise HTTPException(400, f"{what} não pode ficar vazio")
    if len(text) > limit:
        raise HTTPException(400, f"{what} passa de {limit} caracteres")
    return text


def _check_look(color: Optional[str], icon: Optional[str]) -> None:
    if color is not None and color not in COLORS:
        raise HTTPException(400, f"cor inválida: {color}")
    if icon is not None and icon not in ICONS:
        raise HTTPException(400, f"ícone inválido: {icon}")


def _label(info: Any) -> str:
    """Nome que o painel mostra: o de exibição; senão "Pessoal" para a raiz ou o id com a inicial maiúscula."""
    return info.display_name or ("Pessoal" if info.name == "default" else info.name[:1].upper() + info.name[1:])


def _name_taken(name: str, infos: list[Any], *, except_id: str = "") -> bool:
    low = name.lower()
    return any(i.name != except_id and _label(i).lower() == low for i in infos)


# ---- rotas ----

@router.get("")
async def list_profiles_aggregate():
    return await _all_items()


class ProfilePatch(BaseModel):
    name: Optional[str] = None
    desc: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


@router.patch("/{pid}")
async def patch_profile(pid: str, body: ProfilePatch):
    from hermes_cli import profiles as profiles_mod

    _check_look(body.color, body.icon)
    name = _clean(body.name, _NAME_MAX, "o nome", required=True)
    desc = _clean(body.desc, _DESC_MAX, "a descrição", required=False)

    def _apply() -> None:
        infos = profiles_mod.list_profiles(lazy_skill_count=True)
        if not any(i.name == pid for i in infos):
            raise HTTPException(404, "perfil não encontrado")
        if name is not None and _name_taken(name, infos, except_id=pid):
            raise HTTPException(409, "Já existe um perfil com esse nome.")
        home = profiles_mod.get_profile_dir(pid)
        # O id (pasta) não muda: só o nome de exibição — não quebra atalhos nem tarefas agendadas.
        if name is not None:
            profiles_mod.set_profile_display_name(pid, name)
        if desc is not None:
            profiles_mod.write_profile_meta(home, description=desc, description_auto=False)
        if body.color or body.icon:
            _write_look(home, pid, body.color, body.icon)

    await asyncio.to_thread(_apply)
    await _act(pid, "Editou este perfil (" + ", ".join(k for k, v in (("nome", name), ("descrição", desc), ("cor", body.color), ("ícone", body.icon)) if v is not None) + ")")
    return await _one(pid)


class CopyOptions(BaseModel):
    skills: bool = True
    memory: bool = False
    tools: bool = True


class ProfileCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    desc: str = ""
    color: str = _DEFAULT_LOOK[0]
    icon: str = _DEFAULT_LOOK[1]
    copyFrom: Optional[str] = None
    copy_: CopyOptions = Field(default_factory=CopyOptions, alias="copy")


def _trim_clone(home: Path, copy: CopyOptions) -> None:
    """Deixa no clone só o que foi pedido. Chaves de API (.env) NUNCA ficam; canais já saíram na criação."""
    from hermes_cli import profiles as profiles_mod

    (home / ".env").write_text(profiles_mod._PLACEHOLDER_ENV, encoding="utf-8")
    if not copy.memory:
        for f in ("MEMORY.md", "USER.md"):
            (home / "memories" / f).unlink(missing_ok=True)
    if not copy.skills:
        shutil.rmtree(home / "skills", ignore_errors=True)
        (home / "skills").mkdir()
        profiles_mod.seed_profile_skills(home, quiet=True)  # como num perfil novo: só as skills incluídas
    if not copy.tools:
        cfg_path = home / "config.yaml"
        cfg = profiles_mod._load_yaml_dict(cfg_path)
        if cfg is not None and any(k in cfg for k in _TOOL_KEYS):
            from utils import atomic_yaml_write

            atomic_yaml_write(cfg_path, {k: v for k, v in cfg.items() if k not in _TOOL_KEYS}, sort_keys=False)


@router.post("")
async def create_profile(body: ProfileCreate):
    from hermes_cli import profiles as profiles_mod
    from hermes_cli.web_models import ProfileCreate as NativeCreate
    from hermes_cli.web_routers.profiles import create_profile_endpoint

    name = _clean(body.name, _NAME_MAX, "o nome", required=True) or ""
    desc = _clean(body.desc, _DESC_MAX, "a descrição", required=False) or ""
    _check_look(body.color, body.icon)
    src = (body.copyFrom or "").strip() or None

    infos = await asyncio.to_thread(profiles_mod.list_profiles, lazy_skill_count=True)
    if _name_taken(name, infos):
        raise HTTPException(409, "Já existe um perfil com esse nome.")
    if src and not any(i.name == src for i in infos):
        raise HTTPException(404, f"perfil de origem não encontrado: {src}")
    pid = unique_id(name, {i.name for i in infos})
    try:
        profiles_mod.validate_profile_name(pid)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    # Mesmo caminho do dashboard antigo (clona config/skills/SOUL/memória do origem, sem canais; cria o atalho).
    await create_profile_endpoint(NativeCreate(name=pid, clone_from=src, description=desc or None, clone_channels=False))
    home = profiles_mod.get_profile_dir(pid)

    def _finish() -> None:
        try:
            if src:
                _trim_clone(home, body.copy_)
            profiles_mod.write_profile_meta(home, display_name=name)
            _write_look(home, pid, body.color, body.icon)
        except Exception:
            # Meio-criado é pior que não criado: desfaz para o "Tentar de novo" começar limpo.
            logger.exception("ops profiles: falha ao finalizar %s; desfazendo", pid)
            try:
                profiles_mod.delete_profile(pid, yes=True)
            except Exception:  # noqa: BLE001
                logger.exception("ops profiles: não consegui desfazer %s", pid)
            raise

    try:
        await asyncio.to_thread(_finish)
    except Exception as e:
        raise HTTPException(500, "Não consegui criar o perfil. Nada foi criado.") from e

    copied = [lbl for flag, lbl in ((body.copy_.skills, "skills"), (body.copy_.memory, "memória"), (body.copy_.tools, "ferramentas")) if flag] if src else []
    await _act(pid, f"Criou este perfil{' a partir de ' + src + ' (copiou ' + ', '.join(copied) + '; canais e chaves não)' if src else ''}")
    return await _one(pid)
