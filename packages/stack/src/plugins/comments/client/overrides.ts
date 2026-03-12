/**
 * Context passed to lifecycle hooks
 */
export interface RouteContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { resourceId: "my-post", resourceType: "blog-post" }) */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Additional context properties */
	[key: string]: unknown;
}

/**
 * Overridable configuration and hooks for the Comments plugin.
 *
 * Provide these in the layout wrapping your pages via `PluginOverridesProvider`.
 */
export interface CommentsPluginOverrides {
	/**
	 * Base URL for API calls (e.g., "https://example.com")
	 */
	apiBaseURL: string;

	/**
	 * Path where the API is mounted (e.g., "/api/data")
	 */
	apiBasePath: string;

	/**
	 * Optional headers for authenticated API calls (e.g., forwarding cookies)
	 */
	headers?: Record<string, string>;

	// ============ Access Control Hooks ============

	/**
	 * Called before the moderation dashboard page is rendered.
	 * Return false to block rendering (e.g., redirect to login or show 403).
	 * @param context - Route context
	 */
	onBeforeModerationPageRendered?: (context: RouteContext) => boolean;

	/**
	 * Called before the per-resource comments page is rendered.
	 * Return false to block rendering (e.g., for authorization).
	 * @param resourceType - The type of resource (e.g., "blog-post")
	 * @param resourceId - The ID of the resource
	 * @param context - Route context
	 */
	onBeforeResourceCommentsRendered?: (
		resourceType: string,
		resourceId: string,
		context: RouteContext,
	) => boolean;

	// ============ Lifecycle Hooks ============

	/**
	 * Called when a route is rendered.
	 * @param routeName - Name of the route (e.g., 'moderation', 'resourceComments')
	 * @param context - Route context
	 */
	onRouteRender?: (
		routeName: string,
		context: RouteContext,
	) => void | Promise<void>;

	/**
	 * Called when a route encounters an error.
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
