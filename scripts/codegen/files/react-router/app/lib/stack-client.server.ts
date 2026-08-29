import type { QueryClient } from "@tanstack/react-query";
import { createAppClientStack } from "~/lib/stack-client";
import { serverAuth } from "~/lib/authorization.server";

const requestBoundaryMarker = "BTST_REQUEST_HEADERS_SERVER_MARKER";

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
		...(identity ? { requestIdentity: identity } : {}),
	});
}
