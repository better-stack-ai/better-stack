import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StackProvider } from "@btst/stack/context";
import { createTestClientStack } from "../../../stack/src/__tests__/client-stack-test-utils";
import { commentsClientPlugin } from "../client/plugin";
import type { CommentsPluginOverrides } from "../client/overrides";
import {
	Pagination,
	type PaginationProps,
} from "../client/components/shared/pagination";

const props: PaginationProps = {
	currentPage: 1,
	totalPages: 2,
	onPageChange: () => {},
	total: 30,
	limit: 20,
	offset: 0,
};
const pages = ["moderation", "userComments"] as const;
function render(
	view: ReactElement,
	pageOverrides?: CommentsPluginOverrides["pageOverrides"],
) {
	return renderToStaticMarkup(
		<StackProvider
			stack={createTestClientStack({ comments: commentsClientPlugin() })}
			overrides={{ comments: { ...{}, pageOverrides } }}
		>
			{view}
		</StackProvider>,
	);
}

describe("comments page presentation overrides", () => {
	it("selects only the explicitly scoped component and supplies its native props", () => {
		const pageOverrides: CommentsPluginOverrides["pageOverrides"] = {
			moderation: {
				Pagination: (props) => (
					<article data-slot-name="moderation">
						{String(Boolean(props.total))}
					</article>
				),
			},
			userComments: {
				Pagination: (props) => (
					<article data-slot-name="userComments">
						{String(Boolean(props.total))}
					</article>
				),
			},
		};
		for (const page of pages) {
			const html = render(<Pagination page={page} {...props} />, pageOverrides);
			expect(html).toContain(`data-slot-name="${page}">true`);
			for (const other of pages.filter((candidate) => candidate !== page))
				expect(html).not.toContain(`data-slot-name="${other}"`);
		}
		expect(render(<Pagination {...props} />, pageOverrides)).toContain("of 30");
		expect(render(<Pagination {...props} />, pageOverrides)).not.toContain(
			"data-slot-name",
		);
	});
	it("leaves other pages on their built-in presentation when only one is configured", () => {
		const pageOverrides: CommentsPluginOverrides["pageOverrides"] = {
			moderation: { Pagination: () => <article data-slot-name="isolated" /> },
		};
		for (const page of pages) {
			const html = render(<Pagination page={page} {...props} />, pageOverrides);
			if (page === "moderation")
				expect(html).toContain('data-slot-name="isolated"');
			else {
				expect(html).toContain("of 30");
				expect(html).not.toContain("data-slot-name");
			}
		}
	});
	it("keeps built-in defaults with omitted and empty page overrides", () => {
		for (const page of pages) {
			expect(render(<Pagination page={page} {...props} />)).toContain("of 30");
			expect(
				render(<Pagination page={page} {...props} />, { [page]: {} }),
			).toContain("of 30");
		}
	});
});

import { ModerationPage } from "../client/components/pages/moderation-page.internal";
import { UserCommentsPage } from "../client/components/pages/my-comments-page.internal";
vi.mock("../client/hooks/use-comments", () => ({
	useSuspenseModerationComments: () => ({
		comments: [
			{
				id: "comment-1",
				authorId: "viewer-1",
				body: "Comment",
				resolvedAuthorName: "Alice",
				resourceId: "resource",
				resourceType: "post",
				status: "pending",
				createdAt: "2026-11-06",
			},
		],
		total: 1,
		totalPages: 1,
		limit: 20,
		offset: 0,
	}),
	useSuspenseComments: () => ({
		comments: [
			{
				id: "comment-1",
				authorId: "viewer-1",
				body: "Comment",
				resolvedAuthorName: "Alice",
				resourceId: "resource",
				resourceType: "post",
				status: "pending",
				createdAt: "2026-11-06",
			},
		],
		total: 1,
	}),
	useUpdateCommentStatus: () => ({}),
	useDeleteComment: () => ({}),
}));
vi.mock("../client/utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("../client/utils")>()),
	useCurrentUserId: () => ({ currentUserId: "viewer-1", isPending: false }),
}));
it("supplies moderation and personal-list scopes from their built-in pages", () => {
	const pageOverrides = {
		moderation: { Pagination: () => <footer data-page="moderation" /> },
		userComments: { Pagination: () => <footer data-page="userComments" /> },
	};
	expect(render(<ModerationPage />, pageOverrides)).toContain(
		'data-page="moderation"',
	);
	expect(render(<UserCommentsPage />, pageOverrides)).toContain(
		'data-page="userComments"',
	);
});
