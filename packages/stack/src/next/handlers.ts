import type { StackRequestHandler } from "../shared/entry-factories";

/**
 * Wires a BTST API handler to the five HTTP method exports a Next.js route
 * handler file needs.
 *
 * @example
 * ```ts
 * // app/api/data/[[...all]]/route.ts
 * import { toNextRouteHandlers } from "@btst/stack/next";
 * import { handler } from "@/lib/stack";
 *
 * export const { GET, POST, PUT, PATCH, DELETE } = toNextRouteHandlers(handler);
 * ```
 */
export function toNextRouteHandlers(handler: StackRequestHandler) {
	return {
		GET: handler,
		POST: handler,
		PUT: handler,
		PATCH: handler,
		DELETE: handler,
	};
}
