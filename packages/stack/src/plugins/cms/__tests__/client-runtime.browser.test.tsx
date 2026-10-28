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
	useContentOptions,
	useCreateContent,
	useSuspenseContentTypes,
	useContent,
	useContentItem,
	useContentItemBySlug,
	useUpdateContent,
	useSuspenseContent,
	useSuspenseContentItem,
	useContentByRelation,
	useSuspenseContentByRelation,
	useInverseRelationItems,
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

	it("keeps full and content reads separate and refreshes both after updates", async () => {
		let title = "Before";
		const requests: string[] = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request =
				input instanceof Request ? input : new Request(input, init);
			const url = new URL(request.url);
			requests.push(`${request.method} ${url.pathname}${url.search}`);
			if (request.method === "PUT") title = "After";
			const full = { ...contentItem, parsedData: { title, body: "Long body" } };
			const item =
				url.searchParams.get("view") === "content"
					? {
							id: full.id,
							slug: full.slug,
							parsedData: url.searchParams.has("fields")
								? Object.fromEntries(
										JSON.parse(url.searchParams.get("fields")!).map(
											(field: string) => [
												field,
												full.parsedData[field as keyof typeof full.parsedData],
											],
										),
									)
								: full.parsedData,
							createdAt: full.createdAt,
							updatedAt: full.updatedAt,
						}
					: full;
			return jsonResponse(
				url.pathname.endsWith("/article")
					? { items: [item], total: 1, limit: 10, offset: 0 }
					: item,
			);
		});
		const queryClient = new QueryClient();
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient,
			plugins: { cms: cmsClientPlugin() },
		});
		let projected: ReturnType<typeof useContentItem>;
		let equivalent: ReturnType<typeof useContentItem>;
		let bodyOnly: ReturnType<typeof useContentItem>;
		let full: ReturnType<typeof useContentItem>;
		let content: ReturnType<typeof useContentItem>;
		let slug: ReturnType<typeof useContentItemBySlug>;
		let list: ReturnType<typeof useContent>;
		let update: ReturnType<typeof useUpdateContent>;
		function Probe() {
			full = useContentItem("article", "item-1");
			projected = useContentItem("article", "item-1", {
				view: "content",
				fields: ["title"],
			});
			equivalent = useContentItem("article", "item-1", {
				view: "content",
				fields: ["title", "title"],
			});
			bodyOnly = useContentItem("article", "item-1", {
				view: "content",
				fields: ["body"],
			});
			content = useContentItem("article", "item-1", { view: "content" });
			slug = useContentItemBySlug("article", "runtime-article", {
				view: "content",
				fields: ["title"],
			});
			list = useContent("article", { view: "content", fields: ["title"] });
			update = useUpdateContent("article");
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
				!!full?.item &&
				!!content?.item &&
				!!slug?.item &&
				!!list?.items.length &&
				!!projected?.item &&
				!!equivalent?.item &&
				!!bodyOnly?.item,
		);
		expect(projected!.item?.parsedData).toEqual({ title: "Before" });
		expect(equivalent!.item?.parsedData).toEqual({ title: "Before" });
		expect(bodyOnly!.item?.parsedData).toEqual({ body: "Long body" });
		expect(
			requests.filter((value) => {
				const url = new URL(
					value.slice(value.indexOf(" ") + 1),
					"https://app.example.com",
				);
				return (
					url.pathname.endsWith("/item-1") &&
					url.searchParams.get("fields") === '["title"]'
				);
			}),
		).toHaveLength(1);
		expect(full!.item).toHaveProperty("data");
		expect(content!.item).not.toHaveProperty("data");
		expect(slug!.item).not.toHaveProperty("data");
		expect(slug!.item?.parsedData).toEqual({ title: "Before" });
		expect(list!.items[0]?.parsedData).toEqual({ title: "Before" });
		expect(list!.items[0]).not.toHaveProperty("data");
		await act(async () => {
			await update!.mutateAsync({
				id: "item-1",
				data: { data: { title: "After" } },
			});
		});
		await waitFor(() =>
			[
				full?.item,
				content?.item,
				slug?.item,
				list?.items[0],
				projected?.item,
				equivalent?.item,
			].every((item) => item?.parsedData.title === "After"),
		);
		expect(projected!.item?.parsedData).toEqual({ title: "After" });
		expect(bodyOnly!.item?.parsedData).toEqual({ body: "Long body" });
		expect(projected!.item).not.toHaveProperty("data");
		expect(content!.item).not.toHaveProperty("data");
		expect(requests.some((value) => value.includes("view=content"))).toBe(true);
	});

	it("projects picker search results and selected-ID preloads with separate normalized caches", async () => {
		let revision = 0;
		const requests: URL[] = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request =
				input instanceof Request ? input : new Request(input, init);
			const url = new URL(request.url);
			requests.push(url);
			if (request.method === "PUT") revision += 1;
			const detail = url.pathname.endsWith("/selected-2");
			const full = {
				...contentItem,
				id: detail ? "selected-2" : "option-1",
				parsedData: {
					title: `${detail ? "Selected" : "Option"} ${revision}`,
					body: "Unrequested body",
				},
			};
			const value =
				url.searchParams.get("view") === "content"
					? {
							id: full.id,
							slug: full.slug,
							createdAt: full.createdAt,
							updatedAt: full.updatedAt,
							parsedData: url.searchParams.has("fields")
								? Object.fromEntries(
										JSON.parse(url.searchParams.get("fields")!).map(
											(field: string) => [
												field,
												full.parsedData[field as keyof typeof full.parsedData],
											],
										),
									)
								: full.parsedData,
						}
					: full;
			return jsonResponse(
				detail || request.method === "PUT"
					? value
					: { items: [value], total: 1, limit: 50, offset: 0 },
			);
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { cms: cmsClientPlugin() },
		});
		let full: ReturnType<typeof useContentOptions>;
		let projected: ReturnType<typeof useContentOptions>;
		let equivalent: ReturnType<typeof useContentOptions>;
		let update: ReturnType<typeof useUpdateContent>;
		function Probe() {
			full = useContentOptions({
				targetType: "article",
				value: ["selected-2"],
				getOptionLabel: (item) => String(item.parsedData.title),
			});
			projected = useContentOptions({
				targetType: "article",
				value: ["selected-2"],
				view: "content",
				fields: ["title"],
				getOptionLabel: (item) => String(item.parsedData.title),
			});
			equivalent = useContentOptions({
				targetType: "article",
				value: ["selected-2"],
				view: "content",
				fields: ["title", "title"],
				getOptionLabel: (item) => String(item.parsedData.title),
			});
			update = useUpdateContent("article");
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
				!!full &&
				!!projected &&
				!!equivalent &&
				!full.isLoading &&
				!projected.isLoading &&
				!equivalent.isLoading,
		);
		expect(full!.selectedOptions[0]?.item).toHaveProperty("data");
		for (const result of [projected!, equivalent!]) {
			expect(result.options[0]?.item?.parsedData).toEqual({
				title: "Option 0",
			});
			expect(result.selectedOptions[0]?.item?.parsedData).toEqual({
				title: "Selected 0",
			});
			expect(result.selectedOptions[0]?.item).not.toHaveProperty("data");
		}
		const projectedRequests = requests.filter(
			(url) => url.searchParams.get("fields") === '["title"]',
		);
		expect(projectedRequests).toHaveLength(2);
		expect(
			projectedRequests.every(
				(url) => url.searchParams.get("view") === "content",
			),
		).toBe(true);
		await act(async () => projected!.setSearch("target"));
		await waitFor(() =>
			requests.some(
				(url) =>
					url.searchParams.get("search") === "target" &&
					url.searchParams.get("fields") === '["title"]',
			),
		);

		await act(async () => {
			await update!.mutateAsync({
				id: "selected-2",
				data: { data: { title: "Updated" } },
			});
		});
		await waitFor(() => projected!.selectedOptions[0]?.label === "Selected 1");
		expect(projected!.selectedOptions[0]?.item?.parsedData).toEqual({
			title: "Selected 1",
		});
		expect(projected!.selectedOptions[0]?.item).not.toHaveProperty("data");
	});

	it.each([undefined, ["title", "title"]] as const)(
		"hydrates content list and detail hooks without fetching a different response shape (%s fields)",
		async (fields) => {
			const apiClient = createApiClient<CMSApiRouter>({
				baseURL: "https://app.example.com",
				basePath: "/api/data",
			});
			const queries = createCMSQueryKeys(apiClient);
			const serverQueryClient = new QueryClient();
			const item = {
				id: contentItem.id,
				slug: contentItem.slug,
				parsedData: contentItem.parsedData,
				createdAt: contentItem.createdAt,
				updatedAt: contentItem.updatedAt,
			};
			serverQueryClient.setQueryData(
				queries.cmsContent.list({
					typeSlug: "article",
					limit: 10,
					view: "content",
					fields,
				}).queryKey,
				{
					pages: [{ items: [item], total: 1, limit: 10, offset: 0 }],
					pageParams: [0],
				},
			);
			serverQueryClient.setQueryData(
				queries.cmsContent.detail("article", item.id, {
					view: "content",
					fields,
				}).queryKey,
				item,
			);
			const browserQueryClient = new QueryClient();
			hydrate(browserQueryClient, dehydrate(serverQueryClient));
			const stack = createClientStack({
				api: { baseURL: "https://app.example.com", basePath: "/api/data" },
				site: { baseURL: "https://app.example.com", basePath: "/pages" },
				queryClient: browserQueryClient,
				plugins: { cms: cmsClientPlugin() },
			});
			const fetchMock = vi.spyOn(globalThis, "fetch");
			function Probe() {
				const list = useSuspenseContent("article", { view: "content", fields });
				const detail = useSuspenseContentItem("article", item.id, {
					view: "content",
					fields,
				});
				return (
					<span>{`${list.items[0]?.parsedData.title}:${detail.item?.slug}`}</span>
				);
			}
			await act(async () =>
				root.render(
					<StackProvider stack={stack}>
						<Suspense fallback={<span>loading</span>}>
							<Probe />
						</Suspense>
					</StackProvider>,
				),
			);
			expect(container.textContent).toBe("Runtime article:runtime-article");
			expect(fetchMock).not.toHaveBeenCalled();
		},
	);

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
			const items = records.slice(offset, offset + limit);
			return jsonResponse({
				items:
					url.searchParams.get("view") === "content"
						? items.map(({ id, slug, parsedData, createdAt, updatedAt }) => ({
								id,
								slug,
								parsedData,
								createdAt,
								updatedAt,
							}))
						: items,
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
		let content: ReturnType<typeof useContentByRelation>;
		let inverseContent: ReturnType<typeof useInverseRelationItems>;
		function Probe() {
			small = useContentByRelation("article", "categoryId", "category-1", {
				limit: 1,
			});
			large = useContentByRelation("article", "categoryId", "category-1", {
				limit: 2,
			});
			content = useContentByRelation("article", "categoryId", "category-1", {
				limit: 1,
				view: "content",
			});
			const params = {
				contentTypeSlug: "category",
				sourceType: "article",
				itemId: "category-1",
				fieldName: "categoryId",
			};
			first = useInverseRelationItems(params, { limit: 1, offset: 0 });
			second = useInverseRelationItems(params, { limit: 1, offset: 1 });
			inverseContent = useInverseRelationItems(params, {
				limit: 1,
				offset: 1,
				view: "content",
			});
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
				!second?.isLoading &&
				!content?.isLoading &&
				!inverseContent?.isLoading,
		);
		expect(small!.items.map((item) => item.id)).toEqual(["item-1"]);
		expect(large!.items.map((item) => item.id)).toEqual(["item-1", "item-2"]);
		expect(first!.items.map((item) => item.id)).toEqual(["item-1"]);
		expect(second!.items.map((item) => item.id)).toEqual(["item-2"]);
		expect(content!.items.map((item) => item.id)).toEqual(["item-1"]);
		expect(inverseContent!.items.map((item) => item.id)).toEqual(["item-2"]);
		expect(small!.items[0]).toHaveProperty("data");
		expect(second!.items[0]).toHaveProperty("data");
		expect(content!.items[0]).not.toHaveProperty("data");
		expect(inverseContent!.items[0]).not.toHaveProperty("contentType");
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
			const responseItem =
				new URL(request.url).searchParams.get("view") === "content"
					? {
							id: item.id,
							slug: item.slug,
							parsedData: item.parsedData,
							createdAt: item.createdAt,
							updatedAt: item.updatedAt,
						}
					: item;
			return jsonResponse({
				items: [responseItem],
				total: 1,
				limit: 20,
				offset: 0,
			});
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { cms: cmsClientPlugin() },
		});
		let direct: ReturnType<typeof useContentByRelation>;
		let inverse: ReturnType<typeof useInverseRelationItems>;
		let content: ReturnType<typeof useContentByRelation>;
		let inverseContent: ReturnType<typeof useInverseRelationItems>;
		let update: ReturnType<typeof useUpdateContent>;
		let create: ReturnType<typeof useCreateContent>;
		let remove: ReturnType<typeof useDeleteContent>;
		function Probe() {
			direct = useContentByRelation("article", "categoryId", "category-1");
			content = useContentByRelation("article", "categoryId", "category-1", {
				view: "content",
				fields: ["title"],
			});
			inverse = useInverseRelationItems({
				contentTypeSlug: "category",
				sourceType: "article",
				itemId: "category-1",
				fieldName: "categoryId",
			});
			inverseContent = useInverseRelationItems(
				{
					contentTypeSlug: "category",
					sourceType: "article",
					itemId: "category-1",
					fieldName: "categoryId",
				},
				{ view: "content", fields: ["title"] },
			);
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
		await waitFor(
			() =>
				!direct?.isLoading &&
				!inverse?.isLoading &&
				!content?.isLoading &&
				!inverseContent?.isLoading,
		);
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
			await waitFor(() =>
				[direct, inverse, content, inverseContent].every(
					(result) =>
						result?.items[0]?.parsedData.title === `Revision ${index + 1}`,
				),
			);
			expect(direct!.items[0]).toHaveProperty("data");
			expect(inverse!.items[0]).toHaveProperty("data");
			expect(content!.items[0]).not.toHaveProperty("data");
			expect(inverseContent!.items[0]).not.toHaveProperty("contentType");
		}
	});

	it.each([undefined, ["title", "title"]] as const)(
		"hydrates direct and inverse content relation pages with matching client identities (%s fields)",
		async (fields) => {
			const queries = createCMSQueryKeys(
				createApiClient<CMSApiRouter>({
					baseURL: "https://app.example.com",
					basePath: "/api/data",
				}),
			);
			const item = {
				id: contentItem.id,
				slug: contentItem.slug,
				parsedData: contentItem.parsedData,
				createdAt: contentItem.createdAt,
				updatedAt: contentItem.updatedAt,
			};
			const serverQueryClient = new QueryClient();
			serverQueryClient.setQueryData(
				queries.cmsContent.byRelation({
					typeSlug: "article",
					field: "categoryId",
					targetId: "category-1",
					limit: 2,
					view: "content",
					fields,
				}).queryKey,
				{
					pages: [{ items: [item], total: 1, limit: 2, offset: 0 }],
					pageParams: [0],
				},
			);
			serverQueryClient.setQueryData(
				queries.cmsTypes.inverseRelationItems({
					slug: "category",
					sourceType: "article",
					itemId: "category-1",
					fieldName: "categoryId",
					limit: 1,
					offset: 5,
					view: "content",
					fields,
				}).queryKey,
				{ items: [item], total: 6, limit: 1, offset: 5 },
			);
			const queryClient = new QueryClient();
			hydrate(queryClient, dehydrate(serverQueryClient));
			const stack = createClientStack({
				api: { baseURL: "https://app.example.com", basePath: "/api/data" },
				site: { baseURL: "https://app.example.com", basePath: "/pages" },
				queryClient,
				plugins: { cms: cmsClientPlugin() },
			});
			const fetchMock = vi.spyOn(globalThis, "fetch");
			function Probe() {
				const direct = useSuspenseContentByRelation(
					"article",
					"categoryId",
					"category-1",
					{ limit: 2, view: "content", fields: fields ? ["title"] : undefined },
				);
				const inverse = useInverseRelationItems(
					{
						contentTypeSlug: "category",
						sourceType: "article",
						itemId: "category-1",
						fieldName: "categoryId",
					},
					{
						limit: 1,
						offset: 5,
						view: "content",
						fields: fields ? ["title"] : undefined,
					},
				);
				expect(direct.items[0]).not.toHaveProperty("data");
				expect(inverse.items[0]).not.toHaveProperty("contentType");
				return (
					<span>{`${direct.items[0]?.slug}:${inverse.items[0]?.parsedData.title}`}</span>
				);
			}
			await act(async () =>
				root.render(
					<StackProvider stack={stack}>
						<Suspense fallback={<span>loading</span>}>
							<Probe />
						</Suspense>
					</StackProvider>,
				),
			);
			expect(container.textContent).toBe("runtime-article:Runtime article");
			expect(fetchMock).not.toHaveBeenCalled();
		},
	);

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
