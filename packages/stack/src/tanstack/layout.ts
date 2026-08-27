import type { StackIdentity } from "../shared/auth-types";
import type { MaybePromise } from "../shared/types";

/** Options for the request-aware TanStack Start identity layout factory. */
export interface CreateTanStackLayoutOptions<TIdentity extends StackIdentity> {
	/**
	 * Client-callable TanStack Start server function that resolves and validates
	 * identity from the current request.
	 */
	getInitialIdentity: () => MaybePromise<TIdentity | null>;
}

/**
 * Creates the loader for a TanStack Start parent route. Its result is passed
 * to `StackProvider.initialIdentity` by the route component around `<Outlet />`.
 */
export function createTanStackLayout<TIdentity extends StackIdentity>(
	options: CreateTanStackLayoutOptions<TIdentity>,
) {
	async function loader() {
		return { initialIdentity: await options.getInitialIdentity() };
	}

	return { loader };
}
