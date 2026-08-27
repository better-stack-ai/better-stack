import "server-only";

import { createServerAuth } from "@btst/stack/authorization/server";
import { authorization } from "./authorization";

function getMockRequestIdentity(headers: Headers) {
	const token = (headers.get("cookie") ?? "")
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith("better-auth.session_token="))
		?.slice("better-auth.session_token=".length);
	if (!token?.startsWith("mock-session-")) return null;
	const id = token.slice("mock-session-".length);
	return {
		serverOnlyMarker: "BTST_SERVER_AUTH_RESOLVER_MARKER",
		id,
		role: id.startsWith("admin") ? ("admin" as const) : ("user" as const),
	};
}

/** Request-aware provider shared by backend enforcement and identity hydration. */
export const serverAuth = createServerAuth({
	authorization,
	getIdentityFromHeaders: ({ headers }) => getMockRequestIdentity(headers),
});

export const hydrationAuth = serverAuth;
