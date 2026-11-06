"use client";

import { usePluginOverrides, useTranslate } from "@btst/stack/context";
import type { CommentsPluginOverrides } from "../../overrides";
import { COMMENTS_PLUGIN_ID } from "../../constants";
import { PaginationControls } from "@workspace/ui/components/pagination-controls";

/** Page information and navigation supplied by a built-in comments list. */
export interface PaginationProps {
	currentPage: number;
	totalPages: number;
	onPageChange: (page: number) => void;
	total: number;
	limit: number;
	offset: number;
}

export function Pagination({
	page,
	...props
}: PaginationProps & { page?: "moderation" | "userComments" }) {
	const { pageOverrides } =
		usePluginOverrides<CommentsPluginOverrides>(COMMENTS_PLUGIN_ID);
	const Controls =
		(page ? pageOverrides?.[page]?.Pagination : undefined) ??
		(page === "userComments" ? PaginationControls : DefaultPagination);
	return <Controls {...props} />;
}

function DefaultPagination({
	currentPage,
	totalPages,
	onPageChange,
	total,
	limit,
	offset,
}: PaginationProps) {
	const t = useTranslate();
	const { localization } =
		usePluginOverrides<CommentsPluginOverrides>(COMMENTS_PLUGIN_ID);

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
