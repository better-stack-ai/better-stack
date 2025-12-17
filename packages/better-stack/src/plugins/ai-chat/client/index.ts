export { aiChatClientPlugin } from "./plugin";
export type {
	AiChatClientConfig,
	AiChatClientHooks,
	RouteContext,
	LoaderContext,
} from "./plugin";
export type {
	AiChatPluginOverrides,
	AllowedFileType,
	ToolCallProps,
	ToolCallState,
	ToolCallRenderer,
} from "./overrides";
export { DEFAULT_ALLOWED_FILE_TYPES } from "./overrides";
export { ChatInterface } from "./components/chat-interface";
export { ChatLayout } from "./components/chat-layout";
export type { ChatLayoutProps } from "./components/chat-layout";
export { ChatSidebar } from "./components/chat-sidebar";
export { ChatMessage } from "./components/chat-message";
export { ChatInput } from "./components/chat-input";
export { ToolCallDisplay } from "./components/tool-call-display";

// Re-export UIMessage type from AI SDK for consumer convenience
export type { UIMessage } from "ai";
