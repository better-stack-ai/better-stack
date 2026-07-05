// @vitest-environment jsdom
import { act, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StackProvider } from "../context";
import {
	createResourceQueryKeys,
	runResourceMutation,
	type ResourcesDeclaration,
	type StackError,
} from "../plugins/client";
import { createResource } from "../plugins/client/hooks";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

interface Item {
	id: string;
	name: string;
}

interface ListParams {
	q?: string;
	limit?: number;
}

const resources = {
	items: {
		queries: {
			list: {
				path: "/items",
				query: (params?: ListParams) => ({
					q: params?.q,
					limit: params?.limit ?? 10,
				}),
				key: (params?: ListParams) => [
					{ q: params?.q, limit: params?.limit ?? 10 },
				],
				select: (data: any): Item[] => data?.items ?? [],
				infinite: true,
				pageSize: (params?: ListParams) => params?.limit ?? 10,
			},
			detail: {
				path: "/items",
				query: (id: string) => ({ id, limit: 1 }),
				key: (id: string) => [id],
				select: (data: any): Item | null => data?.items?.[0] ?? null,
				skip: (id: string) => !id,
			},
			all: {
				path: "/all-items",
				key: () => ["all"],
				select: (data: any): Item[] => data ?? [],
			},
		},
		mutations: {
			create: {
				path: "@post/items",
				method: "POST" as const,
				input: (vars: { name: string }) => ({ body: vars }),
				select: (data: any) => data as Item | null,
				invalidates: ["items.list"],
				setData: {
					args: (result: Item | null) => (result?.id ? [result.id] : null),
				},
			},
			remove: {
				path: "@delete/items/:id",
				method: "DELETE" as const,
				input: (vars: { id: string }) => ({ params: { id: vars.id } }),
				select: (data: any) => data as { success: boolean },
				invalidates: ["items"],
			},
		},
	},
} satisfies ResourcesDeclaration;

describe("createResourceQueryKeys", () => {
	const client = vi.fn();

	beforeEach(() => {
		client.mockReset();
	});

	it("produces query-key-factory compatible shapes", () => {
		const keys = createResourceQueryKeys(client, resources);

		expect(keys.items._def).toEqual(["items"]);
		expect(keys.items.list._def).toEqual(["items", "list"]);
		expect(keys.items.detail._def).toEqual(["items", "detail"]);

		expect(keys.items.list({ q: "x" }).queryKey).toEqual([
			"items",
			"list",
			{ q: "x", limit: 10 },
		]);
		expect(keys.items.detail("42").queryKey).toEqual(["items", "detail", "42"]);
		expect(keys.items.all().queryKey).toEqual(["items", "all", "all"]);
	});

	it("defaults key cells to the args when no key fn is declared", () => {
		const keys = createResourceQueryKeys(client, {
			things: {
				queries: { byId: { path: "/things", query: (id: string) => ({ id }) } },
			},
		});
		expect(keys.things.byId("7").queryKey).toEqual(["things", "byId", "7"]);
	});

	it("fetches, unwraps and selects data", async () => {
		client.mockResolvedValue({
			data: { items: [{ id: "1", name: "one" }] },
		});
		const keys = createResourceQueryKeys(client, resources, {
			"x-test": "yes",
		});

		const result = await keys.items.detail("1").queryFn();

		expect(result).toEqual({ id: "1", name: "one" });
		expect(client).toHaveBeenCalledWith("/items", {
			method: "GET",
			query: { id: "1", limit: 1 },
			headers: { "x-test": "yes" },
		});
	});

	it("injects the page offset for infinite queries", async () => {
		client.mockResolvedValue({ data: { items: [] } });
		const keys = createResourceQueryKeys(client, resources);

		await keys.items.list({ q: "a", limit: 5 }).queryFn({ pageParam: 15 });

		expect(client).toHaveBeenCalledWith("/items", {
			method: "GET",
			query: { q: "a", limit: 5, offset: 15 },
		});

		// Defaults to offset 0 when no pageParam is provided
		await keys.items.list({ limit: 5 }).queryFn();
		expect(client).toHaveBeenLastCalledWith("/items", {
			method: "GET",
			query: { q: undefined, limit: 5, offset: 0 },
		});
	});

	it("throws a normalized StackError on error responses", async () => {
		client.mockResolvedValue({
			error: { message: "denied", status: 403 },
		});
		const keys = createResourceQueryKeys(client, resources);

		await expect(keys.items.detail("1").queryFn()).rejects.toMatchObject({
			message: "denied",
			statusCode: 403,
		});
	});

	it("skips fetching and resolves null when skip matches", async () => {
		const keys = createResourceQueryKeys(client, resources);

		await expect(keys.items.detail("").queryFn()).resolves.toBeNull();
		expect(client).not.toHaveBeenCalled();
	});
});

describe("runResourceMutation", () => {
	it("maps vars through input and unwraps the result", async () => {
		const client = vi.fn().mockResolvedValue({ data: { success: true } });

		const result = await runResourceMutation(
			client,
			resources.items.mutations.remove,
			{ id: "9" },
		);

		expect(result).toEqual({ success: true });
		expect(client).toHaveBeenCalledWith("@delete/items/:id", {
			method: "DELETE",
			params: { id: "9" },
		});
	});

	it("defaults to sending vars as the body", async () => {
		const client = vi.fn().mockResolvedValue({ data: { id: "1" } });

		await runResourceMutation(
			client,
			{ path: "@post/items", method: "POST" },
			{ name: "x" },
		);

		expect(client).toHaveBeenCalledWith("@post/items", {
			method: "POST",
			body: { name: "x" },
		});
	});

	it("throws a normalized StackError with field errors", async () => {
		const client = vi.fn().mockResolvedValue({
			error: {
				message: "[body.name] Required",
				status: 400,
				issues: [{ path: ["name"], message: "Required" }],
			},
		});

		try {
			await runResourceMutation(client, resources.items.mutations.create, {
				name: "",
			});
			expect.unreachable("mutation should reject");
		} catch (error) {
			const stackError = error as StackError;
			expect(stackError.statusCode).toBe(400);
			expect(stackError.errors).toEqual({ name: "Required" });
		}
	});
});

describe("createResource hooks", () => {
	const items = createResource({ plugin: "test-plugin", resources });

	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;
	let refresh: ReturnType<typeof vi.fn>;
	let fetchMock: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient();
		refresh = vi.fn();
		fetchMock = vi.spyOn(globalThis, "fetch" as any);
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

	async function render(ui: React.ReactElement) {
		await act(async () => {
			root.render(
				<StackProvider
					basePath="/pages"
					overrides={{
						"test-plugin": {
							apiBaseURL: "http://test.local",
							apiBasePath: "/api/data",
							refresh,
						},
					}}
				>
					<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
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

	it("use() fetches and selects data", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({ items: [{ id: "1", name: "one" }] }),
		);

		let captured: any;
		function Probe() {
			captured = items.items.detail.use(["1"]);
			return null;
		}
		await render(<Probe />);
		await waitFor(() => captured.isSuccess);

		expect(captured.data).toEqual({ id: "1", name: "one" });
		const url = String(fetchMock.mock.calls[0]?.[0]);
		expect(url).toContain("http://test.local/api/data/items");
		expect(url).toContain("id=1");
	});

	it("use() respects the enabled option", async () => {
		let captured: any;
		function Probe() {
			captured = items.items.detail.use(["1"], { enabled: false });
			return null;
		}
		await render(<Probe />);

		expect(captured.fetchStatus).toBe("idle");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("useSuspense() suspends and resolves data", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({ items: [{ id: "1", name: "one" }] }),
		);

		let captured: any;
		function Probe() {
			captured = items.items.detail.useSuspense(["1"]);
			return null;
		}
		await render(
			<Suspense fallback={null}>
				<Probe />
			</Suspense>,
		);
		await waitFor(() => !!captured?.data);

		expect(captured.data).toEqual({ id: "1", name: "one" });
	});

	it("useInfinite() pages by offset and derives hasNextPage from pageSize", async () => {
		const firstPage = Array.from({ length: 2 }, (_, i) => ({
			id: `a${i}`,
			name: `a${i}`,
		}));
		const secondPage = [{ id: "b0", name: "b0" }];
		fetchMock.mockImplementation(async (input: any) => {
			const url = String(input);
			return url.includes("offset=2")
				? jsonResponse({ items: secondPage })
				: jsonResponse({ items: firstPage });
		});

		let captured: any;
		function Probe() {
			captured = items.items.list.useInfinite([{ limit: 2 }]);
			return null;
		}
		await render(<Probe />);
		await waitFor(() => captured.isSuccess);

		expect(captured.data.pages).toEqual([firstPage]);
		expect(captured.hasNextPage).toBe(true);

		await act(async () => {
			await captured.fetchNextPage();
		});
		await waitFor(() => captured.data.pages.length === 2);

		expect(captured.data.pages[1]).toEqual(secondPage);
		// Second page is short (1 < 2) — no further pages
		expect(captured.hasNextPage).toBe(false);
		expect(String(fetchMock.mock.calls[1]?.[0])).toContain("offset=2");
	});

	it("mutations invalidate declared targets, seed detail data and refresh", async () => {
		const created: Item = { id: "42", name: "created" };
		fetchMock.mockResolvedValue(jsonResponse(created));

		// Seed a list entry so we can observe invalidation
		const listKey = ["items", "list", { q: undefined, limit: 10 }];
		queryClient.setQueryData(listKey, { pages: [[]], pageParams: [0] });

		let captured: any;
		function Probe() {
			captured = items.items.create.use();
			return null;
		}
		await render(<Probe />);

		await act(async () => {
			await captured.mutateAsync({ name: "created" });
		});

		// POST issued to the right endpoint
		const [url, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
		expect(String(url)).toContain("/api/data/items");
		expect(init.method).toBe("POST");

		// Detail cache seeded from the result
		expect(queryClient.getQueryData(["items", "detail", "42"])).toEqual(
			created,
		);
		// List invalidated
		expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
		// refresh called after invalidation
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it("resource-level invalidation targets every query of the resource", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ success: true }));

		const listKey = ["items", "list", { q: undefined, limit: 10 }];
		const detailKey = ["items", "detail", "9"];
		queryClient.setQueryData(listKey, { pages: [[]], pageParams: [0] });
		queryClient.setQueryData(detailKey, { id: "9", name: "nine" });

		let captured: any;
		function Probe() {
			captured = items.items.remove.use();
			return null;
		}
		await render(<Probe />);

		await act(async () => {
			await captured.mutateAsync({ id: "9" });
		});

		expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
		expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
	});

	it("mutations reject with a normalized StackError", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(
				{
					message: "[body.name] Required",
					code: "VALIDATION_ERROR",
					issues: [{ path: ["name"], message: "Required" }],
				},
				400,
			),
		);

		let captured: any;
		function Probe() {
			captured = items.items.create.use();
			return null;
		}
		await render(<Probe />);

		let thrown: StackError | undefined;
		await act(async () => {
			try {
				await captured.mutateAsync({ name: "" });
			} catch (error) {
				thrown = error as StackError;
			}
		});

		expect(thrown).toBeDefined();
		expect(thrown?.errors).toEqual({ name: "Required" });
		// No invalidation or refresh on failure
		expect(refresh).not.toHaveBeenCalled();
	});
});
