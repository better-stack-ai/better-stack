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

import type { CommentsLocalization } from "./localization";

/**
 * Overridable configuration and hooks for the Comments plugin.
 *
 * Provide these in the layout wrapping your pages via `PluginOverridesProvider`.
 */
export interface CommentsPluginOverrides {
	/**
	 * Localization strings for all Comments plugin UI.
	 * Defaults to English when not provided.
	 */
	localization?: Partial<CommentsLocalization>;
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

	/**
	 * Whether to show the "Powered by BTST" attribution on plugin pages.
	 * Defaults to true.
	 */
	showAttribution?: boolean;

	/**
	 * The ID of the currently authenticated user.
	 *
	 * Used by the User Comments page and the per-resource comments admin view to
	 * scope the comment list to the current user and to enable posting.
	 * Can be a static string or an async function (useful when the user ID must
	 * be resolved from a session cookie at render time).
	 *
	 * When absent both pages show a "Please log in" prompt.
	 */
	currentUserId?:
		| string
		| (() => string | undefined | Promise<string | undefined>);

	/**
	 * URL to redirect unauthenticated users to when they try to post a comment.
	 *
	 * Forwarded to every embedded `CommentThread` (including the one on the
	 * per-resource admin comments view). When absent no login link is shown.
	 */
	loginHref?: string;

	/**
	 * Default number of top-level comments to load per page in `CommentThread`.
	 * Can be overridden per-instance via the `pageSize` prop.
	 * Defaults to 100 when not set.
	 */
	defaultCommentPageSize?: number;

	/**
	 * When false, the comment form and reply buttons are hidden in all
	 * `CommentThread` instances. Users can still read existing comments.
	 * Defaults to true.
	 *
	 * Can be overridden per-instance via the `allowPosting` prop on `CommentThread`.
	 */
	allowPosting?: boolean;

	/**
	 * When false, the edit button is hidden on all comment cards in all
	 * `CommentThread` instances.
	 * Defaults to true.
	 *
	 * Can be overridden per-instance via the `allowEditing` prop on `CommentThread`.
	 */
	allowEditing?: boolean;

	/**
	 * Per-resource-type URL builders used to link each comment back to its
	 * original resource on the User Comments page.
	 *
	 * @example
	 * ```ts
	 * resourceLinks: {
	 *   "blog-post": (slug) => `/pages/blog/${slug}`,
	 *   "kanban-task": (id) => `/pages/kanban?task=${id}`,
	 * }
	 * ```
	 *
	 * When a resource type has no entry the ID is shown as plain text.
	 */
	resourceLinks?: Record<string, (id: string) => string>;

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

	/**
	 * Called before the User Comments page is rendered.
	 * Throw to block rendering (e.g., when the user is not authenticated).
	 * @param context - Route context
	 */
	onBeforeUserCommentsPageRendered?: (context: RouteContext) => boolean | void;

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
