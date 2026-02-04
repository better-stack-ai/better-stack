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

export type {
	BackendPlugin,
	ClientPlugin,
} from "../../types";

export type { Adapter, DatabaseDefinition, DbPlugin } from "@btst/db";

// Re-export Better Call functions needed for plugins
export type { Endpoint, Router } from "better-call";
export { createEndpoint, createRouter } from "better-call";
export { createDbPlugin } from "@btst/db";

/**
 * Helper to define a backend plugin with full type inference
 *
 * @example
 * ```ts
 * const messagesPlugin = defineBackendPlugin({
 *   name: "messages",
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
 */
export function defineBackendPlugin<
	TRoutes extends Record<string, Endpoint> = Record<string, Endpoint>,
>(plugin: BackendPlugin<TRoutes>): BackendPlugin<TRoutes> {
	return plugin;
}
