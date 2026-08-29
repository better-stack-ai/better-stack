// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "../../../client";
import { StackProvider } from "@btst/stack/context";
import { useAssets, useRegisterAsset, useUploadAsset } from "../client/hooks";
import { mediaClientPlugin } from "../client";
import {
	ROUTE_DOCS_QUERY_KEY,
	routeDocsClientPlugin,
} from "../../route-docs/client";
import type { RouteDocsSchema } from "../../route-docs/generator";

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
		);
	});
});
