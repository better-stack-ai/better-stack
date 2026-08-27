import { createServerAuth } from "@btst/stack/authorization/server";
import { authorization } from "./authorization";

export const serverAuth = createServerAuth({
	authorization,
	getIdentity: () => ({
		id: "BTST_SERVER_AUTH_RESOLVER_MARKER",
		role: "admin" as const,
	}),
});
