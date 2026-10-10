"""Operação: ferramentas só de leitura para a Conversa/Telegram enxergarem a Central do Hermes sem garimpar.

Bundled ``kind: backend`` (carrega em todo perfil); ``tools.available`` desliga nos perfis de cliente do
Copiloto (``cli-*``), que nunca podem ver dados de outras empresas.
"""
from __future__ import annotations

from plugins.operacao import tools as _t

_TOOLS = (
    ("ops_groups", _t.GROUPS_SCHEMA, _t.groups, "👥"),
    ("ops_group_messages", _t.MESSAGES_SCHEMA, _t.group_messages, "💬"),
    ("ops_analyses", _t.ANALYSES_SCHEMA, _t.analyses, "🔎"),
    ("ops_incidents", _t.INCIDENTS_SCHEMA, _t.incidents, "🩺"),
)

GUIDE = """## Operação (Central do Hermes)
Perguntas sobre clientes, grupos de WhatsApp, o que aconteceu num cliente, análises, incidentes ou saúde da
plataforma: use primeiro as ferramentas ops_* — não procure em sessões, arquivos ou terminal.
- Achar o grupo de um cliente: ops_groups (busca por nome do grupo ou do cliente).
- O que houve / resumo / quem pediu o quê: ops_group_messages (período em horário de Brasília: hoje, ontem,
  AAAA-MM-DD). No WhatsApp ela traz o histórico completo da plataforma Aibiz, inclusive antes do Hermes.
- Análises do Escutar: ops_analyses. Infra, bots e incidentes: ops_incidents.
Ao resumir: cite quem disse e a hora (Brasília), separe pedidos/combinados/pendências e diga se a lista foi cortada."""


def _guide(session_info) -> str:
    if str((session_info or {}).get("profile_name") or "").startswith("cli-") or not _t.available():
        return ""
    return GUIDE


def register(ctx) -> None:
    for name, schema, handler, emoji in _TOOLS:
        ctx.register_tool(name=name, toolset="operacao", schema=schema, handler=handler, check_fn=_t.available, emoji=emoji)
    ctx.register_system_prompt_section("operacao.guia", _guide, position="after_memory", max_chars=1500)
