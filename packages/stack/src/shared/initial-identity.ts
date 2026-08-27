import type {
	AuthorizationContractIdentity,
	AnyAuthorizationContract,
} from "../authorization";
import { assertJsonSafe } from "../authorization/json";
import type { MaybePromise } from "./types";

/** Schema-bound identity source accepted at a framework serialization seam. */
export interface FrameworkIdentitySource<
	TContract extends AnyAuthorizationContract,
	TContext,
> {
	readonly contract: TContract;
	getIdentity(context: TContext): MaybePromise<unknown>;
}

/** Resolve, schema-parse, and prove an identity safe for framework transport. */
export async function resolveInitialIdentity<
	TContract extends AnyAuthorizationContract,
	TContext,
>(
	auth: FrameworkIdentitySource<TContract, TContext>,
	context: TContext,
): Promise<AuthorizationContractIdentity<TContract> | null> {
	const identity = auth.contract.parseIdentity(await auth.getIdentity(context));
	assertJsonSafe(identity);
	return identity as AuthorizationContractIdentity<TContract> | null;
}

declare const initialIdentitySnapshot: unique symbol;

/** A schema-validated, JSON-safe identity envelope produced on the server. */
export interface InitialIdentitySnapshot<TIdentity> {
	readonly initialIdentity: TIdentity | null;
	readonly [initialIdentitySnapshot]: true;
}

/** Resolve a branded server snapshot for isomorphic framework loaders. */
export async function resolveInitialIdentitySnapshot<
	TContract extends AnyAuthorizationContract,
	TContext,
>(
	auth: FrameworkIdentitySource<TContract, TContext>,
	context: TContext,
): Promise<InitialIdentitySnapshot<AuthorizationContractIdentity<TContract>>> {
	return {
		initialIdentity: await resolveInitialIdentity(auth, context),
	} as InitialIdentitySnapshot<AuthorizationContractIdentity<TContract>>;
}
