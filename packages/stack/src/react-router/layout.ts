import type { StackIdentity } from "../shared/auth-types";
import type { MaybePromise } from "../shared/types";

/** Request values supplied to a React Router parent layout loader. */
export interface ReactRouterLayoutLoaderArgs<TContext = unknown> {
	request: Request;
	params: Record<string, string | undefined>;
	context: TContext;
}

/** Options for the request-aware React Router identity layout factory. */
export interface CreateReactRouterLayoutOptions<
	TIdentity extends StackIdentity,
> {
	/** Server-only identity adapter, normally returned by `createServerAuth`. */
	auth: {
		getIdentity: (request: Request) => MaybePromise<TIdentity | null>;
	};
}

/**
 * Creates the loader for a React Router parent layout. Its result is passed to
 * `StackProvider.initialIdentity` by the layout component around `<Outlet />`.
 */
export function createReactRouterLayout<TIdentity extends StackIdentity>(
	options: CreateReactRouterLayoutOptions<TIdentity>,
) {
	async function loader<TContext = unknown>(
		args: ReactRouterLayoutLoaderArgs<TContext>,
	) {
		return { initialIdentity: await options.auth.getIdentity(args.request) };
	}

	return { loader };
}
