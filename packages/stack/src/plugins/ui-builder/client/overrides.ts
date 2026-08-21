import type {
	ComponentRegistry,
	FunctionRegistry,
} from "@workspace/ui/components/ui-builder/types";
import type { UIBuilderClientHooks } from "../types";
import type { UIBuilderLocalizationOverrides } from "./localization";

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
 * External consumers can provide their own implementations to customize
 * plugin-specific components and behavior.
 */
export interface UIBuilderPluginOverrides {
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
	 * Function registry for resolving bindable event handlers (onClick, onSubmit, etc.)
	 * in the preview modal and layer renderer.
	 */
	functionRegistry?: FunctionRegistry;

	/** Localization overrides for built-in UI Builder plugin pages. */
	localization?: UIBuilderLocalizationOverrides;

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
