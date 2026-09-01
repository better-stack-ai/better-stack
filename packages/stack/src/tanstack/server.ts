import type { AnyAuthorizationContract } from "../authorization";
import {
	type FrameworkIdentitySource,
	resolveInitialIdentitySnapshot,
} from "../shared/initial-identity";

/**
 * Resolve a TanStack Start request identity into a validated, JSON-safe
 * envelope accepted by `createTanStackLayout`.
 */
export function resolveTanStackInitialIdentity<
	TContract extends AnyAuthorizationContract,
>(options: {
	auth: FrameworkIdentitySource<TContract, Request>;
	request: Request;
}) {
	return resolveInitialIdentitySnapshot(options.auth, options.request);
}
