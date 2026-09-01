import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { createClientStack } from "../../../client";
import { defineClientPlugin } from "../../client";
import { defineRoute } from "@btst/yar";
import { mediaClientPlugin } from "../client";
import {
	ROUTE_DOCS_QUERY_KEY,
	routeDocsClientPlugin,
} from "../../route-docs/client";
import type { RouteDocsSchema } from "../../route-docs/generator";

const { mediaPageModuleLoaded } = vi.hoisted(() => ({
	mediaPageModuleLoaded: { value: false },
}));

vi.mock("../client/components/pages/library-page", () => {
	mediaPageModuleLoaded.value = true;
	return { LibraryPageComponent: () => null };
});

function jsonResponse(value: unknown, status = 200) {
	return new Response(JSON.stringify(value), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function responseFor(input: RequestInfo | URL) {
	const url = new URL(input instanceof Request ? input.url : String(input));
	if (url.pathname.endsWith("/media/assets")) {
		return { items: [], total: 0 };
	}
	if (url.pathname.endsWith("/media/folders")) return [];
	return {};
}

function requestDetails(input: RequestInfo | URL, init?: RequestInit) {
	const request = input instanceof Request ? input : new Request(input, init);
	return { url: request.url, headers: request.headers };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Media and Route Docs resolved client runtime", () => {
	it("keeps the Media plugin definition server-import safe", () => {
		expect(mediaPageModuleLoaded.value).toBe(false);
		createClientStack({
			api: { baseURL: "https://api.example.com", basePath: "/api" },
			site: { baseURL: "https://app.example.com", basePath: "/" },
			queryClient: new QueryClient(),
			plugins: { media: mediaClientPlugin() },
		});
		expect(mediaPageModuleLoaded.value).toBe(false);
	});

	it("uses literal IDs and projects only browser-safe Media factory state", () => {
		const queryClient = new QueryClient();
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient,
			plugins: {
				media: mediaClientPlugin({ uploadMode: "s3" }),
				routeDocs: routeDocsClientPlugin(),
			},
		});

		expect(stack.provider.queryClient).toBe(queryClient);
		expect(stack.provider.plugins.media.id).toBe("media");
		expect(stack.provider.plugins.routeDocs.id).toBe("routeDocs");
		expect(stack.provider.plugins.media.config).toEqual({ uploadMode: "s3" });
		expect(stack.provider.plugins.media.config).not.toHaveProperty("headers");
		expect(stack.provider.plugins.media.config).not.toHaveProperty(
			"identityPartition",
		);
		expect(stack.provider.plugins.routeDocs.config).toBeUndefined();
	});

	it("drives Media loading, metadata, and hydration from one inherited runtime", async () => {
		const queryClient = new QueryClient();
		const requests: Array<{ url: string; headers: Headers }> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			requests.push(requestDetails(input, init));
			return jsonResponse(responseFor(input));
		});
		const identityPartition = { id: "media-user" };
		const stack = createClientStack({
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
				headers: {
					authorization: "Bearer server-token",
					cookie: "session=server",
					"x-request": "request-value",
				},
			},
			site: { baseURL: "https://www.example.com", basePath: "/pages" },
			queryClient,
			plugins: {
				media: mediaClientPlugin({ identityPartition }),
			},
		});

		const route = stack.router.getRoute("/media");
		await route?.loader?.();
		const metadata = await route?.meta?.();

		expect(queryClient.getQueryCache().getAll()).toHaveLength(2);
		expect(metadata).toContainEqual({
			property: "og:url",
			content: "https://www.example.com/pages/media",
		});
		expect(requests).toHaveLength(2);
		for (const request of requests) {
			expect(request.url).toMatch(
				/^https:\/\/app\.example\.com\/api\/data\/media\//,
			);
			expect(request.headers.get("authorization")).toBe("Bearer server-token");
			expect(request.headers.get("cookie")).toBe("session=server");
			expect(request.headers.get("x-request")).toBe("request-value");
		}
	});

	it("uses a same-origin Media path override for every loader request", async () => {
		const requests: string[] = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			requests.push(input instanceof Request ? input.url : String(input));
			return jsonResponse(responseFor(input));
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { media: mediaClientPlugin() },
			endpoints: { media: { api: { basePath: "/api/media" } } },
		});

		await stack.router.getRoute("/media")?.loader?.();

		expect(requests).toHaveLength(2);
		for (const url of requests) {
			expect(url).toMatch(/^https:\/\/app\.example\.com\/api\/media\/media\//);
		}
	});

	it("isolates request headers when Media crosses origins", async () => {
		const requests: Array<{ url: string; headers: Headers }> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			requests.push(requestDetails(input, init));
			return jsonResponse(responseFor(input));
		});
		const stack = createClientStack({
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
				headers: {
					authorization: "Bearer server-token",
					cookie: "session=server",
					"x-request": "request-value",
				},
			},
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { media: mediaClientPlugin() },
			endpoints: {
				media: {
					api: {
						baseURL: "https://media.example.net",
						basePath: "/btst/media",
						browserHeaders: { "x-public-client": "public-value" },
					},
				},
			},
		});

		await stack.router.getRoute("/media")?.loader?.();

		expect(requests).toHaveLength(2);
		for (const request of requests) {
			expect(request.url).toMatch(
				/^https:\/\/media\.example\.net\/btst\/media\/media\//,
			);
			expect(request.headers.get("authorization")).toBeNull();
			expect(request.headers.get("cookie")).toBeNull();
			expect(request.headers.get("x-request")).toBeNull();
			expect(request.headers.get("x-public-client")).toBe("public-value");
		}
	});

	it("cannot revive removed Media transport fields and joins a root site mount", async () => {
		const requests: Headers[] = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			requests.push(requestDetails(input, init).headers);
			return jsonResponse(responseFor(input));
		});
		const legacyConfig = {
			apiBaseURL: "https://legacy.example.com",
			headers: {
				authorization: "Bearer hidden-plugin-token",
				cookie: "session=hidden-plugin",
			},
		} as unknown as Parameters<typeof mediaClientPlugin>[0];
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { media: mediaClientPlugin(legacyConfig) },
			endpoints: {
				media: {
					api: {
						baseURL: "https://media.example.net",
						basePath: "/btst/media",
					},
					site: {
						baseURL: "https://media-pages.example.net",
						basePath: "/",
					},
				},
			},
		});

		const route = stack.router.getRoute("/media");
		await route?.loader?.();
		const metadata = await route?.meta?.();

		expect(metadata).toContainEqual({
			property: "og:url",
			content: "https://media-pages.example.net/media",
		});
		expect(requests.length).toBeGreaterThan(0);
		for (const headers of requests) {
			expect(headers.get("authorization")).toBeNull();
			expect(headers.get("cookie")).toBeNull();
		}
	});

	it("contains Media error observers and reports a loader failure once", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({ message: "unavailable" }, 500),
		);
		const onErrorLoad = vi.fn((_error: Error, _context: unknown) => {
			throw new Error("reporter failed");
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { media: mediaClientPlugin({ hooks: { onErrorLoad } }) },
		});

		await expect(
			stack.router.getRoute("/media")?.loader?.(),
		).resolves.toBeUndefined();
		expect(onErrorLoad).toHaveBeenCalledTimes(1);
		expect(onErrorLoad.mock.calls[0]?.[1]).toMatchObject({
			path: "/media",
			isSSR: true,
			apiBaseURL: "https://app.example.com",
			apiBasePath: "/api/data",
		});
	});

	it("keeps Route Docs client-only and resolves site overrides independently", async () => {
		const queryClient = new QueryClient();
		const probe = defineClientPlugin({
			id: "probe",
			resolve: (runtime) => ({
				routes: () => ({
					probe: defineRoute("/probe", {
						page: () => null,
						meta: () => [{ title: "Probe" }],
					}),
				}),
				sitemap: () => [
					{ url: `${runtime.site.baseURL}${runtime.site.basePath}/probe` },
				],
			}),
		});
		const stack = createClientStack({
			api: { baseURL: "https://api.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient,
			plugins: {
				probe,
				routeDocs: routeDocsClientPlugin({
					title: "Routes",
					description: "Resolved routes",
				}),
			},
			endpoints: {
				routeDocs: {
					site: {
						baseURL: "https://docs.example.net",
						basePath: "/",
					},
				},
			},
		});

		const route = stack.router.getRoute("/route-docs");
		await route?.loader?.();
		const metadata = await route?.meta?.();
		const schema = queryClient.getQueriesData<RouteDocsSchema>({
			queryKey: ROUTE_DOCS_QUERY_KEY,
		})[0]?.[1];

		expect(schema?.plugins.map((plugin) => plugin.key)).toEqual(["probe"]);
		expect(metadata).toContainEqual({
			property: "og:url",
			content: "https://docs.example.net/route-docs",
		});
		expect(stack.provider.plugins.routeDocs.site).toEqual({
			baseURL: "https://docs.example.net",
			basePath: "/",
		});
	});

	it("keeps Route Docs page props serializable across the Next RSC boundary", () => {
		const stack = createClientStack({
			api: { baseURL: "https://api.example.com", basePath: "/api" },
			site: { baseURL: "https://site.example.com", basePath: "/" },
			queryClient: new QueryClient(),
			plugins: { routeDocs: routeDocsClientPlugin() },
		});
		const route = stack.context.plugins.routeDocs!.routes(stack.context)
			.docs as {
			def?: { page?: () => { props: Record<string, unknown> } };
		};
		const props = route.def?.page?.().props;

		expect(props).toBeDefined();
		expect(props).not.toHaveProperty("loadSchema");
		expect(Object.values(props ?? {})).not.toContainEqual(expect.any(Function));
		expect(() => JSON.stringify(props)).not.toThrow();
	});

	it("isolates Route Docs loader caches for structurally identical stacks", async () => {
		const createProbe = (label: string) =>
			defineClientPlugin({
				id: "probe",
				resolve: () => ({
					routes: () => ({
						probe: defineRoute("/probe", { page: () => null }, undefined, {
							title: label,
						}),
					}),
					sitemap: () => [
						{
							url: `https://stack-${label.endsWith("A") ? "a" : "b"}.example.com/probe`,
						},
					],
				}),
			});
		const queryClient = new QueryClient();
		const stackA = createClientStack({
			api: { baseURL: "https://api.example.com", basePath: "/api" },
			site: { baseURL: "https://site.example.com", basePath: "/" },
			queryClient,
			plugins: {
				probe: createProbe("Stack A"),
				routeDocs: routeDocsClientPlugin(),
			},
		});
		const stackB = createClientStack({
			api: { baseURL: "https://api.example.com", basePath: "/api" },
			site: { baseURL: "https://site.example.com", basePath: "/" },
			queryClient,
			plugins: {
				probe: createProbe("Stack B"),
				routeDocs: routeDocsClientPlugin(),
			},
		});

		await stackA.router.getRoute("/route-docs")?.loader?.();
		expect(
			queryClient
				.getQueriesData<RouteDocsSchema>({ queryKey: ROUTE_DOCS_QUERY_KEY })
				.map(([, schema]) => ({
					title: schema?.plugins[0]?.routes[0]?.meta?.title,
					sitemap: schema?.allSitemapEntries[0]?.url,
				})),
		).toEqual([
			{
				title: "Stack A",
				sitemap: "https://stack-a.example.com/probe",
			},
		]);
		expect(queryClient.getQueryData(ROUTE_DOCS_QUERY_KEY)).toBeUndefined();

		await stackB.router.getRoute("/route-docs")?.loader?.();
		expect(
			queryClient
				.getQueriesData<RouteDocsSchema>({ queryKey: ROUTE_DOCS_QUERY_KEY })
				.map(([, schema]) => ({
					title: schema?.plugins[0]?.routes[0]?.meta?.title,
					sitemap: schema?.allSitemapEntries[0]?.url,
				}))
				.sort((left, right) =>
					String(left.title).localeCompare(String(right.title)),
				),
		).toEqual([
			{
				title: "Stack A",
				sitemap: "https://stack-a.example.com/probe",
			},
			{
				title: "Stack B",
				sitemap: "https://stack-b.example.com/probe",
			},
		]);
	});

	it("reuses Route Docs loader data across equivalent stack reconstruction", async () => {
		const queryClient = new QueryClient();
		const createEquivalentStack = (apiBaseURL: string, apiBasePath: string) =>
			createClientStack({
				api: { baseURL: apiBaseURL, basePath: apiBasePath },
				site: { baseURL: "https://site.example.com", basePath: "/" },
				queryClient,
				plugins: {
					probe: defineClientPlugin({
						id: "probe",
						resolve: () => ({
							routes: () => ({
								probe: defineRoute(
									"/probe/:id",
									{ page: () => null },
									{ query: z.object({ view: z.string().optional() }) },
									{ title: "Equivalent probe" },
								),
							}),
							sitemap: () => [
								{ url: "https://site.example.com/probe/example" },
							],
						}),
					}),
					routeDocs: routeDocsClientPlugin(),
				},
			});
		const loaderStack = createEquivalentStack(
			"http://internal-api:3000",
			"/internal-api",
		);
		const pageStack = createEquivalentStack(
			"https://api.example.com",
			"/public-api",
		);
		const getPageQueryKey = (stack: typeof loaderStack) => {
			const route = stack.context.plugins.routeDocs!.routes(stack.context)
				.docs as {
				def?: { page?: () => { props: { queryKey: readonly unknown[] } } };
			};
			return route.def?.page?.().props.queryKey;
		};

		await loaderStack.router.getRoute("/route-docs")?.loader?.();
		const loaderKey = getPageQueryKey(loaderStack);
		const pageKey = getPageQueryKey(pageStack);
		if (!loaderKey || !pageKey)
			throw new Error("Route Docs key was not created");

		expect(pageKey).toEqual(loaderKey);
		expect(queryClient.getQueryData(pageKey)).toBe(
			queryClient.getQueryData(loaderKey),
		);
		expect(
			queryClient.getQueriesData({ queryKey: ROUTE_DOCS_QUERY_KEY }),
		).toHaveLength(1);
	});

	it("isolates otherwise identical Route Docs stacks by sitemap output", async () => {
		const queryClient = new QueryClient();
		const createStack = (sitemapURL: string) =>
			createClientStack({
				api: { baseURL: "https://api.example.com", basePath: "/api" },
				site: { baseURL: "https://site.example.com", basePath: "/" },
				queryClient,
				plugins: {
					probe: defineClientPlugin({
						id: "probe",
						resolve: () => ({
							routes: () => ({
								probe: defineRoute("/probe", { page: () => null }, undefined, {
									title: "Same probe",
								}),
							}),
							sitemap: async () => [{ url: sitemapURL }],
						}),
					}),
					routeDocs: routeDocsClientPlugin(),
				},
			});
		const stackA = createStack("https://site.example.com/probe-a");
		const stackB = createStack("https://site.example.com/probe-b");
		const getPageQueryKey = (stack: typeof stackA) => {
			const route = stack.context.plugins.routeDocs!.routes(stack.context)
				.docs as {
				def?: { page?: () => { props: { queryKey: readonly unknown[] } } };
			};
			return route.def?.page?.().props.queryKey;
		};

		await stackA.router.getRoute("/route-docs")?.loader?.();
		const keyA = getPageQueryKey(stackA);
		await stackB.router.getRoute("/route-docs")?.loader?.();
		const keyB = getPageQueryKey(stackB);
		if (!keyA || !keyB) throw new Error("Route Docs key was not created");

		expect(keyB).not.toEqual(keyA);
		expect(
			queryClient.getQueryData<RouteDocsSchema>(keyA)?.allSitemapEntries[0]
				?.url,
		).toBe("https://site.example.com/probe-a");
		expect(
			queryClient.getQueryData<RouteDocsSchema>(keyB)?.allSitemapEntries[0]
				?.url,
		).toBe("https://site.example.com/probe-b");
		expect(
			queryClient.getQueriesData({ queryKey: ROUTE_DOCS_QUERY_KEY }),
		).toHaveLength(2);

		const reconstructedAKey = getPageQueryKey(
			createStack("https://site.example.com/probe-a"),
		);
		const reconstructedBKey = getPageQueryKey(
			createStack("https://site.example.com/probe-b"),
		);
		if (!reconstructedAKey || !reconstructedBKey) {
			throw new Error("Reconstructed Route Docs key was not created");
		}
		expect(reconstructedAKey).not.toEqual(keyB);
		expect(reconstructedBKey).not.toEqual(keyB);
		expect(reconstructedAKey).not.toEqual(reconstructedBKey);
	});
});
