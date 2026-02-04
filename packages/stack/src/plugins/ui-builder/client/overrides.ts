import type { ComponentType } from "react";
import type { ComponentRegistry } from "@workspace/ui/components/ui-builder/types";
import type { UIBuilderClientHooks } from "../types";

/**
 * Context passed to lifecycle hooks
 */
export interface RouteContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { id: "123" }) */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Additional context properties */
	[key: string]: unknown;
}

/**
 * Plugin overrides interface for UI Builder
 *
 * External consumers can provide their own implementations of these
 * to customize the behavior for their framework (Next.js, React Router, etc.)
 */
export interface UIBuilderPluginOverrides {
	/**
	 * Link component for navigation
	 */
	Link?: ComponentType<React.ComponentProps<"a"> & Record<string, unknown>>;

	/**
	 * Navigation function for programmatic navigation
	 */
	navigate?: (path: string) => void | Promise<void>;

	/**
	 * Refresh function to invalidate server-side cache (e.g., Next.js router.refresh())
	 */
	refresh?: () => void | Promise<void>;

	/**
	 * API base URL
	 */
	apiBaseURL: string;

	/**
	 * API base path
	 */
	apiBasePath: string;

	/**
	 * Optional headers to pass with API requests (e.g., for SSR auth)
	 */
	headers?: HeadersInit;

	/**
	 * Whether to show the attribution
	 */
	showAttribution?: boolean;

	/**
	 * Component registry for the UI Builder
	 */
	componentRegistry?: ComponentRegistry;

	/**
	 * Base path for UI Builder admin pages (default: /pages/ui-builder)
	 */
	siteBasePath?: string;

	/**
	 * SSR authorization hooks
	 */
	hooks?: UIBuilderClientHooks;

	// Lifecycle Hooks (optional)

	/**
	 * Called when a route is rendered
	 * @param routeName - Name of the route (e.g., 'pageList', 'pageBuilder')
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
