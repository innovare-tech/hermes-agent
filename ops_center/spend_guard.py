"""Aplica os limites de gasto (Modelos › Limites, design A5) a cada ciclo do ticker do gateway.

``models.evaluate_limits`` só avalia; aqui fica a ação, uma vez por dia por estado:

- ``alert`` → aviso na rota de infra (nível ``warning``).
- ``over`` com ``notify`` → aviso crítico.
- ``over`` com ``pause_non_urgent`` → aviso crítico + segura o que não é urgente até o fim do dia
  (``holding_non_urgent``): no Escutar, só lotes de urgência crítica/alta vão para o modelo; o resto
  chega à equipe com as mensagens cruas, sem gastar.
- ``over`` com ``pause_profile`` → aviso crítico + pausa do perfil (ESTOP do perfil; o padrão não
  pausa sozinho, então só avisa). Retomar é manual, no painel.

ponytail: a checagem lê o ``state.db`` a cada ``CHECK_SECONDS``; gasto que acontece entre duas
checagens passa do limite em até esse intervalo.
"""

from __future__ import annotations

import logging
import sqlite3
import time
from datetime import datetime
from typing import Optional

from ops_center import store

logger = logging.getLogger(__name__)

CHECK_SECONDS = 300
_last_check: dict[str, float] = {}


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _spend_now() -> dict:
    from hermes_constants import get_hermes_home
    from ops_center import models

    db = get_hermes_home() / "state.db"
    if not db.is_file():
        return {"today": 0.0, "month": 0.0}
    con = sqlite3.connect(f"{db.as_uri()}?mode=ro", uri=True, timeout=2)
    try:
        return models.spend(con)
    finally:
        con.close()


def holding_non_urgent() -> bool:
    """Hoje o limite mandou segurar o que não é urgente."""
    return store.get_meta("limits.hold_non_urgent") == _today()


def _warn(level: str, text: str) -> None:
    store.log_activity("cfg", text.split("\n", 1)[0], "limite de gasto (Modelos › Limites)")
    try:
        from ops_center import notify

        if notify.is_configured():
            notify.send("infra", level, text)
            return
    except Exception:
        logger.warning("ops_center: aviso de limite não saiu", exc_info=True)
    logger.warning("ops_center: %s", text)


def check(now: Optional[float] = None, *, spend: Optional[dict] = None) -> dict:
    """Avalia e aplica (no perfil atual). Devolve a avaliação; ``{'state': 'off'}`` sem limites salvos."""
    from ops_center import models

    lim = models.limits()
    if not lim.get("saved"):
        return {"state": "off"}
    cur = spend if spend is not None else _spend_now()
    ev = models.evaluate_limits(cur, lim)
    state = ev["state"]
    if state == "ok":
        return ev
    today = _today()
    if store.get_meta(f"limits.acted.{state}") == today:
        return ev  # já agiu hoje neste estado
    store.set_meta(f"limits.acted.{state}", today)
    money = f"hoje US$ {float(cur.get('today') or 0):.2f} de {lim['dailyUsd']} · mês US$ {float(cur.get('month') or 0):.2f} de {lim['monthlyUsd']}"
    if state == "alert":
        _warn("warning", f"⚠️ Gasto do Hermes passou de {lim['alertPct']}% do limite\n{money}")
        return ev
    action = ev.get("action") or "notify"
    if action == "pause_non_urgent":
        store.set_meta("limits.hold_non_urgent", today)
        _warn("critical", f"🛑 Limite de gasto atingido — só o que é urgente usa o modelo até amanhã\n{money}")
    elif action == "pause_profile":
        paused = _pause_profile()
        _warn("critical", f"🛑 Limite de gasto atingido — {'perfil pausado; retome no painel' if paused else 'o perfil padrão não pausa sozinho: pause pelo painel se quiser'}\n{money}")
    else:
        _warn("critical", f"🛑 Limite de gasto atingido\n{money}")
    return ev


def _pause_profile() -> bool:
    from agent.estop import engage, sentinel_path
    from hermes_constants import get_process_hermes_home

    try:
        if sentinel_path().parent.resolve() == get_process_hermes_home().resolve():
            return False
        engage(reason="limite de gasto atingido")
        return True
    except OSError:
        logger.warning("ops_center: não consegui pausar o perfil pelo limite de gasto", exc_info=True)
        return False


def maybe_check(home_key: str) -> None:
    """Para o ticker: no máximo uma checagem a cada ``CHECK_SECONDS`` por perfil."""
    now = time.monotonic()
    if now - _last_check.get(home_key, -CHECK_SECONDS) < CHECK_SECONDS:
        return
    _last_check[home_key] = now
    try:
        check()
    except Exception:
        logger.warning("ops_center: checagem do limite de gasto falhou", exc_info=True)
