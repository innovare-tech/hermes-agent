"""Atividade automática: toda ação de configuração feita pela API (painel ou não) vira uma linha da
Atividade — o quê, quando e por quê ("você no painel"). Nunca registra valores secretos (só nomes).

Rotas da Central de Operações registram direto; as rotas antigas do dashboard (pausa, gateway,
chaves, canais, skills, modelo, ferramentas) passam pelo ``activity_middleware``, que só registra
quando a resposta é 2xx.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

WHY = "você no painel."


def log(action: str, *, kind: str = "cfg", why: str = WHY, business_id: Optional[str] = None) -> None:
    """Fail-open: Atividade nunca derruba a ação que ela registra."""
    try:
        from ops_center import store

        store.log_activity(kind, action, why, business_id=business_id)
    except Exception:
        logger.debug("ops activity: falha ao registrar %r", action, exc_info=True)


def _name(platform: str) -> str:
    return {"whatsapp_cloud": "WhatsApp Business", "google_chat": "Google Chat", "email": "E-mail", "sms": "SMS"}.get(platform, platform.replace("_", " ").title())


def _messaging(m: re.Match, body: dict) -> Optional[str]:
    p = _name(m.group(1))
    if body.get("clear_env"):
        return f"Apagou as credenciais de {p}"
    if body.get("env"):
        return f"Salvou as credenciais de {p} ({', '.join(sorted(body['env']))})"
    if "enabled" in body:
        return f"{'Ligou' if body['enabled'] else 'Desligou'} o canal {p}"
    return None


# (método, caminho) → texto da ação a partir do match e do corpo JSON. None = não registra.
_RULES: list[tuple[str, re.Pattern, Callable[[re.Match, dict], Optional[str]]]] = [
    ("PUT", re.compile(r"^/api/estop$"), lambda m, b: "Pausou tudo (kill switch)" if b.get("paused") else "Retomou o agente"),
    ("POST", re.compile(r"^/api/gateway/(start|stop|restart)$"), lambda m, b: {"start": "Iniciou o gateway", "stop": "Parou o gateway", "restart": "Reiniciou o gateway"}[m.group(1)]),
    ("PUT", re.compile(r"^/api/env$"), lambda m, b: f"Salvou a chave {b.get('key', '')}" if b.get("key") else None),
    ("DELETE", re.compile(r"^/api/env$"), lambda m, b: f"Removeu a chave {b.get('key', '')}" if b.get("key") else None),
    ("PUT", re.compile(r"^/api/messaging/platforms/([\w-]+)$"), _messaging),
    ("POST", re.compile(r"^/api/skills/toggle$"), lambda m, b: f"{'Ligou' if b.get('enabled') else 'Desligou'} a skill /{b.get('name', '')}"),
    ("PUT", re.compile(r"^/api/tools/toolsets/([\w-]+)$"), lambda m, b: f"{'Ligou' if b.get('enabled') else 'Desligou'} a ferramenta {m.group(1)}"),
    ("POST", re.compile(r"^/api/model/set$"), lambda m, b: f"Trocou o modelo padrão para {b.get('model')} ({b.get('provider')})" if b.get("model") else None),
    ("PUT", re.compile(r"^/api/config$"), lambda m, b: "Alterou as configurações do agente"),
]


def match(method: str, path: str, body: dict) -> Optional[str]:
    for meth, pattern, render in _RULES:
        if meth == method:
            m = pattern.match(path)
            if m:
                try:
                    return render(m, body)
                except Exception:
                    return None
    return None


async def activity_middleware(request: Any, call_next: Callable) -> Any:
    method, path = request.method, request.url.path
    if method not in ("PUT", "POST", "DELETE") or not any(meth == method and p.match(path) for meth, p, _ in _RULES):
        return await call_next(request)
    try:
        raw = await request.body()  # Starlette reaproveita o corpo para a rota
        body = json.loads(raw) if raw else {}
        body = body if isinstance(body, dict) else {}
    except Exception:
        body = {}
    response = await call_next(request)
    if 200 <= response.status_code < 300:
        action = match(method, path, body)
        if action:
            log(action)
    return response
