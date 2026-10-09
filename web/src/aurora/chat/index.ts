import { gatewayChat, resetChatProfile } from "./gateway";
import type { ChatAdapter } from "./types";

/** Conversa real: JSON-RPC do tui_gateway via /api/ws. */
export const chat: ChatAdapter = gatewayChat;

export { resetChatProfile };
