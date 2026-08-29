import type {
	AuthorizationContractIdentity,
	AnyAuthorizationContract,
} from "../authorization";
import {
	type FrameworkIdentitySource,
	resolveInitialIdentity,
} from "../shared/initial-identity";

/** Request values supplied to a React Router parent layout loader. */
export interface ReactRouterLayoutLoaderArgs<TContext = unknown> {
	request: Request;
	params: Record<string, string | undefined>;
	context: TContext;
}

/** Options for the request-aware React Router identity layout factory. */
export interface CreateReactRouterLayoutOptions<
	TContract extends AnyAuthorizationContract,
> {
	/** Server-only identity adapter, normally returned by `createServerAuth`. */
	auth: FrameworkIdentitySource<TContract, Request>;
}

/**
 * Creates the loader for a React Router parent layout. Its result is passed to
 * `StackProvider.initialIdentity` by the layout component around `<Outlet />`.
 */
export function createReactRouterLayout<
	TContract extends AnyAuthorizationContract,
>(options: CreateReactRouterLayoutOptions<TContract>) {
	async function loader<TContext = unknown>(
		args: ReactRouterLayoutLoaderArgs<TContext>,
	) {
		return {
			initialIdentity: await resolveInitialIdentity(options.auth, args.request),
		} satisfies {
			initialIdentity: AuthorizationContractIdentity<TContract> | null;
		};
	}

	return { loader };
}
