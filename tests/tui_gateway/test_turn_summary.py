"""O fim do turno grava o resumo (tokens/custo DESTE turno, duração, status) na linha do usuário."""

import contextlib
from types import SimpleNamespace

import tui_gateway.server as server


def test_record_turn_summary_writes_delta_on_user_row(monkeypatch):
    from tui_gateway import prompt_turn  # noqa: F401 — garante o bind dos helpers no server

    calls = []

    class FakeDB:
        def set_message_turn_summary(self, key, row, summary):
            calls.append((key, row, summary))
            return True

    @contextlib.contextmanager
    def fake_db(session):
        yield FakeDB()

    monkeypatch.setattr(server, "_session_db", fake_db)
    agent = SimpleNamespace(model="gemini-x", session_estimated_cost_usd=0.5, session_cost_status="estimated")
    st = SimpleNamespace(agent=agent, usage_before={"input": 100, "output": 10, "reasoning": 0, "total": 110},
                         cost_before=0.25, started_at=server.time.time() - 3)
    payload = {"usage": {"model": "gemini-x", "input": 150, "output": 30, "reasoning": 5, "total": 185},
               "persisted_turn": {"user_row_id": 42, "row_ids": [42, 43]}, "status": "interrupted"}
    server._record_turn_summary({"session_key": "k1"}, st, payload, "interrupted")

    [(key, row, summary)] = calls
    assert (key, row) == ("k1", 42)
    assert summary["status"] == "interrupted" and summary["model"] == "gemini-x"
    assert summary["tokens"] == {"input": 50, "output": 20, "reasoning": 5, "total": 75}
    assert summary["cost_usd"] == 0.25 and summary["duration_s"] >= 3
    assert payload["turn_summary"] == summary


def test_record_turn_summary_without_row_is_a_noop(monkeypatch):
    called = []
    monkeypatch.setattr(server, "_session_db", lambda s: called.append(1))
    server._record_turn_summary({"session_key": "k1"}, SimpleNamespace(agent=None, usage_before={}, cost_before=0,
                                                                       started_at=0), {"usage": {}}, "complete")
    assert called == []
