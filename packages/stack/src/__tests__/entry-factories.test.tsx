import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createNextPage, toNextRouteHandlers } from "../next";
import { createReactRouterPage, toReactRouterHandlers } from "../react-router";
import type {
	StackClientLike,
	StackRouteLike,
} from "../shared/entry-factories";
import { createTanStackPageOptions, toTanStackHandlers } from "../tanstack";

function makeStackClient(routes: Record<string, StackRouteLike>) {
	return (_queryClient: QueryClient): StackClientLike => ({
		router: {
			getRoute: (path: string) => routes[path] ?? null,
		},
	});
}

function makeQueryClient() {
	return new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
}

const okHandler = async (request: Request) =>
	new Response(`ok:${request.method}`);

describe("API route handler factories", () => {
	it("toNextRouteHandlers exposes the handler for all five methods", async () => {
		const handlers = toNextRouteHandlers(okHandler);
		expect(Object.keys(handlers)).toEqual([
			"GET",
			"POST",
			"PUT",
			"PATCH",
			"DELETE",
		]);
		const res = await handlers.POST(
			new Request("http://test.local/api/data", { method: "POST" }),
		);
		expect(await res.text()).toBe("ok:POST");
	});

	it("toReactRouterHandlers delegates loader and action to the handler", async () => {
		const { loader, action } = toReactRouterHandlers(okHandler);
		const getRes = await loader({
			request: new Request("http://test.local/api/data"),
		});
		expect(await getRes.text()).toBe("ok:GET");
		const postRes = await action({
			request: new Request("http://test.local/api/data", { method: "POST" }),
		});
		expect(await postRes.text()).toBe("ok:POST");
	});

	it("toTanStackHandlers delegates all five methods to the handler", async () => {
		const handlers = toTanStackHandlers(okHandler);
		expect(Object.keys(handlers)).toEqual([
			"GET",
			"POST",
			"PUT",
			"PATCH",
			"DELETE",
		]);
		const res = await handlers.DELETE({
			request: new Request("http://test.local/api/data", { method: "DELETE" }),
		});
		expect(await res.text()).toBe("ok:DELETE");
	});
});

describe("createNextPage", () => {
	const params = (all?: string[]) => Promise.resolve({ all });

	it("runs the loader and renders the page inside a HydrationBoundary", async () => {
		const calls: string[] = [];
		const queryClient = makeQueryClient();
		const page = createNextPage({
			getStackClient: makeStackClient({
				"/blog": {
					PageComponent: () => <div>blog page</div>,
					loader: async () => {
						calls.push("loader");
					},
				},
			}),
			getQueryClient: () => queryClient,
		});

		const element = await page.Page({ params: params(["blog"]) });
		const html = renderToString(
			<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
		);
		expect(calls).toEqual(["loader"]);
		expect(html).toContain("blog page");
	});

	it("calls notFound when no route matches", async () => {
		const notFound = vi.fn(() => {
			throw new Error("NEXT_NOT_FOUND_TEST");
		});
		const page = createNextPage({
			getStackClient: makeStackClient({}),
			getQueryClient: makeQueryClient,
			notFound: notFound as unknown as () => never,
		});

		await expect(page.Page({ params: params(["missing"]) })).rejects.toThrow(
			"NEXT_NOT_FOUND_TEST",
		);
		expect(notFound).toHaveBeenCalledOnce();
	});

	it("generateMetadata runs the loader before meta and converts elements", async () => {
		const calls: string[] = [];
		const page = createNextPage({
			getStackClient: makeStackClient({
				"/blog": {
					loader: async () => {
						calls.push("loader");
					},
					meta: () => {
						calls.push("meta");
						return [
							{ name: "title", content: "Blog Title" },
							{ name: "description", content: "Blog Description" },
						];
					},
				},
			}),
			getQueryClient: makeQueryClient,
		});

		const metadata = await page.generateMetadata({ params: params(["blog"]) });
		expect(calls).toEqual(["loader", "meta"]);
		expect(metadata).toMatchObject({
			title: "Blog Title",
			description: "Blog Description",
		});
	});

	it("generateMetadata returns {} without running the loader when the route has no meta", async () => {
		const loader = vi.fn();
		const page = createNextPage({
			getStackClient: makeStackClient({ "/blog": { loader } }),
			getQueryClient: makeQueryClient,
		});

		const metadata = await page.generateMetadata({ params: params(["blog"]) });
		expect(metadata).toEqual({});
		expect(loader).not.toHaveBeenCalled();
	});
});

describe("createReactRouterPage", () => {
	it("loader prefetches and returns path, dehydratedState and meta", async () => {
		const queryClient = makeQueryClient();
		const page = createReactRouterPage({
			getStackClient: makeStackClient({
				"/blog": {
					loader: async () => {
						await queryClient.prefetchQuery({
							queryKey: ["post"],
							queryFn: async () => "post data",
						});
					},
					meta: () => [{ name: "title", content: "Blog" }],
				},
			}),
			getQueryClient: () => queryClient,
		});

		const data = await page.loader({ params: { "*": "blog" } });
		expect(data.path).toBe("/blog");
		expect(data.meta).toEqual([{ name: "title", content: "Blog" }]);
		expect(data.dehydratedState.queries).toHaveLength(1);

		// meta() maps loader data through (supports both arg field names)
		expect(page.meta({ loaderData: data })).toEqual(data.meta);
		expect(page.meta({ data })).toEqual(data.meta);
	});

	it("dehydrates failed queries so the client does not refetch on error", async () => {
		const queryClient = makeQueryClient();
		const page = createReactRouterPage({
			getStackClient: makeStackClient({
				"/broken": {
					loader: async () => {
						await queryClient.prefetchQuery({
							queryKey: ["broken"],
							queryFn: async () => {
								throw new Error("boom");
							},
						});
					},
				},
			}),
			getQueryClient: () => queryClient,
		});

		const data = await page.loader({ params: { "*": "broken" } });
		const errored = data.dehydratedState.queries.find(
			(q) => q.state.status === "error",
		);
		expect(errored).toBeDefined();
	});
});

describe("createTanStackPageOptions", () => {
	it("loader throws notFound() when no route matches", async () => {
		const options = createTanStackPageOptions({
			getStackClient: makeStackClient({}),
			getQueryClient: makeQueryClient,
		});

		await expect(
			options.loader({ params: { _splat: "missing" } }),
		).rejects.toMatchObject({ isNotFound: true });
	});

	it("loader uses the router context queryClient, runs route.loader and returns meta", async () => {
		const contextQueryClient = makeQueryClient();
		const seen: QueryClient[] = [];
		const options = createTanStackPageOptions({
			getStackClient: (queryClient) => {
				seen.push(queryClient);
				return makeStackClient({
					"/blog": {
						loader: async () => {},
						meta: () => [{ title: "Blog" }],
					},
				})(queryClient);
			},
		});

		const data = await options.loader({
			params: { _splat: "blog" },
			context: { queryClient: contextQueryClient },
		});
		expect(seen).toEqual([contextQueryClient]);
		expect(data).toEqual({ meta: [{ title: "Blog" }] });
	});

	it("head falls back when there is no meta and passes meta through otherwise", () => {
		const options = createTanStackPageOptions({
			getStackClient: makeStackClient({}),
			getQueryClient: makeQueryClient,
		});

		expect(options.head({ loaderData: undefined })).toEqual({
			title: "No Meta",
			meta: [{ title: "No Meta" }],
		});
		const meta = [{ title: "Blog" }];
		expect(options.head({ loaderData: { meta } })).toEqual({ meta });
	});
});
