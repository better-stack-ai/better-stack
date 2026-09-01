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

import type { BackendPlugin } from "../../types";
import type { Endpoint } from "better-call";

type IdentifiedBackendPlugin<
	TId extends string,
	TRoutes extends Record<string, Endpoint>,
	TRaw extends Record<string, (...args: any[]) => any>,
	TOperations extends import("./operation").OperationRecord,
> = BackendPlugin<TRoutes, TRaw, TOperations, TId>;

export type {
	BackendPlugin,
	ClientPlugin,
} from "../../types";

export type {
	DBAdapter as Adapter,
	DatabaseDefinition,
	DbPlugin,
} from "@btst/db";

// Re-export Better Call functions needed for plugins
export type { Endpoint, Router } from "better-call";
export { createRouter } from "better-call";
// Wrapped createEndpoint that preserves Zod validation issues in 400 responses
export { createEndpoint } from "./create-endpoint";
export type { SerializedValidationIssue } from "./create-endpoint";
export type {
	ComposedEndpointInventoryEntry,
	InfrastructureRouteDeclaration,
	InfrastructureRouteInventory,
} from "./endpoint-inventory";
export { createDbPlugin } from "@btst/db";
export {
	defineOperation,
	definePassthroughOperation,
	type AnyOperation,
	type DeepReadonly,
	type Operation,
	type OperationAccess,
	type OperationApi,
	type OperationContext,
	type OperationData,
	type OperationErrorContext,
	OperationHttpError,
	type OperationPermissionRequest,
	type OperationRecord,
	type OperationResultMode,
	type RouteOperation,
	type RouteOperationApi,
} from "./operation";

/**
 * Helper to define a backend plugin with full type inference
 *
 * @example
 * ```ts
 * const messagesPlugin = defineBackendPlugin({
 *   id: "messages",
 *   dbPlugin: createDbPlugin("messages", messagesSchema),
 *   routes: (adapter) => ({
 *     list: endpoint("/messages", { method: "GET" }, async () => { ... }),
 *     create: endpoint("/messages", { method: "POST" }, async () => { ... })
 *   })
 * });
 * // Route keys "list" and "create" are preserved in types
 * ```
 *
 * @template TRoutes - The exact shape of routes (auto-inferred from routes function)
 * @template TRaw - The narrow lower-level server surface (auto-inferred from the raw factory)
 */
export function defineBackendPlugin<
	const TId extends string,
	TRoutes extends Record<string, Endpoint> = Record<string, Endpoint>,
	TRaw extends Record<string, (...args: any[]) => any> = never,
	TOperations extends import("./operation").OperationRecord = never,
>(
	plugin: IdentifiedBackendPlugin<TId, TRoutes, TRaw, TOperations>,
): IdentifiedBackendPlugin<TId, TRoutes, TRaw, TOperations> {
	return plugin;
}
