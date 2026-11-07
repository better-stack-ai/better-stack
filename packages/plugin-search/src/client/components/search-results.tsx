"use client";

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
}: {
	query: string;
	data?: SearchResponse;
	loading: boolean;
	error: Error | null | undefined;
	emptyMessage?: string;
	onRetry: () => void;
}) {
	if (error) {
		return (
			<div className="space-y-3 p-4" role="alert">
				<p>Search could not be completed. Check your access or try again.</p>
				<Button type="button" variant="outline" onClick={onRetry}>
					Retry search
				</Button>
			</div>
		);
	}
	if (loading)
		return (
			<p className="p-4 text-sm" role="status">
				Searching…
			</p>
		);
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
	return null;
}

export function SearchResults({ data }: { data: SearchResponse }) {
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
						className="block space-y-2 rounded-sm p-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
						data-testid="search-result"
					>
						<span className="block text-xs text-muted-foreground">
							{item.sourceLabel}
						</span>
						<span className="block font-medium">{item.title}</span>
						{item.snippet && (
							<span className="block text-sm text-muted-foreground">
								{item.snippet}
							</span>
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
			className="flex items-center justify-between gap-3 border-t p-4 text-sm"
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
