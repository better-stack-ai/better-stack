"use client";

import { Button } from "@workspace/ui/components/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePluginOverrides } from "@btst/stack/context";
import type { CMSPluginOverrides } from "../../overrides";
import { CMS_LOCALIZATION } from "../../localization";

interface PaginationProps {
	currentPage: number;
	totalPages: number;
	onPageChange: (page: number) => void;
	total: number;
	limit: number;
	offset: number;
}

export function Pagination({
	currentPage,
	totalPages,
	onPageChange,
	total,
	limit,
	offset,
}: PaginationProps) {
	const { localization: customLocalization } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const localization = { ...CMS_LOCALIZATION, ...customLocalization };

	const from = offset + 1;
	const to = Math.min(offset + limit, total);

	if (totalPages <= 1) {
		return null;
	}

	return (
		<div className="flex items-center justify-between px-4 py-3 border-t">
			<p className="text-sm text-muted-foreground">
				{localization.CMS_LIST_PAGINATION_SHOWING.replace(
					"{from}",
					String(from),
				)
					.replace("{to}", String(to))
					.replace("{total}", String(total))}
			</p>
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(currentPage - 1)}
					disabled={currentPage === 1}
				>
					<ChevronLeft className="h-4 w-4 mr-1" />
					{localization.CMS_LIST_PAGINATION_PREVIOUS}
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
					{localization.CMS_LIST_PAGINATION_NEXT}
					<ChevronRight className="h-4 w-4 ml-1" />
				</Button>
			</div>
		</div>
	);
}
