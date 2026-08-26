import "server-only";

import { createServerAuth } from "@btst/stack/authorization/server";
import { authorization } from "./authorization";

export const serverAuth = createServerAuth({
	authorization,
	getIdentity: () => ({
		// Kept as a production-build sentinel so the E2E setup can prove this
		// server-only resolver never reaches a browser chunk.
		id: "BTST_SERVER_AUTH_RESOLVER_MARKER",
		role: "admin" as const,
	}),
});
