"""Lista de Sessões: "perguntas" = mensagens do usuário ativas (bate com o que a conversa mostra)."""

from hermes_state import SessionDB


def test_question_counts(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    from hermes_cli.web_routers.sessions import _question_counts

    db = SessionDB(db_path=tmp_path / "state.db")
    db.create_session("a", "web")
    for role, text in (("user", "1"), ("assistant", "r"), ("tool", "{}"), ("user", "2"), ("assistant", "r2")):
        db.append_message("a", role, text)
    db.create_session("b", "web")
    db.close()
    assert _question_counts(tmp_path / "state.db", ["a", "b"]) == {"a": 2}
    assert _question_counts(tmp_path / "state.db", []) == {}
    assert _question_counts(tmp_path / "nao-existe.db", ["a"]) == {}
