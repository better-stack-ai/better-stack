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
	useContent,
	useContentItem,
	useContentItemBySlug,
	useUpdateContent,
	useSuspenseContent,
	useSuspenseContentItem,
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
			const full = { ...contentItem, parsedData: { title } };
			const item =
				url.searchParams.get("view") === "content"
					? {
							id: full.id,
							slug: full.slug,
							parsedData: full.parsedData,
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
		let full: ReturnType<typeof useContentItem>;
		let content: ReturnType<typeof useContentItem>;
		let slug: ReturnType<typeof useContentItemBySlug>;
		let list: ReturnType<typeof useContent>;
		let update: ReturnType<typeof useUpdateContent>;
		function Probe() {
			full = useContentItem("article", "item-1");
			content = useContentItem("article", "item-1", { view: "content" });
			slug = useContentItemBySlug("article", "runtime-article", {
				view: "content",
			});
			list = useContent("article", { view: "content" });
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
				!!full?.item && !!content?.item && !!slug?.item && !!list?.items.length,
		);
		expect(full!.item).toHaveProperty("data");
		expect(content!.item).not.toHaveProperty("data");
		expect(slug!.item).not.toHaveProperty("data");
		expect(list!.items[0]).not.toHaveProperty("data");
		await act(async () => {
			await update!.mutateAsync({
				id: "item-1",
				data: { data: { title: "After" } },
			});
		});
		await waitFor(() =>
			[full?.item, content?.item, slug?.item, list?.items[0]].every(
				(item) => item?.parsedData.title === "After",
			),
		);
		expect(content!.item).not.toHaveProperty("data");
		expect(requests.some((value) => value.includes("view=content"))).toBe(true);
	});

	it("hydrates content list and detail hooks without fetching a different response shape", async () => {
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
			}).queryKey,
			{
				pages: [{ items: [item], total: 1, limit: 10, offset: 0 }],
				pageParams: [0],
			},
		);
		serverQueryClient.setQueryData(
			queries.cmsContent.detail("article", item.id, { view: "content" })
				.queryKey,
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
			const list = useSuspenseContent("article", { view: "content" });
			const detail = useSuspenseContentItem("article", item.id, {
				view: "content",
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
