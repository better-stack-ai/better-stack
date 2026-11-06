import { PageListPage } from "../client/components/pages/page-list-page.internal";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UIBuilderPluginOverrides } from "../client/overrides";
import { EmptyState } from "../client/components/shared/empty-state";

const state = vi.hoisted(() => ({ overrides: {} as UIBuilderPluginOverrides }));
vi.mock("@btst/stack/context", () => ({
	usePluginOverrides: () => state.overrides,
	joinBasePath: (base = "", path: string) => `${base}${path}`,
	useTranslate: () => (_key: string, fallback: string) => fallback,
	useNotify: () => ({ success: vi.fn(), error: vi.fn() }),
	useStack: () => ({ router: { Link: "a" }, plugins: {} }),
	usePluginSiteNavigation: () => ({
		Link: "a",
		resolve: (...parts: string[]) => ({ href: `/pages/${parts.join("/")}` }),
	}),
	PermissionAccess: ({ children }: { children: ReactNode }) => children,
}));

const props = {
	title: "No pages",
	description: "Create your first page",
	action: <button>Create page</button>,
};
const pages = ["pageList"] as const;
const render = (page?: (typeof pages)[number]) =>
	renderToStaticMarkup(<EmptyState {...props} page={page} />);

beforeEach(() => {
	state.overrides = {};
});

describe("ui-builder page-scoped EmptyState", () => {
	it("selects the explicit page and forwards the existing presentation props", () => {
		for (const page of pages) {
			const slot = vi.fn((_: unknown) => (
				<section data-slot-override={page}>Custom presentation</section>
			));
			state.overrides = { pageOverrides: { [page]: { EmptyState: slot } } };
			expect(render(page)).toContain(`data-slot-override="${page}"`);
			const presentationProps = props;
			expect(slot.mock.calls[0]?.[0]).toEqual(presentationProps);
			for (const other of pages.filter((key) => key !== page)) {
				expect(render(other)).not.toContain("data-slot-override");
				expect(render(other)).toContain("No pages");
			}
			expect(render()).not.toContain("data-slot-override");
			expect(render()).toContain("No pages");
		}
	});
	it("preserves built-in presentation when no slot is configured or a page entry is empty", () => {
		for (const page of pages) {
			const unchanged = render(page);
			expect(unchanged).toContain("No pages");
			state.overrides = { pageOverrides: { [page]: {} } };
			expect(render(page)).toBe(unchanged);
		}
	});
});

vi.mock("../client/hooks/ui-builder-hooks", () => ({
	useSuspenseUIBuilderPages: () => ({
		pages: [],
		total: 0,
		hasMore: false,
		isLoadingMore: false,
		loadMore: vi.fn(),
	}),
	useDeleteUIBuilderPage: () => ({}),
}));
it("the built-in list supplies pageList scope and preserves the create action", () => {
	state.overrides = {
		pageOverrides: {
			pageList: {
				EmptyState: ({ title, action }) => (
					<section data-built-in="pageList">
						{title}
						{action}
					</section>
				),
			},
		},
	};
	const html = renderToStaticMarkup(<PageListPage />);
	expect(html).toContain('data-built-in="pageList"');
	expect(html).toContain("/ui-builder/new");
});
