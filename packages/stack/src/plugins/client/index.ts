/**
 * Plugin utilities and types for building standalone plugins
 *
 * This module exports everything needed to create custom plugins
 * for BTST outside of this package.
 *
 * Note: Backend and Client plugins are separate to prevent SSR issues
 * and enable better code splitting. Import them separately:
 * - Backend: import type { BackendPlugin } from "@btst/stack/plugins/api"
 * - Client: import type { ClientPlugin } from "@btst/stack/plugins/client"
 */

import type { ClientPlugin, ClientPluginDefinition } from "../../types";
import type { Route } from "@btst/yar";

type IdentifiedClientPlugin<
	TId extends string,
	TOverrides,
	TRoutes extends Record<string, Route>,
> = ClientPlugin<TOverrides, TRoutes, TId> & { readonly id: TId };

type IdentifiedClientPluginDefinition<
	TId extends string,
	TOverrides,
	TRoutes extends Record<string, Route>,
> = ClientPluginDefinition<TOverrides, TRoutes, TId> & { readonly id: TId };

type LegacyClientPlugin<
	TOverrides,
	TRoutes extends Record<string, Route>,
> = ClientPlugin<TOverrides, TRoutes> & {
	name: string;
	readonly id?: never;
};

type LegacyClientPluginDefinition<
	TOverrides,
	TRoutes extends Record<string, Route>,
> = ClientPluginDefinition<TOverrides, TRoutes> & {
	name: string;
	readonly id?: never;
};

interface DefineClientPluginWithOverrides<TOverrides> {
	<const TId extends string, TRoutes extends Record<string, Route>>(
		plugin: IdentifiedClientPlugin<TId, TOverrides, TRoutes>,
	): IdentifiedClientPlugin<TId, TOverrides, TRoutes>;
	<const TId extends string, TRoutes extends Record<string, Route>>(
		plugin: IdentifiedClientPluginDefinition<TId, TOverrides, TRoutes>,
	): IdentifiedClientPluginDefinition<TId, TOverrides, TRoutes>;
}

export type {
	ClientPlugin,
	ClientPluginDefinition,
	ClientPluginRegistration,
	PluginOverrides,
	ResolvedClientPluginRuntime,
} from "../../types";

export {
	createApiClient,
	createSanitizedSSRLoaderError,
	isConnectionError,
	SSR_LOADER_ERROR_MESSAGE,
} from "../utils";

// Shared error contract + React Query config for data plugins
export {
	isErrorResponse,
	SHARED_QUERY_CONFIG,
	toError,
} from "./resource/errors";
export type { StackError } from "./resource/errors";

// Resource declaration types + server-safe query-key factory
export {
	buildQueryKey,
	createResourceQueryKeys,
	resolvePageSize,
	runResourceMutation,
	runResourceQuery,
} from "./resource/queries";
export type {
	ResourceClient,
	ResourceDef,
	ResourceMutationDef,
	ResourceMutationResult,
	ResourceMutationVars,
	ResourceQueryArgs,
	ResourceQueryData,
	ResourceQueryDef,
	ResourceQueryEntry,
	ResourceQueryKeys,
	ResourcesDeclaration,
} from "./resource/queries";

// Re-export Yar types needed for plugins
export type { Route, RouteContext, RouteDef } from "@btst/yar";
export {
	createRoute,
	createRouter,
	defineRoute,
	defineRoutes,
} from "@btst/yar";

export { createClient } from "better-call/client";

/**
 * Helper to define a client plugin with full type inference
 *
 * Automatically infers route keys, hook names, and their types without needing casts.
 *
 * @example
 * ```ts
 * const messagesPlugin = defineClientPlugin({
 *   id: "messages",
 *   resolve: (runtime) => ({
 *     routes: () => ({
 *       messagesList: createRoute("/messages", () => ({ ... }))
 *     }),
 *     sitemap: () => [{
 *       url: `${runtime.site.baseURL}${runtime.site.basePath}/messages`,
 *     }],
 *   }),
 * });
 * ```
 *
 * @template TOverrides - The shape of overridable components/functions this plugin requires
 * @template TRoutes - The exact shape of routes this plugin provides (preserves keys and route types)
 */
export function defineClientPlugin<
	TOverrides,
>(): DefineClientPluginWithOverrides<TOverrides>;
export function defineClientPlugin<
	const TId extends string,
	TRoutes extends Record<string, Route>,
>(
	plugin: IdentifiedClientPlugin<TId, Record<string, never>, TRoutes>,
): IdentifiedClientPlugin<TId, Record<string, never>, TRoutes>;
export function defineClientPlugin<
	const TId extends string,
	TRoutes extends Record<string, Route>,
>(
	plugin: IdentifiedClientPluginDefinition<TId, Record<string, never>, TRoutes>,
): IdentifiedClientPluginDefinition<TId, Record<string, never>, TRoutes>;
export function defineClientPlugin<
	TOverrides,
	TRoutes extends Record<string, Route> = Record<string, Route>,
>(
	plugin: LegacyClientPlugin<TOverrides, TRoutes>,
): LegacyClientPlugin<TOverrides, TRoutes>;
export function defineClientPlugin<
	TOverrides,
	TRoutes extends Record<string, Route> = Record<string, Route>,
>(
	plugin: LegacyClientPluginDefinition<TOverrides, TRoutes>,
): LegacyClientPluginDefinition<TOverrides, TRoutes>;
export function defineClientPlugin<
	TOverrides = Record<string, never>,
	TRoutes extends Record<string, Route> = Record<string, Route>,
>(plugin: ClientPlugin<TOverrides, TRoutes>): ClientPlugin<TOverrides, TRoutes>;
export function defineClientPlugin<
	TOverrides = Record<string, never>,
	TRoutes extends Record<string, Route> = Record<string, Route>,
>(
	plugin: ClientPluginDefinition<TOverrides, TRoutes>,
): ClientPluginDefinition<TOverrides, TRoutes>;
export function defineClientPlugin(
	plugin?: ClientPlugin<any, any> | ClientPluginDefinition<any, any>,
):
	| ClientPlugin<any, any>
	| ClientPluginDefinition<any, any>
	| DefineClientPluginWithOverrides<any> {
	if (plugin === undefined) {
		return ((definition: any) =>
			definition) as DefineClientPluginWithOverrides<any>;
	}
	return plugin;
}
