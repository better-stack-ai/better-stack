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

function reactRouterLoaderArgs(splat: string) {
	return {
		request: new Request(`http://test.local/${splat}`),
		params: { "*": splat },
		context: undefined,
	};
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

	it("supports an async request-aware stack client when rendering", async () => {
		const queryClient = makeQueryClient();
		const pageProps = { params: params(["account"]) };
		const page = createNextPage({
			getStackClient: async (currentQueryClient, currentPageProps) => {
				const { all } = await currentPageProps.params;
				return makeStackClient({
					[`/${all?.join("/")}`]: {
						PageComponent: () => <div>request-aware page</div>,
					},
				})(currentQueryClient);
			},
			getQueryClient: () => queryClient,
		});

		const element = await page.Page(pageProps);
		const html = renderToString(
			<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
		);
		expect(html).toContain("request-aware page");
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

	it("generateMetadata awaits a request-aware stack client", async () => {
		const page = createNextPage({
			getStackClient: async (queryClient, { params: pageParams }) => {
				const { all } = await pageParams;
				return makeStackClient({
					[`/${all?.join("/")}`]: {
						meta: () => [{ name: "title", content: "Request Metadata" }],
					},
				})(queryClient);
			},
			getQueryClient: makeQueryClient,
		});

		const metadata = await page.generateMetadata({
			params: params(["account"]),
		});

		expect(metadata).toMatchObject({ title: "Request Metadata" });
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

	it("generateMetadata calls notFound when no route matches", async () => {
		const notFound = vi.fn(() => {
			throw new Error("NEXT_NOT_FOUND_TEST");
		});
		const page = createNextPage({
			getStackClient: makeStackClient({}),
			getQueryClient: makeQueryClient,
			notFound: notFound as unknown as () => never,
		});

		await expect(
			page.generateMetadata({ params: params(["missing"]) }),
		).rejects.toThrow("NEXT_NOT_FOUND_TEST");
		expect(notFound).toHaveBeenCalledOnce();
	});
});

describe("createReactRouterPage", () => {
	it("creates an async request-aware loader without changing the render client", async () => {
		const queryClient = makeQueryClient();
		const page = createReactRouterPage({
			getStackClient: makeStackClient({}),
			getQueryClient: () => queryClient,
		});
		const loader = page.createLoader<{ role: string }>(
			async (currentQueryClient, { request, context }) => {
				const role = context.role;
				const requestRole = request.headers.get("x-role");
				return makeStackClient({
					"/account": {
						meta: () => [{ name: "viewer", content: `${role}:${requestRole}` }],
					},
				})(currentQueryClient);
			},
		);

		const data = await loader({
			params: { "*": "account" },
			request: new Request("http://test.local/account", {
				headers: { "x-role": "member" },
			}),
			context: { role: "admin" },
		});

		expect(data.meta).toEqual([{ name: "viewer", content: "admin:member" }]);
	});

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

		const data = await page.loader(reactRouterLoaderArgs("blog"));
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

		const data = await page.loader(reactRouterLoaderArgs("broken"));
		const errored = data.dehydratedState.queries.find(
			(q) => q.state.status === "error",
		);
		expect(errored).toBeDefined();
	});

	it("supports custom ErrorBoundary and dehydrateOptions overrides", async () => {
		const queryClient = makeQueryClient();
		const CustomErrorBoundary = () => <div>custom error</div>;
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
			ErrorBoundary: CustomErrorBoundary,
			dehydrateOptions: { shouldDehydrateQuery: () => false },
		});

		expect(page.ErrorBoundary).toBe(CustomErrorBoundary);
		const data = await page.loader(reactRouterLoaderArgs("broken"));
		expect(data.dehydratedState.queries).toHaveLength(0);
	});
});

describe("createTanStackPageOptions", () => {
	it("awaits a context-aware stack client for isomorphic loaders", async () => {
		const queryClient = makeQueryClient();
		const options = createTanStackPageOptions<{ role: string }>({
			getStackClient: makeStackClient({}),
			getQueryClient: () => queryClient,
			getLoaderStackClient: async (currentQueryClient, { context }) =>
				makeStackClient({
					"/account": {
						meta: () => [{ title: `Account for ${context.role}` }],
					},
				})(currentQueryClient),
		});

		const data = await options.loader({
			params: { _splat: "account" },
			context: { role: "admin" },
		});

		expect(data).toEqual({ meta: [{ title: "Account for admin" }] });
	});

	it("loader throws notFound() when no route matches", async () => {
		const options = createTanStackPageOptions({
			getStackClient: makeStackClient({}),
			getQueryClient: makeQueryClient,
		});

		await expect(
			options.loader({ params: { _splat: "missing" }, context: undefined }),
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
