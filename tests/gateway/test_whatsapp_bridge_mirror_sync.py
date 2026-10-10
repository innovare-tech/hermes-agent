"""Docker: a ponte roda de uma cópia em HERMES_HOME; atualizar a imagem tem de atualizar a cópia."""

from gateway.platforms import whatsapp_common as wc


def test_mirror_is_refreshed_from_install_tree_but_keeps_node_modules(tmp_path):
    src, dst = tmp_path / "install", tmp_path / "home"
    (src / "sub").mkdir(parents=True)
    (src / "bridge.js").write_text("v2 groups.json")
    (src / "sub" / "allowlist.js").write_text("novo")
    (src / "package.json").write_text('{"v": 2}')
    (dst / "node_modules" / "baileys").mkdir(parents=True)
    (dst / "node_modules" / "baileys" / "index.js").write_text("instalado")
    (dst / "bridge.js").write_text("v1")
    (dst / "package.json").write_text('{"v": 2}')
    before = (dst / "package.json").stat().st_mtime_ns

    wc._sync_bridge_mirror(src, dst)

    assert (dst / "bridge.js").read_text() == "v2 groups.json"
    assert (dst / "sub" / "allowlist.js").read_text() == "novo"
    assert (dst / "node_modules" / "baileys" / "index.js").read_text() == "instalado"
    assert (dst / "package.json").stat().st_mtime_ns == before  # igual: não reescreve


def test_resolve_syncs_existing_mirror_when_install_tree_is_read_only(tmp_path, monkeypatch):
    home = tmp_path / "hermes"
    mirror = home / "scripts" / "whatsapp-bridge"
    mirror.mkdir(parents=True)
    (mirror / "bridge.js").write_text("velho")
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setattr(wc.Path, "touch", lambda self, *a, **k: (_ for _ in ()).throw(OSError("read-only")))
    assert wc.resolve_whatsapp_bridge_dir() == mirror
    install_bridge = wc.Path(wc.__file__).resolve().parents[2] / "scripts" / "whatsapp-bridge" / "bridge.js"
    assert (mirror / "bridge.js").read_bytes() == install_bridge.read_bytes()
