"use client";

import { usePluginOverrides } from "@btst/stack/context";
import type { CMSPluginOverrides } from "../../overrides";
import { CMS_LOCALIZATION } from "../../localization";
import { PaginationControls } from "@workspace/ui/components/pagination-controls";

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

	return (
		<PaginationControls
			currentPage={currentPage}
			totalPages={totalPages}
			onPageChange={onPageChange}
			total={total}
			limit={limit}
			offset={offset}
			labels={{
				previous: localization.CMS_LIST_PAGINATION_PREVIOUS,
				next: localization.CMS_LIST_PAGINATION_NEXT,
				showing: localization.CMS_LIST_PAGINATION_SHOWING,
			}}
		/>
	);
}
