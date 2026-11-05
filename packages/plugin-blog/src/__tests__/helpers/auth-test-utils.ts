import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { z } from "zod";

const identityOnlyAuthorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [] as const,
	rules: () => [],
});

/** Build a final-protocol client auth adapter for tests concerned only with identity. */
export function createIdentityTestAuth(
	getIdentity: () =>
		| ({ id: string } & Record<string, unknown>)
		| null
		| Promise<({ id: string } & Record<string, unknown>) | null>,
	options?: { loginPath?: string },
) {
	return createClientAuth({
		authorization: identityOnlyAuthorization,
		getIdentity,
		...options,
	});
}
