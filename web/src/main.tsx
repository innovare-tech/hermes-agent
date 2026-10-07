// Aurora é a UI padrão. `?ui=legacy` abre a interface antiga (até a Fase 6), `?ui=aurora` volta.
const KEY = "hermes.ui";
const asked = new URLSearchParams(location.search).get("ui");
try {
  if (asked) localStorage.setItem(KEY, asked);
} catch {
  // sem storage a escolha vale só para esta carga
}
let ui = asked;
try {
  ui ??= localStorage.getItem(KEY);
} catch {
  // idem
}

if (ui === "legacy") import("./legacy-main");
else import("./aurora/main");
