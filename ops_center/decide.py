"""Triagem dos lotes do Escutar com um modelo de decisão (Jev, da TypeSafe).

API de decisões (não é chat): ``POST {base_url}/decisions`` com ``{model, state, questions}``; cada
pergunta tem ``type`` (``choice``/``score``/``noul``), ``instructions`` e ``criteria``. A resposta traz
``answers.<id>`` com ``choice``/``score``/``noul``, ``probabilities`` e ``confidence``. Uma chamada só
responde as três perguntas da triagem (categoria · urgência · é conversa social?).

Sem ``base_url`` ou sem chave, a triagem fica desligada (``None``) e o lote vai direto para a análise
completa — mais caro, nunca perde mensagem.
"""

from __future__ import annotations

import json
import logging
import urllib.request
from typing import Any, Optional

logger = logging.getLogger(__name__)

CATEGORIES = {
    "bug": "Algo do sistema não funciona, deu erro, parou, sumiu ou está lento",
    "duvida": "Pergunta sobre como usar, configurar ou entender algo",
    "sugestao": "Ideia ou pedido de melhoria, sem nada quebrado",
    "reclamacao": "Insatisfação com atendimento, cobrança, prazo ou qualidade",
    "elogio": "Agradecimento ou elogio",
    "social": "Conversa social: cumprimentos, piadas, figurinhas, combinados sem pedido ao suporte",
}
URGENCY = ["baixa", "media", "alta", "critica"]
_URGENCY_CRITERIA = [
    "Baixa: pode esperar dias, ninguém está parado",
    "Média: atrapalha, mas há como seguir trabalhando",
    "Alta: atrapalha o atendimento ou as vendas do cliente hoje",
    "Crítica: cliente parado, perdendo dinheiro ou clientes agora, ou vários clientes afetados",
]


def _questions() -> dict:
    return {
        "category": {"type": "choice", "instructions": "Qual é o assunto principal desta conversa do grupo de suporte?",
                     "criteria": CATEGORIES},
        "urgency": {"type": "score", "instructions": "Quão urgente é para a equipe de suporte agir?",
                    "criteria": _URGENCY_CRITERIA},
        "social": {"type": "noul", "instructions": "A conversa é só social, sem nenhum pedido, problema ou dúvida para o suporte"},
    }


def _post(url: str, key: str, body: dict, timeout: float) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST", headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 — URL configurada pelo dono
        return json.loads(r.read().decode())


def triage(state: str, cfg: dict, *, timeout: float = 20.0) -> Optional[dict]:
    """``{category, urgency, confidence, social, usage}`` ou ``None`` (triagem desligada)."""
    base = str(cfg.get("base_url") or "").rstrip("/")
    from agent.secret_scope import get_secret_str  # .env do perfil no gateway multiplexado

    key = get_secret_str(str(cfg.get("api_key_env") or "TYPESAFE_API_KEY"))
    if not base or not key:
        return None
    # A TypeSafe publica o mesmo contrato em ``/v1/systemone`` (nativo) e ``/decisions`` (Portkey/OpenRouter).
    url = base if base.endswith(("/decisions", "/systemone")) else f"{base}/decisions"
    out = _post(url, key, {"model": cfg.get("model") or "jev-latest", "state": state[-60000:],
                           "questions": _questions()}, timeout)
    return parse(out)


def parse(out: dict) -> dict:
    a = out.get("answers") or {}
    cat, urg, soc = a.get("category") or {}, a.get("urgency") or {}, a.get("social") or {}
    category = cat.get("choice") if cat.get("choice") in CATEGORIES else "duvida"
    return {
        "category": category,
        "urgency": _urgency(urg),
        "confidence": float(cat.get("confidence") or 0.0),
        "social": float(soc.get("noul") or 0.0),
        "usage": out.get("usage") or {},
    }


def _level(key: Any) -> Optional[int]:
    """Índice do nível a partir de "2", 2, ou do texto do critério."""
    if isinstance(key, int) or (isinstance(key, str) and key.isdigit()):
        return int(key) if 0 <= int(key) < len(URGENCY) else None
    low = str(key).lower()
    return next((i for i, c in enumerate(_URGENCY_CRITERIA) if low and (low in c.lower() or c.lower() in low)), None)


def _urgency(ans: dict) -> str:
    """Nível mais provável (``probabilities``); senão a posição (0..n-1 ou fração 0..1) ou rótulo.

    ponytail: formato exato da nota do Jev não está publicado; confirmar com a chave real."""
    probs = ans.get("probabilities")
    if isinstance(probs, dict) and probs:
        idx = _level(max(probs, key=lambda k: probs[k]))
        if idx is not None:
            return URGENCY[idx]
    score: Any = ans.get("score")
    if isinstance(score, str):
        low = score.lower()
        return next((u for u in URGENCY if u in low or low in _URGENCY_CRITERIA[URGENCY.index(u)].lower()), "media")
    try:
        x = float(score)
    except (TypeError, ValueError):
        return "media"
    idx = round(x * (len(URGENCY) - 1)) if 0 <= x <= 1 else round(x)
    return URGENCY[max(0, min(len(URGENCY) - 1, idx))]


def is_social(result: Optional[dict], min_confidence: float) -> bool:
    """Lote vai para "ignoradas" só quando a triagem tem certeza de que é conversa social."""
    return bool(result) and result["category"] == "social" and result["social"] >= 0.5 \
        and result["confidence"] >= min_confidence
