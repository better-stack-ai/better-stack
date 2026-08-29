import type { QueryClient } from "@tanstack/react-query";
import { serverAuth } from "./authorization.server";
import { createAppClientStack } from "./stack-client";

const requestBoundaryMarker = "BTST_REQUEST_HEADERS_SERVER_MARKER";

/** Creates the request-only stack used by TanStack Start route loaders. */
export async function getRequestClientStack(
	queryClient: QueryClient,
	request: Request,
) {
	if (!(request instanceof Request)) {
		throw new TypeError(`${requestBoundaryMarker}: expected a request`);
	}
	const identity = await serverAuth.getIdentity(request);
	return createAppClientStack(queryClient, {
		baseURL: new URL(request.url).origin,
		headers: request.headers,
		...(identity ? { identity } : {}),
	});
}
