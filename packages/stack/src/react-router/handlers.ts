import type { StackRequestHandler } from "../shared/entry-factories";

/**
 * Wires a BTST API handler to the `loader`/`action` exports a React Router
 * catch-all API route needs.
 *
 * @example
 * ```ts
 * // app/routes/api/data/$.ts
 * import { toReactRouterHandlers } from "@btst/stack/react-router";
 * import { handler } from "~/lib/stack";
 *
 * export const { loader, action } = toReactRouterHandlers(handler);
 * ```
 */
export function toReactRouterHandlers(handler: StackRequestHandler) {
	return {
		loader: ({ request }: { request: Request }) => handler(request),
		action: ({ request }: { request: Request }) => handler(request),
	};
}
