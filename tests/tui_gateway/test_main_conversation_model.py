"""Modelos (A5) › "Conversa principal": vale para conversas novas do painel, sem escolha própria."""


def test_main_conversation_model(monkeypatch):
    import ops_center.models as m
    from tui_gateway.server import _main_conversation_model

    monkeypatch.setattr(m, "resolved_model", lambda task: {"provider": "gemini", "model": "g-1"} if task == "main" else None)
    assert _main_conversation_model() == {"provider": "gemini", "model": "g-1"}
    monkeypatch.setattr(m, "resolved_model", lambda task: None)
    assert _main_conversation_model() is None

    def boom(task):
        raise RuntimeError("ops.db ilegível")

    monkeypatch.setattr(m, "resolved_model", boom)
    assert _main_conversation_model() is None
