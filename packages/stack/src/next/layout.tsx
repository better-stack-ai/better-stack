import { headers } from "next/headers";
import type { ComponentType, ReactNode } from "react";
import type {
	AuthorizationContractIdentity,
	AnyAuthorizationContract,
} from "../authorization";
import type { StackIdentity } from "../shared/auth-types";
import {
	type HeadersFrameworkIdentitySource,
	resolveInitialIdentityFromHeaders,
} from "../shared/initial-identity";

/** Props passed from a Next.js server layout to the generated client boundary. */
export interface NextClientLayoutProps<TIdentity extends StackIdentity> {
	/** Validated request identity. `null` means the server resolved anonymous. */
	initialIdentity: TIdentity | null;
	children?: ReactNode;
}

/** Options for the request-aware Next.js identity layout factory. */
export interface CreateNextLayoutOptions<
	TContract extends AnyAuthorizationContract,
> {
	/** Server-only identity adapter, normally returned by `createServerAuth`. */
	auth: HeadersFrameworkIdentitySource<TContract>;
	/** Client boundary that owns `StackProvider` for the complete route subtree. */
	ClientLayout: ComponentType<
		NextClientLayoutProps<AuthorizationContractIdentity<TContract>>
	>;
}

/**
 * Creates a Next.js App Router layout that resolves identity on the server and
 * passes only the validated snapshot to a client-owned provider boundary.
 *
 * Import this helper from `@btst/stack/next/server` so `next/headers` and the
 * application server auth module never enter the client graph.
 * Because identity is resolved from request headers, the consuming layout must
 * export `const dynamic = "force-dynamic"`. Keep SSG/ISR pages in a separate
 * static route group with no server identity snapshot. This helper targets
 * Next.js route-segment caching with Cache Components disabled.
 */
export function createNextLayout<TContract extends AnyAuthorizationContract>(
	options: CreateNextLayoutOptions<TContract>,
) {
	async function Layout({ children }: { children?: ReactNode }) {
		const requestHeaders = new Headers(await headers());
		const initialIdentity = await resolveInitialIdentityFromHeaders(
			options.auth,
			{ headers: requestHeaders },
		);
		return (
			<options.ClientLayout initialIdentity={initialIdentity}>
				{children}
			</options.ClientLayout>
		);
	}

	return { Layout };
}
