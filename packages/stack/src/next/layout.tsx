import { headers } from "next/headers";
import type { ComponentType, ReactNode } from "react";
import type { StackIdentity } from "../shared/auth-types";
import type { MaybePromise } from "../shared/types";

/** Props passed from a Next.js server layout to the generated client boundary. */
export interface NextClientLayoutProps<TIdentity extends StackIdentity> {
	/** Validated request identity. `null` means the server resolved anonymous. */
	initialIdentity: TIdentity | null;
	children?: ReactNode;
}

/** Options for the request-aware Next.js identity layout factory. */
export interface CreateNextLayoutOptions<TIdentity extends StackIdentity> {
	/** Server-only identity adapter, normally returned by `createServerAuth`. */
	auth: {
		getIdentity: (context: {
			headers: Headers;
		}) => MaybePromise<TIdentity | null>;
	};
	/** Client boundary that owns `StackProvider` for the complete route subtree. */
	ClientLayout: ComponentType<NextClientLayoutProps<TIdentity>>;
}

/**
 * Creates a Next.js App Router layout that resolves identity on the server and
 * passes only the validated snapshot to a client-owned provider boundary.
 *
 * Import this helper from `@btst/stack/next/server` so `next/headers` and the
 * application server auth module never enter the client graph.
 */
export function createNextLayout<TIdentity extends StackIdentity>(
	options: CreateNextLayoutOptions<TIdentity>,
) {
	async function Layout({ children }: { children?: ReactNode }) {
		const requestHeaders = new Headers(await headers());
		const initialIdentity = await options.auth.getIdentity({
			headers: requestHeaders,
		});
		return (
			<options.ClientLayout initialIdentity={initialIdentity}>
				{children}
			</options.ClientLayout>
		);
	}

	return { Layout };
}
