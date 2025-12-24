"use client";

import { Button } from "@workspace/ui/components/button";
import { ChevronRight } from "lucide-react";

interface PaginationProps {
	total: number;
	showing: number;
	hasMore: boolean;
	isLoadingMore: boolean;
	onLoadMore: () => void;
	labels?: {
		showing?: string;
		previous?: string;
		next?: string;
	};
}

export function Pagination({
	total,
	showing,
	hasMore,
	isLoadingMore,
	onLoadMore,
	labels = {},
}: PaginationProps) {
	const {
		showing: showingLabel = "Showing {count} of {total}",
		next = "Load More",
	} = labels;

	const showingText = showingLabel
		.replace("{count}", String(showing))
		.replace("{total}", String(total));

	return (
		<div className="flex items-center justify-between py-4">
			<p className="text-sm text-muted-foreground">{showingText}</p>
			{hasMore && (
				<Button
					variant="outline"
					size="sm"
					onClick={onLoadMore}
					disabled={isLoadingMore}
				>
					{isLoadingMore ? "Loading..." : next}
					<ChevronRight className="ml-2 h-4 w-4" />
				</Button>
			)}
		</div>
	);
}
