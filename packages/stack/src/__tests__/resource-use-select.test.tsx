// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StackProvider } from "../context";
import type { ResourcesDeclaration } from "../plugins/client";
import { createResource } from "../plugins/client/hooks";
import type { ResourceSelectResult } from "../plugins/client/hooks";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

interface Tag {
	id: string;
	name: string;
}

const resources = {
	tags: {
		queries: {
			list: {
				path: "/tags",
				query: (search?: string) => ({ q: search || undefined }),
				key: (search?: string) => [{ q: search || undefined }],
				select: (data: any): Tag[] => data ?? [],
			},
			detail: {
				path: "/tags/one",
				query: (id: string) => ({ id }),
				key: (id: string) => [id],
				select: (data: any): Tag | null => data ?? null,
			},
		},
	},
} satisfies ResourcesDeclaration;

const tags = createResource({ plugin: "test-plugin", resources });

const ALL_TAGS: Tag[] = [
	{ id: "1", name: "alpha" },
	{ id: "2", name: "beta" },
	{ id: "3", name: "kanban" },
];

describe("resource useSelect", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;
	let fetchMock: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient();
		fetchMock = vi.spyOn(globalThis, "fetch" as any);
		fetchMock.mockImplementation(async (input: any) => {
			const url = new URL(String(input));
			if (url.pathname.endsWith("/tags/one")) {
				const id = url.searchParams.get("id");
				const tag = id === "42" ? { id: "42", name: "preloaded" } : null;
				return jsonResponse(tag);
			}
			const q = url.searchParams.get("q");
			const filtered = q
				? ALL_TAGS.filter((tag) => tag.name.includes(q))
				: ALL_TAGS;
			return jsonResponse(filtered);
		});
	});

	afterEach(async () => {
		await act(async () => {
			root.unmount();
		});
		container.remove();
		vi.restoreAllMocks();
	});

	function jsonResponse(body: unknown, status = 200) {
		return new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		});
	}

	type SelectConfig = Parameters<typeof tags.tags.useSelect<Tag>>[0];

	async function renderSelect(
		config: SelectConfig,
		onCapture: (result: ResourceSelectResult<Tag>) => void,
	) {
		function Probe() {
			const result = tags.tags.useSelect<Tag>(config);
			onCapture(result);
			return null;
		}
		await act(async () => {
			root.render(
				<StackProvider
					basePath="/pages"
					overrides={{
						"test-plugin": {
							apiBaseURL: "http://test.local",
							apiBasePath: "/api/data",
						},
					}}
				>
					<QueryClientProvider client={queryClient}>
						<Probe />
					</QueryClientProvider>
				</StackProvider>,
			);
		});
	}

	async function waitFor(check: () => boolean, timeout = 3000) {
		const start = Date.now();
		while (!check()) {
			if (Date.now() - start > timeout) {
				throw new Error("waitFor timed out");
			}
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
			});
		}
	}

	const baseConfig: SelectConfig = {
		searchArgs: (search) => [search],
		getOptionValue: (tag) => tag.id,
		getOptionLabel: (tag) => tag.name,
		debounceMs: 50,
	};

	it("loads initial options for the empty search", async () => {
		let select!: ResourceSelectResult<Tag>;
		await renderSelect(baseConfig, (value) => {
			select = value;
		});
		await waitFor(() => !select.isLoading);

		expect(select.options).toEqual([
			{ value: "1", label: "alpha", item: ALL_TAGS[0] },
			{ value: "2", label: "beta", item: ALL_TAGS[1] },
			{ value: "3", label: "kanban", item: ALL_TAGS[2] },
		]);
		expect(select.isSearching).toBe(false);
	});

	it("debounces the search text and skips intermediate values", async () => {
		let select!: ResourceSelectResult<Tag>;
		await renderSelect(baseConfig, (value) => {
			select = value;
		});
		await waitFor(() => !select.isLoading);

		await act(async () => {
			select.setSearch("k");
		});
		await act(async () => {
			select.setSearch("ka");
		});

		// Debounce pending: still searching, no new fetch yet
		expect(select.isSearching).toBe(true);
		const callsBefore = fetchMock.mock.calls.length;

		await waitFor(
			() => !select.isSearching && select.options.length === 1,
			2000,
		);

		expect(select.options[0]?.label).toBe("kanban");

		// Only the debounced value was fetched — never the intermediate "k"
		const searchedTerms = fetchMock.mock.calls
			.slice(callsBefore)
			.map((call) => new URL(String(call[0])).searchParams.get("q"));
		expect(searchedTerms).toEqual(["ka"]);
	});

	it("preloads selected values missing from the options", async () => {
		let select!: ResourceSelectResult<Tag>;
		await renderSelect(
			{
				...baseConfig,
				value: "42",
				preload: { args: (value) => [value] },
			},
			(value) => {
				select = value;
			},
		);
		await waitFor(
			() => select.options.some((option) => option.value === "42"),
			2000,
		);

		expect(select.options).toContainEqual({
			value: "42",
			label: "preloaded",
			item: { id: "42", name: "preloaded" },
		});
		expect(select.selectedOptions).toEqual([
			{
				value: "42",
				label: "preloaded",
				item: { id: "42", name: "preloaded" },
			},
		]);
	});

	it("does not preload values already present in the options", async () => {
		let select!: ResourceSelectResult<Tag>;
		await renderSelect(
			{
				...baseConfig,
				value: "2",
				preload: { args: (value) => [value] },
			},
			(value) => {
				select = value;
			},
		);
		await waitFor(() => !select.isLoading);

		expect(select.selectedOptions).toEqual([
			{ value: "2", label: "beta", item: ALL_TAGS[1] },
		]);
		const detailCalls = fetchMock.mock.calls.filter((call) =>
			String(call[0]).includes("/tags/one"),
		);
		expect(detailCalls).toHaveLength(0);
	});

	it("falls back to the raw value for unresolvable selections", async () => {
		let select!: ResourceSelectResult<Tag>;
		await renderSelect({ ...baseConfig, value: "missing" }, (value) => {
			select = value;
		});
		await waitFor(() => !select.isLoading);

		expect(select.selectedOptions).toEqual([
			{ value: "missing", label: "missing" },
		]);
	});
});
