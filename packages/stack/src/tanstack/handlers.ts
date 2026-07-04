import type { StackRequestHandler } from "../shared/entry-factories";

/**
 * Wires a BTST API handler to the method handler map a TanStack Start server
 * route needs.
 *
 * @example
 * ```ts
 * // src/routes/api/data/$.ts
 * import { createFileRoute } from "@tanstack/react-router";
 * import { toTanStackHandlers } from "@btst/stack/tanstack";
 * import { handler } from "@/lib/stack";
 *
 * export const Route = createFileRoute("/api/data/$")({
 *   server: { handlers: toTanStackHandlers(handler) },
 * });
 * ```
 */
export function toTanStackHandlers(handler: StackRequestHandler) {
	const methodHandler = ({ request }: { request: Request }) => handler(request);
	return {
		GET: methodHandler,
		POST: methodHandler,
		PUT: methodHandler,
		PATCH: methodHandler,
		DELETE: methodHandler,
	};
}
