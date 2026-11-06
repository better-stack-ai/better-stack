import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StackProvider } from "@btst/stack/context";
import { createTestClientStack } from "../../../stack/src/__tests__/client-stack-test-utils";
import { formBuilderClientPlugin } from "../client/plugin";
import type { FormBuilderPluginOverrides } from "../client/overrides";
import {
	Pagination,
	type PaginationProps,
} from "../client/components/shared/pagination";

const props: PaginationProps = {
	total: 7,
	showing: 2,
	hasMore: true,
	isLoadingMore: false,
	onLoadMore: () => {},
};
const pages = ["formList", "submissions"] as const;
function render(
	view: ReactElement,
	pageOverrides?: FormBuilderPluginOverrides["pageOverrides"],
) {
	return renderToStaticMarkup(
		<StackProvider
			stack={createTestClientStack({ formBuilder: formBuilderClientPlugin() })}
			overrides={{ formBuilder: { ...{}, pageOverrides } }}
		>
			{view}
		</StackProvider>,
	);
}

describe("form-builder page presentation overrides", () => {
	it("selects only the explicitly scoped component and supplies its native props", () => {
		const pageOverrides: FormBuilderPluginOverrides["pageOverrides"] = {
			formList: {
				Pagination: (props) => (
					<article data-slot-name="formList">
						{String(Boolean(props.total))}
					</article>
				),
			},
			submissions: {
				Pagination: (props) => (
					<article data-slot-name="submissions">
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
		expect(render(<Pagination {...props} />, pageOverrides)).toContain(
			"Showing 2 of 7",
		);
		expect(render(<Pagination {...props} />, pageOverrides)).not.toContain(
			"data-slot-name",
		);
	});
	it("leaves other pages on their built-in presentation when only one is configured", () => {
		const pageOverrides: FormBuilderPluginOverrides["pageOverrides"] = {
			formList: { Pagination: () => <article data-slot-name="isolated" /> },
		};
		for (const page of pages) {
			const html = render(<Pagination page={page} {...props} />, pageOverrides);
			if (page === "formList")
				expect(html).toContain('data-slot-name="isolated"');
			else {
				expect(html).toContain("Showing 2 of 7");
				expect(html).not.toContain("data-slot-name");
			}
		}
	});
	it("keeps built-in defaults with omitted and empty page overrides", () => {
		for (const page of pages) {
			expect(render(<Pagination page={page} {...props} />)).toContain(
				"Showing 2 of 7",
			);
			expect(
				render(<Pagination page={page} {...props} />, { [page]: {} }),
			).toContain("Showing 2 of 7");
		}
	});
});

it("renders unscoped Pagination without a StackProvider", () => {
	expect(renderToStaticMarkup(<Pagination {...props} />)).toContain(
		"Showing 2 of 7",
	);
});

import { FormListPage } from "../client/components/pages/form-list-page.internal";
import { SubmissionsPage } from "../client/components/pages/submissions-page.internal";
vi.mock("../client/hooks", () => ({
	useSuspenseForms: () => ({
		forms: [
			{
				id: "form-1",
				name: "Contact",
				slug: "contact",
				status: "active",
				createdAt: "2026-11-06",
			},
		],
		total: 1,
	}),
	useForms: () => ({ forms: [], total: 0 }),
	useDeleteForm: () => ({}),
	useSuspenseSubmissions: () => ({
		form: { id: "form-1", name: "Contact", schema: "{}" },
		submissions: [{ id: "submission-1", submittedAt: "2026-11-06" }],
		total: 1,
	}),
	useExportSubmissions: () => ({}),
	useDeleteSubmission: () => ({}),
	useSubmission: () => ({}),
}));
it("supplies the forms-list and submissions scopes from their built-in pages", () => {
	const pageOverrides = {
		formList: { Pagination: () => <footer data-page="formList" /> },
		submissions: { Pagination: () => <footer data-page="submissions" /> },
	};
	expect(render(<FormListPage />, pageOverrides)).toContain(
		'data-page="formList"',
	);
	expect(render(<SubmissionsPage formId="form-1" />, pageOverrides)).toContain(
		'data-page="submissions"',
	);
});
