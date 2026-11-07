"use client";

import { lazy } from "react";
import {
	ComposedRoute,
	type FallbackProps,
} from "@btst/stack/client/components";
import { Button } from "@workspace/ui/components/button";
import type { SearchListState } from "../../search-state";

const Page = lazy(() =>
	import("./search-page.internal").then((module) => ({
		default: module.SearchPage,
	})),
);

function SearchLoading() {
	return (
		<p className="p-8" role="status">
			Loading search…
		</p>
	);
}

function SearchError({ resetErrorBoundary }: FallbackProps) {
	return (
		<div className="space-y-4 p-8" role="alert">
			<p>Search is unavailable.</p>
			<Button type="button" variant="outline" onClick={resetErrorBoundary}>
				Retry loading
			</Button>
		</div>
	);
}

export function SearchPageComponent({
	initialSearch,
}: {
	initialSearch?: SearchListState;
}) {
	return (
		<ComposedRoute
			path="/search"
			PageComponent={Page}
			LoadingComponent={SearchLoading}
			ErrorComponent={SearchError}
			props={{ initialSearch }}
			onError={(error) => console.error("[btst/search]", error)}
		/>
	);
}
