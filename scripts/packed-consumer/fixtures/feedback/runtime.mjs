import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import * as core from "@btst/stack/api";
import * as auth from "@btst/stack/authorization";
import * as server from "@btst/stack/authorization/server";
import * as feedback from "@btst/plugin-feedback/api";
import * as permissions from "@btst/plugin-feedback/permissions";
import * as queries from "@btst/plugin-feedback/query-keys";
import { feedbackClientPlugin } from "@btst/plugin-feedback/client";
import { createClientStack } from "@btst/stack/client";
import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
const require = createRequire(import.meta.url);
for (const absent of ["blog", "ai-chat", "newsletter", "cms"])
	assert.throws(() => require.resolve(`@btst/plugin-${absent}/api`), {
		code: "MODULE_NOT_FOUND",
	});
assert.equal(feedbackClientPlugin().id, "feedback");
assert.equal(
	require("@btst/plugin-feedback/client").feedbackClientPlugin().id,
	"feedback",
);
function serializedMemoryAdapter(db) {
	const adapter = createMemoryAdapter(db)({});
	let tail = Promise.resolve();
	async function withLock(run) {
		let release;
		const previous = tail;
		tail = new Promise((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			return await run();
		} finally {
			release();
		}
	}
	const result = { ...adapter, id: "serialized-memory-test" };
	for (const method of [
		"create",
		"findOne",
		"findMany",
		"count",
		"update",
		"updateMany",
		"delete",
		"deleteMany",
		"consumeOne",
		"transaction",
	]) {
		result[method] = (input) => withLock(() => adapter[method](input));
	}
	return result;
}

async function verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	feedbackBackendPlugin,
	feedbackPermissions,
	createFeedbackQueryKeys,
}) {
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [feedbackPermissions],
		rules: ({ feedback: f }) => [
			f.post.read.allow(),
			f.post.create.when(({ identity }) => identity !== null),
			f.post.vote.when(({ identity }) => identity !== null),
			f.post.updateStatus.when(({ identity }) => identity?.id === "admin"),
			f.changelog.read.allow(),
			f.changelog.create.when(({ identity }) => identity?.id === "admin"),
		],
	});
	const stack = createBackendStack({
		basePath: "/api",
		plugins: { feedback: feedbackBackendPlugin() },
		adapter: serializedMemoryAdapter,
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => {
				const id = request.headers.get("x-user");
				return id ? { id } : null;
			},
		}),
	});
	const request = (id) =>
		new Request("https://example.test/api", {
			headers: id ? { "x-user": id } : {},
		});
	const user = stack.forRequest(request("user")).operations.feedback;
	const admin = stack.forRequest(request("admin")).operations.feedback;
	const anonymous = stack.forRequest(request()).operations.feedback;
	await assert.rejects(
		anonymous.createPost({ title: "Denied", body: "No identity" }),
	);
	const post = await user.createPost({
		title: "Packed feedback",
		body: "A request from a packed consumer",
		category: "Developer tools",
	});
	assert.equal(post.authorId, "user");
	await assert.rejects(
		user.updatePostStatus({ id: post.id, status: "shipped" }),
	);
	await assert.rejects(
		user.createChangelogEntry({
			title: "Denied",
			body: "No admin",
			postIds: [post.id],
		}),
	);
	await assert.rejects(
		admin.createChangelogEntry({
			title: "Premature",
			body: "Still under review",
			postIds: [post.id],
		}),
	);
	await Promise.all(
		Array.from({ length: 8 }, (_, i) =>
			stack
				.forRequest(request(`voter-${i}`))
				.operations.feedback.toggleVote({ id: post.id }),
		),
	);
	assert.equal((await anonymous.getPost({ slug: post.slug })).voteCount, 8);
	await user.toggleVote({ id: post.id });
	assert.equal((await user.getPost({ slug: post.slug })).isVoted, true);
	await user.toggleVote({ id: post.id });
	assert.equal((await user.getPost({ slug: post.slug })).voteCount, 8);
	await admin.updatePostStatus({ id: post.id, status: "shipped" });
	const entry = await admin.createChangelogEntry({
		title: "Packed release",
		body: "Now shipped",
		postIds: [post.id],
	});
	assert.equal(entry.posts[0].id, post.id);
	assert.equal((await anonymous.getRoadmap({})).shipped[0].id, post.id);
	assert.equal(
		(await anonymous.listChangelog({})).items[0].title,
		"Packed release",
	);
	assert.equal((await anonymous.listPosts({ category: "Other" })).total, 0);
	const keys = createFeedbackQueryKeys({ get: async () => ({}) });
	assert.notDeepEqual(
		keys.feedbackPosts.detail(post.slug, { id: "user" }).queryKey,
		keys.feedbackPosts.detail(post.slug, { id: "other" }).queryKey,
	);
	return { stack, post };
}
const { stack, post } = await verify({
	...core,
	...auth,
	...server,
	...feedback,
	...permissions,
	...queries,
});
await verify({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-feedback/api"),
	...require("@btst/plugin-feedback/permissions"),
	...require("@btst/plugin-feedback/query-keys"),
});
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => stack.handler(new Request(input, init));
try {
	const queryClient = new QueryClient();
	const client = createClientStack({
		api: {
			baseURL: "https://example.test",
			basePath: "/api",
			headers: { "x-user": "user" },
		},
		site: { baseURL: "https://example.test", basePath: "/pages" },
		queryClient,
		plugins: {
			feedback: feedbackClientPlugin({ identityPartition: { id: "user" } }),
		},
	});
	for (const path of [
		"/feedback",
		`/feedback/${post.slug}`,
		"/feedback/roadmap",
		"/feedback/changelog",
	]) {
		const route = client.router.getRoute(path);
		assert.ok(route?.loader);
		await route.loader();
	}
	assert.ok(queryClient.getQueryCache().getAll().length >= 4);
} finally {
	globalThis.fetch = originalFetch;
}
console.log(
	"Feedback ESM/CommonJS atomic voting, authorization, changelog, and SSR passed",
);
