"""Rotação com janela (Copiloto do Gestor): a chave anterior de um perfil nomeado vale até
API_SERVER_KEY_PREVIOUS_UNTIL; depois, 401. O perfil padrão nunca usa chave anterior."""

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
