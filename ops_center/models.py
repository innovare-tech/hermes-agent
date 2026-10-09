"""Modelos (design A5): provedores, quem faz o quê, gasto e limites de um perfil.

Nada aqui inventa armazenamento onde o Hermes já tem chave nativa. Tarefa → onde mora:

==================  ====================================================================
default             ``model.provider`` + ``model.default`` (config.yaml)
vision              ``auxiliary.vision.provider`` + ``.model``
compaction          ``auxiliary.compression.provider`` + ``.model``
transcription       ``stt.provider`` + ``stt.<provedor>.model`` (``model_id`` no ElevenLabs)
scheduled           ``cron.model_provider`` + ``cron.model``
triage_jev          ``ops.db`` listen: ``triage.model`` (+ ``min_confidence``); o endereço do Jev é o do provedor
group_analysis      ``ops.db`` meta ``models.group_analysis`` (lido por ``group_analysis_model()``)
main, channel.*     ``ops.db`` meta ``models.tasks`` (o Hermes não tem modelo por conversa/plataforma;
                    só ``channel_overrides`` por chat) — ``resolved_model()`` resolve a herança
==================  ====================================================================

Chaves de API ficam no ``.env`` do perfil (``key_env``); aqui só sai ``keyHint`` (últimos 4).
Limites e estado dos provedores ficam no ``ops.db``. Tudo roda no escopo do perfil pedido
(``hermes_cli.web_routers.ops_center._run``).
"""

from __future__ import annotations

import calendar
import json
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any, Optional

from ops_center import store

TASKS = ("main", "channel.telegram", "channel.whatsapp", "channel.api", "group_analysis", "triage_jev",
         "vision", "transcription", "compaction", "scheduled")
# O que o modelo precisa saber fazer em cada tarefa.
NEEDS = {t: "text" for t in TASKS} | {"triage_jev": "decision", "vision": "vision", "transcription": "audio"}
LACKS = {"text": "não gera texto", "vision": "não lê imagens", "audio": "não ouve áudio", "decision": "não é um modelo de decisão"}
AUX_SLOT = {"vision": "vision", "compaction": "compression"}
OPS_TASKS = ("main", "channel.telegram", "channel.whatsapp", "channel.api")  # sem chave nativa: ficam no ops.db
PARENT = {"channel.telegram": "main", "channel.whatsapp": "main", "channel.api": "main"}  # o resto herda do padrão

# Tokens médios por unidade (entrada, saída) quando o perfil ainda não tem medida própria.
TASK_UNITS = {
    "default": ("mil mensagens", 1500, 400), "main": ("mil mensagens", 2500, 600),
    "channel.telegram": ("mil mensagens", 1800, 400), "channel.whatsapp": ("mil mensagens", 1800, 350),
    "channel.api": ("mil mensagens", 1200, 300), "group_analysis": ("mil lotes", 6000, 700),
    "triage_jev": ("mil decisões", 700, 0), "vision": ("mil imagens", 1400, 250),
    "transcription": ("mil áudios de 1 min", None, None), "compaction": ("mil resumos", 8000, 800),
    "scheduled": ("mil execuções", 3000, 600),
}

# Transcrição: o Hermes só fala com estes provedores de STT; a chave do modelo varia.
STT_KEY = {"openai": "model", "groq": "model", "mistral": "model", "xai": "model", "deepinfra": "model", "elevenlabs": "model_id"}
# (modelo, US$ por minuto de áudio — preço de tabela do provedor; None = não informado)
STT_MODELS = {
    "openai": [("whisper-1", 0.006), ("gpt-4o-mini-transcribe", 0.003), ("gpt-4o-transcribe", 0.006)],
    "groq": [("whisper-large-v3-turbo", 0.0007), ("whisper-large-v3", 0.0019)],
    "mistral": [("voxtral-mini-latest", None)],
    "elevenlabs": [("scribe_v2", None)],
}

TYPESAFE = "typesafe"
JEV_MODELS = ("jev-latest",)
JEV_PRICE_IN = 0.042  # US$ por milhão de tokens de entrada; valor da TypeSafe ainda a confirmar

ON_LIMIT = ("notify", "pause_non_urgent", "pause_profile")
LIMIT_DEFAULTS = {"dailyUsd": 15.0, "monthlyUsd": 300.0, "alertPct": 80, "onLimit": "pause_non_urgent"}


# ---------------------------------------------------------------- limites (puro)

def evaluate_limits(spend: dict, limits: dict) -> dict:
    """``{state: 'ok'|'alert'|'over', action, windows}`` a partir do gasto e dos limites.

    ``over`` em qualquer janela (dia ou mês) → ``action = limits.onLimit``; ``alert`` (passou de
    ``alertPct`` do limite, ainda abaixo dele) → ``action = 'notify'``; ``ok`` → ``action = None``.
    Limite vazio ou ≤ 0 = sem limite naquela janela. Só avalia: quem aplica a ação é outro.
    """
    pct = float(limits.get("alertPct") or LIMIT_DEFAULTS["alertPct"])

    def window(spent: Any, cap: Any) -> str:
        spent, cap = float(spent or 0), float(cap or 0)
        if cap <= 0:
            return "ok"
        return "over" if spent >= cap else "alert" if spent >= cap * pct / 100 else "ok"

    windows = {"day": window(spend.get("today"), limits.get("dailyUsd")),
               "month": window(spend.get("month"), limits.get("monthlyUsd"))}
    state = "over" if "over" in windows.values() else "alert" if "alert" in windows.values() else "ok"
    on_limit = limits.get("onLimit") if limits.get("onLimit") in ON_LIMIT else LIMIT_DEFAULTS["onLimit"]
    return {"state": state, "action": on_limit if state == "over" else "notify" if state == "alert" else None, "windows": windows}


def limits() -> dict:
    saved = store.get_meta("models.limits")
    return {**LIMIT_DEFAULTS, **(saved or {}), "saved": saved is not None}


def set_limits(patch: dict) -> dict:
    cur = limits()
    merged = {k: patch[k] if patch.get(k) is not None else cur[k] for k in LIMIT_DEFAULTS}
    for k in ("dailyUsd", "monthlyUsd"):
        try:
            merged[k] = round(float(merged[k]), 2)
        except (TypeError, ValueError):
            raise ValueError("o limite precisa ser um número") from None
        if not 0 < merged[k] <= 1_000_000:
            raise ValueError("o limite precisa ficar entre US$ 0,01 e US$ 1.000.000")
    if not isinstance(merged["alertPct"], int) or isinstance(merged["alertPct"], bool) or not 1 <= merged["alertPct"] <= 99:
        raise ValueError("o aviso precisa ficar entre 1% e 99% do limite")
    if merged["onLimit"] not in ON_LIMIT:
        raise ValueError(f"onLimit: use {', '.join(ON_LIMIT)}")
    store.set_meta("models.limits", merged)
    return limits()


# ---------------------------------------------------------------- gasto

def spend(conn: sqlite3.Connection, now: Optional[datetime] = None) -> dict:
    """Gasto do perfil (US$) hoje e no mês, pelo ``state.db``: custo real quando houver, senão o estimado.

    Soma o uso auxiliar (visão, compactação…), que não entra nos contadores da sessão. Dia e mês no
    fuso local, como o painel de análises.
    """
    now = now or datetime.now()
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)

    def total(since: float) -> float:
        main = conn.execute("SELECT COALESCE(SUM(COALESCE(NULLIF(actual_cost_usd, 0), estimated_cost_usd, 0)), 0) "
                            "FROM sessions WHERE started_at >= ?", (since,)).fetchone()[0]
        try:
            aux = conn.execute("SELECT COALESCE(SUM(u.estimated_cost_usd), 0) FROM session_model_usage u "
                               "JOIN sessions s ON s.id = u.session_id WHERE s.started_at >= ? AND u.task != ''",
                               (since,)).fetchone()[0]
        except sqlite3.Error:  # state.db antigo, sem a tabela de uso por chamada
            aux = 0
        return round(float(main or 0) + float(aux or 0), 4)

    return {"today": total(day.timestamp()), "month": total(day.replace(day=1).timestamp()),
            "dayOfMonth": now.day, "daysInMonth": calendar.monthrange(now.year, now.month)[1]}


def measured_tokens(conn: sqlite3.Connection, min_calls: int = 5) -> dict:
    """Tokens médios por chamada medidos no perfil, onde o Hermes registra por tarefa (visão, compactação)."""
    out: dict = {}
    try:
        rows = conn.execute("SELECT task, SUM(input_tokens), SUM(output_tokens), SUM(COALESCE(api_call_count, 0)) "
                            "FROM session_model_usage WHERE task IN ('vision', 'compression') GROUP BY task").fetchall()
    except sqlite3.Error:
        return out
    for task, tin, tout, calls in rows:
        if calls and calls >= min_calls:
            out["compaction" if task == "compression" else task] = (round(tin / calls), round(tout / calls))
    return out


def task_meta(measured: Optional[dict] = None) -> dict:
    measured = measured or {}
    meta = {}
    for t, (unit, tin, tout) in TASK_UNITS.items():
        m = measured.get(t)
        meta[t] = {"unit": unit, "tokensIn": m[0] if m else tin, "tokensOut": m[1] if m else tout, "measured": bool(m)}
    return meta


# ---------------------------------------------------------------- teste de conexão

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):  # a chave não segue para outro endereço
        return None


def _opener(url: str) -> urllib.request.OpenerDirector:
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    handlers: list = [_NoRedirect()]
    if host in ("localhost", "127.0.0.1", "::1") or host.endswith(".local"):
        handlers.append(urllib.request.ProxyHandler({}))  # proxy do sistema não enxerga a própria máquina
    return urllib.request.build_opener(*handlers)


def valid_url(url: str) -> bool:
    p = urllib.parse.urlparse((url or "").strip())
    return p.scheme in ("http", "https") and bool(p.hostname)


def probe(base_url: str, api_key: str, *, kind: str = "openai", timeout: float = 8.0) -> dict:
    """``GET {base}/models``: ``{ok, latencyMs, models}`` ou ``{ok: False, code, message}``.

    ``code``: ``unauthorized`` (401/403), ``unreachable`` (sem rota, erro de rede ou HTTP ≠ 2xx) ou
    ``no_models`` (respondeu, mas sem lista). Provedor de decisão (Jev) não tem ``/models`` garantido:
    qualquer resposta abaixo de 500, que não seja de chave recusada, vale como alcançável.
    """
    base = (base_url or "").strip().rstrip("/")
    if not valid_url(base):
        return {"ok": False, "code": "unreachable", "message": "O endereço precisa começar com https:// e ter um domínio."}
    req = urllib.request.Request(base + "/models", headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json",
                                                            "User-Agent": "hermes-dashboard"})
    t0 = time.monotonic()
    try:
        with _opener(base).open(req, timeout=timeout) as r:
            body = r.read(2_000_000)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            return {"ok": False, "code": "unauthorized", "message": f"A chave foi recusada (erro {e.code}). Confira se copiou inteira."}
        if kind == "decision" and e.code < 500:
            return {"ok": True, "latencyMs": round((time.monotonic() - t0) * 1000), "models": []}
        return {"ok": False, "code": "unreachable", "message": f"O endereço respondeu erro {e.code}. Confira se é a URL base da API (costuma terminar em /v1)."}
    except (urllib.error.URLError, OSError, ValueError) as e:
        why = getattr(e, "reason", e)
        return {"ok": False, "code": "unreachable", "message": f"Não consegui chegar no endereço ({why}). Ele está ligado e acessível pelo servidor do Hermes?"}
    latency = round((time.monotonic() - t0) * 1000)
    try:
        payload = json.loads(body.decode("utf-8", "replace"))
    except ValueError:
        payload = None
    rows = payload.get("data") if isinstance(payload, dict) else payload
    ids = [str(m.get("id") if isinstance(m, dict) else m) for m in rows if (m.get("id") if isinstance(m, dict) else m)] if isinstance(rows, list) else []
    if not ids and kind != "decision":
        return {"ok": False, "code": "no_models", "message": "O endereço respondeu, mas não listou modelos. Confira se é uma API compatível com OpenAI."}
    return {"ok": True, "latencyMs": latency, "models": list(dict.fromkeys(ids))}


# ---------------------------------------------------------------- capacidade (puro)

def capability_error(task: str, model: Optional[dict]) -> Optional[str]:
    """Motivo pelo qual ``model`` (item do catálogo) não serve à ``task``; ``None`` se serve ou se não dá para saber.

    O catálogo só afirma o que sabe: modelo fora dele (``None``) ou sem metadados (``capsKnown`` falso)
    passa em texto e visão. Triagem e transcrição exigem modelo conhecido como de decisão / de áudio.
    """
    need = NEEDS[task]
    if need in ("decision", "audio"):
        return None if model and need in model["caps"] else f"{(model or {}).get('id', 'esse modelo')} {LACKS[need]}"
    if model is None or need in model["caps"] or not model.get("capsKnown", True):
        return None
    return f"{model['id']} {LACKS[need]}"


# ---------------------------------------------------------------- catálogo de provedores

def _hint(value: Optional[str]) -> str:
    value = (value or "").strip()
    return "…" + value[-4:] if len(value) >= 8 else ("…" if value else "")


def _info(slugs: list, model_id: str):
    try:
        from agent.models_dev import get_model_info
    except Exception:  # noqa: BLE001 — catálogo é opcional
        return None
    for s in slugs:
        try:
            info = get_model_info(s, model_id)
        except Exception:  # noqa: BLE001
            info = None
        if info is not None:
            return info
    return None


def _model(model_id: str, slugs: list) -> dict:
    info = _info(slugs, model_id)
    caps = ["text"] + (["vision"] if info is not None and info.supports_vision() else [])
    priced = info is not None and info.has_cost_data()
    return {"id": model_id, "caps": caps, "capsKnown": info is not None,
            "priceIn": info.cost_input if priced else None, "priceOut": info.cost_output if priced else None,
            "pricePerMin": None, "context": (info.context_window or None) if info is not None else None}


def _stt_models(slug: str) -> list:
    return [{"id": m, "caps": ["audio"], "capsKnown": True, "priceIn": None, "priceOut": None, "pricePerMin": p, "context": None}
            for m, p in STT_MODELS.get(slug, [])]


def _status(statuses: dict, pid: str) -> dict:
    s = statuses.get(pid) or {}
    return {"status": "error" if s.get("ok") is False else "ok",
            "error": {"code": s.get("code"), "message": s.get("message"), "since": s.get("since")} if s.get("ok") is False else None,
            "checkedAt": s.get("at")}


def _custom_endpoints(cfg: dict) -> list:
    from hermes_cli.providers import custom_provider_slug
    from hermes_cli.web_routers.config_env import _custom_endpoint_response

    rows = []
    for e in _custom_endpoint_response(cfg)["endpoints"]:
        key = e["id"] if e["source"] == "providers" else ""
        rows.append({**e, "pid": custom_provider_slug(e["name"], key)})
    return rows


def _key_env(cfg: dict, e: dict) -> str:
    from hermes_cli.config import custom_endpoint_key_env, find_provider_entry

    entry = find_provider_entry(cfg.get("providers"), e["id"])[1] if e["source"] == "providers" else None
    return str((entry or {}).get("key_env") or "") or custom_endpoint_key_env(e["id"])


def typesafe_provider(env: dict, statuses: dict) -> Optional[dict]:
    """O Jev não é compatível com OpenAI: mora em ``listen.triage`` (endereço) e no ``.env`` (chave)."""
    t = store.listen_settings()["triage"]
    if not t.get("base_url"):
        return None
    models = list(dict.fromkeys([t.get("model") or JEV_MODELS[0], *JEV_MODELS]))
    return {"id": TYPESAFE, "name": "TypeSafe", "kind": "decision", "baseUrl": t["base_url"], "editable": True,
            "keyHint": _hint(env.get(t.get("api_key_env") or "TYPESAFE_API_KEY")), **_status(statuses, TYPESAFE),
            "models": [{"id": m, "caps": ["decision"], "capsKnown": True, "priceIn": JEV_PRICE_IN, "priceOut": 0.0,
                        "pricePerMin": None, "context": None, "latency": "0,07–0,5 s"} for m in models]}


def providers() -> list:
    """Provedores do perfil: os compatíveis com OpenAI (``providers:``), o Jev e os nativos com credencial."""
    from hermes_cli.config import load_config, load_env

    cfg, env, statuses = load_config(), load_env(), store.get_meta("models.provider_status", {}) or {}
    out = []
    for e in _custom_endpoints(cfg):
        ids = list(e["models"]) or ([e["model"]] if e["model"] else [])
        out.append({"id": e["pid"], "name": e["name"], "kind": "openai", "baseUrl": e["base_url"], "editable": True,
                    "keyHint": _hint(env.get(_key_env(cfg, e))), **_status(statuses, e["pid"]),
                    "models": [_model(m, ["openrouter"]) for m in ids]})
    ts = typesafe_provider(env, statuses)
    if ts:
        out.append(ts)
    out += _builtin_providers(cfg, statuses)
    return out + _stt_only(env, statuses, {p["id"] for p in out})


_STT_ENV = {"openai": "OPENAI_API_KEY", "groq": "GROQ_API_KEY", "mistral": "MISTRAL_API_KEY", "elevenlabs": "ELEVENLABS_API_KEY"}


def _stt_only(env: dict, statuses: dict, have: set) -> list:
    """Provedor de transcrição com chave no ``.env`` que o catálogo de chat não lista: entra só com os modelos de áudio."""
    return [{"id": slug, "name": {"openai": "OpenAI", "groq": "Groq", "mistral": "Mistral", "elevenlabs": "ElevenLabs"}[slug], "kind": "builtin",
             "baseUrl": "", "editable": False, "keyHint": "", **_status(statuses, slug), "models": _stt_models(slug)}
            for slug, var in _STT_ENV.items() if slug not in have and env.get(var)]


def _builtin_providers(cfg: dict, statuses: dict) -> list:
    """Nativos com credencial (Nous, OpenRouter, OpenAI…), do catálogo em cache: nunca bloqueia na rede."""
    try:
        from hermes_cli.inventory import build_models_payload, load_picker_context

        rows = build_models_payload(load_picker_context(), explicit_only=True, probe_custom_providers=False,
                                    non_blocking_catalogs=True, max_models=400)["providers"]
    except Exception:  # noqa: BLE001 — sem catálogo, a tela ainda mostra os provedores próprios
        return []
    out = []
    for r in rows:
        slug = str(r.get("slug") or "").strip().lower()
        if not slug or r.get("is_user_defined") or slug in ("moa", "custom") or slug.startswith("custom:"):
            continue
        models = [_model(m, [slug]) for m in r.get("models") or []] + _stt_models(slug)
        out.append({"id": slug, "name": str(r.get("name") or slug), "kind": "builtin", "baseUrl": str(r.get("api_url") or ""),
                    "editable": False, "keyHint": "", **_status(statuses, slug), "models": models})
    return out


def find_model(plist: list, provider: str, model: str) -> tuple:
    """``(provedor, modelo)`` do catálogo; qualquer um pode vir ``None``."""
    p = next((x for x in plist if x["id"] == provider), None)
    return p, next((m for m in (p or {"models": []})["models"] if m["id"] == model), None)


def _match_provider(raw: str, plist: list) -> str:
    """O id do catálogo para o que está gravado no config (``together``, ``custom:together``, ``nous``…)."""
    r = (raw or "").strip().lower()
    ids = {p["id"] for p in plist}
    for cand in (r, "custom:" + r, "custom:" + r.removeprefix("custom:")):
        if cand in ids:
            return cand
    return r


# ---------------------------------------------------------------- roteamento

def _main_fields(cfg: dict) -> tuple:
    m = cfg.get("model")
    if isinstance(m, dict):
        return str(m.get("provider") or ""), str(m.get("default") or m.get("name") or "")
    return "", str(m or "")


def _pick(provider: str, model: str) -> Optional[dict]:
    return {"provider": provider, "model": model} if model else None


def routing(plist: Optional[list] = None) -> dict:
    """``{default, tasks}`` lidos das chaves nativas (e do ops.db onde não há chave nativa)."""
    from hermes_cli.config import load_config

    cfg, plist = load_config(), plist if plist is not None else providers()
    inherit: dict = {"inherit": True}
    prov, model = _main_fields(cfg)
    default = _pick(_match_provider(prov, plist), model)
    saved = store.get_meta("models.tasks", {}) or {}
    tasks: dict = {t: saved.get(t) or inherit for t in OPS_TASKS}
    tasks["group_analysis"] = store.get_meta("models.group_analysis") or inherit
    aux = cfg.get("auxiliary") if isinstance(cfg.get("auxiliary"), dict) else {}
    # "auto"/"main"/vazio = o provedor do padrão; sem modelo gravado = herda.
    follow = (default or {}).get("provider", "")

    def own(provider: Any, model: Any) -> dict:
        p, m = str(provider or "").strip().lower(), str(model or "").strip()
        p = follow if p in ("", "auto", "main") else _match_provider(p, plist)
        return _pick(p, m) if m and p else inherit

    for task, slot in AUX_SLOT.items():
        s = aux.get(slot) if isinstance(aux.get(slot), dict) else {}
        tasks[task] = own(s.get("provider"), s.get("model"))
    stt = cfg.get("stt") if isinstance(cfg.get("stt"), dict) else {}
    sp = str(stt.get("provider") or "").strip().lower()
    sm = str((stt.get(sp) or {}).get(STT_KEY.get(sp, "model")) or "") if isinstance(stt.get(sp), dict) else ""
    tasks["transcription"] = {**(_pick(sp, sm) if sp in STT_KEY and sm else inherit),
                              "language": str(stt.get("language") or "").strip()}  # "" = detectar sozinho
    cron = cfg.get("cron") if isinstance(cfg.get("cron"), dict) else {}
    tasks["scheduled"] = own(cron.get("model_provider"), cron.get("model"))
    ls = store.listen_settings()
    ts = _pick(TYPESAFE, ls["triage"].get("model") or JEV_MODELS[0]) if ls["triage"].get("base_url") else {"provider": "", "model": ""}
    tasks["triage_jev"] = {**ts, "minConfidence": ls["min_confidence"]}
    return {"default": default, "tasks": tasks}


def resolved_model(task: str, route: Optional[dict] = None) -> Optional[dict]:
    """Modelo que a tarefa usa de fato, seguindo a herança (canal → conversa principal → padrão)."""
    route = route or routing()
    seen = task
    while True:
        v = route["tasks"].get(seen) if seen != "default" else route["default"]
        if v and not v.get("inherit"):
            return {"provider": v["provider"], "model": v["model"]} if v.get("model") else None
        if seen == "default" or seen == "triage_jev":
            return None
        seen = PARENT.get(seen, "default")


def group_analysis_model() -> Optional[dict]:
    """Modelo fixado para a análise dos grupos: ``{provider, model[, base_url]}`` ou ``None`` (= o do cron/padrão).

    ``provider`` é o id nativo (``custom:<chave>``, ``openrouter``…), o mesmo que o job do cron aceita.
    """
    v = store.get_meta("models.group_analysis")
    if not v or not v.get("model") or not v.get("provider"):
        return None
    out = {"provider": v["provider"], "model": v["model"]}
    if v["provider"].startswith("custom:"):
        from hermes_cli.config import load_config

        e = next((x for x in _custom_endpoints(load_config()) if x["pid"] == v["provider"]), None)
        if e and e["base_url"]:
            out["base_url"] = e["base_url"]
    return out


def validate_routing(body: dict, plist: list) -> dict:
    """Confere o pedido inteiro antes de gravar qualquer coisa; devolve ``{default, tasks}`` normalizado."""
    default, tasks = body.get("default"), body.get("tasks") or {}
    out: dict = {"default": None, "tasks": {}}
    if default is not None:
        out["default"] = _checked("default", default, plist)
    for t, v in tasks.items():
        if t not in TASKS:
            raise ValueError(f"tarefa desconhecida: {t}")
        if not isinstance(v, dict):
            raise ValueError(f"{t}: use {{inherit: true}} ou {{provider, model}}")
        if v.get("inherit"):
            if t == "triage_jev":
                raise ValueError("a triagem não herda o padrão: o padrão não é um modelo de decisão")
            out["tasks"][t] = {"inherit": True}
        else:
            out["tasks"][t] = _checked(t, v, plist)
        if t == "transcription" and "language" in v:
            lang = str(v.get("language") or "").strip().lower()
            if lang and not (2 <= len(lang) <= 3 and lang.isalpha()):
                raise ValueError("idioma da transcrição: use o código ISO (pt, en, es…) ou vazio para detectar")
            out["tasks"][t]["language"] = lang
        if v.get("inherit"):
            continue
        if t == "triage_jev" and v.get("minConfidence") is not None:
            try:
                conf = float(v["minConfidence"])
            except (TypeError, ValueError):
                conf = -1.0
            if not 0.5 <= conf <= 0.95:  # mesma faixa do store, conferida antes de gravar qualquer coisa
                raise ValueError("confiança mínima entre 50% e 95%")
            out["tasks"][t]["minConfidence"] = conf
    return out


def _checked(task: str, v: dict, plist: list) -> dict:
    """Provedor conectado + modelo com a capacidade da tarefa (``default`` precisa de texto, como ``main``)."""
    provider, model = str(v.get("provider") or "").strip(), str(v.get("model") or "").strip()
    if not provider or not model:
        raise ValueError(f"{task}: provider e model são obrigatórios")
    p, m = find_model(plist, provider, model)
    if p is None:
        raise ValueError(f"{provider} não está entre os provedores conectados deste perfil")
    if task == "transcription" and provider not in STT_KEY:
        raise ValueError(f"{provider} não oferece transcrição no Hermes ({', '.join(STT_KEY)})")
    if task == "triage_jev" and provider != TYPESAFE:
        raise ValueError("a triagem hoje só roda com um modelo de decisão (TypeSafe/Jev)")
    if task != "triage_jev" and provider == TYPESAFE:
        raise ValueError(f"{model} é um modelo de decisão: só serve à triagem")
    why = capability_error("main" if task == "default" else task, m)
    if why:
        raise ValueError(why)
    return {"provider": provider, "model": model}


def apply_routing(req: dict) -> dict:
    """Grava o pedido (já validado por ``validate_routing``) nas chaves nativas. Devolve ``routing()``."""
    from hermes_cli.config import load_config, save_config
    from hermes_cli.web_routers._common import _CONFIG_MUTATION_LOCK

    tasks = req["tasks"]
    with _CONFIG_MUTATION_LOCK:
        if req["default"]:
            _set_default(**req["default"])
        for t in ("vision", "compaction"):
            if t in tasks:
                _set_aux(AUX_SLOT[t], tasks[t])
        cfg = load_config()
        dirty = False
        if "transcription" in tasks:
            _set_stt(cfg, tasks["transcription"])
            dirty = True
        if "scheduled" in tasks:
            cron = cfg.get("cron") if isinstance(cfg.get("cron"), dict) else {}
            v = tasks["scheduled"]
            cron["model"], cron["model_provider"] = ("", "") if v.get("inherit") else (v["model"], v["provider"])
            cfg["cron"] = cron
            dirty = True
        if dirty:
            save_config(cfg)
    ops = {t: tasks[t] for t in OPS_TASKS if t in tasks}
    if ops:
        saved = store.get_meta("models.tasks", {}) or {}
        for t, v in ops.items():
            if v.get("inherit"):
                saved.pop(t, None)
            else:
                saved[t] = v
        store.set_meta("models.tasks", saved)
    if "group_analysis" in tasks:
        v = tasks["group_analysis"]
        store.set_meta("models.group_analysis", None if v.get("inherit") else v)
    if "triage_jev" in tasks:
        v = tasks["triage_jev"]
        patch: dict = {"triage": {"model": v["model"]}}
        if v.get("minConfidence") is not None:
            patch["min_confidence"] = v["minConfidence"]
        store.set_listen_settings(patch)
    return routing()


def _set_default(provider: str, model: str) -> None:
    """Mesmo caminho do ``/api/model/set``; num provedor próprio, aponta a chave do ``.env`` como a ativação nativa faz."""
    from hermes_cli.config import load_config, save_config
    from hermes_cli.web_server_config import _apply_model_assignment_sync

    _apply_model_assignment_sync("main", provider, model, "", "")
    if provider.startswith("custom:"):
        cfg = load_config()
        e = next((x for x in _custom_endpoints(cfg) if x["pid"] == provider), None)
        if e and isinstance(cfg.get("model"), dict):
            cfg["model"]["key_env"] = _key_env(cfg, e)
            cfg["model"].pop("api_key", None)
            save_config(cfg)


def _set_aux(slot: str, v: dict) -> None:
    from hermes_cli.config import load_config
    from hermes_cli.web_server_config import _apply_aux_assignment_sync

    p, m = ("auto", "") if v.get("inherit") else (v["provider"], v["model"])
    _apply_aux_assignment_sync(load_config(), p, m, slot, "", "")


def _set_stt(cfg: dict, v: dict) -> None:
    stt = cfg.get("stt") if isinstance(cfg.get("stt"), dict) else {}
    if "language" in v:  # sem idioma o Whisper adivinha — e em áudio curto adivinha inglês
        if v["language"]:
            stt["language"] = v["language"]
        else:
            stt.pop("language", None)
    if v.get("inherit"):
        stt.pop("provider", None)
    else:
        sect = stt.get(v["provider"]) if isinstance(stt.get(v["provider"]), dict) else {}
        sect[STT_KEY[v["provider"]]] = v["model"]
        stt[v["provider"]], stt["provider"] = sect, v["provider"]
    cfg["stt"] = stt


def forget_provider(pid: str) -> list:
    """Depois de remover um provedor: quem o usava volta a herdar (o padrão fica vazio). Devolve as tarefas afetadas."""
    r = routing()
    hit = [t for t, v in r["tasks"].items() if v.get("provider") == pid and t != "triage_jev"]
    if pid == TYPESAFE:
        hit = []
    if r["default"] and r["default"]["provider"] == pid:
        hit.insert(0, "default")
        _clear_default()
    tasks = {t: {"inherit": True} for t in hit if t != "default"}
    if tasks:
        apply_routing({"default": None, "tasks": tasks})
    return hit


def _clear_default() -> None:
    from hermes_cli.config import load_config, save_config

    cfg = load_config()
    m = cfg.get("model")
    if isinstance(m, dict):
        m.pop("default", None)
        m.pop("name", None)
        m.pop("provider", None)
        cfg["model"] = m
        save_config(cfg)


# ---------------------------------------------------------------- provedores: criar, editar, remover, testar

def _set_status(pid: str, result: dict) -> None:
    s = store.get_meta("models.provider_status", {}) or {}
    prev = s.get(pid) or {}
    if result["ok"]:
        s.pop(pid, None)
    else:
        s[pid] = {"ok": False, "code": result.get("code"), "message": result.get("message"), "at": time.time(),
                  "since": prev.get("since") if prev.get("ok") is False else time.time()}
    store.set_meta("models.provider_status", s)


def _find_custom(cfg: dict, pid: str) -> dict:
    e = next((x for x in _custom_endpoints(cfg) if x["pid"] == pid), None)
    if e is None:
        raise KeyError(pid)
    return e


def get_provider(pid: str) -> dict:
    p = next((x for x in providers() if x["id"] == pid), None)
    if p is None:
        raise KeyError(pid)
    return p


def create_provider(name: str, base_url: str, api_key: str, kind: str = "openai") -> dict:
    name, base_url, api_key = (name or "").strip(), (base_url or "").strip().rstrip("/"), (api_key or "").strip()
    if not name or not api_key:
        raise ValueError("nome e chave de API são obrigatórios")
    if kind not in ("openai", "decision"):
        raise ValueError("kind: use openai ou decision")
    r = probe(base_url, api_key, kind=kind)
    if not r["ok"]:
        raise ValueError(r["message"])
    if kind == "decision":
        return _save_typesafe(base_url, api_key)
    from hermes_cli.config import load_config, save_config
    from hermes_cli.web_models import CustomEndpointUpdate
    from hermes_cli.web_routers._common import _CONFIG_MUTATION_LOCK
    from hermes_cli.web_routers.config_env import _custom_endpoint_id, _write_custom_endpoint

    with _CONFIG_MUTATION_LOCK:
        cfg = load_config()
        if any(e["pid"].removeprefix("custom:") == _custom_endpoint_id(name) or e["id"] == _custom_endpoint_id(name) for e in _custom_endpoints(cfg)):
            raise ValueError("já existe um provedor com esse nome")
        _write_custom_endpoint(cfg, CustomEndpointUpdate(name=name, base_url=base_url, model=r["models"][0], models=r["models"], api_key=api_key))
        save_config(cfg)
        pid = next(e["pid"] for e in _custom_endpoints(cfg) if e["name"] == name)
    _set_status(pid, r)
    return get_provider(pid)


def update_provider(pid: str, name: Optional[str] = None, base_url: Optional[str] = None, api_key: Optional[str] = None) -> dict:
    if pid == TYPESAFE:
        return _update_typesafe(base_url, api_key)
    from hermes_cli.config import load_config, load_env, save_config
    from hermes_cli.web_models import CustomEndpointUpdate
    from hermes_cli.web_routers._common import _CONFIG_MUTATION_LOCK
    from hermes_cli.web_routers.config_env import _write_custom_endpoint

    with _CONFIG_MUTATION_LOCK:
        cfg = load_config()
        e = _find_custom(cfg, pid)
        url = (base_url if base_url is not None else e["base_url"]).strip().rstrip("/")
        key = (api_key or "").strip() or None
        models = None
        if url != e["base_url"].rstrip("/") or key:
            effective = key or load_env().get(_key_env(cfg, e), "")
            if not effective:
                raise ValueError("informe a chave de API para testar o novo endereço")
            r = probe(url, effective)
            if not r["ok"]:
                raise ValueError(r["message"])
            models = r["models"]
            _set_status(pid, r)
        _write_custom_endpoint(cfg, CustomEndpointUpdate(
            id=e["id"], name=(name or e["name"]).strip(), base_url=url, model=e["model"] or (models or e["models"] or [""])[0],
            models=models, api_key=key))
        save_config(cfg)
    return get_provider(pid)


def delete_provider(pid: str) -> dict:
    """Remove o provedor próprio e a chave do ``.env``; quem o usava volta a herdar. ``{ok, affected}``."""
    if pid == TYPESAFE:
        return _delete_typesafe()
    from hermes_cli.config import custom_endpoint_key_env, load_config, remove_env_value, save_config
    from hermes_cli.web_routers._common import _CONFIG_MUTATION_LOCK
    from hermes_cli.web_routers.config_env import _detach_main_model_from_provider, _pop_legacy_custom_provider

    with _CONFIG_MUTATION_LOCK:
        cfg = load_config()
        e = _find_custom(cfg, pid)
        env_name = _key_env(cfg, e)
        affected = forget_provider(pid)  # antes de apagar: precisa ler quem usa
        cfg = load_config()
        providers_cfg = cfg.get("providers")
        if e["source"] == "providers" and isinstance(providers_cfg, dict):
            entry = providers_cfg.pop(e["id"], None)
            cfg["providers"] = providers_cfg
        else:
            entry = _pop_legacy_custom_provider(cfg, e["id"])
        _detach_main_model_from_provider(cfg, e["id"], entry)
        save_config(cfg)
        remove_env_value(env_name)
        if env_name != custom_endpoint_key_env(e["id"]):
            remove_env_value(custom_endpoint_key_env(e["id"]))
    s = store.get_meta("models.provider_status", {}) or {}
    if s.pop(pid, None) is not None:
        store.set_meta("models.provider_status", s)
    return {"ok": True, "affected": affected}


def test_provider(pid: str) -> dict:
    """Testa um provedor salvo com o endereço e a chave dele; grava o estado e, se deu certo, atualiza os modelos."""
    from hermes_cli.config import load_config, load_env, save_config
    from hermes_cli.web_routers._common import _CONFIG_MUTATION_LOCK

    if pid == TYPESAFE:
        t = store.listen_settings()["triage"]
        if not t.get("base_url"):
            raise KeyError(pid)
        r = probe(t["base_url"], load_env().get(t.get("api_key_env") or "TYPESAFE_API_KEY", ""), kind="decision")
        _set_status(pid, r)
        return r
    cfg = load_config()
    if pid in {p["id"] for p in _builtin_providers(cfg, {})}:
        raise ValueError("provedor nativo: teste e troque a chave em Chaves de API")
    e = _find_custom(cfg, pid)
    r = probe(e["base_url"], load_env().get(_key_env(cfg, e), ""))
    _set_status(pid, r)
    if r["ok"] and e["source"] == "providers" and r["models"] != e["models"]:
        with _CONFIG_MUTATION_LOCK:
            cfg = load_config()
            entry = (cfg.get("providers") or {}).get(e["id"])
            if isinstance(entry, dict):
                old = entry.get("models") if isinstance(entry.get("models"), dict) else {}
                entry["models"] = {m: old.get(m) if isinstance(old.get(m), dict) else {} for m in r["models"]}
                save_config(cfg)
    return r


def _save_typesafe(base_url: str, api_key: str) -> dict:
    from hermes_cli.config import save_env_value

    env_name = store.listen_settings()["triage"].get("api_key_env") or "TYPESAFE_API_KEY"
    save_env_value(env_name, api_key)
    store.set_listen_settings({"triage": {"base_url": base_url, "api_key_env": env_name}})
    _set_status(TYPESAFE, {"ok": True})
    return get_provider(TYPESAFE)


def _update_typesafe(base_url: Optional[str], api_key: Optional[str]) -> dict:
    from hermes_cli.config import load_env

    t = store.listen_settings()["triage"]
    if not t.get("base_url"):
        raise KeyError(TYPESAFE)
    url = (base_url or t["base_url"]).strip().rstrip("/")
    key = (api_key or "").strip() or load_env().get(t.get("api_key_env") or "TYPESAFE_API_KEY", "")
    r = probe(url, key, kind="decision")
    if not r["ok"]:
        raise ValueError(r["message"])
    return _save_typesafe(url, key)


def _delete_typesafe() -> dict:
    from hermes_cli.config import remove_env_value

    t = store.listen_settings()["triage"]
    if not t.get("base_url"):
        raise KeyError(TYPESAFE)
    store.set_listen_settings({"triage": {"base_url": ""}})  # sem endereço a triagem desliga; o lote vai direto para a análise
    remove_env_value(t.get("api_key_env") or "TYPESAFE_API_KEY")
    return {"ok": True, "affected": ["triage_jev"]}
