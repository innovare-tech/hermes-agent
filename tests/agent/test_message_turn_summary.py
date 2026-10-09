"""Resumo do turno no display_metadata da linha do usuário: o rodapé e o estado (interrompido/erro) voltam
ao reabrir a conversa em qualquer cliente, sem depender do navegador."""

import json
import sqlite3

import pytest

from hermes_state import SessionDB


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    return SessionDB(db_path=tmp_path / "state.db")


def _meta(path, row_id):
    con = sqlite3.connect(path)
    try:
        raw = con.execute("SELECT display_metadata FROM messages WHERE id=?", (row_id,)).fetchone()[0]
    finally:
        con.close()
    return json.loads(raw) if raw else None


def test_turn_summary_round_trip_and_keeps_reactions(db, tmp_path):
    key = db.create_session("turn-sum", "test")
    db.append_message(key, "user", "oi")
    db.append_message(key, "assistant", "olá")
    user_row = db.get_messages_as_conversation(key, include_row_ids=True)[0]["_row_id"]

    db.set_message_reaction(key, user_row, "\U0001f44d", author="agent")
    summary = {"status": "interrupted", "model": "m", "tokens": {"input": 10, "output": 2, "reasoning": 0, "total": 12}}
    assert db.set_message_turn_summary(key, user_row, summary) is True
    db.flush_token_counts() if hasattr(db, "flush_token_counts") else None
    meta = _meta(tmp_path / "state.db", user_row)
    assert meta["turn"] == summary and meta["reactions"][0]["emoji"] == "\U0001f44d"

    assert db.set_message_turn_summary(key, user_row, None) is True
    assert "turn" not in (_meta(tmp_path / "state.db", user_row) or {})
    assert db.set_message_turn_summary("outra-sessao", user_row, summary) is False
