// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { defineRoute } from "@btst/yar";
import { act, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "../../../client";
import { StackProvider } from "@btst/stack/context";
import { defineClientPlugin } from "../../client";
import { useAssets, useRegisterAsset, useUploadAsset } from "../client/hooks";
import {
	createMediaUploadConfig,
	mediaClientPlugin,
	uploadAsset,
} from "../client";
import {
	ROUTE_DOCS_QUERY_KEY,
	routeDocsClientPlugin,
	useRegisteredRoutes,
} from "../../route-docs/client";
import type { RouteDocsSchema } from "../../route-docs/generator";

const { putBlob } = vi.hoisted(() => ({
	putBlob: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({ put: putBlob }));

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const asset = {
	id: "asset-1",
	filename: "runtime.txt",
	originalName: "runtime.txt",
	mimeType: "text/plain",
	size: 7,
	url: "https://files.example/runtime.txt",
	createdAt: "2026-01-01T00:00:00.000Z",
};

function jsonResponse(value: unknown) {
	return new Response(JSON.stringify(value), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

async function waitFor(check: () => boolean, timeout = 3_000) {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeout) throw new Error("waitFor timed out");
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});
	}
}

describe("Media and Route Docs browser runtime", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		putBlob.mockReset();
		putBlob.mockResolvedValue({ url: "https://blob.example/runtime.txt" });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.restoreAllMocks();
	});

	it("uses the one resolved Media endpoint for queries, JSON mutations, and uploads", async () => {
		const requests: Array<{
			url: string;
			method: string;
			headers: Headers;
			credentials: RequestCredentials;
		}> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request =
				input instanceof Request ? input : new Request(input, init);
			requests.push({
				url: request.url,
				method: request.method,
				headers: request.headers,
				credentials: request.credentials,
			});
			if (request.method === "GET") {
				return jsonResponse({ items: [asset], total: 1 });
			}
			return jsonResponse(asset);
		});
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient,
			plugins: { media: mediaClientPlugin({ uploadMode: "direct" }) },
			endpoints: {
				media: {
					api: {
						baseURL: "https://media.example.net",
						basePath: "/btst/media",
						browserHeaders: { "x-public-client": "public-value" },
						credentials: "include",
					},
				},
			},
		});

		let assetsQuery: ReturnType<typeof useAssets> | undefined;
		let register:
			| ReturnType<typeof useRegisterAsset>["mutateAsync"]
			| undefined;
		let upload: ReturnType<typeof useUploadAsset>["mutateAsync"] | undefined;
		function Probe() {
			assetsQuery = useAssets({ limit: 1 });
			register = useRegisterAsset().mutateAsync;
			upload = useUploadAsset().mutateAsync;
			return null;
		}

		await act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<StackProvider
						stack={stack}
						overrides={{ media: { imageCompression: false } }}
					>
						<Probe />
					</StackProvider>
				</QueryClientProvider>,
			);
		});
		await waitFor(() => assetsQuery?.isLoading === false);
		await act(async () => {
			await register?.({
				url: asset.url,
				filename: asset.filename,
				mimeType: asset.mimeType,
				size: asset.size,
			});
			await upload?.({
				file: new File(["runtime"], "runtime.txt", { type: "text/plain" }),
			});
		});

		expect(assetsQuery?.data?.pages[0]?.items[0]?.filename).toBe("runtime.txt");
		expect(requests.some((request) => request.method === "GET")).toBe(true);
		expect(
			requests.filter((request) => request.method === "POST").length,
		).toBeGreaterThanOrEqual(2);
		for (const request of requests) {
			expect(request.url).toMatch(
				/^https:\/\/media\.example\.net\/btst\/media\/media\//,
			);
			expect(request.headers.get("x-public-client")).toBe("public-value");
			expect(request.headers.get("authorization")).toBeNull();
			expect(request.headers.get("cookie")).toBeNull();
			expect(request.credentials).toBe("include");
		}
	});

	it("forwards resolved transport to the Vercel Blob token exchange", async () => {
		const requests: Array<{
			url: string;
			headers: Headers;
			credentials: RequestCredentials;
			body: unknown;
		}> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request =
				input instanceof Request ? input : new Request(input, init);
			requests.push({
				url: request.url,
				headers: request.headers,
				credentials: request.credentials,
				body: await request.clone().json(),
			});
			return request.url.endsWith("/media/upload/vercel-blob")
				? jsonResponse({ clientToken: "vercel_blob_client_runtime" })
				: jsonResponse(asset);
		});

		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: {
				media: mediaClientPlugin({ uploadMode: "vercel-blob" }),
			},
			endpoints: {
				media: {
					api: {
						baseURL: "https://media.example.net",
						basePath: "/btst/media",
						browserHeaders: { "x-public-client": "public-value" },
						credentials: "include",
					},
				},
			},
		});
		const result = await uploadAsset(
			createMediaUploadConfig(stack.provider.plugins.media, {
				imageCompression: false,
			}),
			{
				file: new File(["runtime"], "runtime.txt", { type: "text/plain" }),
				folderId: "folder-1",
			},
		);

		expect(result).toEqual(asset);
		expect(requests).toHaveLength(2);
		expect(requests[0]).toMatchObject({
			url: "https://media.example.net/btst/media/media/upload/vercel-blob",
			credentials: "include",
			body: {
				type: "blob.generate-client-token",
				payload: {
					pathname: "runtime.txt",
					callbackUrl:
						"https://media.example.net/btst/media/media/upload/vercel-blob",
					multipart: false,
				},
			},
		});
		expect(requests[0]?.headers.get("x-public-client")).toBe("public-value");
		expect(requests[1]).toMatchObject({
			url: "https://media.example.net/btst/media/media/assets",
			credentials: "include",
		});
		expect(requests[1]?.headers.get("x-public-client")).toBe("public-value");
		expect(putBlob).toHaveBeenCalledWith("runtime.txt", expect.any(File), {
			access: "public",
			token: "vercel_blob_client_runtime",
		});
	});

	it.each([
		{
			mode: "direct" as const,
			expectedBtstUrls: ["https://media.example.net/media/upload"],
		},
		{
			mode: "s3" as const,
			expectedBtstUrls: [
				"https://media.example.net/media/upload/token",
				"https://media.example.net/media/assets",
			],
		},
		{
			mode: "vercel-blob" as const,
			expectedBtstUrls: [
				"https://media.example.net/media/upload/vercel-blob",
				"https://media.example.net/media/assets",
			],
		},
	])("joins Media $mode uploads to a root API mount", async (testCase) => {
		const btstUrls: string[] = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url === "https://storage.example.net/presigned") {
				return new Response(null, { status: 200 });
			}
			btstUrls.push(url);
			if (url.endsWith("/media/upload/token")) {
				return jsonResponse({
					type: "presigned-url",
					payload: {
						uploadUrl: "https://storage.example.net/presigned",
						publicUrl: "https://files.example/runtime.txt",
						key: "runtime.txt",
						method: "PUT",
						headers: {},
					},
				});
			}
			if (url.endsWith("/media/upload/vercel-blob")) {
				return jsonResponse({ clientToken: "vercel_blob_client_runtime" });
			}
			return jsonResponse(asset);
		});

		await uploadAsset(
			{
				apiBaseURL: "https://media.example.net",
				apiBasePath: "/",
				uploadMode: testCase.mode,
				imageCompression: false,
			},
			{
				file: new File(["runtime"], "runtime.txt", { type: "text/plain" }),
			},
		);

		expect(btstUrls).toEqual(testCase.expectedBtstUrls);
		expect(
			btstUrls.every((url) => !new URL(url).pathname.startsWith("//")),
		).toBe(true);
	});

	it("uses Route Docs' resolved cross-origin site for rendered navigation", async () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData<RouteDocsSchema>(ROUTE_DOCS_QUERY_KEY, {
			plugins: [
				{
					key: "probe",
					name: "probe",
					routes: [
						{
							key: "home",
							path: "/probe",
							pathParams: [],
							queryParams: [],
						},
					],
					sitemapEntries: [],
				},
			],
			generatedAt: "2026-01-01T00:00:00.000Z",
			allSitemapEntries: [],
		});
		const stack = createClientStack({
			api: { baseURL: "https://api.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient,
			plugins: { routeDocs: routeDocsClientPlugin() },
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
		const PageComponent = route?.PageComponent;
		const open = vi.spyOn(window, "open").mockImplementation(() => null);

		await act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<StackProvider stack={stack}>
						<Suspense fallback={<span>loading</span>}>
							{PageComponent ? <PageComponent /> : null}
						</Suspense>
					</StackProvider>
				</QueryClientProvider>,
			);
		});
		await waitFor(() => container.textContent?.includes("Visit") ?? false);
		const visitButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent?.includes("Visit"),
		);
		await act(async () => visitButton?.click());

		expect(container.textContent).toContain("https://docs.example.net/probe");
		expect(open).toHaveBeenCalledWith(
			"https://docs.example.net/probe",
			"_blank",
			"noopener,noreferrer",
		);
	});

	it("binds route introspection to the enclosing or explicitly supplied stack", async () => {
		const createStack = (path: string) =>
			createClientStack({
				api: { baseURL: "https://api.example.com", basePath: "/api" },
				site: { baseURL: "https://app.example.com", basePath: "/" },
				queryClient: new QueryClient(),
				plugins: {
					probe: defineClientPlugin({
						id: "probe",
						resolve: () => ({
							routes: () => ({
								probe: defineRoute(path, { page: () => null }),
							}),
							sitemap: () => [],
						}),
					}),
					routeDocs: routeDocsClientPlugin(),
				},
			});
		const stackA = createStack("/probe-a");
		const stackB = createStack("/probe-b");
		const routes: Record<string, ReturnType<typeof useRegisteredRoutes>> = {};
		function Probe({
			name,
			source,
		}: {
			name: string;
			source?: Parameters<typeof useRegisteredRoutes>[0];
		}) {
			routes[name] = useRegisteredRoutes(source);
			return null;
		}

		await act(async () => {
			root.render(
				<>
					<StackProvider stack={stackA}>
						<Probe name="providerA" />
					</StackProvider>
					<StackProvider stack={stackB}>
						<Probe name="providerB" />
					</StackProvider>
					<Probe name="explicitA" source={stackA} />
				</>,
			);
		});

		expect(routes.providerA).toEqual([
			{ path: "/probe-a", plugin: "probe", key: "probe" },
		]);
		expect(routes.providerB).toEqual([
			{ path: "/probe-b", plugin: "probe", key: "probe" },
		]);
		expect(routes.explicitA).toEqual(routes.providerA);
	});
});
