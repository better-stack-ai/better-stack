import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StackProvider } from "@btst/stack/context";
import { createTestClientStack } from "../../../stack/src/__tests__/client-stack-test-utils";
import { cmsClientPlugin } from "../client/plugin";
import type { CMSPluginOverrides } from "../client/overrides";
import {
	EmptyState,
	type EmptyStateProps,
} from "../client/components/shared/empty-state";

import {
	ContentTypeCard,
	type ContentTypeCardProps,
} from "../client/components/shared/content-type-card";

const props: EmptyStateProps = {
	title: "No entries",
	description: "Create an entry",
};
const pages = [
	"dashboard",
	"contentList",
	"newContent",
	"editContent",
] as const;
function render(
	view: ReactElement,
	pageOverrides?: CMSPluginOverrides["pageOverrides"],
) {
	return renderToStaticMarkup(
		<StackProvider
			stack={createTestClientStack({ cms: cmsClientPlugin() })}
			overrides={{ cms: { ...{}, pageOverrides } }}
		>
			{view}
		</StackProvider>,
	);
}

describe("cms page presentation overrides", () => {
	it("selects only the explicitly scoped component and supplies its native props", () => {
		const pageOverrides: CMSPluginOverrides["pageOverrides"] = {
			dashboard: {
				EmptyState: (props) => (
					<article data-slot-name="dashboard">
						{String(Boolean(props.title))}
					</article>
				),
			},
			contentList: {
				EmptyState: (props) => (
					<article data-slot-name="contentList">
						{String(Boolean(props.title))}
					</article>
				),
			},
			newContent: {
				EmptyState: (props) => (
					<article data-slot-name="newContent">
						{String(Boolean(props.title))}
					</article>
				),
			},
			editContent: {
				EmptyState: (props) => (
					<article data-slot-name="editContent">
						{String(Boolean(props.title))}
					</article>
				),
			},
		};
		for (const page of pages) {
			const html = render(<EmptyState page={page} {...props} />, pageOverrides);
			expect(html).toContain(`data-slot-name="${page}">true`);
			for (const other of pages.filter((candidate) => candidate !== page))
				expect(html).not.toContain(`data-slot-name="${other}"`);
		}
		expect(render(<EmptyState {...props} />, pageOverrides)).toContain(
			"No entries",
		);
		expect(render(<EmptyState {...props} />, pageOverrides)).not.toContain(
			"data-slot-name",
		);
	});
	it("leaves other pages on their built-in presentation when only one is configured", () => {
		const pageOverrides: CMSPluginOverrides["pageOverrides"] = {
			dashboard: { EmptyState: () => <article data-slot-name="isolated" /> },
		};
		for (const page of pages) {
			const html = render(<EmptyState page={page} {...props} />, pageOverrides);
			if (page === "dashboard")
				expect(html).toContain('data-slot-name="isolated"');
			else {
				expect(html).toContain("No entries");
				expect(html).not.toContain("data-slot-name");
			}
		}
	});
	it("keeps built-in defaults with omitted and empty page overrides", () => {
		for (const page of pages) {
			expect(render(<EmptyState page={page} {...props} />)).toContain(
				"No entries",
			);
			expect(
				render(<EmptyState page={page} {...props} />, { [page]: {} }),
			).toContain("No entries");
		}
	});
});

it("CMS dashboard card is isolated from standalone cards and preserves styling by default", () => {
	const card: ContentTypeCardProps = {
		contentType: {
			id: "articles",
			name: "Articles",
			slug: "articles",
			itemCount: 3,
			description: "Editorial content",
			jsonSchema: "{}",
			createdAt: "2026-11-06",
			updatedAt: "2026-11-06",
		},
		itemCountLabel: "3 items",
		onOpen: () => {},
		className: "custom-card",
		titleClassName: "custom-title",
	};
	const override = {
		dashboard: {
			ContentTypeCard: ({ contentType }: ContentTypeCardProps) => (
				<article data-card="custom">{contentType.name}</article>
			),
		},
	};
	expect(
		render(<ContentTypeCard page="dashboard" {...card} />, override),
	).toContain('data-card="custom">Articles');
	for (const view of [
		<ContentTypeCard {...card} />,
		<ContentTypeCard page="dashboard" {...card} />,
	]) {
		const html = render(view);
		expect(html).toContain('data-slot="card"');
		expect(html).toContain("custom-card");
		expect(html).toContain("custom-title");
		expect(html).toContain("3 items");
	}
	expect(render(<ContentTypeCard {...card} />, override)).not.toContain(
		'data-card="custom"',
	);
	expect(
		render(<ContentTypeCard page="dashboard" {...card} />, { dashboard: {} }),
	).toContain('data-slot="card"');
});

it("renders unscoped EmptyState without a StackProvider", () => {
	expect(renderToStaticMarkup(<EmptyState {...props} />)).toContain(
		"No entries",
	);
});

import { DashboardPage } from "../client/components/pages/dashboard-page.internal";
import { ContentListPage } from "../client/components/pages/content-list-page.internal";
import { ContentEditorPage } from "../client/components/pages/content-editor-page.internal";
const dataHooks = vi.hoisted(() => ({
	useSuspenseContentTypes: vi.fn(() => ({ contentTypes: [] })),
}));
vi.mock("../client/hooks", () => ({
	...dataHooks,
	useSuspenseContent: () => ({ items: [], total: 0 }),
	useContent: () => ({ items: [], total: 0 }),
	useDeleteContent: () => ({}),
	useContentItem: () => ({ item: null }),
	useContentItemForm: () => ({}),
}));
it("supplies every CMS page's empty-state scope and the dashboard card scope", () => {
	const pageOverrides = {
		dashboard: {
			EmptyState: () => <article data-page="dashboard" />,
			ContentTypeCard: () => <article data-card="dashboard" />,
		},
		contentList: { EmptyState: () => <article data-page="contentList" /> },
		newContent: { EmptyState: () => <article data-page="newContent" /> },
		editContent: { EmptyState: () => <article data-page="editContent" /> },
	};
	dataHooks.useSuspenseContentTypes.mockReturnValue({ contentTypes: [] });
	for (const [page, view] of Object.entries({
		dashboard: <DashboardPage />,
		contentList: <ContentListPage typeSlug="missing" />,
		newContent: <ContentEditorPage typeSlug="missing" />,
		editContent: <ContentEditorPage typeSlug="missing" id="entry" />,
	})) {
		expect(render(view, pageOverrides)).toContain(`data-page="${page}"`);
	}
	dataHooks.useSuspenseContentTypes.mockReturnValue({
		contentTypes: [
			{ id: "article", name: "Articles", slug: "articles", itemCount: 2 },
		],
	} as any);
	expect(render(<DashboardPage />, pageOverrides)).toContain(
		'data-card="dashboard"',
	);
});
