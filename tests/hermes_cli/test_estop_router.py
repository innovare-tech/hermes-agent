"""``/api/estop`` toggles the same sentinel ``hermes pause`` / ``hermes resume`` use."""

import pytest


@pytest.mark.asyncio
async def test_estop_route_round_trip(tmp_path, monkeypatch):
    from agent import estop
    from hermes_cli.web_routers.estop import EstopBody, get_estop, put_estop

    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))

    assert (await get_estop())["paused"] is False

    engaged = await put_estop(EstopBody(paused=True, reason="teste"))
    assert engaged["paused"] is True and engaged["reason"] == "teste"
    assert estop.is_engaged()

    resumed = await put_estop(EstopBody(paused=False))
    assert resumed == {"paused": False, "reason": None, "engaged_at": None}
    assert not estop.is_engaged()
