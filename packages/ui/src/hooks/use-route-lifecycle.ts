"use client";

import { useEffect } from "react";

/**
 * Base route context interface that plugins can extend
 */
export interface BaseRouteContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { slug: "my-post" }) */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Additional context properties */
	[key: string]: unknown;
}

/**
 * Minimum interface required for route lifecycle hooks
 * Plugin overrides should implement these optional hooks
 */
export interface RouteLifecycleOverrides<TContext extends BaseRouteContext> {
	/** Called when a route is rendered */
	onRouteRender?: (
		routeName: string,
		context: TContext,
	) => void | Promise<void>;
	/** Called when a route encounters an error */
	onRouteError?: (
		routeName: string,
		error: Error,
		context: TContext,
	) => void | Promise<void>;
}

/**
 * Hook to handle route lifecycle events
 * - Calls authorization check before render
 * - Calls onRouteRender on mount
 * - Handles errors with onRouteError
 *
 * @example
 * ```tsx
 * const overrides = usePluginOverrides<MyPluginOverrides>("myPlugin");
 *
 * useRouteLifecycle({
 *   routeName: "dashboard",
 *   context: { path: "/dashboard", isSSR: typeof window === "undefined" },
 *   overrides,
 *   beforeRenderHook: (overrides, context) => {
 *     if (overrides.onBeforeDashboardRendered) {
 *       return overrides.onBeforeDashboardRendered(context);
 *     }
 *     return true;
 *   },
 * });
 * ```
 */
export function useRouteLifecycle<
	TContext extends BaseRouteContext,
	TOverrides extends RouteLifecycleOverrides<TContext>,
>({
	routeName,
	context,
	overrides,
	beforeRenderHook,
}: {
	routeName: string;
	context: TContext;
	overrides: TOverrides;
	beforeRenderHook?: (overrides: TOverrides, context: TContext) => boolean;
}) {
	// Authorization check - runs synchronously before render
	if (beforeRenderHook) {
		const canRender = beforeRenderHook(overrides, context);
		if (!canRender) {
			const error = new Error(`Unauthorized: Cannot render ${routeName}`);
			// Call error hook synchronously
			if (overrides.onRouteError) {
				try {
					const result = overrides.onRouteError(routeName, error, context);
					if (result instanceof Promise) {
						result.catch(() => {}); // Ignore promise rejection
					}
				} catch {
					// Ignore errors in error hook
				}
			}
			throw error;
		}
	}

	// Lifecycle hook - runs on mount
	useEffect(() => {
		if (overrides.onRouteRender) {
			try {
				const result = overrides.onRouteRender(routeName, context);
				if (result instanceof Promise) {
					result.catch((error) => {
						// If onRouteRender throws, call onRouteError
						if (overrides.onRouteError) {
							overrides.onRouteError(routeName, error, context);
						}
					});
				}
			} catch (error) {
				// If onRouteRender throws, call onRouteError
				if (overrides.onRouteError) {
					overrides.onRouteError(routeName, error as Error, context);
				}
			}
		}
	}, [routeName, overrides, context]);
}
