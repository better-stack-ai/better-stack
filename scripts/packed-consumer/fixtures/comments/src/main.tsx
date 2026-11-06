import { commentsClientPlugin } from "@btst/plugin-comments/client";
import {
	CommentThread,
	CommentCount,
	ModerationPageComponent,
} from "@btst/plugin-comments/client/components";
import { commentsPermissions } from "@btst/plugin-comments/permissions";
import type { SerializedComment } from "@btst/plugin-comments/types";
import "@btst/plugin-comments/css";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { z } from "zod";

const comment: SerializedComment = {
	id: "v5-comment",
	resourceId: "post-1",
	resourceType: "post",
	parentId: null,
	authorId: "owner",
	resolvedAuthorName: "Alice",
	resolvedAvatarUrl: null,
	body: "Existing v5 comment",
	status: "approved",
	likes: 0,
	isLikedByCurrentUser: false,
	editedAt: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	replyCount: 0,
};
let records: SerializedComment[] = [
	comment,
	{
		...comment,
		id: "moderate-me",
		body: "Queued for approval",
		authorId: "other",
		status:
			localStorage.getItem("comments-approved") === "true"
				? "approved"
				: "pending",
	},
];
const requests: Array<{ url: string; method: string; headers: Headers }> = [];
Object.assign(window, { packedCommentsRequests: requests });
globalThis.fetch = async (input, init) => {
	const request =
		input instanceof Request ? input : new Request(String(input), init);
	const url = new URL(request.url);
	const method = request.method;
	requests.push({ url: url.href, method, headers: request.headers });
	const body = init?.body ? JSON.parse(String(init.body)) : undefined;
	if (method === "PATCH" && url.pathname.endsWith("/status")) {
		const id = url.pathname.split("/").at(-2);
		records = records.map((c) =>
			c.id === id ? { ...c, status: body.status } : c,
		);
		if (id === "moderate-me") localStorage.setItem("comments-approved", "true");
		return Response.json(records.find((c) => c.id === id));
	}
	if (method === "POST" && url.pathname.endsWith("/like")) {
		const id = url.pathname.split("/").at(-2);
		records = records.map((c) =>
			c.id === id
				? { ...c, likes: c.likes + 1, isLikedByCurrentUser: true }
				: c,
		);
		return Response.json({ liked: true, likes: 1 });
	}
	if (method === "POST" && url.pathname.endsWith("/comments")) {
		const created = {
			...comment,
			...body,
			id: `new-${records.length}`,
			authorId: "owner",
			resolvedAuthorName: "Alice",
			status: "pending" as const,
		};
		records.push(created);
		return Response.json(created);
	}
	if (method === "GET" && url.pathname.endsWith("/count"))
		return Response.json({
			count: records.filter((c) => c.status === "approved").length,
		});
	if (method === "GET" && url.pathname.endsWith("/comments")) {
		const status = url.searchParams.get("status") ?? "approved";
		const resource = url.searchParams.get("resourceId");
		const items = records.filter(
			(c) =>
				c.status === status &&
				(!resource || c.resourceId === resource) &&
				(url.searchParams.get("parentId") &&
				url.searchParams.get("parentId") !== "null"
					? c.parentId === url.searchParams.get("parentId")
					: c.parentId === null),
		);
		return Response.json({ items, total: items.length, limit: 20, offset: 0 });
	}
	throw new Error(`Unexpected Comments request: ${method} ${url}`);
};
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const stack = createClientStack({
	api: {
		baseURL: "https://example.test",
		basePath: "/api",
	},
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient,
	plugins: { comments: commentsClientPlugin() },
	endpoints: {
		comments: {
			api: {
				baseURL: "https://example.test",
				basePath: "/api",
				browserHeaders: { "x-public-client": "comments-fixture" },
				credentials: "include",
			},
		},
	},
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [commentsPermissions],
	rules: ({ comments }) => [
		comments.thread.read.allow(),
		comments.thread.createComment.allow(),
		comments.comment.edit.allow(),
		comments.comment.delete.allow(),
		comments.comment.react.allow(),
		comments.comment.moderate.allow(),
	],
});
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider
			stack={stack}
			router={{ navigate: () => undefined }}
			auth={createClientAuth({
				authorization,
				getIdentity: () => ({ id: "owner" }),
			})}
			initialIdentity={{ id: "owner" }}
		>
			<CommentCount resourceId="post-1" resourceType="post" />
			<CommentThread resourceId="post-1" resourceType="post" />
			<ModerationPageComponent />
		</StackProvider>
	</QueryClientProvider>,
);
