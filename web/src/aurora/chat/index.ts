import { gatewayChat } from "./gateway";
import { mockChat } from "./mock";
import type { ChatAdapter } from "./types";

/** Servido pelo dashboard (token/ticket injetado) → gateway real; Vite sem backend → mock do protótipo. */
const served = typeof window !== "undefined" && (window.__HERMES_SESSION_TOKEN__ || window.__HERMES_AUTH_REQUIRED__);
export const chat: ChatAdapter = served ? gatewayChat : mockChat;
