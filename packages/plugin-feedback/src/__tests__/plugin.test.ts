import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter, DatabaseDefinition } from "@btst/db";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { feedbackBackendPlugin } from "../api";
import { feedbackPermissions } from "../permissions";

function serializedMemoryAdapter(db: DatabaseDefinition): DBAdapter {
	const adapter = createMemoryAdapter(db)({});
	let tail = Promise.resolve();
	const lock = async <T>(run: () => Promise<T>): Promise<T> => {
		let release = () => {};
		const previous = tail;
		tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			return await run();
		} finally {
			release();
		}
	};
	return {
		...adapter,
		id: "serialized-memory-test",
		create: ((input) =>
			lock(() => adapter.create(input))) as DBAdapter["create"],
		findOne: ((input) =>
			lock(() => adapter.findOne(input))) as DBAdapter["findOne"],
		findMany: ((input) =>
			lock(() => adapter.findMany(input))) as DBAdapter["findMany"],
		count: (input) => lock(() => adapter.count(input)),
		update: ((input) =>
			lock(() => adapter.update(input))) as DBAdapter["update"],
		updateMany: (input) => lock(() => adapter.updateMany(input)),
		delete: ((input) =>
			lock(() => adapter.delete(input))) as DBAdapter["delete"],
		deleteMany: (input) => lock(() => adapter.deleteMany(input)),
		incrementOne: ((input) =>
			lock(() => adapter.incrementOne(input))) as DBAdapter["incrementOne"],
		transaction: ((callback) =>
			lock(() => adapter.transaction(callback))) as DBAdapter["transaction"],
	};
}
const authorization = defineAuthorization({
	identity: z.object({ id: z.string(), role: z.string() }),
	permissions: [feedbackPermissions],
	rules: ({ feedback }) => [
		feedback.post.read.allow(),
		feedback.changelog.read.allow(),
		feedback.post.create.when(({ identity }) => Boolean(identity)),
		feedback.post.vote.when(({ identity }) => Boolean(identity)),
		feedback.post.updateStatus.when(
			({ identity }) => identity?.role === "admin",
		),
		feedback.changelog.create.when(
			({ identity }) => identity?.role === "admin",
		),
	],
});
function setup(atomic = true) {
	let adapter!: DBAdapter;
	const stack = createBackendStack({
		basePath: "/api",
		plugins: { feedback: feedbackBackendPlugin() },
		auth: createServerAuth({
			authorization,
			getIdentity: (request) => {
				const id = request.headers.get("x-user");
				return id
					? { id, role: request.headers.get("x-role") ?? "user" }
					: null;
			},
		}),
		adapter: (db) => {
			adapter = atomic
				? serializedMemoryAdapter(db)
				: createMemoryAdapter(db)({});
			return adapter;
		},
	});
	return { stack, operations: stack.trusted.feedback, adapter: () => adapter };
}
function request(
	path: string,
	method = "GET",
	body?: unknown,
	user?: string,
	role = "user",
) {
	return new Request(`https://example.test/api/feedback/${path}`, {
		method,
		headers: {
			"content-type": "application/json",
			...(user ? { "x-user": user, "x-role": role } : {}),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}
const draft = {
	title: "Dark mode",
	body: "Please add a dark theme",
	category: "Interface",
};

describe("feedback operations", () => {
	it("allows public reads and enforces authenticated authorship and administrator management", async () => {
		const { stack, operations } = setup();
		expect((await stack.handler(request("posts"))).status).toBe(200);
		expect((await stack.handler(request("posts", "POST", draft))).status).toBe(
			401,
		);
		const response = await stack.handler(
			request("posts", "POST", { ...draft, authorId: "forged" }, "alice"),
		);
		expect(response.status).toBe(200);
		const post = await response.json();
		expect(post).toMatchObject({
			authorId: "alice",
			status: "under_review",
			voteCount: 0,
		});
		expect(
			(await stack.handler(request(`posts/${post.id}/vote`, "POST", {})))
				.status,
		).toBe(401);
		expect(
			(
				await stack.handler(
					request(
						`posts/${post.id}/status`,
						"PUT",
						{ status: "shipped" },
						"alice",
					),
				)
			).status,
		).toBe(403);
		expect(
			(
				await stack.handler(
					request(
						"changelog",
						"POST",
						{ title: "Release", body: "Ready", postIds: [post.id] },
						"alice",
					),
				)
			).status,
		).toBe(403);
		expect(
			(
				await stack.handler(
					request(
						`posts/${post.id}/status`,
						"PUT",
						{ status: "planned" },
						"admin",
						"admin",
					),
				)
			).status,
		).toBe(200);
		expect(
			(await operations.listPosts({ category: "Interface", status: "planned" }))
				.items,
		).toHaveLength(1);
		expect(
			(await operations.listPosts({ category: "Other" })).items,
		).toHaveLength(0);
		expect((await operations.getRoadmap({})).planned[0]?.id).toBe(post.id);
	});
	it("serializes concurrent toggles and atomic counters with one vote per user and post", async () => {
		const { operations, adapter, stack } = setup();
		const post = await operations.createPost({ ...draft, authorId: "author" });
		await Promise.all(
			Array.from({ length: 20 }, (_, i) =>
				operations.toggleVote({ id: post.id, userId: `user-${i}` }),
			),
		);
		expect((await operations.getPost({ slug: post.slug })).voteCount).toBe(20);
		expect(await adapter().count({ model: "feedbackVote" })).toBe(20);
		await Promise.all(
			Array.from({ length: 10 }, () =>
				operations.toggleVote({ id: post.id, userId: "same-user" }),
			),
		);
		expect((await operations.getPost({ slug: post.slug })).voteCount).toBe(20);
		expect(await adapter().count({ model: "feedbackVote" })).toBe(20);
		const votes = await stack.handler(
			request(`posts/${post.id}/vote`, "POST", { userId: "spoof" }, "alice"),
		);
		expect(await votes.json()).toEqual({ voteCount: 21, isVoted: true });
		const own = await stack.handler(
			request(`posts/${post.slug}`, "GET", undefined, "alice"),
		);
		const other = await stack.handler(
			request(`posts/${post.slug}`, "GET", undefined, "bob"),
		);
		expect((await own.json()).isVoted).toBe(true);
		expect((await other.json()).isVoted).toBe(false);
	});
	it("rolls back vote and counter together when the counter write fails", async () => {
		const { operations, adapter } = setup();
		const post = await operations.createPost({ ...draft, authorId: "author" });
		const transaction = adapter().transaction.bind(adapter());
		vi.spyOn(adapter(), "transaction").mockImplementation((callback) =>
			transaction((tx) =>
				callback({
					...tx,
					incrementOne: async () => {
						throw new Error("counter unavailable");
					},
				}),
			),
		);
		await expect(
			operations.toggleVote({ id: post.id, userId: "alice" }),
		).rejects.toThrow("counter unavailable");
		expect(await adapter().count({ model: "feedbackVote" })).toBe(0);
		expect((await operations.getPost({ slug: post.slug })).voteCount).toBe(0);
	});
	it("requires real isolated transactions before voting or management writes", async () => {
		const { operations, adapter } = setup(false);
		const post = await operations.createPost({ ...draft, authorId: "author" });
		await expect(
			operations.toggleVote({ id: post.id, userId: "alice" }),
		).rejects.toThrow("isolated transaction");
		await expect(
			operations.updatePostStatus({ id: post.id, status: "planned" }),
		).rejects.toThrow("isolated transaction");
		expect(await adapter().count({ model: "feedbackVote" })).toBe(0);
	});
	it("publishes linked shipped requests and rejects unshipped or missing references atomically", async () => {
		const { operations } = setup();
		const post = await operations.createPost({ ...draft, authorId: "author" });
		const entry = {
			title: "Theme release",
			body: "Dark theme is available",
			postIds: [post.id],
		};
		await expect(operations.createChangelogEntry(entry)).rejects.toThrow(
			"shipped",
		);
		await expect(
			operations.createChangelogEntry({ ...entry, postIds: ["missing"] }),
		).rejects.toThrow("not found");
		expect((await operations.listChangelog({})).total).toBe(0);
		await operations.updatePostStatus({ id: post.id, status: "shipped" });
		const published = await operations.createChangelogEntry(entry);
		expect(published.posts[0]).toMatchObject({
			id: post.id,
			status: "shipped",
		});
		expect((await operations.listChangelog({})).items[0]?.id).toBe(
			published.id,
		);
	});
});
