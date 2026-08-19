"use client";

import { usePluginOverrides, useTranslate } from "@btst/stack/context";
import type { CommentsPluginOverrides } from "../../overrides";
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
	const t = useTranslate();
	const { localization } =
		usePluginOverrides<CommentsPluginOverrides>("comments");

	return (
		<PaginationControls
			currentPage={currentPage}
			totalPages={totalPages}
			onPageChange={onPageChange}
			total={total}
			limit={limit}
			offset={offset}
			labels={{
				previous:
					localization?.COMMENTS_MODERATION_PAGINATION_PREVIOUS ??
					t("comments.moderation.paginationPrevious", "Previous"),
				next:
					localization?.COMMENTS_MODERATION_PAGINATION_NEXT ??
					t("comments.moderation.paginationNext", "Next"),
				showing:
					localization?.COMMENTS_MODERATION_PAGINATION_SHOWING ??
					t(
						"comments.moderation.paginationShowing",
						"Showing {from}–{to} of {total}",
					),
			}}
		/>
	);
}
