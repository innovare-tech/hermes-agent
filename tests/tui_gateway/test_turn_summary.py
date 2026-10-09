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


def test_get_usage_reports_session_cost_and_status():
    from types import SimpleNamespace
    from tui_gateway.server import _get_usage

    u = _get_usage(SimpleNamespace(model="m", session_estimated_cost_usd=0.0175, session_cost_status="estimated"))
    assert u["cost_usd"] == 0.0175 and u["cost_status"] == "estimated"
    assert _get_usage(SimpleNamespace(model="m"))["cost_status"] == "unknown"


def test_usage_includes_stored_totals_after_resume():
    """Agente retomado começa do zero; o painel soma o que a conversa já gastou (linha ``sessions``)."""
    from types import SimpleNamespace
    from tui_gateway.server import _get_usage, _stored_usage_base

    row = {"input_tokens": 100, "output_tokens": 10, "cache_read_tokens": 50, "reasoning_tokens": 5,
           "api_call_count": 2, "estimated_cost_usd": 0.02, "cost_status": "estimated"}
    base = _stored_usage_base(SimpleNamespace(get_session=lambda k: row), "s1")
    agent = SimpleNamespace(model="m", session_input_tokens=7, session_output_tokens=3, session_api_calls=1,
                            session_estimated_cost_usd=0.001, _usage_base=base)
    u = _get_usage(agent)
    assert (u["input"], u["output"], u["calls"], u["total"]) == (107, 13, 3, 160)
    assert round(u["cost_usd"], 3) == 0.021 and u["cost_status"] == "estimated"
    assert _stored_usage_base(SimpleNamespace(get_session=lambda k: None), "s1") == {}


def test_context_breakdown_waits_for_cold_resume_build(monkeypatch):
    """Retomada a frio: o agente ainda está montando. O painel espera e recebe o contexto calculado, não 0."""
    import threading
    from types import SimpleNamespace
    from tui_gateway import server

    assert "session.context_breakdown" in server._LONG_HANDLERS  # espera fora do leitor do socket
    ready = threading.Event()
    session = {"agent": None, "agent_ready": ready, "agent_build_started": True, "history": [],
               "history_lock": threading.Lock(), "session_key": "k1", "profile_home": None}
    monkeypatch.setattr(server, "_sessions", {"s1": session})
    monkeypatch.setattr("agent.context_breakdown.compute_session_context_breakdown",
                        lambda agent, history: {"categories": [], "context_used": 20700, "context_max": 100})
    monkeypatch.setattr("agent.context_file_sources.context_file_sources_for_agent", lambda agent: [])

    def build():
        session["agent"] = SimpleNamespace(model="m")
        ready.set()

    threading.Timer(0.2, build).start()
    resp = server._methods["session.context_breakdown"]("rid", {"session_id": "s1"})
    assert resp["result"]["context_used"] == 20700, resp
