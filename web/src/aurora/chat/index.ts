import { gatewayChat } from "./gateway";
import { served } from "../served";
import { mockChat } from "./mock";
import type { ChatAdapter } from "./types";

export const chat: ChatAdapter = served ? gatewayChat : mockChat;
