"use client";

import type { SearchPluginOverrides } from "../overrides";
import { useStack } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import type { SearchResponse } from "../../types";
import { SearchHighlight } from "./search-highlight";

export function SearchStatus({
	query,
	data,
	loading,
	error,
	emptyMessage = "No results found.",
	onRetry,
	renderLoading,
}: {
	query: string;
	data?: SearchResponse;
	loading: boolean;
	error: Error | null | undefined;
	emptyMessage?: string;
	onRetry: () => void;
	renderLoading?: SearchPluginOverrides["renderLoading"];
}) {
	const hasResults =
		!loading && !error && !!query.trim() && !!data?.items.length;
	const message = loading
		? "Searching…"
		: error
			? "Search could not be completed. Check your access or try again."
			: !query.trim()
				? "Enter a search term."
				: !data?.items.length
					? emptyMessage
					: `${data.items.length} results on this page.`;
	return (
		<div className={hasResults ? undefined : "space-y-3 p-4"}>
			<p
				role={!loading && error ? "alert" : "status"}
				aria-atomic="true"
				className={
					hasResults || (loading && renderLoading) ? "sr-only" : "text-sm"
				}
			>
				{message}
			</p>
			{loading && renderLoading && (
				<div aria-hidden="true">{renderLoading()}</div>
			)}
			{!loading && error && (
				<Button type="button" variant="outline" onClick={onRetry}>
					Retry search
				</Button>
			)}
		</div>
	);
}

export function SearchResults({
	data,
	query,
	renderResult,
}: {
	data: SearchResponse;
	query: string;
	renderResult?: SearchPluginOverrides["renderResult"];
}) {
	const { router } = useStack();
	const Link = router?.Link ?? "a";
	return (
		<ul
			className="divide-y"
			aria-label="Search results"
			data-testid="search-results"
		>
			{data.items.map((item) => (
				<li key={item.key}>
					<Link
						href={item.href}
						aria-label={`${item.title}, ${item.sourceLabel}`}
						className="block space-y-2 [overflow-wrap:anywhere] rounded-sm p-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
						data-testid="search-result"
					>
						{renderResult ? (
							renderResult(item, query)
						) : (
							<>
								<span className="block text-xs text-muted-foreground">
									{item.sourceLabel}
								</span>
								<span className="block font-medium">
									<SearchHighlight text={item.title} query={query} />
								</span>
								{item.snippet && (
									<span className="block text-sm text-muted-foreground">
										<SearchHighlight text={item.snippet} query={query} />
									</span>
								)}
							</>
						)}
					</Link>
				</li>
			))}
		</ul>
	);
}

export function SearchPagination({
	page,
	hasMore,
	loading,
	onPageChange,
}: {
	page: number;
	hasMore: boolean;
	loading: boolean;
	onPageChange: (page: number) => void;
}) {
	return (
		<nav
			aria-label="Search pagination"
			className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm"
		>
			<Button
				type="button"
				variant="outline"
				disabled={page <= 1 || loading}
				onClick={() => onPageChange(page - 1)}
			>
				Previous page
			</Button>
			<span>Page {page}</span>
			<Button
				type="button"
				variant="outline"
				disabled={!hasMore || loading}
				onClick={() => onPageChange(page + 1)}
			>
				Next page
			</Button>
		</nav>
	);
}
