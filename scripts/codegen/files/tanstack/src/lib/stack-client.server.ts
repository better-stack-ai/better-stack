import {
	filterCredentialForwardingHeaders,
	resolveTrustedClientOrigins,
} from "@btst/stack/client/server";
import type { QueryClient } from "@tanstack/react-query";
import { serverAuth } from "./authorization.server";
import { createAppClientStack } from "./stack-client";

const requestBoundaryMarker = "BTST_REQUEST_HEADERS_SERVER_MARKER";

function getConfiguredApiOrigin() {
	return (
		process.env.BTST_API_URL ??
		import.meta.env.VITE_PUBLIC_API_URL ??
		process.env.BASE_URL ??
		import.meta.env.VITE_BASE_URL
	);
}

function getConfiguredSiteOrigin() {
	return (
		process.env.BTST_SITE_URL ??
		import.meta.env.VITE_PUBLIC_SITE_URL ??
		process.env.BASE_URL ??
		import.meta.env.VITE_BASE_URL
	);
}

export function getRequestClientOrigins(request: Request) {
	const requestOrigin = new URL(request.url).origin;
	return resolveTrustedClientOrigins({
		configuredApiOrigin: getConfiguredApiOrigin(),
		configuredSiteOrigin: getConfiguredSiteOrigin(),
		requestOrigin,
		isProduction: process.env.NODE_ENV === "production",
		apiLabel: "BTST_API_URL, VITE_PUBLIC_API_URL, or BASE_URL",
		siteLabel: "BTST_SITE_URL, VITE_PUBLIC_SITE_URL, or BASE_URL",
	});
}

/** Creates the request-only stack used by TanStack Start route loaders. */
export async function getRequestClientStack(
	queryClient: QueryClient,
	request: Request,
) {
	if (!(request instanceof Request)) {
		throw new TypeError(`${requestBoundaryMarker}: expected a request`);
	}
	const identity = await serverAuth.getIdentity(request);
	const origins = getRequestClientOrigins(request);
	return createAppClientStack(queryClient, {
		...origins,
		headers: filterCredentialForwardingHeaders(request.headers),
		...(identity ? { requestIdentity: identity } : {}),
	});
}
