"use client";

import { usePluginOverrides } from "@btst/stack/context";
import type { FormBuilderPluginOverrides } from "../../overrides";
import { FORM_BUILDER_PLUGIN_ID } from "../../constants";
import { Button } from "@workspace/ui/components/button";
import { ChevronRight } from "lucide-react";
import { cn } from "../../../utils";

/** Pagination data, labels, and load action supplied by a built-in list. */
export interface PaginationProps {
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
	page,
	...props
}: PaginationProps & { page?: "formList" | "submissions" }) {
	if (!page) return <DefaultPagination {...props} />;
	return <ScopedPagination page={page} {...props} />;
}

function ScopedPagination({
	page,
	...props
}: PaginationProps & { page: "formList" | "submissions" }) {
	const { pageOverrides } = usePluginOverrides<FormBuilderPluginOverrides>(
		FORM_BUILDER_PLUGIN_ID,
	);
	const Controls =
		(page ? pageOverrides?.[page]?.Pagination : undefined) ?? DefaultPagination;
	return <Controls {...props} />;
}

function DefaultPagination({
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
