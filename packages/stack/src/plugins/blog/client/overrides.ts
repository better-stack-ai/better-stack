import type { SerializedPost } from "../types";
import type { ComponentType } from "react";
import type { BlogLocalization } from "./localization";

/**
 * Context passed to lifecycle hooks
 */
export interface RouteContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { slug: "my-post" }) */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Additional context properties */
	[key: string]: any;
}

/**
 * Overridable components and functions for the Blog plugin
 *
 * External consumers can provide their own implementations of these
 * to customize the behavior for their framework (Next.js, React Router, etc.)
 */
export interface BlogPluginOverrides {
	/**
	 * Link component for navigation
	 */
	Link?: ComponentType<React.ComponentProps<"a"> & Record<string, any>>;
	/**
	 * Post card component for displaying a post
	 */
	PostCard?: ComponentType<{
		post: SerializedPost;
	}>;
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
		React.ImgHTMLAttributes<HTMLImageElement> & Record<string, any>
	>;
	/**
	 * Function used to upload an image and return its URL.
	 */
	uploadImage: (file: File) => Promise<string>;
	/**
	 * Localization object for the blog plugin
	 */
	localization?: BlogLocalization;
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

	// Lifecycle Hooks (optional)
	/**
	 * Called when a route is rendered
	 * @param routeName - Name of the route (e.g., 'posts', 'post', 'newPost')
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
	 * Called before the posts list page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param context - Route context
	 */
	onBeforePostsPageRendered?: (context: RouteContext) => boolean;

	/**
	 * Called before a single post page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param slug - The post slug
	 * @param context - Route context
	 */
	onBeforePostPageRendered?: (slug: string, context: RouteContext) => boolean;

	/**
	 * Called before the new post page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param context - Route context
	 */
	onBeforeNewPostPageRendered?: (context: RouteContext) => boolean;

	/**
	 * Called before the edit post page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param slug - The post slug being edited
	 * @param context - Route context
	 */
	onBeforeEditPostPageRendered?: (
		slug: string,
		context: RouteContext,
	) => boolean;

	/**
	 * Called before the drafts page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param context - Route context
	 */
	onBeforeDraftsPageRendered?: (context: RouteContext) => boolean;
}
