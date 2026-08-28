// @vitest-environment jsdom
import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "../../../client";
import { StackProvider } from "@btst/stack/context";
import { createApiClient } from "../../client";
import type { CommentsApiRouter } from "../api";
import { commentsClientPlugin } from "../client";
import { useComments, useUpdateComment } from "../client/hooks";
import { createCommentsQueryKeys } from "../query-keys";
import type { SerializedComment } from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const comment = {
	id: "comment-1",
	resourceId: "post-1",
	resourceType: "blog-post",
	parentId: null,
	authorId: "author-1",
	resolvedAuthorName: "Alice",
	resolvedAvatarUrl: null,
	body: "Runtime comment",
	status: "approved",
	likes: 0,
	isLikedByCurrentUser: false,
	editedAt: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	replyCount: 0,
} as SerializedComment;

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

describe("Comments browser runtime", () => {
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

	it("hydrates Comments hooks through the resolved stack cache without refetching", async () => {
		const params = {
			resourceId: "post-1",
			resourceType: "blog-post",
			status: "approved" as const,
		};
		const serverQueryClient = new QueryClient();
		const queryKeys = createCommentsQueryKeys(
			createApiClient<CommentsApiRouter>({
				baseURL: "https://app.example.com",
				basePath: "/api/data",
			}),
		);
		serverQueryClient.setQueryData(queryKeys.comments.list(params).queryKey, {
			items: [comment],
			total: 1,
			limit: 20,
			offset: 0,
		});

		const browserQueryClient = new QueryClient();
		hydrate(browserQueryClient, dehydrate(serverQueryClient));
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: browserQueryClient,
			plugins: { comments: commentsClientPlugin() },
		});
		const fetchMock = vi.spyOn(globalThis, "fetch");

		function Probe() {
			const { comments } = useComments(params);
			return <span>{comments[0]?.body}</span>;
		}

		await act(async () => {
			root.render(
				<StackProvider stack={stack}>
					<Probe />
				</StackProvider>,
			);
		});

		expect(container.textContent).toBe("Runtime comment");
		expect(fetchMock).not.toHaveBeenCalled();
		expect(stack.provider.queryClient).toBe(browserQueryClient);
	});

	it.each([
		[
			"same-origin path",
			{ api: { basePath: "/api/comments" } },
			/^https:\/\/app\.example\.com\/api\/comments\/comments/,
		],
		[
			"cross-origin endpoint",
			{
				api: {
					baseURL: "https://discussion.example.net",
					basePath: "/btst/comments",
					browserHeaders: { "x-public-client": "public-value" },
					credentials: "include" as const,
				},
			},
			/^https:\/\/discussion\.example\.net\/btst\/comments\/comments/,
		],
	] as const)(
		"uses the resolved %s for browser queries and mutations",
		async (_label, endpoint, expectedURL) => {
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
					? jsonResponse({ items: [comment], total: 1, limit: 20, offset: 0 })
					: jsonResponse({ ...comment, body: "Updated comment" });
			});
			const stack = createClientStack({
				api: { baseURL: "https://app.example.com", basePath: "/api/data" },
				site: { baseURL: "https://app.example.com", basePath: "/pages" },
				queryClient: new QueryClient(),
				plugins: { comments: commentsClientPlugin() },
				endpoints: { comments: endpoint },
			});

			let query: ReturnType<typeof useComments> | undefined;
			let update: ReturnType<typeof useUpdateComment> | undefined;
			function Probe() {
				query = useComments({
					resourceId: "post-1",
					resourceType: "blog-post",
				});
				update = useUpdateComment();
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
				await update?.mutateAsync({
					id: comment.id,
					body: "Updated comment",
				});
			});

			expect(query?.comments).toEqual([comment]);
			expect(requests.some((request) => request.method === "GET")).toBe(true);
			expect(requests.some((request) => request.method === "PATCH")).toBe(true);
			for (const request of requests) {
				expect(request.url).toMatch(expectedURL);
				expect(request.headers.get("authorization")).toBeNull();
				expect(request.headers.get("cookie")).toBeNull();
				if (_label === "cross-origin endpoint") {
					expect(request.headers.get("x-public-client")).toBe("public-value");
					expect(request.credentials).toBe("include");
				}
			}
		},
	);
});
