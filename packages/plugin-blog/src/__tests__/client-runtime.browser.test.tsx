// @vitest-environment jsdom
import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { act, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "@btst/stack/client";
import { StackProvider, useIdentity } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { z } from "zod";
import { createApiClient } from "@btst/stack/plugins/client";
import type { BlogApiRouter } from "../api";
import { blogClientPlugin } from "../client";
import {
	useCreatePost,
	usePost,
	usePostRevisions,
	useRestorePostRevision,
	useSuspensePosts,
} from "../client/hooks";
import { createBlogQueryKeys } from "../query-keys";
import type { SerializedPost, SerializedPostRevision } from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const post = {
	id: "post-1",
	title: "Runtime post",
	content: "Runtime content",
	excerpt: "Runtime excerpt",
	slug: "runtime-post",
	published: true,
	image: undefined,
	tags: [],
	authorId: "author-1",
	publishedAt: "2026-01-02T00:00:00.000Z",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-03T00:00:00.000Z",
} as SerializedPost;

const revisionAuthorization = defineAuthorization({
	identity: z.object({ id: z.string(), role: z.string().optional() }),
	permissions: [] as const,
	rules: () => [],
});
const privateRevision: SerializedPostRevision = {
	id: "private-revision",
	postId: post.id,
	version: 1,
	actorId: "private-editor-actor",
	createdAt: post.updatedAt,
	title: "Private draft",
	content: "Private unsent body",
	excerpt: "Private excerpt",
	slug: "private-draft",
	published: false,
	tags: [],
};
const revisionPage = { items: [privateRevision], total: 1 };
const historyData = { pages: [revisionPage], pageParams: [0] };
function deniedHistory() {
	return new Response(JSON.stringify({ message: "Forbidden" }), {
		status: 403,
		headers: { "content-type": "application/json" },
	});
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

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

describe("Blog browser runtime", () => {
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

	it("hydrates Blog hooks through the resolved stack cache without refetching", async () => {
		const serverQueryClient = new QueryClient();
		const queryKeys = createBlogQueryKeys(
			createApiClient<BlogApiRouter>({
				baseURL: "https://app.example.com",
				basePath: "/api/data",
			}),
		);
		const listQuery = queryKeys.posts.list({
			limit: 10,
			published: true,
		});
		serverQueryClient.setQueryData(listQuery.queryKey, {
			pages: [[post]],
			pageParams: [0],
		});

		const browserQueryClient = new QueryClient();
		hydrate(browserQueryClient, dehydrate(serverQueryClient));
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: browserQueryClient,
			plugins: { blog: blogClientPlugin() },
		});
		const fetchMock = vi.spyOn(globalThis, "fetch");

		function Probe() {
			const { posts } = useSuspensePosts({ published: true });
			return <span>{posts[0]?.title}</span>;
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

		expect(container.textContent).toBe("Runtime post");
		expect(fetchMock).not.toHaveBeenCalled();
		expect(stack.provider.queryClient).toBe(browserQueryClient);
	});

	it("uses the resolved Blog endpoint for browser queries and mutations", async () => {
		const requests: Array<{
			url: string;
			headers: Headers;
			method: string;
			credentials?: RequestCredentials;
		}> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request = {
				url: input instanceof Request ? input.url : String(input),
				headers: new Headers(
					input instanceof Request ? input.headers : init?.headers,
				),
				method:
					input instanceof Request ? input.method : (init?.method ?? "GET"),
				credentials:
					input instanceof Request ? input.credentials : init?.credentials,
			};
			requests.push(request);
			return request.method === "GET"
				? jsonResponse({ items: [post], total: 1, limit: 1, offset: 0 })
				: jsonResponse(post);
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { blog: blogClientPlugin() },
			endpoints: {
				blog: {
					api: {
						baseURL: "https://content.example.net",
						basePath: "/btst/blog",
						browserHeaders: { "x-public-client": "public-value" },
						credentials: "include",
					},
				},
			},
		});

		let query: ReturnType<typeof usePost> | undefined;
		let create: ReturnType<typeof useCreatePost> | undefined;
		function Probe() {
			query = usePost("runtime-post");
			create = useCreatePost();
			return null;
		}

		await act(async () => {
			root.render(
				<StackProvider stack={stack}>
					<Probe />
				</StackProvider>,
			);
		});
		await waitFor(() => query?.isLoading === false);
		await act(async () => {
			await create?.mutateAsync({
				title: post.title,
				content: post.content,
				excerpt: post.excerpt,
				slug: post.slug,
				published: true,
				tags: [],
			});
		});

		expect(query?.post).toEqual(post);
		expect(requests).toHaveLength(2);
		for (const request of requests) {
			expect(request.url).toMatch(
				/^https:\/\/content\.example\.net\/btst\/blog\//,
			);
			expect(request.headers.get("x-public-client")).toBe("public-value");
			expect(request.headers.get("authorization")).toBeNull();
			expect(request.headers.get("cookie")).toBeNull();
			expect(request.credentials).toBe("include");
		}
	});

	it("uses a same-origin path-only Blog endpoint for browser queries and mutations", async () => {
		const requests: Array<{ url: string; method: string }> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request = {
				url: input instanceof Request ? input.url : String(input),
				method:
					input instanceof Request ? input.method : (init?.method ?? "GET"),
			};
			requests.push(request);
			return request.method === "GET"
				? jsonResponse({ items: [post], total: 1, limit: 1, offset: 0 })
				: jsonResponse(post);
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { blog: blogClientPlugin() },
			endpoints: { blog: { api: { basePath: "/api/blog" } } },
		});

		let query: ReturnType<typeof usePost> | undefined;
		let create: ReturnType<typeof useCreatePost> | undefined;
		function Probe() {
			query = usePost("runtime-post");
			create = useCreatePost();
			return null;
		}

		await act(async () => {
			root.render(
				<StackProvider stack={stack}>
					<Probe />
				</StackProvider>,
			);
		});
		await waitFor(() => query?.isLoading === false);
		await act(async () => {
			await create?.mutateAsync({
				title: post.title,
				content: post.content,
				excerpt: post.excerpt,
				slug: post.slug,
				published: true,
				tags: [],
			});
		});

		expect(query?.post).toEqual(post);
		expect(requests).toHaveLength(2);
		expect(requests).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					url: expect.stringMatching(
						/^https:\/\/app\.example\.com\/api\/blog\/posts\?slug=runtime-post&/,
					),
					method: "GET",
				}),
				expect.objectContaining({
					url: "https://app.example.com/api/blog/posts",
					method: "POST",
				}),
			]),
		);
	});

	it("loads history only when opened, paginates it, and sends the editor version on restore", async () => {
		const revisions = Array.from(
			{ length: 21 },
			(_, index): SerializedPostRevision => ({
				id: `revision-${21 - index}`,
				postId: post.id,
				version: 21 - index,
				actorId: "editor-1",
				createdAt: post.updatedAt,
				title: `Saved version ${21 - index}`,
				content: "Saved content",
				excerpt: "Saved excerpt",
				slug: "saved-post",
				published: false,
				tags: [],
			}),
		);
		const requests: Array<{ url: URL; body?: string }> = [];
		let conflict = true;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			requests.push({ url, body: init?.body as string | undefined });
			if (url.pathname.endsWith("/restore")) {
				if (conflict)
					return new Response(JSON.stringify({ message: "Post changed" }), {
						status: 409,
						headers: { "content-type": "application/json" },
					});
				return jsonResponse({ ...post, revisionVersion: 22 });
			}
			const offset = Number(url.searchParams.get("offset"));
			return jsonResponse({
				items: revisions.slice(offset, offset + 20),
				total: 21,
				offset,
				limit: 20,
				currentVersion: 21,
			});
		});
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient,
			plugins: { blog: blogClientPlugin() },
		});
		let history: ReturnType<typeof usePostRevisions> | undefined;
		let restore: ReturnType<typeof useRestorePostRevision> | undefined;
		function Probe({ open }: { open: boolean }) {
			history = usePostRevisions(post.id, open);
			restore = useRestorePostRevision();
			return null;
		}
		const render = async (open: boolean) =>
			act(async () => {
				root.render(
					<StackProvider stack={stack}>
						<Probe open={open} />
					</StackProvider>,
				);
			});
		await render(false);
		expect(requests).toHaveLength(0);
		await render(true);
		await waitFor(() => history?.revisions.length === 20);
		expect(history?.hasNextPage).toBe(true);
		await act(async () => {
			await history?.fetchNextPage();
		});
		await waitFor(() => history?.revisions.length === 21);
		expect(history?.hasNextPage).toBe(false);
		expect(requests.map(({ url }) => url.searchParams.get("offset"))).toEqual([
			"0",
			"20",
		]);
		await act(async () => {
			await expect(
				restore?.mutateAsync({
					id: post.id,
					revisionId: "revision-1",
					expectedVersion: 7,
				}),
			).rejects.toMatchObject({ statusCode: 409 });
		});
		expect(JSON.parse(requests[2]!.body!)).toEqual({ expectedVersion: 7 });
		expect(requests[2]!.url.pathname).toBe(
			`/api/data/posts/${post.id}/revisions/revision-1/restore`,
		);
		conflict = false;
		await act(async () => {
			await restore?.mutateAsync({
				id: post.id,
				revisionId: "revision-1",
				expectedVersion: 21,
			});
		});
		expect(queryClient.getQueryData(["posts", "detail", post.slug])).toEqual({
			...post,
			revisionVersion: 22,
		});
		queryClient.clear();
	});

	it("isolates private history across resolved identities and authorization refreshes", async () => {
		const alice = { id: "alice", role: "editor" };
		const bob = { id: "bob", role: "reader" };
		const lookup = deferred<typeof alice>();
		let nextIdentity: typeof alice | Promise<typeof alice> = lookup.promise;
		const auth = createClientAuth({
			authorization: revisionAuthorization,
			getIdentity: () => nextIdentity,
		});
		let allowed = false;
		const fetch = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(async () =>
				allowed ? jsonResponse(revisionPage) : deniedHistory(),
			);
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const keys = createBlogQueryKeys(vi.fn());
		const aliceKey = keys.postRevisions.list(post.id, alice).queryKey;
		queryClient.setQueryData(aliceKey, historyData);
		const stack = createClientStack({
			api: { baseURL: "https://app.test", basePath: "/api/data" },
			site: { baseURL: "https://app.test", basePath: "/pages" },
			queryClient,
			plugins: { blog: blogClientPlugin() },
		});
		let history: ReturnType<typeof usePostRevisions> | undefined;
		let refreshIdentity: ReturnType<typeof useIdentity>["refetch"] | undefined;
		const seen: unknown[] = [];
		function Probe() {
			history = usePostRevisions(post.id);
			refreshIdentity = useIdentity().refetch;
			seen.push({ data: history.data, revisions: history.revisions });
			return <span>{history.revisions[0]?.content}</span>;
		}
		const render = (identity: typeof alice) =>
			root.render(
				<StackProvider stack={stack} auth={auth} initialIdentity={identity}>
					<Probe />
				</StackProvider>,
			);
		await act(async () => render(alice));
		expect(history?.data).toEqual(historyData);
		expect(container.textContent).toBe(privateRevision.content);
		expect(fetch).not.toHaveBeenCalled();
		seen.length = 0;
		await act(async () => {
			void refreshIdentity?.();
		});
		expect(history?.data).toBeUndefined();
		expect(history?.revisions).toEqual([]);
		expect(queryClient.getQueryData(aliceKey)).toBeUndefined();
		expect(fetch).not.toHaveBeenCalled();
		await act(async () => lookup.resolve(bob));
		await waitFor(() => history?.isError === true);
		expect(history?.error).toMatchObject({ statusCode: 403 });
		expect(history?.data).toBeUndefined();
		expect(history?.revisions).toEqual([]);
		expect(JSON.stringify(seen)).not.toContain(privateRevision.content);
		expect(JSON.stringify(seen)).not.toContain(privateRevision.actorId);

		// A new validated role for the same user must not reuse the old partition.
		allowed = true;
		const editorBob = { ...bob, role: "editor" };
		await act(async () => render(editorBob));
		await waitFor(() => history?.revisions.length === 1);
		const editorKey = queryClient
			.getQueryCache()
			.findAll({ queryKey: ["postRevisions"] })
			.find((query) => query.state.data)?.queryKey;
		expect(editorKey).toBeDefined();
		allowed = false;
		nextIdentity = editorBob;
		seen.length = 0;
		await act(async () => {
			await refreshIdentity?.();
		});
		await waitFor(() => history?.isError === true);
		expect(history?.data).toBeUndefined();
		expect(history?.revisions).toEqual([]);
		expect(queryClient.getQueryData(editorKey!)).toBeUndefined();
		expect(JSON.stringify(seen)).not.toContain(privateRevision.content);
		expect(fetch).toHaveBeenCalledTimes(3);
		queryClient.clear();
	});

	it.each([null, undefined])(
		"never reads legacy private history on initial anonymous/pending identity (%s)",
		async (initialIdentity) => {
			const lookup = deferred<{ id: string } | null>();
			const auth = createClientAuth({
				authorization: revisionAuthorization,
				getIdentity: () => lookup.promise,
			});
			const fetch = vi
				.spyOn(globalThis, "fetch")
				.mockResolvedValue(deniedHistory());
			const queryClient = new QueryClient({
				defaultOptions: { queries: { retry: false } },
			});
			const legacyKey = createBlogQueryKeys(vi.fn()).postRevisions.list(
				post.id,
			).queryKey;
			expect(legacyKey).toEqual(["postRevisions", "list", post.id]);
			queryClient.setQueryData(legacyKey, historyData);
			const stack = createClientStack({
				api: { baseURL: "https://app.test", basePath: "/api/data" },
				site: { baseURL: "https://app.test", basePath: "/pages" },
				queryClient,
				plugins: { blog: blogClientPlugin() },
			});
			let history: ReturnType<typeof usePostRevisions> | undefined;
			const seen: unknown[] = [];
			function Probe() {
				history = usePostRevisions(post.id);
				seen.push({ data: history.data, revisions: history.revisions });
				return null;
			}
			await act(async () =>
				root.render(
					<StackProvider
						stack={stack}
						auth={auth}
						initialIdentity={initialIdentity}
					>
						<Probe />
					</StackProvider>,
				),
			);
			expect(history?.data).toBeUndefined();
			expect(history?.revisions).toEqual([]);
			expect(queryClient.getQueryData(legacyKey)).toBeUndefined();
			expect(JSON.stringify(seen)).not.toContain(privateRevision.content);
			if (initialIdentity === undefined) {
				expect(fetch).not.toHaveBeenCalled();
				await act(async () => lookup.reject(new Error("Identity unavailable")));
				await waitFor(() => history?.error?.message === "Identity unavailable");
				expect(history?.data).toBeUndefined();
				expect(history?.revisions).toEqual([]);
				expect(fetch).not.toHaveBeenCalled();
			} else {
				await waitFor(() => history?.isError === true);
				expect(fetch).toHaveBeenCalledOnce();
			}
			queryClient.clear();
		},
	);

	it("cancels old private history so delayed responses cannot repopulate a switched identity", async () => {
		const oldResponse = deferred<Response>();
		const fetch = vi
			.spyOn(globalThis, "fetch")
			.mockImplementationOnce(() => oldResponse.promise)
			.mockResolvedValue(deniedHistory());
		const auth = createClientAuth({
			authorization: revisionAuthorization,
			getIdentity: () => null,
		});
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.test", basePath: "/api/data" },
			site: { baseURL: "https://app.test", basePath: "/pages" },
			queryClient,
			plugins: { blog: blogClientPlugin() },
		});
		let history: ReturnType<typeof usePostRevisions> | undefined;
		function Probe() {
			history = usePostRevisions(post.id);
			return null;
		}
		const render = (identity: { id: string }) =>
			root.render(
				<StackProvider stack={stack} auth={auth} initialIdentity={identity}>
					<Probe />
				</StackProvider>,
			);
		const alice = { id: "alice" };
		await act(async () => render(alice));
		expect(fetch).toHaveBeenCalledOnce();
		const oldKey = createBlogQueryKeys(vi.fn()).postRevisions.list(
			post.id,
			alice,
		).queryKey;
		await act(async () => render({ id: "bob" }));
		await waitFor(() => history?.isError === true);
		await act(async () => oldResponse.resolve(jsonResponse(revisionPage)));
		expect(queryClient.getQueryData(oldKey)).toBeUndefined();
		expect(history?.data).toBeUndefined();
		expect(history?.revisions).toEqual([]);
		expect(
			queryClient
				.getQueryCache()
				.findAll({ queryKey: ["postRevisions"] })
				.every((query) => query.state.data === undefined),
		).toBe(true);
		queryClient.clear();
	});
});
