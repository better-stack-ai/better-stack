"use client";

import type { SearchPluginOverrides } from "../overrides";
import { useStack } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import type { SearchResponse } from "../../types";

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
	if (loading)
		return (
			<div className="p-4 text-sm" role="status" aria-atomic="true">
				<span className={renderLoading ? "sr-only" : undefined}>
					Searching…
				</span>
				{renderLoading && <div aria-hidden="true">{renderLoading()}</div>}
			</div>
		);
	if (error) {
		return (
			<div className="space-y-3 p-4">
				<p role="alert">
					Search could not be completed. Check your access or try again.
				</p>
				<Button type="button" variant="outline" onClick={onRetry}>
					Retry search
				</Button>
			</div>
		);
	}
	if (!query.trim()) {
		return (
			<p className="p-4 text-sm text-muted-foreground">Enter a search term.</p>
		);
	}
	if (data?.items.length === 0) {
		return (
			<p className="p-4 text-sm text-muted-foreground" role="status">
				{emptyMessage}
			</p>
		);
	}
	return (
		<p className="sr-only" role="status" aria-atomic="true">
			{data?.items.length ?? 0} results on this page.
		</p>
	);
}

export function SearchResults({
	data,
	renderResult,
}: {
	data: SearchResponse;
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
							renderResult(item)
						) : (
							<>
								<span className="block text-xs text-muted-foreground">
									{item.sourceLabel}
								</span>
								<span className="block font-medium">{item.title}</span>
								{item.snippet && (
									<span className="block text-sm text-muted-foreground">
										{item.snippet}
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
