import type { StackRequestHandler } from "../shared/entry-factories";

/**
 * Wires a BTST API handler to the `loader`/`action` exports a React Router
 * catch-all API route needs.
 *
 * Note: React Router's build cannot strip destructured exports from route
 * modules, so export the fields individually rather than destructuring.
 *
 * @example
 * ```ts
 * // app/routes/api/data/$.ts
 * import { toReactRouterHandlers } from "@btst/stack/react-router";
 * import { handler } from "~/lib/stack";
 *
 * const handlers = toReactRouterHandlers(handler);
 * export const loader = handlers.loader;
 * export const action = handlers.action;
 * ```
 */
export function toReactRouterHandlers(handler: StackRequestHandler) {
	return {
		loader: ({ request }: { request: Request }) => handler(request),
		action: ({ request }: { request: Request }) => handler(request),
	};
}
