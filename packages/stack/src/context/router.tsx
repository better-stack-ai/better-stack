import type { ComponentType } from "react";

/**
 * Framework routing primitives shared by all plugins.
 *
 * These are the fields that every plugin override block used to re-wire
 * individually (`Link`, `navigate`, `refresh`, `Image`). Providing them once
 * via the top-level `router` prop on `StackProvider` applies them to every
 * plugin; per-plugin overrides still take precedence.
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
 * Top-level API config applied to all plugins.
 * Maps to the `apiBaseURL` / `apiBasePath` fields of each plugin's overrides.
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

/**
 * Override keys that are managed by the top-level `router` / `api` props.
 */
export type RouterManagedOverrideKeys =
	| "Link"
	| "Image"
	| "navigate"
	| "refresh"
	| "getSearchParams"
	| "setSearchParams"
	| "apiBaseURL"
	| "apiBasePath";

/**
 * Makes the router/api-managed fields of a plugin overrides interface
 * optional, so consumers wiring `router` / `api` at the top level can omit
 * them per plugin without type errors.
 */
export type WithOptionalRouterOverrides<T> = Omit<
	T,
	Extract<keyof T, RouterManagedOverrideKeys>
> &
	Partial<Pick<T, Extract<keyof T, RouterManagedOverrideKeys>>>;
