import type { ComponentType } from "react";
import type { KanbanLocalization } from "./localization";

/**
 * Context passed to lifecycle hooks
 */
export interface RouteContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { boardId: "abc123" }) */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Additional context properties */
	[key: string]: unknown;
}

/**
 * Overridable components and functions for the Kanban plugin
 *
 * External consumers can provide their own implementations of these
 * to customize the behavior for their framework (Next.js, React Router, etc.)
 */
export interface KanbanPluginOverrides {
	/**
	 * Link component for navigation
	 */
	Link?: ComponentType<React.ComponentProps<"a"> & Record<string, unknown>>;
	/**
	 * Navigation function for programmatic navigation
	 */
	navigate: (path: string) => void | Promise<void>;
	/**
	 * Refresh function to invalidate server-side cache (e.g., Next.js router.refresh())
	 */
	refresh?: () => void | Promise<void>;
	/**
	 * Image component for displaying images
	 */
	Image?: ComponentType<
		React.ImgHTMLAttributes<HTMLImageElement> & Record<string, unknown>
	>;
	/**
	 * Localization object for the kanban plugin
	 */
	localization?: KanbanLocalization;
	/**
	 * API base URL
	 */
	apiBaseURL: string;
	/**
	 * API base path
	 */
	apiBasePath: string;
	/**
	 * Whether to show the attribution
	 */
	showAttribution?: boolean;
	/**
	 * Optional headers to pass with API requests (e.g., for SSR auth)
	 */
	headers?: HeadersInit;

	// ============ Lifecycle Hooks (optional) ============

	/**
	 * Called when a route is rendered
	 * @param routeName - Name of the route (e.g., 'boards', 'board', 'newBoard')
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
	 * Called before the boards list page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param context - Route context
	 */
	onBeforeBoardsPageRendered?: (context: RouteContext) => boolean;

	/**
	 * Called before a single board page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param boardId - The board ID
	 * @param context - Route context
	 */
	onBeforeBoardPageRendered?: (
		boardId: string,
		context: RouteContext,
	) => boolean;

	/**
	 * Called before the new board page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param context - Route context
	 */
	onBeforeNewBoardPageRendered?: (context: RouteContext) => boolean;
}
