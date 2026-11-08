"use client";

import {
	StackProvider,
	useStack,
	type ClientStackOverrides,
} from "@btst/stack/context";
import type { getStackClient } from "@/lib/stack-client";
import {
	SearchInput,
	SearchHighlight,
} from "@btst/plugin-search/client/components";

/** Embedded Search keeps local state while its host retains URL-backed filters. */
export function EmbeddedSearch({
	stack,
}: {
	stack: ReturnType<typeof getStackClient>;
}) {
	const { router, overrides } = useStack<ClientStackOverrides<typeof stack>>();
	return (
		<StackProvider
			stack={stack}
			overrides={overrides}
			router={{
				Link: router?.Link,
				navigate: router?.navigate,
				refresh: router?.refresh,
			}}
		>
			<SearchInput
				sources={["blog"]}
				buttonText="Search Posts"
				placeholder="Search Blog Posts..."
				renderResult={(item, query) => (
					<span data-testid="custom-search-row" className="space-y-1">
						<span className="block text-xs">{item.sourceLabel}</span>
						<strong className="block">
							<SearchHighlight text={item.title} query={query} />
						</strong>
						<span className="block text-sm">
							<SearchHighlight text={item.snippet} query={query} />
						</span>
					</span>
				)}
				renderLoading={() => (
					<div
						data-testid="custom-search-loading"
						className="h-12 rounded bg-muted"
					/>
				)}
			/>
		</StackProvider>
	);
}
