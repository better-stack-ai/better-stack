import { createServerAuth } from "@btst/stack/authorization/server";
import { authorization } from "./authorization";

export const serverAuth = createServerAuth({
	authorization,
	getIdentityFromHeaders: () => ({
		// Build sentinel only; the identity contract strips this before hydration.
		serverOnlyMarker: "BTST_SERVER_AUTH_RESOLVER_MARKER",
		id: "olliethedev",
		role: "admin" as const,
	}),
});
