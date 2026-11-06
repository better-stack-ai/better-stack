"use client";

import { useId } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import { Input } from "@workspace/ui/components/input";
import { SEARCH_PLUGIN_ID } from "../../constants";
import type { SearchPluginOverrides } from "../../overrides";
import type { SearchListState } from "../../search-state";
import {
	SearchPagination,
	SearchResults,
	SearchStatus,
} from "../search-results";
import { SourceFilter } from "../source-filter";
import { useSearchState } from "../../hooks";

export function SearchPage({
	initialSearch,
}: {
	initialSearch?: SearchListState;
}) {
	const id = useId();
	const overrides = usePluginOverrides<SearchPluginOverrides>(SEARCH_PLUGIN_ID);
	const { state, setState, result, loading } = useSearchState({
		initialSearch,
	});
	return (
		<main
			className="container mx-auto min-w-0 max-w-4xl space-y-6 px-4 py-8"
			data-testid="search-page"
		>
			<h1 className="text-3xl font-semibold tracking-tight">
				{overrides.title ?? "Search"}
			</h1>
			<div className="space-y-2">
				<label htmlFor={id} className="text-sm font-medium">
					Search
				</label>
				<Input
					id={id}
					type="search"
					data-testid="search-input"
					maxLength={200}
					placeholder={overrides.placeholder ?? "Search content…"}
					value={state.q}
					onChange={(event) =>
						setState({ q: event.target.value, page: 1 }, { replace: true })
					}
				/>
			</div>
			{result.data && (
				<SourceFilter
					sources={result.data.sources}
					value={state.sources}
					onChange={(sources) => setState({ sources, page: 1 })}
				/>
			)}
			<section
				className="rounded-md border"
				aria-label="Search results"
				aria-busy={loading}
			>
				<div aria-live="polite">
					<SearchStatus
						query={state.q}
						data={result.data}
						loading={loading}
						error={result.error}
						emptyMessage={overrides.emptyMessage}
						onRetry={() => void result.refetch()}
					/>
				</div>
				{!result.error && !loading && result.data && (
					<SearchResults data={result.data} />
				)}
				{!result.error && state.q.trim() && result.data && (
					<SearchPagination
						page={state.page}
						hasMore={result.data.hasMore}
						loading={loading}
						onPageChange={(page) => setState({ page })}
					/>
				)}
			</section>
			{result.data?.truncated && (
				<p className="text-sm text-muted-foreground">
					Showing a limited result window. Refine your query to find more
					content.
				</p>
			)}
		</main>
	);
}
