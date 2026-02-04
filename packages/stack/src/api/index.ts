import { createRouter } from "better-call";
import type {
	BackendLibConfig,
	BackendLib,
	PrefixedPluginRoutes,
	StackContext,
} from "../types";
import { defineDb } from "@btst/db";

export { toNodeHandler } from "better-call/node";

/**
 * Creates the backend library with plugin support
 *
 * @example
 * ```ts
 * const api = stack({
 *   plugins: {
 *     messages: messagesPlugin.backend
 *   },
 *   adapter: memoryAdapter
 * });
 *
 * // Use in API route:
 * export const GET = api.handler;
 * export const POST = api.handler;
 * ```
 *
 * @template TPlugins - The exact plugins map (inferred from config)
 * @template TRoutes - All routes with prefixed keys like "pluginName_routeName" (computed automatically)
 */
export function stack<
	TPlugins extends Record<string, any>,
	TRoutes extends
		PrefixedPluginRoutes<TPlugins> = PrefixedPluginRoutes<TPlugins>,
>(config: BackendLibConfig<TPlugins>): BackendLib<TRoutes> {
	const { plugins, adapter, dbSchema, basePath } = config;

	// Collect all routes from all plugins with type-safe prefixed keys
	const allRoutes = {} as TRoutes;

	let betterDbSchema = dbSchema ?? defineDb({});

	// use all the db plugins on the betterDbSchema
	for (const [pluginKey, plugin] of Object.entries(plugins)) {
		betterDbSchema = betterDbSchema.use(plugin.dbPlugin);
	}

	// Create the adapter instance once
	const adapterInstance = adapter(betterDbSchema);

	// Create context for plugins that need access to all plugins (e.g., openAPI)
	const context: StackContext = {
		plugins,
		basePath,
		adapter: adapterInstance,
	};

	for (const [pluginKey, plugin] of Object.entries(plugins)) {
		// Pass both adapter and context to plugin routes
		const pluginRoutes = plugin.routes(adapterInstance, context);

		// Prefix route keys with plugin name to avoid collisions
		for (const [routeKey, endpoint] of Object.entries(pluginRoutes)) {
			const compositeKey = `${pluginKey}_${routeKey}` as keyof TRoutes;
			(allRoutes as any)[compositeKey] = endpoint;
		}
	}

	// Create the composed router
	const router = createRouter(allRoutes, {
		basePath: basePath,
	});

	return {
		handler: router.handler,
		router,
		dbSchema: betterDbSchema,
	};
}

export type {
	BackendPlugin,
	BackendLibConfig,
	BackendLib,
	StackContext,
} from "../types";
