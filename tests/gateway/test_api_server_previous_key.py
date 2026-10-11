"""Rotação com janela (Copiloto do Gestor): a chave anterior de um perfil nomeado vale até
API_SERVER_KEY_PREVIOUS_UNTIL; depois, 401. O perfil padrão nunca usa chave anterior."""

import asyncio
import json
import time
from types import SimpleNamespace

import pytest

from agent import secret_scope as ss
from gateway.config import PlatformConfig
from gateway.platforms.api_server import APIServerAdapter, _api_request_profile


@pytest.fixture(autouse=True)
def _reset_multiplex():
    ss.set_multiplex_active(False)
    yield
    ss.set_multiplex_active(False)


def _req(token):
    return SimpleNamespace(headers={"Authorization": f"Bearer {token}"}, remote="127.0.0.1", transport=None,
                           method="GET", path_qs="/p/cli-x/v1/models")


@pytest.mark.parametrize("until_delta, accepted", [(3600, True), (-1, False)])
def test_previous_key_only_inside_window(tmp_path, monkeypatch, until_delta, accepted):
    home = tmp_path / "profiles" / "cli-x"
    home.mkdir(parents=True)
    new, old = "hcp_new-key-1234567890abcdef", "hcp_old-key-1234567890abcdef"
    (home / ".env").write_text(f"API_SERVER_KEY={new}\nAPI_SERVER_KEY_PREVIOUS={old}\n"
                               f"API_SERVER_KEY_PREVIOUS_UNTIL={int(time.time() + until_delta)}\n", encoding="utf-8")
    monkeypatch.setattr("hermes_cli.profiles.get_profile_dir", lambda name: home)
    adapter = APIServerAdapter(PlatformConfig(enabled=True))
    adapter._api_key = "default-listener-api-key-123456"
    ss.set_multiplex_active(True)
    token = _api_request_profile.set("cli-x")
    try:
        with adapter._profile_scope("cli-x"):
            assert adapter._check_auth(_req(new)) is None
            assert (adapter._check_auth(_req(old)) is None) is accepted
            assert adapter._check_auth(_req("hcp_qualquer-outra-123456789")).status == 401
    finally:
        _api_request_profile.reset(token)


@pytest.mark.parametrize("profile, accepted", [("cli-x", True), ("aibiz", False)])
def test_radar_gateway_key_only_for_copilot_profiles(tmp_path, monkeypatch, profile, accepted):
    """A chave de serviço da porta do Aibiz Radar abre qualquer perfil cli-*, nunca um perfil da equipe."""
    home = tmp_path / "profiles" / profile
    home.mkdir(parents=True)
    (home / ".env").write_text("API_SERVER_KEY=hcp_own-key-1234567890abcdef\n", encoding="utf-8")
    monkeypatch.setattr("hermes_cli.profiles.get_profile_dir", lambda name: home)
    gateway = "g" * 40
    monkeypatch.setenv("COPILOT_GATEWAY_KEY", gateway)
    adapter = APIServerAdapter(PlatformConfig(enabled=True))
    ss.set_multiplex_active(True)
    token = _api_request_profile.set(profile)
    try:
        with adapter._profile_scope(profile):
            assert (adapter._check_auth(_req(gateway)) is None) is accepted
    finally:
        _api_request_profile.reset(token)


def test_radar_gateway_key_ignored_when_short(monkeypatch):
    monkeypatch.setenv("COPILOT_GATEWAY_KEY", "curta")
    assert APIServerAdapter(PlatformConfig(enabled=True))._copilot_gateway_key == ""


def test_radar_client_reads_registry_in_the_request_profile(monkeypatch):
    """O estado do Radar é lido no perfil da requisição (/p/aibiz), não no banco padrão."""
    from ops_center import copilot

    gateway = "g" * 40
    monkeypatch.setenv("COPILOT_GATEWAY_KEY", gateway)
    monkeypatch.setattr(copilot, "radar_status", lambda sid: {"sid": sid, "profile": _api_request_profile.get()})
    adapter = APIServerAdapter(PlatformConfig(enabled=True))
    req = SimpleNamespace(headers={"Authorization": f"Bearer {gateway}"}, match_info={"system_client_id": "emp-A"})
    token = _api_request_profile.set("aibiz")
    try:
        resp = asyncio.run(adapter._handle_radar_client(req))
    finally:
        _api_request_profile.reset(token)
    assert json.loads(resp.text) == {"sid": "emp-A", "profile": "aibiz"}


def test_radar_clients_list_needs_the_gateway_key(monkeypatch):
    """A lista de empresas com Radar (motor de alertas da porta) só abre com a chave de serviço."""
    from ops_center import copilot

    gateway = "g" * 40
    monkeypatch.setenv("COPILOT_GATEWAY_KEY", gateway)
    monkeypatch.setattr(copilot, "radar_clients", lambda: [{"systemClientId": "emp-A", "state": "active"}])
    adapter = APIServerAdapter(PlatformConfig(enabled=True))
    ok = asyncio.run(adapter._handle_radar_clients(SimpleNamespace(headers={"Authorization": f"Bearer {gateway}"})))
    assert json.loads(ok.text) == {"items": [{"systemClientId": "emp-A", "state": "active"}]}
    denied = asyncio.run(adapter._handle_radar_clients(SimpleNamespace(headers={"Authorization": "Bearer outra"})))
    assert denied.status == 401
