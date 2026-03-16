"use client";

import { usePluginOverrides } from "@btst/stack/context";
import type { CommentsPluginOverrides } from "../../overrides";
import { COMMENTS_LOCALIZATION } from "../../localization";
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
		usePluginOverrides<CommentsPluginOverrides>("comments");
	const localization = { ...COMMENTS_LOCALIZATION, ...customLocalization };

	return (
		<PaginationControls
			currentPage={currentPage}
			totalPages={totalPages}
			onPageChange={onPageChange}
			total={total}
			limit={limit}
			offset={offset}
			labels={{
				previous: localization.COMMENTS_MODERATION_PAGINATION_PREVIOUS,
				next: localization.COMMENTS_MODERATION_PAGINATION_NEXT,
				showing: localization.COMMENTS_MODERATION_PAGINATION_SHOWING,
			}}
		/>
	);
}
