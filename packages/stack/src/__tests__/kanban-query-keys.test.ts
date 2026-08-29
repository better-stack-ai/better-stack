/**
 * SSG guard: factory-generated Kanban query keys must stay deep-equal to the
 * builders used by `prefetchForRoute`. Key drift silently breaks hydration.
 */
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createStackClient } from "../client";
import {
	getBoardSummaries,
	serializeBoardSummary,
	type SerializedBoardSummary,
} from "../plugins/kanban/api";
import { KANBAN_QUERY_KEYS } from "../plugins/kanban/api/query-key-defs";
import { kanbanClientPlugin } from "../plugins/kanban/client/plugin";
import {
	type CreateBoardInput,
	createKanbanQueryKeys,
} from "../plugins/kanban/query-keys";
import { createTanStackPageOptions } from "../tanstack";

const client = vi.fn() as any;

describe("kanban query keys match SSG prefetch keys", () => {
	const queries = createKanbanQueryKeys(client);

	it("derives board create input from the browser-safe runtime schema", () => {
		expectTypeOf<CreateBoardInput>()
			.toHaveProperty("slug")
			.toEqualTypeOf<string | undefined>();
		expectTypeOf<CreateBoardInput>().not.toHaveProperty("ownerId");
		expectTypeOf<CreateBoardInput>().not.toHaveProperty("organizationId");
	});

	it("exports the collection-safe serializer from the public API", () => {
		expect(getBoardSummaries).toBeTypeOf("function");
		expect(serializeBoardSummary).toBeTypeOf("function");
		expectTypeOf<
			ReturnType<typeof serializeBoardSummary>
		>().toMatchTypeOf<SerializedBoardSummary>();
	});

	it("board list keys match for default params", () => {
		expect([...queries.boards.list().queryKey]).toEqual([
			...KANBAN_QUERY_KEYS.boardsList(),
		]);
	});

	it("board list keys match for every supported filter", () => {
		const params = {
			slug: "roadmap",
			ownerId: "user-1",
			organizationId: "org-1",
			limit: 10,
			offset: 20,
		};
		expect([...queries.boards.list(params).queryKey]).toEqual([
			...KANBAN_QUERY_KEYS.boardsList(params),
		]);
	});

	it("board detail keys match", () => {
		expect([...queries.boards.detail("board-1").queryKey]).toEqual([
			...KANBAN_QUERY_KEYS.boardDetail("board-1"),
		]);
	});

	it("preserves the previous query-key factory prefixes", () => {
		expect([...queries.boards._def]).toEqual(["boards"]);
		expect([...queries.boards.list._def]).toEqual(["boards", "list"]);
		expect([...queries.boards.detail._def]).toEqual(["boards", "detail"]);
		expect([...queries.boards.bySlug._def]).toEqual(["boards", "bySlug"]);
		expect([...queries.boards.bySlug("roadmap").queryKey]).toEqual([
			"boards",
			"bySlug",
			"slug",
			"roadmap",
		]);
	});
});

describe("Kanban authenticated SSR hydration", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("forwards request headers and seeds detail metadata under the hydrated identity key", async () => {
		const queryClient = new QueryClient();
		const identity = { id: "owner-1", role: "admin" };
		const headers = new Headers({ cookie: "session=request-session" });
		const board = {
			id: "board-1",
			name: "Private roadmap",
			slug: "private-roadmap",
			description: "",
			ownerId: identity.id,
			organizationId: null,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			columns: [],
		};
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify(board), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		const stack = createStackClient({
			api: {
				baseURL: "http://test.local",
				basePath: "/api/data",
				headers,
			},
			site: { baseURL: "http://test.local", basePath: "/pages" },
			queryClient,
			plugins: {
				kanban: kanbanClientPlugin({ identityPartition: identity }),
			},
		});

		const route = stack.router.getRoute(`/kanban/${board.id}`);
		await route?.loader?.();

		const queries = createKanbanQueryKeys(client);
		expect(
			queryClient.getQueryData(
				queries.boards.detail(board.id, identity).queryKey,
			),
		).toEqual(board);
		expect(
			queryClient.getQueryData(queries.boards.detail(board.id).queryKey),
		).toBeUndefined();
		expect(route?.meta?.()).toContainEqual({ title: board.name });
		const [, init] = fetchMock.mock.calls[0] ?? [];
		expect(new Headers(init?.headers).get("cookie")).toBe(
			"session=request-session",
		);
	});

	it("reads hydrated identity-partitioned metadata during TanStack client navigation", async () => {
		const queryClient = new QueryClient();
		const identity = { id: "owner-1", role: "admin" };
		const board = {
			id: "board-1",
			name: "Hydrated private roadmap",
			slug: "private-roadmap",
			description: "",
			ownerId: identity.id,
			organizationId: null,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			columns: [],
		};
		queryClient.setQueryData(
			createKanbanQueryKeys(client).boards.detail(board.id, identity).queryKey,
			board,
		);

		const stackClient = (identityPartition?: typeof identity) =>
			createStackClient({
				api: { baseURL: "http://test.local", basePath: "/api/data" },
				site: { baseURL: "http://test.local", basePath: "/pages" },
				queryClient,
				plugins: {
					kanban: kanbanClientPlugin({ identityPartition }),
				},
			});
		const page = createTanStackPageOptions<{ queryClient: QueryClient }>({
			getStackClient: () => stackClient(),
			getLoaderStackClient: () => stackClient(identity),
		});
		vi.stubGlobal("window", {});

		const loaderData = await page.loader({
			params: { _splat: "kanban/board-1" },
			context: { queryClient },
		});

		expect(loaderData.meta).toContainEqual({ title: board.name });
		expect(page.head({ loaderData }).meta).toContainEqual({
			title: board.name,
		});
	});
});

describe("Kanban anonymous sitemap", () => {
	afterEach(() => vi.restoreAllMocks());

	function createClient() {
		return createStackClient({
			api: { baseURL: "http://test.local", basePath: "/api/data" },
			site: { baseURL: "http://test.local", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: {
				kanban: kanbanClientPlugin(),
			},
		});
	}

	it("omits every route when anonymous collection authorization fails", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ message: "Unauthorized" }), {
				status: 401,
				headers: { "content-type": "application/json" },
			}),
		);

		await expect(createClient().generateSitemap()).resolves.toEqual([]);
	});

	it("publishes routes only after an explicit public collection succeeds", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					items: [
						{
							id: "public-board",
							updatedAt: "2026-01-01T00:00:00.000Z",
							columns: [],
						},
					],
					total: 1,
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			),
		);

		expect(
			(await createClient().generateSitemap()).map(({ url }) => url),
		).toEqual([
			"http://test.local/pages/kanban",
			"http://test.local/pages/kanban/public-board",
		]);
	});
});
