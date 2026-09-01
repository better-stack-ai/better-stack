import type { ComponentType } from "react";

/** Join a resolved site base path to an application route without `//`. */
export function joinBasePath(basePath: string, path: string): string {
	const normalizedBasePath = basePath.replace(/\/+$/, "");
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	return `${normalizedBasePath}${normalizedPath}`;
}

/**
 * Framework routing primitives shared by all plugins.
 *
 * Providing these fields once via the top-level `router` prop on
 * `StackProvider` makes them available to every plugin.
 */
export interface StackRouter {
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
	 * Navigation function for programmatic navigation
	 */
	navigate?: (path: string) => void | Promise<void>;
	/**
	 * Refresh function to invalidate server-side cache (e.g., Next.js router.refresh())
	 */
	refresh?: () => void | Promise<void>;
	/**
	 * Read the current URL search params
	 */
	getSearchParams?: () => URLSearchParams;
	/**
	 * Replace the current URL search params
	 */
	setSearchParams?: (
		next: URLSearchParams,
		opts?: { replace?: boolean },
	) => void;
}

/**
 * Config accepted by the `router` prop on `StackProvider`.
 *
 * Framework presets (`nextRouter()`, `reactRouter()`, `tanstackRouter()`) are
 * plain objects created anywhere — including module scope — so fields that
 * need framework hooks are produced by the optional `useRouter` hook, which
 * `StackProvider` evaluates internally. Hook results are merged over the
 * static fields.
 */
export interface StackRouterConfig extends StackRouter {
	/**
	 * Optional hook evaluated inside `StackProvider`. Use this for router
	 * fields that must be derived from framework hooks (e.g. `useNavigate`).
	 */
	useRouter?: () => StackRouter;
}

/**
 * Top-level API config used by all plugin components.
 */
export interface StackApiConfig {
	/**
	 * API base URL (e.g. `https://example.com`)
	 */
	baseURL: string;
	/**
	 * API base path (e.g. `/api/data`)
	 */
	basePath: string;
}
