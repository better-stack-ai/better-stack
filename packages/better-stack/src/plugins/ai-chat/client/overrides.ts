import type { ComponentType } from "react";
import type { AiChatLocalization } from "./localization";

/**
 * Plugin mode for AI Chat
 * - 'authenticated': Conversations persisted with userId (default)
 * - 'public': Stateless chat, no persistence (ideal for public chatbots)
 */
export type AiChatMode = "authenticated" | "public";

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
 * External consumers can provide their own implementations of these
 * to customize the behavior for their framework (Next.js, React Router, etc.)
 */
export interface AiChatPluginOverrides {
	/**
	 * Plugin mode - should match backend config
	 * @default 'authenticated'
	 */
	mode?: AiChatMode;

	/**
	 * API base URL
	 */
	apiBaseURL: string;

	/**
	 * API base path
	 */
	apiBasePath: string;

	/**
	 * Navigation function for programmatic navigation
	 */
	navigate: (path: string) => void | Promise<void>;

	/**
	 * Refresh function to invalidate server-side cache (e.g., Next.js router.refresh())
	 */
	refresh?: () => void | Promise<void>;

	/**
	 * Link component for navigation
	 */
	Link?: ComponentType<React.ComponentProps<"a"> & Record<string, any>>;

	/**
	 * Image component for displaying images
	 */
	Image?: ComponentType<
		React.ImgHTMLAttributes<HTMLImageElement> & Record<string, any>
	>;

	/**
	 * Function used to upload an image and return its URL.
	 */
	uploadImage?: (file: File) => Promise<string>;

	/**
	 * Localization object for the AI Chat plugin
	 */
	localization?: Partial<AiChatLocalization>;

	/**
	 * Optional headers to pass with API requests (e.g., for SSR auth)
	 */
	headers?: HeadersInit;

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

	/**
	 * Called before the chat page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param context - Route context
	 */
	onBeforeChatPageRendered?: (context: RouteContext) => boolean;

	/**
	 * Called before a conversation page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param id - The conversation ID
	 * @param context - Route context
	 */
	onBeforeConversationPageRendered?: (
		id: string,
		context: RouteContext,
	) => boolean;
}
