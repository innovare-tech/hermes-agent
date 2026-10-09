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
