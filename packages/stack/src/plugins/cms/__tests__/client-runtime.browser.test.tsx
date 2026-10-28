// @vitest-environment jsdom
import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { act, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "../../../client";
import { StackProvider } from "@btst/stack/context";
import { createApiClient } from "../../client";
import type { CMSApiRouter } from "../api";
import { cmsClientPlugin } from "../client";
import {
	useContentTypes,
	useCreateContent,
	useSuspenseContentTypes,
	useContentByRelation,
	useInverseRelationItems,
	useUpdateContent,
	useDeleteContent,
} from "../client/hooks";
import { createCMSQueryKeys } from "../query-keys";
import { uiBuilderClientPlugin } from "../../ui-builder/client";
import {
	useCreateUIBuilderPage,
	useSuspenseUIBuilderPages,
	useUIBuilderPage,
} from "../../ui-builder/client/hooks";
import { createUIBuilderQueryKeys } from "../../ui-builder/query-keys";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const contentType = {
	id: "type-1",
	name: "Article",
	slug: "article",
	schema: {},
	itemCount: 1,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

const contentItem = {
	id: "item-1",
	contentTypeId: contentType.id,
	slug: "runtime-article",
	data: "{}",
	parsedData: { title: "Runtime article" },
	contentType,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

const uiBuilderItem = {
	...contentItem,
	id: "page-1",
	contentTypeId: "ui-builder-type",
	slug: "runtime-page",
	parsedData: { layers: "[]", variables: "[]", status: "published" },
};

function jsonResponse(value: unknown) {
	return new Response(JSON.stringify(value), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

async function waitFor(check: () => boolean, timeout = 3000) {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeout) throw new Error("waitFor timed out");
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});
	}
}

describe("CMS and UI Builder browser runtime", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.restoreAllMocks();
	});

	it("keeps relation page sizes and inverse offsets separate in the client cache", async () => {
		const records = [
			contentItem,
			{ ...contentItem, id: "item-2" },
			{ ...contentItem, id: "item-3" },
		];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			const limit = Number(url.searchParams.get("limit") ?? 20);
			const offset = Number(url.searchParams.get("offset") ?? 0);
			return jsonResponse({
				items: records.slice(offset, offset + limit),
				total: 3,
				limit,
				offset,
			});
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { cms: cmsClientPlugin() },
		});
		let small: ReturnType<typeof useContentByRelation>;
		let large: ReturnType<typeof useContentByRelation>;
		let first: ReturnType<typeof useInverseRelationItems>;
		let second: ReturnType<typeof useInverseRelationItems>;
		function Probe() {
			small = useContentByRelation("article", "categoryId", "category-1", {
				limit: 1,
			});
			large = useContentByRelation("article", "categoryId", "category-1", {
				limit: 2,
			});
			const params = {
				contentTypeSlug: "category",
				sourceType: "article",
				itemId: "category-1",
				fieldName: "categoryId",
			};
			first = useInverseRelationItems(params, { limit: 1, offset: 0 });
			second = useInverseRelationItems(params, { limit: 1, offset: 1 });
			return null;
		}
		await act(async () =>
			root.render(
				<StackProvider stack={stack}>
					<Probe />
				</StackProvider>,
			),
		);
		await waitFor(
			() =>
				!small?.isLoading &&
				!large?.isLoading &&
				!first?.isLoading &&
				!second?.isLoading,
		);
		expect(small!.items.map((item) => item.id)).toEqual(["item-1"]);
		expect(large!.items.map((item) => item.id)).toEqual(["item-1", "item-2"]);
		expect(first!.items.map((item) => item.id)).toEqual(["item-1"]);
		expect(second!.items.map((item) => item.id)).toEqual(["item-2"]);
		await act(async () => small!.loadMore());
		await waitFor(() => small!.items.length === 2);
		expect(small!.items.map((item) => item.id)).toEqual(["item-1", "item-2"]);
		expect(large!.items).toHaveLength(2);
	});

	it("refreshes direct and inverse relation pages after content mutations", async () => {
		let revision = 0;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request =
				input instanceof Request ? input : new Request(input, init);
			const item = {
				...contentItem,
				parsedData: { title: `Revision ${revision}` },
			};
			if (request.method !== "GET") {
				revision += 1;
				if (request.method === "DELETE") return jsonResponse({ success: true });
				return jsonResponse({
					...item,
					parsedData: { title: `Revision ${revision}` },
				});
			}
			return jsonResponse({ items: [item], total: 1, limit: 20, offset: 0 });
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { cms: cmsClientPlugin() },
		});
		let direct: ReturnType<typeof useContentByRelation>;
		let inverse: ReturnType<typeof useInverseRelationItems>;
		let update: ReturnType<typeof useUpdateContent>;
		let create: ReturnType<typeof useCreateContent>;
		let remove: ReturnType<typeof useDeleteContent>;
		function Probe() {
			direct = useContentByRelation("article", "categoryId", "category-1");
			inverse = useInverseRelationItems({
				contentTypeSlug: "category",
				sourceType: "article",
				itemId: "category-1",
				fieldName: "categoryId",
			});
			update = useUpdateContent("article");
			create = useCreateContent("article");
			remove = useDeleteContent("article");
			return null;
		}
		await act(async () =>
			root.render(
				<StackProvider stack={stack}>
					<Probe />
				</StackProvider>,
			),
		);
		await waitFor(() => !direct?.isLoading && !inverse?.isLoading);
		expect(direct!.items[0]?.parsedData.title).toBe("Revision 0");
		expect(inverse!.items[0]?.parsedData.title).toBe("Revision 0");
		for (const [index, mutate] of [
			() =>
				update!.mutateAsync({
					id: "item-1",
					data: { data: { title: "Updated" } },
				}),
			() =>
				create!.mutateAsync({
					slug: "new-article",
					data: { title: "Created" },
				}),
			() => remove!.mutateAsync("item-2"),
		].entries()) {
			await act(async () => {
				await mutate();
			});
			await waitFor(
				() =>
					direct!.items[0]?.parsedData.title === `Revision ${index + 1}` &&
					inverse!.items[0]?.parsedData.title === `Revision ${index + 1}`,
			);
		}
	});

	it("hydrates CMS and UI Builder hooks through the one resolved stack cache", async () => {
		const serverQueryClient = new QueryClient();
		const apiClient = createApiClient<CMSApiRouter>({
			baseURL: "https://app.example.com",
			basePath: "/api/data",
		});
		const cmsQueries = createCMSQueryKeys(apiClient);
		const uiBuilderQueries = createUIBuilderQueryKeys(apiClient);
		serverQueryClient.setQueryData(cmsQueries.cmsTypes.list().queryKey, [
			contentType,
		]);
		serverQueryClient.setQueryData(
			uiBuilderQueries.cmsContent.list({ limit: 10 }).queryKey,
			{
				pages: [{ items: [uiBuilderItem], total: 1, limit: 10, offset: 0 }],
				pageParams: [0],
			},
		);

		const browserQueryClient = new QueryClient();
		hydrate(browserQueryClient, dehydrate(serverQueryClient));
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: browserQueryClient,
			plugins: {
				cms: cmsClientPlugin(),
				uiBuilder: uiBuilderClientPlugin(),
			},
		});
		const fetchMock = vi.spyOn(globalThis, "fetch");

		function Probe() {
			const { contentTypes } = useSuspenseContentTypes();
			const { pages } = useSuspenseUIBuilderPages();
			return <span>{`${contentTypes[0]?.name}:${pages[0]?.slug}`}</span>;
		}

		await act(async () => {
			root.render(
				<StackProvider stack={stack}>
					<Suspense fallback={<span>loading</span>}>
						<Probe />
					</Suspense>
				</StackProvider>,
			);
		});

		expect(container.textContent).toBe("Article:runtime-page");
		expect(fetchMock).not.toHaveBeenCalled();
		expect(stack.provider.queryClient).toBe(browserQueryClient);
	});

	it("uses each resolved endpoint for CMS and UI Builder queries and mutations", async () => {
		const requests: Array<{
			url: string;
			headers: Headers;
			method: string;
			credentials: RequestCredentials;
		}> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request =
				input instanceof Request ? input : new Request(input, init);
			requests.push({
				url: request.url,
				headers: request.headers,
				method: request.method,
				credentials: request.credentials,
			});
			const url = new URL(request.url);
			if (request.method === "POST") {
				return jsonResponse(
					url.pathname.includes("ui-builder-page")
						? uiBuilderItem
						: contentItem,
				);
			}
			if (url.pathname.endsWith("/content-types")) {
				return jsonResponse([contentType]);
			}
			return jsonResponse(uiBuilderItem);
		});

		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: {
				cms: cmsClientPlugin(),
				uiBuilder: uiBuilderClientPlugin(),
			},
			endpoints: {
				cms: {
					api: {
						baseURL: "https://content.example.net",
						basePath: "/btst/cms",
						browserHeaders: { "x-public-client": "public-value" },
						credentials: "include",
					},
				},
			},
		});

		let cmsQuery: ReturnType<typeof useContentTypes> | undefined;
		let createContent: ReturnType<typeof useCreateContent> | undefined;
		let uiBuilderQuery: ReturnType<typeof useUIBuilderPage> | undefined;
		let createUIBuilder: ReturnType<typeof useCreateUIBuilderPage> | undefined;
		function Probe() {
			cmsQuery = useContentTypes();
			createContent = useCreateContent("article");
			uiBuilderQuery = useUIBuilderPage("page-1");
			createUIBuilder = useCreateUIBuilderPage();
			return null;
		}

		await act(async () => {
			root.render(
				<StackProvider stack={stack}>
					<Probe />
				</StackProvider>,
			);
		});
		await waitFor(
			() =>
				cmsQuery?.isLoading === false && uiBuilderQuery?.isLoading === false,
		);
		await act(async () => {
			await createContent?.mutateAsync({
				slug: "runtime-article",
				data: { title: "Runtime article" },
			});
			await createUIBuilder?.mutateAsync({
				slug: "runtime-page",
				layers: [],
			});
		});

		expect(cmsQuery?.contentTypes[0]?.name).toBe("Article");
		expect(uiBuilderQuery?.page?.slug).toBe("runtime-page");
		expect(requests.some((request) => request.method === "POST")).toBe(true);
		expect(requests.length).toBeGreaterThan(0);
		for (const request of requests) {
			expect(request.url).toMatch(
				/^https:\/\/content\.example\.net\/btst\/cms\//,
			);
			expect(request.headers.get("x-public-client")).toBe("public-value");
			expect(request.headers.get("authorization")).toBeNull();
			expect(request.headers.get("cookie")).toBeNull();
			expect(request.credentials).toBe("include");
		}
		expect(stack.provider.plugins.uiBuilder.api).toEqual(
			stack.provider.plugins.cms.api,
		);
	});
});
