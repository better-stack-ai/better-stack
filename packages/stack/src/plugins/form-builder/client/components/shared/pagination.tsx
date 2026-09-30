"use client";

import { Button } from "@workspace/ui/components/button";
import { ChevronRight } from "lucide-react";
import { cn } from "../../../utils";

interface PaginationProps {
	total: number;
	showing: number;
	hasMore: boolean;
	isLoadingMore: boolean;
	onLoadMore: () => void;
	className?: string;
	labels?: {
		showing?: string;
		previous?: string;
		next?: string;
		loading?: string;
	};
}

export function Pagination({
	total,
	showing,
	hasMore,
	isLoadingMore,
	onLoadMore,
	className,
	labels = {},
}: PaginationProps) {
	const {
		showing: showingLabel = "Showing {count} of {total}",
		next = "Load More",
		loading = "Loading...",
	} = labels;

	const showingText = showingLabel
		.replace("{count}", String(showing))
		.replace("{total}", String(total));

	return (
		<div
			className={cn("flex items-center justify-between py-4", className)}
			data-testid="form-builder-pagination"
		>
			<p className="text-sm text-muted-foreground">{showingText}</p>
			{hasMore && (
				<Button
					variant="outline"
					size="sm"
					onClick={onLoadMore}
					disabled={isLoadingMore}
				>
					{isLoadingMore ? loading : next}
					<ChevronRight className="ml-2 h-4 w-4" />
				</Button>
			)}
		</div>
	);
}
