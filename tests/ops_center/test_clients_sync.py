"""Diretório de clientes vindo do Mongo do negócio (só leitura)."""

import pytest


@pytest.fixture(autouse=True)
def _home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))


def test_sync_uses_business_id_and_name(monkeypatch):
    from ops_center import clients_sync, store

    docs = [{"_id": "oid1", "id": "sc-101", "name": "Padaria Sol", "status": "active"},
            {"_id": "oid2", "shortName": "Lumen", "status": "inactive"},  # sem id: usa o _id
            {"_id": "oid3", "id": "sc-103"}]  # sem nome: fica de fora
    seen = {}
    out = clients_sync.sync(fetch=lambda src: seen.update(src) or docs)
    assert seen["db"] == "aibiz_mrz" and seen["collection"] == "system_client"
    assert out["imported"] == 2 and out["total"] == 2
    assert store.get_client("sc-101")["name"] == "Padaria Sol" and store.get_client("oid2")["name"] == "Lumen"
    assert clients_sync.status()["last"]["imported"] == 2


def test_sync_without_connection_explains(monkeypatch):
    from ops_center import clients_sync

    with pytest.raises(ValueError, match="AIBIZ_MONGO_URI"):
        clients_sync.sync()
    assert clients_sync.set_source({"db": "outro"})["db"] == "outro"
    with pytest.raises(ValueError):
        clients_sync.set_source({"collection": " "})


def test_maybe_sync_waits_between_attempts(monkeypatch):
    from ops_center import clients_sync

    calls = []
    monkeypatch.setattr(clients_sync, "status", lambda: {"configured": True, "last": None})
    monkeypatch.setattr(clients_sync, "sync", lambda: calls.append(1) or (_ for _ in ()).throw(RuntimeError("fora do ar")))
    clients_sync.maybe_sync()
    clients_sync.maybe_sync()
    assert calls == [1]  # a falha não vira nova tentativa no ciclo seguinte
