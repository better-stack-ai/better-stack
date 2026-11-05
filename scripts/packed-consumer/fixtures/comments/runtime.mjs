import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import * as core from "@btst/stack/api";
import * as auth from "@btst/stack/authorization";
import * as server from "@btst/stack/authorization/server";
import * as comments from "@btst/plugin-comments/api";
import * as permissions from "@btst/plugin-comments/permissions";
import { commentsClientPlugin } from "@btst/plugin-comments/client";
import { createCommentsQueryKeys } from "@btst/plugin-comments/query-keys";
import { createApiClient } from "@btst/stack/plugins/client";
import { createClientStack } from "@btst/stack/client";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { z } from "zod";
const require = createRequire(import.meta.url);
assert.throws(() => require.resolve("@btst/plugin-ai-chat/api"), {
	code: "MODULE_NOT_FOUND",
});
assert.throws(() => require.resolve("@btst/components"), {
	code: "MODULE_NOT_FOUND",
});
assert.equal(commentsClientPlugin().id, "comments");
assert.equal(
	require("@btst/plugin-comments/client").commentsClientPlugin().id,
	"comments",
);
async function verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	commentsBackendPlugin,
	commentsPermissions,
	listComments,
	serializeComment,
	COMMENTS_QUERY_KEYS,
}) {
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string(), role: z.enum(["user", "moderator"]) }),
		permissions: [commentsPermissions],
		rules: ({ comments }) => [
			comments.thread.read.when(
				({ identity, facts }) =>
					facts.scope === "public" ||
					(facts.scope === "own"
						? identity?.id === facts.authorId
						: identity?.role === "moderator"),
			),
			comments.thread.createComment.when(({ identity }) => identity !== null),
			comments.comment.edit.when(
				({ identity, facts }) => identity?.id === facts.authorId,
			),
			comments.comment.delete.when(
				({ identity, facts }) => identity?.id === facts.authorId,
			),
			comments.comment.react.when(
				({ identity, facts }) =>
					identity !== null && facts.status === "approved",
			),
			comments.comment.moderate.when(
				({ identity }) => identity?.role === "moderator",
			),
		],
	});
	const stack = createBackendStack({
		basePath: "/api",
		adapter: (db) => createMemoryAdapter(db)({}),
		plugins: {
			comments: commentsBackendPlugin({
				resolveUser: async (id) => ({ name: id, avatarUrl: null }),
			}),
		},
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => {
				const id = request.headers.get("x-user");
				return id
					? { id, role: request.headers.get("x-role") ?? "user" }
					: null;
			},
		}),
	});
	const request = (path, method = "GET", body, user, role = "user") =>
		stack.handler(
			new Request(`https://example.test/api${path}`, {
				method,
				headers: {
					...(user ? { "x-user": user, "x-role": role } : {}),
					...(body ? { "content-type": "application/json" } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		);
	// Literal v5 table/column data verifies the published package retains persisted identity.
	await stack.adapter.create({
		model: "comment",
		forceAllowId: true,
		data: {
			id: "v5-comment",
			resourceId: "post-1",
			resourceType: "post",
			parentId: null,
			authorId: "owner",
			body: "Existing v5 comment",
			status: "approved",
			likes: 0,
			createdAt: new Date("2026-01-01T00:00:00Z"),
			updatedAt: new Date("2026-01-01T00:00:00Z"),
		},
	});
	let response = await request("/comments?resourceId=post-1&resourceType=post");
	assert.equal(response.status, 200);
	let result = await response.json();
	assert.equal(result.items[0].id, "v5-comment");
	assert.equal(result.items[0].body, "Existing v5 comment");
	assert.equal(result.items[0].createdAt, "2026-01-01T00:00:00.000Z");
	response = await request("/comments", "POST", {
		resourceId: "post-1",
		resourceType: "post",
		body: "Anonymous",
	});
	assert.equal(response.status, 401);
	response = await request(
		"/comments",
		"POST",
		{ resourceId: "post-1", resourceType: "post", body: "" },
		"owner",
	);
	assert.equal(response.status, 400);
	response = await request(
		"/comments",
		"POST",
		{
			resourceId: "post-1",
			resourceType: "post",
			body: "Pending reply",
			parentId: "v5-comment",
		},
		"owner",
	);
	assert.equal(response.status, 200);
	const reply = await response.json();
	assert.equal(reply.parentId, "v5-comment");
	assert.equal(reply.authorId, "owner");
	assert.equal(reply.status, "pending");
	response = await request(
		"/comments?resourceId=post-1&resourceType=post&parentId=v5-comment",
	);
	assert.equal((await response.json()).items.length, 0);
	response = await request(
		`/comments/${reply.id}/status`,
		"PATCH",
		{ status: "approved" },
		"viewer",
	);
	assert.equal(response.status, 403);
	response = await request(
		`/comments/${reply.id}/status`,
		"PATCH",
		{ status: "approved" },
		"mod",
		"moderator",
	);
	assert.equal(response.status, 200);
	response = await request(
		`/comments/${reply.id}`,
		"PATCH",
		{ body: "Edited reply" },
		"viewer",
	);
	assert.equal(response.status, 403);
	response = await request(
		`/comments/${reply.id}`,
		"PATCH",
		{ body: "Edited reply" },
		"owner",
	);
	assert.equal(response.status, 200);
	assert.equal((await response.json()).body, "Edited reply");
	response = await request(
		"/comments?resourceId=post-1&resourceType=post&parentId=v5-comment",
	);
	assert.equal((await response.json()).items[0].body, "Edited reply");
	response = await request("/comments/v5-comment/like", "POST", {}, "viewer");
	assert.equal(response.status, 200);
	response = await request("/comments?resourceId=post-1&resourceType=post");
	result = await response.json();
	assert.equal(result.items.find((c) => c.id === "v5-comment").likes, 1);
	response = await request(
		"/comments?status=pending",
		"GET",
		undefined,
		"viewer",
	);
	assert.equal(response.status, 403);
	const params = {
		resourceId: "post-1",
		resourceType: "post",
		status: "approved",
	};
	const direct = await listComments(stack.adapter, params);
	const stored = await stack.adapter.findOne({
		model: "comment",
		where: [{ field: "id", value: "v5-comment" }],
	});
	assert.equal(serializeComment(stored).createdAt, "2026-01-01T00:00:00.000Z");
	const cache = new QueryClient();
	cache.setQueryData(COMMENTS_QUERY_KEYS.commentsList(params), {
		...direct,
		items: direct.items,
	});
	assert.doesNotThrow(() => JSON.stringify(dehydrate(cache)));
	return { request, result };
}
await verify({ ...core, ...auth, ...server, ...comments, ...permissions });
await verify({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-comments/api"),
	...require("@btst/plugin-comments/permissions"),
});
// SSR shares the installed public query factory, retains request headers and separates moderation cache.
const queryClient = new QueryClient();
const calls = [];
globalThis.fetch = async (input, init) => {
	calls.push({ url: String(input), headers: new Headers(init?.headers) });
	return Response.json({ items: [], total: 0, limit: 20, offset: 0 });
};
const client = createClientStack({
	api: {
		baseURL: "https://example.test",
		basePath: "/api",
		headers: { "x-user": "mod" },
	},
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient,
	plugins: { comments: commentsClientPlugin() },
});
await client.router.getRoute("/comments/moderation").loader();
assert.equal(calls.length, 1);
assert.equal(calls[0].headers.get("x-user"), "mod");
assert.equal(queryClient.getQueryCache().getAll().length, 1);
const query = createCommentsQueryKeys(
	createApiClient({ baseURL: "https://example.test", basePath: "/api" }),
);
assert.notDeepEqual(
	query.comments.list({ resourceId: "post-1", resourceType: "post" }).queryKey,
	query.comments.list({ status: "pending" }).queryKey,
);
