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
 * Provide these in the `comments` block of `StackProvider.overrides`.
 */
export interface CommentsPluginOverrides {
	/**
	 * Localization strings for all Comments plugin UI.
	 * Defaults to English when not provided.
	 */
	localization?: Partial<CommentsLocalization>;
	/**
	 * Whether to show the "Powered by BTST" attribution on plugin pages.
	 * Defaults to true.
	 */
	showAttribution?: boolean;

	/**
	 * Default number of top-level comments to load per page in `CommentThread`.
	 * Can be overridden per-instance via the `pageSize` prop.
	 * Defaults to 100 when not set.
	 */
	defaultCommentPageSize?: number;

	/**
	 * Default sort direction (by `createdAt`) for top-level comments in
	 * `CommentThread`.
	 * - `"desc"` (default): newest comments first.
	 * - `"asc"`: oldest comments first.
	 *
	 * Can be overridden per-instance via the `sort` prop on `CommentThread`.
	 */
	defaultCommentSort?: "asc" | "desc";

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
