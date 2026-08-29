import "server-only";

import type { QueryClient } from "@tanstack/react-query";
import { hydrationAuth } from "./authorization.server";
import { createAppClientStack } from "./stack-client";

const requestBoundaryMarker = "BTST_REQUEST_HEADERS_SERVER_MARKER";

function getRequestBaseURL(headers: Headers) {
	const host = headers.get("x-forwarded-host") ?? headers.get("host");
	const protocol = headers.get("x-forwarded-proto") ?? "http";
	return (
		process.env.BASE_URL ??
		(host ? `${protocol}://${host}` : "http://localhost:3000")
	);
}

/** Creates the request-only stack used by Next.js route loaders and metadata. */
export async function getRequestClientStack(
	queryClient: QueryClient,
	requestHeaders: Headers,
) {
	if (!(requestHeaders instanceof Headers)) {
		throw new TypeError(`${requestBoundaryMarker}: expected request headers`);
	}
	const identity = await hydrationAuth.getIdentityFromHeaders({
		headers: requestHeaders,
	});
	return createAppClientStack(queryClient, {
		baseURL: getRequestBaseURL(requestHeaders),
		headers: requestHeaders,
		...(identity ? { requestIdentity: identity } : {}),
	});
}
