// @vitest-environment jsdom
import {
	dehydrate,
	hydrate,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { defineRoute } from "@btst/yar";
import { act, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "../../../client";
import { StackProvider } from "@btst/stack/context";
import { createReactRouterPage } from "../../../react-router";
import { defineClientPlugin } from "../../client";
import {
	useAssets,
	useCreateFolder,
	useFolders,
	useRegisterAsset,
	useUploadAsset,
} from "../client/hooks";
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
import { generateRouteDocsSchema } from "../../route-docs/generator";

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
const relativeAsset = { ...asset, url: "/uploads/runtime.txt" };
const secondRelativeAsset = {
	...relativeAsset,
	id: "asset-2",
	filename: "runtime-2.txt",
	originalName: "runtime-2.txt",
	url: "/uploads/runtime-2.txt",
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
		vi.unstubAllGlobals();
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
				const offset = new URL(request.url).searchParams.get("offset");
				return jsonResponse({
					items: [offset === "1" ? secondRelativeAsset : relativeAsset],
					total: 2,
				});
			}
			return jsonResponse(relativeAsset);
		});
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const foreignQueryClient = new QueryClient();
		const stackInvalidate = vi.spyOn(queryClient, "invalidateQueries");
		const foreignInvalidate = vi.spyOn(foreignQueryClient, "invalidateQueries");
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
		let registerMutation: ReturnType<typeof useRegisterAsset> | undefined;
		let upload: ReturnType<typeof useUploadAsset>["mutateAsync"] | undefined;
		let registeredAsset: typeof asset | undefined;
		let uploadedAsset: typeof asset | undefined;
		let probeRenderCount = 0;
		function Probe() {
			probeRenderCount += 1;
			assetsQuery = useAssets({ limit: 1 });
			registerMutation = useRegisterAsset();
			register = registerMutation.mutateAsync;
			upload = useUploadAsset().mutateAsync;
			return null;
		}

		const renderProbe = async () => {
			await act(async () => {
				root.render(
					<QueryClientProvider client={foreignQueryClient}>
						<StackProvider
							stack={stack}
							overrides={{ media: { imageCompression: false } }}
						>
							<Probe />
						</StackProvider>
					</QueryClientProvider>,
				);
			});
		};
		await renderProbe();
		await waitFor(() => assetsQuery?.isLoading === false);
		let refetchedURL: string | undefined;
		let nextPageURL: string | undefined;
		await act(async () => {
			const refetched = await assetsQuery?.refetch();
			refetchedURL = refetched?.data?.pages[0]?.items[0]?.url;
			const nextPage = await assetsQuery?.fetchNextPage();
			nextPageURL = nextPage?.data?.pages[1]?.items[0]?.url;
		});
		await act(async () => {
			registeredAsset = await register?.({
				url: asset.url,
				filename: asset.filename,
				mimeType: asset.mimeType,
				size: asset.size,
			});
			uploadedAsset = await upload?.({
				file: new File(["runtime"], "runtime.txt", { type: "text/plain" }),
			});
		});

		const resolvedURL = "https://media.example.net/uploads/runtime.txt";
		expect(refetchedURL).toBe(resolvedURL);
		expect(nextPageURL).toBe("https://media.example.net/uploads/runtime-2.txt");
		expect(assetsQuery?.data?.pages[0]?.items[0]).toMatchObject({
			filename: "runtime.txt",
			url: resolvedURL,
		});
		expect(registeredAsset?.url).toBe(resolvedURL);
		expect(uploadedAsset?.url).toBe(resolvedURL);

		let callbackAsset: typeof asset | undefined;
		let settledAsset: typeof asset | undefined;
		await act(async () => {
			registerMutation?.mutate(
				{
					url: asset.url,
					filename: asset.filename,
					mimeType: asset.mimeType,
					size: asset.size,
				},
				{
					onSuccess: (created) => {
						callbackAsset = created;
					},
					onSettled: (created) => {
						settledAsset = created;
					},
				},
			);
		});
		await waitFor(
			() =>
				registerMutation?.isSuccess === true &&
				callbackAsset !== undefined &&
				settledAsset !== undefined,
		);
		expect(registerMutation?.data?.url).toBe(resolvedURL);
		expect(callbackAsset?.url).toBe(resolvedURL);
		expect(settledAsset?.url).toBe(resolvedURL);
		const mutationData = registerMutation?.data;
		const renderCount = probeRenderCount;
		await renderProbe();
		expect(probeRenderCount).toBeGreaterThan(renderCount);
		expect(registerMutation?.data).toBe(mutationData);
		expect(queryClient.getMutationCache().getAll().length).toBeGreaterThan(0);
		expect(foreignQueryClient.getMutationCache().getAll()).toHaveLength(0);
		expect(stackInvalidate).toHaveBeenCalled();
		expect(foreignInvalidate).not.toHaveBeenCalled();
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

	it("isolates Media lists and invalidation by resolved endpoint", async () => {
		const requests: string[] = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request =
				input instanceof Request ? input : new Request(input, init);
			requests.push(`${request.method} ${request.url}`);
			const service = request.url.includes("media-a.example") ? "a" : "b";
			if (request.method === "POST") {
				return jsonResponse({
					id: `folder-${service}-created`,
					name: "Created",
				});
			}
			if (request.url.includes("/media/folders")) {
				return jsonResponse([
					{ id: `folder-${service}`, name: `Folder ${service}` },
				]);
			}
			return jsonResponse({
				items: [
					{
						...relativeAsset,
						id: `asset-${service}`,
						filename: `${service}.txt`,
					},
				],
				total: 1,
			});
		});
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const createStack = (service: "a" | "b") =>
			createClientStack({
				api: { baseURL: "https://app.example.com", basePath: "/api" },
				site: { baseURL: "https://app.example.com", basePath: "/pages" },
				queryClient,
				plugins: { media: mediaClientPlugin() },
				endpoints: {
					media: {
						api: {
							baseURL: `https://media-${service}.example`,
							basePath: `/api-${service}`,
						},
					},
				},
			});
		const stackA = createStack("a");
		const stackB = createStack("b");
		const filenames: Record<string, string | undefined> = {};
		const folderNames: Record<string, string | undefined> = {};
		let createFolderA:
			| ReturnType<typeof useCreateFolder>["mutateAsync"]
			| undefined;
		function Probe({ service }: { service: "a" | "b" }) {
			filenames[service] = useAssets({
				limit: 1,
			}).data?.pages[0]?.items[0]?.filename;
			folderNames[service] = useFolders().data?.[0]?.name;
			const createFolder = useCreateFolder().mutateAsync;
			if (service === "a") createFolderA = createFolder;
			return null;
		}

		await act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<StackProvider stack={stackA}>
						<Probe service="a" />
					</StackProvider>
					<StackProvider stack={stackB}>
						<Probe service="b" />
					</StackProvider>
				</QueryClientProvider>,
			);
		});
		await waitFor(
			() =>
				filenames.a === "a.txt" &&
				filenames.b === "b.txt" &&
				folderNames.a === "Folder a" &&
				folderNames.b === "Folder b",
		);
		await act(async () => {
			await createFolderA?.({ name: "Created" });
		});

		expect(
			requests.filter((request) =>
				request.startsWith("GET https://media-a.example/api-a/media/folders"),
			),
		).toHaveLength(2);
		expect(
			requests.filter((request) =>
				request.startsWith("GET https://media-b.example/api-b/media/folders"),
			),
		).toHaveLength(1);
		expect(
			queryClient.getQueriesData({ queryKey: ["mediaAssets", "list"] }),
		).toHaveLength(2);
		expect(
			queryClient.getQueriesData({ queryKey: ["mediaFolders", "list"] }),
		).toHaveLength(2);
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
				: jsonResponse(relativeAsset);
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

		expect(result).toEqual({
			...relativeAsset,
			url: "https://media.example.net/uploads/runtime.txt",
		});
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
		const foreignQueryClient = new QueryClient();
		const sitemap = vi.fn(() => []);
		const stack = createClientStack({
			api: { baseURL: "https://api.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient,
			plugins: {
				probe: defineClientPlugin({
					id: "probe",
					resolve: () => ({
						routes: () => ({
							home: defineRoute("/probe", { page: () => null }),
						}),
						sitemap,
					}),
				}),
				routeDocs: routeDocsClientPlugin(),
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
		const routeDefinition = stack.context.plugins.routeDocs!.routes(
			stack.context,
		).docs as {
			def?: { page?: () => { props: { queryKey: readonly unknown[] } } };
		};
		const queryKey = routeDefinition.def?.page?.().props.queryKey;
		if (!queryKey) throw new Error("Route Docs query key was not created");
		queryClient.setQueryData(
			queryKey,
			generateRouteDocsSchema(stack.context, []),
		);
		const PageComponent = route?.PageComponent;
		const open = vi.spyOn(window, "open").mockImplementation(() => null);

		await act(async () => {
			root.render(
				<QueryClientProvider client={foreignQueryClient}>
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
		expect(sitemap).not.toHaveBeenCalled();
		expect(
			foreignQueryClient.getQueriesData({ queryKey: ROUTE_DOCS_QUERY_KEY }),
		).toHaveLength(0);
	});

	it("renders the configured Route Docs page component", async () => {
		const queryClient = new QueryClient();
		const CustomDocsPage = () => <p>Ejected Route Docs page</p>;
		const stack = createClientStack({
			api: { baseURL: "https://api.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient,
			plugins: {
				routeDocs: routeDocsClientPlugin({
					pageComponents: { docs: CustomDocsPage },
				}),
			},
		});
		const PageComponent = stack.router.getRoute("/route-docs")?.PageComponent;

		await act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<StackProvider stack={stack}>
						{PageComponent ? <PageComponent /> : null}
					</StackProvider>
				</QueryClientProvider>,
			);
		});

		expect(container.textContent).toContain("Ejected Route Docs page");
	});

	it("isolates Route Docs pages that share one query client", async () => {
		const queryClient = new QueryClient();
		const createStack = (path: string) =>
			createClientStack({
				api: { baseURL: "https://api.example.com", basePath: "/api" },
				site: { baseURL: "https://app.example.com", basePath: "/" },
				queryClient,
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

		const renderStack = async (stack: typeof stackA) => {
			const PageComponent = stack.router.getRoute("/route-docs")?.PageComponent;
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
		};

		await renderStack(stackA);
		await waitFor(() => container.textContent?.includes("/probe-a") ?? false);
		await renderStack(stackB);
		await waitFor(() => container.textContent?.includes("/probe-b") ?? false);
		expect(container.textContent).not.toContain("/probe-a");
	});

	it("isolates client-generated Route Docs schemas by sitemap output", async () => {
		const queryClient = new QueryClient();
		const createStack = (sitemapURL: string) =>
			createClientStack({
				api: { baseURL: "https://api.example.com", basePath: "/api" },
				site: { baseURL: "https://app.example.com", basePath: "/" },
				queryClient,
				plugins: {
					probe: defineClientPlugin({
						id: "probe",
						resolve: () => ({
							routes: () => ({
								probe: defineRoute("/probe", { page: () => null }),
							}),
							sitemap: async () => [{ url: sitemapURL }],
						}),
					}),
					routeDocs: routeDocsClientPlugin(),
				},
			});
		const stackA = createStack("https://app.example.com/probe-a");
		const stackB = createStack("https://app.example.com/probe-b");

		const renderStack = async (stack: typeof stackA) => {
			const PageComponent = stack.router.getRoute("/route-docs")?.PageComponent;
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
		};

		await renderStack(stackA);
		await waitFor(
			() =>
				container.textContent?.includes("https://app.example.com/probe-a") ??
				false,
		);
		await renderStack(stackB);
		await waitFor(
			() =>
				container.textContent?.includes("https://app.example.com/probe-b") ??
				false,
		);

		expect(container.textContent).not.toContain(
			"https://app.example.com/probe-a",
		);
		expect(
			queryClient.getQueriesData({ queryKey: ROUTE_DOCS_QUERY_KEY }),
		).toHaveLength(2);
	});

	it("isolates hydrated Route Docs alias variants across reconstructed stacks", async () => {
		const createStack = (queryClient: QueryClient, sitemapURL: string) =>
			createClientStack({
				api: { baseURL: "https://api.example.com", basePath: "/api" },
				site: { baseURL: "https://app.example.com", basePath: "/" },
				queryClient,
				plugins: {
					probe: defineClientPlugin({
						id: "probe",
						resolve: () => ({
							routes: () => ({
								probe: defineRoute("/probe", { page: () => null }),
							}),
							sitemap: async () => [{ url: sitemapURL }],
						}),
					}),
					routeDocs: routeDocsClientPlugin(),
				},
			});

		const serverQueryClient = new QueryClient();
		const serverStackA = createStack(
			serverQueryClient,
			"https://app.example.com/probe-a",
		);
		const serverStackB = createStack(
			serverQueryClient,
			"https://app.example.com/probe-b",
		);
		vi.stubGlobal("window", undefined);
		try {
			await serverStackA.router.getRoute("/route-docs")?.loader?.();
			await serverStackB.router.getRoute("/route-docs")?.loader?.();
		} finally {
			vi.unstubAllGlobals();
		}

		const dehydrated = dehydrate(serverQueryClient);
		expect(() => JSON.stringify(dehydrated)).not.toThrow();
		const alias = dehydrated.queries.find(
			(query) =>
				query.queryKey[0] === "route-docs" &&
				query.queryKey[1] === "schema-key",
		)?.state.data;
		expect(alias).toEqual(
			expect.arrayContaining([expect.any(String), expect.any(String)]),
		);
		expect(alias).toHaveLength(2);

		const browserQueryClient = new QueryClient();
		hydrate(browserQueryClient, JSON.parse(JSON.stringify(dehydrated)));
		const browserStackA = createStack(
			browserQueryClient,
			"https://app.example.com/probe-a",
		);
		const browserStackB = createStack(
			browserQueryClient,
			"https://app.example.com/probe-b",
		);

		const pageProps = (stack: typeof browserStackA) => {
			const route = stack.context.plugins.routeDocs!.routes(stack.context)
				.docs as {
				def?: { page?: () => { props: { queryKey: readonly unknown[] } } };
			};
			return route.def?.page?.().props;
		};
		const propsA = pageProps(browserStackA);
		const propsB = pageProps(browserStackB);
		expect(() => JSON.stringify(propsA)).not.toThrow();
		expect(() => JSON.stringify(propsB)).not.toThrow();
		expect(propsA?.queryKey).not.toEqual(propsB?.queryKey);

		const renderStack = async (stack: typeof browserStackA) => {
			const PageComponent = stack.router.getRoute("/route-docs")?.PageComponent;
			await act(async () => {
				root.render(
					<QueryClientProvider client={browserQueryClient}>
						<StackProvider stack={stack}>
							<Suspense fallback={<span>loading</span>}>
								{PageComponent ? <PageComponent /> : null}
							</Suspense>
						</StackProvider>
					</QueryClientProvider>,
				);
			});
		};

		await renderStack(browserStackA);
		await waitFor(
			() =>
				container.textContent?.includes("https://app.example.com/probe-a") ??
				false,
		);
		await renderStack(browserStackB);
		await waitFor(
			() =>
				container.textContent?.includes("https://app.example.com/probe-b") ??
				false,
		);
		expect(container.textContent).not.toContain(
			"https://app.example.com/probe-a",
		);
	});

	it("resolves the React Router Route Docs key after its hydration boundary", async () => {
		const createStack = (
			queryClient: QueryClient,
			sitemap: () => Promise<Array<{ url: string }>>,
		) =>
			createClientStack({
				api: { baseURL: "https://api.example.com", basePath: "/api" },
				site: { baseURL: "https://app.example.com", basePath: "/pages" },
				queryClient,
				plugins: {
					probe: defineClientPlugin({
						id: "probe",
						resolve: () => ({
							routes: () => ({
								probe: defineRoute("/probe", { page: () => null }),
							}),
							sitemap,
						}),
					}),
					routeDocs: routeDocsClientPlugin(),
				},
			});
		const serverQueryClient = new QueryClient();
		const serverSitemapURL = "https://app.example.com/server-probe";
		const serverStack = createStack(serverQueryClient, async () => [
			{ url: serverSitemapURL },
		]);
		vi.stubGlobal("window", undefined);
		try {
			await serverStack.router.getRoute("/route-docs")?.loader?.();
		} finally {
			vi.unstubAllGlobals();
		}
		const dehydratedState = JSON.parse(
			JSON.stringify(dehydrate(serverQueryClient)),
		);

		const browserQueryClient = new QueryClient();
		const browserSitemap = vi.fn(async () => [
			{ url: "https://app.example.com/browser-probe" },
		]);
		// The layout creates its provider stack before the nested page's
		// HydrationBoundary runs, matching generated React Router applications.
		const layoutStack = createStack(browserQueryClient, browserSitemap);
		const hydratedAliasCounts: number[] = [];
		const page = createReactRouterPage({
			getStackClient: (queryClient) => {
				hydratedAliasCounts.push(
					queryClient.getQueriesData({
						queryKey: ["route-docs", "schema-key"],
					}).length,
				);
				return createStack(queryClient, browserSitemap);
			},
			getQueryClient: () => browserQueryClient,
		});
		const router = createMemoryRouter(
			[
				{
					id: "route-docs-page",
					path: "/pages/*",
					Component: page.Component,
				},
			],
			{
				initialEntries: ["/pages/route-docs"],
				hydrationData: {
					loaderData: {
						"route-docs-page": {
							path: "/route-docs",
							dehydratedState,
							meta: undefined,
						},
					},
				},
			},
		);

		await act(async () => {
			root.render(
				<QueryClientProvider client={browserQueryClient}>
					<StackProvider stack={layoutStack}>
						<RouterProvider router={router} />
					</StackProvider>
				</QueryClientProvider>,
			);
		});
		await waitFor(
			() => container.textContent?.includes(serverSitemapURL) ?? false,
		);

		expect(container.textContent).not.toContain(
			"https://app.example.com/browser-probe",
		);
		expect(hydratedAliasCounts).toEqual([1]);
		expect(browserSitemap).not.toHaveBeenCalled();
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
