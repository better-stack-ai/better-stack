import type { ComponentType } from "react";
import type { AiChatLocalization } from "./localization";

/**
 * Plugin mode for AI Chat
 * - 'authenticated': Conversations persisted with userId (default)
 * - 'public': Stateless chat, no persistence (ideal for public chatbots)
 */
export type AiChatMode = "authenticated" | "public";

/** Browser-safe AI Chat factory values carried by the resolved client stack. */
export interface AiChatProviderConfig {
	/** Conversation behavior selected by `aiChatClientPlugin()`. */
	readonly mode: AiChatMode;
}

/** Resolve an explicit component mode before the registered plugin default. */
export function resolveAiChatMode(
	configuredMode: AiChatMode | undefined,
	providerConfig: Readonly<Record<string, unknown>> | undefined,
): AiChatMode {
	if (configuredMode) return configuredMode;
	return providerConfig?.mode === "public" ? "public" : "authenticated";
}

/**
 * State of a tool call execution
 */
export type ToolCallState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

/**
 * Props passed to custom tool call renderer components
 */
export interface ToolCallProps<TInput = unknown, TOutput = unknown> {
	/** Unique identifier for this tool call */
	toolCallId: string;
	/** Name of the tool being called */
	toolName: string;
	/** Current state of the tool call execution */
	state: ToolCallState;
	/** Input arguments passed to the tool (may be partial during streaming) */
	input: TInput | undefined;
	/** Output from the tool (only available when state is 'output-available') */
	output: TOutput | undefined;
	/** Error message (only available when state is 'output-error') */
	errorText?: string;
	/** Whether the tool call is currently in progress */
	isLoading: boolean;
}

/**
 * A component that renders a custom UI for a specific tool call.
 * Return `null` to fall back to the default tool call accordion.
 */
export type ToolCallRenderer<
	TInput = unknown,
	TOutput = unknown,
> = ComponentType<ToolCallProps<TInput, TOutput>>;

/**
 * Allowed file type categories for uploads
 */
export type AllowedFileType =
	| "image"
	| "text"
	| "pdf"
	| "markdown"
	| "csv"
	| "json";

/**
 * Default allowed file types (images only for best AI model compatibility)
 * Consumers can expand this by passing allowedFileTypes in overrides
 */
export const DEFAULT_ALLOWED_FILE_TYPES: AllowedFileType[] = ["image"];

/**
 * MIME type mappings for each file type category
 */
export const FILE_TYPE_MIME_MAP: Record<AllowedFileType, string[]> = {
	image: ["image/*"],
	text: ["text/plain"],
	markdown: ["text/markdown"],
	csv: ["text/csv"],
	pdf: ["application/pdf"],
	json: ["application/json"],
};

/**
 * Context passed to lifecycle hooks
 */
export interface RouteContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { id: "abc123" }) */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Additional context properties */
	[key: string]: any;
}

/**
 * Overridable components and functions for the AI Chat plugin
 *
 * External consumers can provide their own implementations to customize
 * plugin-specific components and behavior.
 */
export interface AiChatPluginOverrides {
	/**
	 * Function used to upload a file and return its URL.
	 * Called for images, PDFs, text files, and other supported file types.
	 */
	uploadFile?: (file: File) => Promise<string>;

	/**
	 * Allowed file types for upload.
	 * By default, all types are enabled: image, text, pdf, markdown, csv, json
	 * Set to empty array to disable file uploads entirely.
	 * @default ['image', 'text', 'pdf', 'markdown', 'csv', 'json']
	 */
	allowedFileTypes?: AllowedFileType[];

	/**
	 * Localization object for the AI Chat plugin
	 */
	localization?: Partial<AiChatLocalization>;

	/**
	 * Whether to show the attribution
	 * @default true
	 */
	showAttribution?: boolean;

	/**
	 * Suggested prompts to display in the empty chat state.
	 * When provided, these appear as clickable buttons that populate the input field.
	 *
	 * @example
	 * ```tsx
	 * chatSuggestions: [
	 *   "What can you help me with?",
	 *   "Tell me about your features",
	 *   "How do I get started?",
	 * ]
	 * ```
	 */
	chatSuggestions?: string[];

	/**
	 * Custom renderers for tool calls. Keys should match tool names.
	 * Each renderer receives ToolCallProps and can return custom UI.
	 *
	 * @example
	 * ```tsx
	 * toolRenderers: {
	 *   getWeather: ({ toolName, input, output, state, isLoading }) => (
	 *     <WeatherCard location={input?.location} weather={output} loading={isLoading} />
	 *   ),
	 *   searchDocs: ({ input, output, isLoading }) => (
	 *     <SearchResults query={input?.query} results={output} loading={isLoading} />
	 *   ),
	 * }
	 * ```
	 */
	toolRenderers?: Record<string, ToolCallRenderer>;

	// ============== Lifecycle Hooks (optional) ==============

	/**
	 * Called when a route is rendered
	 * @param routeName - Name of the route (e.g., 'chat', 'chatConversation')
	 * @param context - Route context with path, params, etc.
	 */
	onRouteRender?: (
		routeName: string,
		context: RouteContext,
	) => void | Promise<void>;

	/**
	 * Called when a route encounters an error
	 * @param routeName - Name of the route
	 * @param error - The error that occurred
	 * @param context - Route context
	 */
	onRouteError?: (
		routeName: string,
		error: Error,
		context: RouteContext,
	) => void | Promise<void>;
}
