"""Modelos (A5): o modelo escolhido para Telegram/WhatsApp/API vale no runtime (com herança)."""

from types import SimpleNamespace

import pytest


@pytest.fixture
def picks(monkeypatch):
    chosen = {}
    import ops_center.models as m

    monkeypatch.setattr(m, "resolved_model", lambda task: chosen.get(task))
    return chosen


def test_platform_model_maps_only_messaging_channels(picks):
    from gateway.run_turn import _platform_model

    picks["channel.telegram"] = {"provider": "gemini", "model": "gemini-x"}
    assert _platform_model(SimpleNamespace(platform=SimpleNamespace(value="telegram"))) == {"provider": "gemini", "model": "gemini-x"}
    assert _platform_model(SimpleNamespace(platform="whatsapp")) is None  # sem escolha: padrão
    assert _platform_model(SimpleNamespace(platform="discord")) is None
    picks["channel.whatsapp"] = {"provider": "", "model": "x"}  # incompleto: ignora
    assert _platform_model(SimpleNamespace(platform="whatsapp")) is None


def test_platform_model_never_breaks_the_turn(monkeypatch):
    import ops_center.models as m
    from gateway.run_turn import _platform_model

    def boom(task):
        raise RuntimeError("ops.db ilegível")

    monkeypatch.setattr(m, "resolved_model", boom)
    assert _platform_model(SimpleNamespace(platform="telegram")) is None


def test_api_channel_model(picks):
    from gateway.platforms.api_server import _api_channel_model

    assert _api_channel_model() is None
    picks["channel.api"] = {"provider": "openrouter", "model": "a/b"}
    assert _api_channel_model() == {"provider": "openrouter", "model": "a/b"}
