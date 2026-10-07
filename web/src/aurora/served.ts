/** Página servida pelo dashboard (token/ticket injetado) → backend real; Vite sem backend → mocks do protótipo. */
export const served = typeof window !== "undefined" && !!(window.__HERMES_SESSION_TOKEN__ || window.__HERMES_AUTH_REQUIRED__);
