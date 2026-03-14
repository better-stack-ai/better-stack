"use client";

import { Button } from "@workspace/ui/components/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginationControlsProps {
	/** Current page, 1-based */
	currentPage: number;
	totalPages: number;
	total: number;
	limit: number;
	offset: number;
	onPageChange: (page: number) => void;
	labels?: {
		previous?: string;
		next?: string;
		/** Template string; use {from}, {to}, {total} as placeholders */
		showing?: string;
	};
}

/**
 * Generic Prev/Next pagination control with a "Showing X–Y of Z" label.
 * Plugin-agnostic — pass localized labels as props.
 * Returns null when totalPages ≤ 1.
 */
export function PaginationControls({
	currentPage,
	totalPages,
	total,
	limit,
	offset,
	onPageChange,
	labels,
}: PaginationControlsProps) {
	const previous = labels?.previous ?? "Previous";
	const next = labels?.next ?? "Next";
	const showingTemplate = labels?.showing ?? "Showing {from}–{to} of {total}";

	const from = offset + 1;
	const to = Math.min(offset + limit, total);

	const showingText = showingTemplate
		.replace("{from}", String(from))
		.replace("{to}", String(to))
		.replace("{total}", String(total));

	if (totalPages <= 1) {
		return null;
	}

	return (
		<div className="flex items-center justify-between px-4 py-3 border-t">
			<p className="text-sm text-muted-foreground">{showingText}</p>
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(currentPage - 1)}
					disabled={currentPage === 1}
				>
					<ChevronLeft className="h-4 w-4 mr-1" />
					{previous}
				</Button>
				<span className="text-sm text-muted-foreground">
					{currentPage} / {totalPages}
				</span>
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(currentPage + 1)}
					disabled={currentPage === totalPages}
				>
					{next}
					<ChevronRight className="h-4 w-4 ml-1" />
				</Button>
			</div>
		</div>
	);
}
