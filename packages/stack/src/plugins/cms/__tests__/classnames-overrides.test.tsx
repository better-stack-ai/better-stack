// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Core primitives MUST be imported from the package entry (not relative src
// paths) so they share module identity — and React context — with the cms
// components, which resolve `@btst/stack/*` via package self-reference.
import { StackProvider } from "@btst/stack/context";
import { createTestClientStack } from "../../../__tests__/client-stack-test-utils";
import { cmsClientPlugin } from "../client";
import { DashboardPage } from "../client/components/pages/dashboard-page.internal";
import { ContentListPage } from "../client/components/pages/content-list-page.internal";
import type {
	SerializedContentItemWithType,
	SerializedContentType,
} from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom lacks these APIs used by Radix / cmdk
(globalThis as any).ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

const hooks = vi.hoisted(() => ({
	useContentTypes: vi.fn(),
	useSuspenseContentTypes: vi.fn(),
	useContent: vi.fn(),
	useSuspenseContent: vi.fn(),
	useDeleteContent: vi.fn(),
}));

vi.mock("../client/hooks", () => hooks);

const CLASS_NAMES = {
	container: "bg-red-100",
	contentTypeCard: "bg-blue-100",
	contentTypeTitle: "text-purple-700",
	table: "bg-yellow-50",
	tableRow: "text-green-600",
	pagination: "border-4 border-orange-500",
} as const;

const SIMPLE_JSON_SCHEMA = JSON.stringify({
	type: "object",
	properties: { title: { type: "string" } },
	required: ["title"],
	autoFormVersion: 2,
});

const contentType: SerializedContentType & { itemCount: number } = {
	id: "ct1",
	name: "Post",
	slug: "post",
	description: "",
	jsonSchema: SIMPLE_JSON_SCHEMA,
	autoFormVersion: 2,
	itemCount: 1,
	createdAt: new Date("2024-01-01").toISOString(),
	updatedAt: new Date("2024-01-01").toISOString(),
} as unknown as SerializedContentType & { itemCount: number };

const item: SerializedContentItemWithType = {
	id: "i1",
	slug: "hello-world",
	contentTypeId: "ct1",
	data: JSON.stringify({ title: "Hello" }),
	parsedData: { title: "Hello" },
	contentType: { id: "ct1", name: "Post", slug: "post" },
	createdAt: new Date("2024-01-01").toISOString(),
	updatedAt: new Date("2024-01-01").toISOString(),
	authorId: "user-1",
} as unknown as SerializedContentItemWithType;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);

	hooks.useSuspenseContentTypes.mockReturnValue({
		contentTypes: [contentType],
		refetch: vi.fn(),
	});
	hooks.useSuspenseContent.mockReturnValue({
		items: [item],
		total: 1,
		loadMore: vi.fn(),
		hasMore: false,
		isLoadingMore: false,
		refetch: vi.fn(),
	});
	hooks.useContent.mockReturnValue({
		items: [],
		total: 0,
		isLoading: false,
		error: null,
		loadMore: vi.fn(),
		hasMore: false,
		isLoadingMore: false,
	});
	hooks.useDeleteContent.mockReturnValue({
		mutateAsync: vi.fn(),
		isPending: false,
	});
});

afterEach(async () => {
	await act(async () => {
		root.unmount();
	});
	container.remove();
	vi.clearAllMocks();
});

function createMockRouter() {
	let params = new URLSearchParams();
	return {
		navigate: vi.fn(),
		getSearchParams: () => new URLSearchParams(params.toString()),
		setSearchParams: vi.fn((next: URLSearchParams) => {
			params = new URLSearchParams(next.toString());
		}),
	};
}

async function render(ui: React.ReactElement, withOverrides = true) {
	await act(async () => {
		root.render(
			<StackProvider
				stack={createTestClientStack({ cms: cmsClientPlugin() })}
				router={createMockRouter()}
				overrides={withOverrides ? { cms: { classNames: CLASS_NAMES } } : {}}
			>
				{ui}
			</StackProvider>,
		);
	});
}

function query(selector: string): HTMLElement {
	const el = container.querySelector<HTMLElement>(selector);
	expect(el, `expected to find ${selector}`).toBeTruthy();
	return el!;
}

describe("cms classNames overrides (issue #36)", () => {
	it("applies container, contentTypeCard and contentTypeTitle on the dashboard", async () => {
		await render(<DashboardPage />);

		const page = query('[data-testid="cms-dashboard-page"]');
		expect(page.className).toContain(CLASS_NAMES.container);
		// The override must merge with the layout's own classes, not replace them.
		expect(page.className).toContain("mx-auto");

		const card = query('[data-slot="card"]');
		expect(card.className).toContain(CLASS_NAMES.contentTypeCard);
		expect(card.className).toContain("cursor-pointer");

		const title = query('[data-slot="card-title"]');
		expect(title.className).toContain(CLASS_NAMES.contentTypeTitle);
		expect(title.className).toContain("font-medium");
		expect(title.textContent).toBe(contentType.name);
	});

	it("applies table, tableRow and pagination on the content list", async () => {
		await render(<ContentListPage typeSlug="post" />);

		const table = query('[data-testid="cms-content-table"]');
		expect(table.className).toContain(CLASS_NAMES.table);
		expect(table.className).toContain("rounded-lg");

		const row = table.querySelector<HTMLElement>("tbody tr")!;
		expect(row, "expected a body row").toBeTruthy();
		expect(row.className).toContain(CLASS_NAMES.tableRow);
		expect(row.textContent).toContain(item.slug);

		const pagination = query('[data-testid="cms-content-pagination"]');
		expect(pagination.className).toContain("border-4");
		expect(pagination.className).toContain("border-orange-500");
		// Non-conflicting base classes survive the merge. (`border-t` is
		// intentionally dropped by tailwind-merge since `border-4` wins the
		// border-width group — that is the override taking precedence.)
		expect(pagination.className).toContain("justify-between");
		expect(pagination.className).toContain("px-4");
	});

	it("leaves base classes untouched when no classNames override is supplied", async () => {
		await render(<DashboardPage />, false);

		const card = query('[data-slot="card"]');
		expect(card.className).toContain("cursor-pointer");
		expect(card.className).not.toContain(CLASS_NAMES.contentTypeCard);
	});
});
