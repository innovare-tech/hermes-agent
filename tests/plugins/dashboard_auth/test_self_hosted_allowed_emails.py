"""``allowed_emails``: com um IDP público (Google), só os e-mails da lista entram — e só verificados."""
from __future__ import annotations

import time

import pytest

import plugins.dashboard_auth.self_hosted as oidc

ME = "santoskeeelvin@gmail.com"


def _provider(allowed):
    return oidc.SelfHostedOIDCProvider(issuer="https://accounts.google.com", client_id="cid", allowed_emails=allowed)


def _claims(email, verified=True):
    return {"sub": "1", "email": email, "email_verified": verified, "exp": int(time.time()) + 600}


def test_allowed_email_logs_in_case_insensitive():
    s = _provider([ME])._session("tok", "", _claims(ME.upper()))
    assert s.email == ME.upper() and s.user_id == "1"


@pytest.mark.parametrize("claims", [_claims("outro@gmail.com"), _claims(ME, verified=False), _claims("")])
def test_other_unverified_or_missing_email_is_refused(claims):
    with pytest.raises(oidc.EmailNotAllowedError):
        _provider([ME])._session("tok", "", claims)


def test_live_session_of_removed_email_stops_verifying(monkeypatch):
    p = _provider([ME])
    monkeypatch.setattr(p, "_claims_for", lambda token: _claims("outro@gmail.com"))
    assert p.verify_session(access_token="tok") is None


def test_empty_allowlist_keeps_upstream_behaviour():
    assert _provider(())._session("tok", "", _claims("qualquer@gmail.com", verified=False)).email


def test_settings_read_env_list(monkeypatch):
    monkeypatch.setenv("HERMES_DASHBOARD_OIDC_ISSUER", "https://accounts.google.com")
    monkeypatch.setenv("HERMES_DASHBOARD_OIDC_CLIENT_ID", "cid")
    monkeypatch.setenv("HERMES_DASHBOARD_OIDC_ALLOWED_EMAILS", f"{ME}, Ivair@Exemplo.com")
    monkeypatch.setattr(oidc, "_load_config_oauth_section", lambda: {})
    assert oidc._settings()["allowed_emails"] == {ME, "ivair@exemplo.com"}


def test_limited_response_reads_gzip_body_once(monkeypatch):
    """Google serve a descoberta OIDC com gzip: o corpo lido já vem descompactado e não pode ser decodificado de novo."""
    import gzip
    import json

    import httpx

    import plugins.dashboard_auth._shared as shared

    body = json.dumps({"issuer": "https://accounts.google.com"}).encode()
    transport = httpx.MockTransport(lambda req: httpx.Response(
        200, headers={"content-encoding": "gzip", "content-type": "application/json"}, content=gzip.compress(body)))
    real_stream = httpx.stream
    monkeypatch.setattr(shared.httpx, "stream",
                        lambda method, url, **kw: httpx.Client(transport=transport).stream(method, url, **kw))
    r = shared._request_limited_response("GET", "https://accounts.google.com/.well-known/openid-configuration")
    assert r.json()["issuer"] == "https://accounts.google.com"
    assert real_stream is not None


def test_settings_feed_the_provider_end_to_end(monkeypatch):
    """O caminho real: _settings() → construtor → login. (O frozenset das settings virava texto no construtor.)"""
    monkeypatch.setenv("HERMES_DASHBOARD_OIDC_ISSUER", "https://accounts.google.com")
    monkeypatch.setenv("HERMES_DASHBOARD_OIDC_CLIENT_ID", "cid")
    monkeypatch.setenv("HERMES_DASHBOARD_OIDC_ALLOWED_EMAILS", ME)
    monkeypatch.setattr(oidc, "_load_config_oauth_section", lambda: {})
    p = oidc.SelfHostedOIDCProvider(**oidc._settings())
    assert p._session("tok", "", _claims(ME)).email == ME
    with pytest.raises(oidc.EmailNotAllowedError):
        p._session("tok", "", _claims("outro@gmail.com"))


def test_google_login_asks_offline_access_so_the_session_outlives_the_1h_id_token(monkeypatch):
    """Sem access_type=offline o Google não manda refresh token: a sessão do painel caía em ~1h."""
    import urllib.parse

    p = _provider([ME])
    monkeypatch.setattr(p, "_get_discovery", lambda: {"authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth"})
    q = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(p.start_login(redirect_uri="https://agent.innv.dev/auth/callback").redirect_url).query))
    assert q["access_type"] == "offline" and q["prompt"] == "consent"
    assert q["code_challenge_method"] == "S256" and q["client_id"] == "cid"


def test_auth_params_never_override_pkce_core_and_other_idps_get_none(monkeypatch):
    import urllib.parse

    p = oidc.SelfHostedOIDCProvider(issuer="https://auth.example.com", client_id="cid",
                                    auth_params={"state": "x", "foo": "bar"})
    monkeypatch.setattr(p, "_get_discovery", lambda: {"authorization_endpoint": "https://auth.example.com/authorize"})
    q = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(p.start_login(redirect_uri="https://agent.innv.dev/auth/callback").redirect_url).query))
    assert q["foo"] == "bar" and q["state"] != "x"
    assert oidc.SelfHostedOIDCProvider(issuer="https://auth.example.com", client_id="cid")._auth_params == {}
