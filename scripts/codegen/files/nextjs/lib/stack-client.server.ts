import "server-only";

import {
	filterCredentialForwardingHeaders,
	resolveTrustedClientOrigins,
} from "@btst/stack/client/server";
import type { QueryClient } from "@tanstack/react-query";
import { hydrationAuth } from "./authorization.server";
import { createAppClientStack } from "./stack-client";

const requestBoundaryMarker = "BTST_REQUEST_HEADERS_SERVER_MARKER";

function getConfiguredApiOrigin() {
	return (
		process.env.BTST_API_URL ??
		process.env.NEXT_PUBLIC_API_URL ??
		process.env.BASE_URL
	);
}

function getConfiguredSiteOrigin() {
	return (
		process.env.BTST_SITE_URL ??
		process.env.NEXT_PUBLIC_SITE_URL ??
		process.env.NEXT_PUBLIC_BASE_URL ??
		process.env.BASE_URL
	);
}

function getRequestOrigin(headers: Headers) {
	const host = headers.get("x-forwarded-host") ?? headers.get("host");
	if (!host) return undefined;
	const protocol = headers.get("x-forwarded-proto") ?? "http";
	return `${protocol.split(",")[0]?.trim()}://${host.split(",")[0]?.trim()}`;
}

export function getServerClientOrigins(requestOrigin?: string) {
	return resolveTrustedClientOrigins({
		configuredApiOrigin: getConfiguredApiOrigin(),
		configuredSiteOrigin: getConfiguredSiteOrigin(),
		requestOrigin,
		isProduction: process.env.NODE_ENV === "production",
		apiLabel: "BTST_API_URL, NEXT_PUBLIC_API_URL, or BASE_URL",
		siteLabel: "BTST_SITE_URL, NEXT_PUBLIC_SITE_URL, or BASE_URL",
	});
}

export function getRequestClientOrigins(requestHeaders: Headers) {
	return getServerClientOrigins(getRequestOrigin(requestHeaders));
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
	const origins = getRequestClientOrigins(requestHeaders);
	return createAppClientStack(queryClient, {
		...origins,
		headers: filterCredentialForwardingHeaders(requestHeaders),
		...(identity ? { requestIdentity: identity } : {}),
	});
}
