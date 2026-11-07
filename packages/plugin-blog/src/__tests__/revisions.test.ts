import { createMemoryAdapter } from "@btst/adapter-memory";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import type { DBAdapter } from "@btst/db";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	blogBackendPlugin,
	type BlogBackendHooks,
	createPost,
	updatePost,
	deletePost,
} from "../api";
import { blogPermissions } from "../permissions";
import type { Post } from "../types";

function setup(hooks?: BlogBackendHooks) {
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [blogPermissions] as const,
		rules: ({ blog }) => [
			blog.post.read.when(
				({ identity, facts }) =>
					identity !== null ||
					facts.scope === "published" ||
					(facts.scope === "post" && facts.published),
			),
			blog.post.create.when(({ identity }) => identity !== null),
			blog.post.update.when(
				({ identity, facts }) => identity?.id === facts.authorId,
			),
			blog.post.delete.when(
				({ identity, facts }) => identity?.id === facts.authorId,
			),
			blog.post.history.when(
				({ identity, facts }) => identity?.id === facts.authorId,
			),
			blog.post.restore.when(
				({ identity, facts }) => identity?.id === facts.authorId,
			),
			blog.tag.read.allow(),
		],
	});
	const backend = createBackendStack({
		basePath: "/api",
		adapter: (db) => createMemoryAdapter(db)({}),
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => {
				const id = request.headers.get("x-user");
				return id ? { id } : null;
			},
		}),
		plugins: { blog: blogBackendPlugin({ hooks }) },
	});
	const ops = (user = "editor") =>
		backend.forRequest(
			new Request("http://localhost/api", { headers: { "x-user": user } }),
		).operations.blog;
	const data = {
		title: "First",
		content: "First content",
		excerpt: "First excerpt",
		slug: "hello",
		published: false,
		tags: [{ name: "Original" }],
	};
	const create = () => ops().createPost(data);
	return { backend, ops, create, data };
}

describe("Blog immutable revisions", () => {
	it("records server metadata, immutable content and tag snapshots and restores without publishing", async () => {
		const after = vi.fn();
		const { ops, create, data } = setup({ onAfterUpdatePost: after });
		const post = await create();
		const original = (await ops().listPostRevisions({ id: post.id })).items[0]!;
		expect(original).toMatchObject({
			version: 1,
			actorId: "editor",
			title: "First",
			tags: [{ name: "Original" }],
		});
		expect(new Date(original.createdAt).getTime()).not.toBeNaN();
		const updated = await ops().updatePost({
			id: post.id,
			data: {
				...data,
				title: "Second",
				image: "/new.png",
				tags: [],
				expectedVersion: 1,
			},
		});
		expect(updated.revisionVersion).toBe(2);
		const restored = await ops().restorePostRevision({
			id: post.id,
			revisionId: original.id,
			expectedVersion: 2,
		});
		expect(restored).toMatchObject({
			title: "First",
			image: "",
			published: false,
			revisionVersion: 3,
			tags: [{ name: "Original" }],
		});
		const history = await ops().listPostRevisions({ id: post.id });
		expect(history.items.map((r) => r.version)).toEqual([3, 2, 1]);
		expect(history.items[2]).toEqual(original);
		expect(after).toHaveBeenCalledTimes(2);
	});

	it("preserves current publication timestamp instead of replaying historical publication metadata", async () => {
		const { ops, create, data } = setup();
		const post = await create();
		const original = (await ops().listPostRevisions({ id: post.id })).items[0]!;
		const publishedAt = "2026-11-01T00:00:00.000Z";
		await ops().updatePost({
			id: post.id,
			data: { ...data, title: "Public", published: true, publishedAt },
		});
		const restored = await ops().restorePostRevision({
			id: post.id,
			revisionId: original.id,
			expectedVersion: 2,
		});
		expect(restored).toMatchObject({
			title: "First",
			published: true,
			publishedAt,
		});
		await ops().updatePost({
			id: post.id,
			data: { ...data, published: false },
		});
		const publicSnapshot = (
			await ops().listPostRevisions({ id: post.id })
		).items.find((r) => r.version === 2)!;
		expect(
			(
				await ops().restorePostRevision({
					id: post.id,
					revisionId: publicSnapshot.id,
					expectedVersion: 4,
				})
			).published,
		).toBe(false);
	});

	it("protects history and restore independently from public reads over HTTP and operations", async () => {
		const { backend, ops, create, data } = setup();
		const post = await create();
		const revision = (await ops().listPostRevisions({ id: post.id })).items[0]!;
		await ops().updatePost({ id: post.id, data: { ...data, published: true } });
		await expect(ops("").listPostRevisions({ id: post.id })).rejects.toThrow();
		await expect(
			ops("other").restorePostRevision({
				id: post.id,
				revisionId: revision.id,
				expectedVersion: 2,
			}),
		).rejects.toThrow();
		expect(
			(
				await backend.handler(
					new Request(`http://localhost/api/posts/${post.id}/revisions`),
				)
			).status,
		).toBe(401);
		expect(
			(
				await backend.handler(
					new Request(
						`http://localhost/api/posts/${post.id}/revisions/${revision.id}/restore`,
						{
							method: "POST",
							headers: {
								"content-type": "application/json",
								"x-user": "other",
							},
							body: JSON.stringify({ expectedVersion: 2 }),
						},
					),
				)
			).status,
		).toBe(403);
		const publicPost = await ops("").listPosts({ slug: post.slug });
		expect(publicPost.items[0]).not.toHaveProperty("revisions");
		expect(publicPost.items[0]).not.toHaveProperty("actorId");
		expect((await ops().listPostRevisions({ id: post.id })).total).toBe(2);
	});

	it("rejects stale edits and simultaneous restores without appending rejected writes", async () => {
		const { ops, create, data } = setup();
		const post = await create();
		const original = (await ops().listPostRevisions({ id: post.id })).items[0]!;
		await ops().updatePost({
			id: post.id,
			data: { ...data, title: "Newer", expectedVersion: 1 },
		});
		await expect(
			ops().restorePostRevision({
				id: post.id,
				revisionId: original.id,
				expectedVersion: 1,
			}),
		).rejects.toMatchObject({ statusCode: 409 });
		const outcomes = await Promise.allSettled([
			ops().restorePostRevision({
				id: post.id,
				revisionId: original.id,
				expectedVersion: 2,
			}),
			ops().restorePostRevision({
				id: post.id,
				revisionId: original.id,
				expectedVersion: 2,
			}),
		]);
		expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect((await ops().listPostRevisions({ id: post.id })).total).toBe(3);
		await expect(
			ops().updatePost({ id: post.id, data: { ...data, expectedVersion: 2 } }),
		).rejects.toMatchObject({ statusCode: 409 });
		const competing = await Promise.allSettled([
			ops().updatePost({
				id: post.id,
				data: { ...data, title: "Concurrent", expectedVersion: 3 },
			}),
			ops().restorePostRevision({
				id: post.id,
				revisionId: original.id,
				expectedVersion: 3,
			}),
		]);
		expect(competing.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(
			(await ops().listPostRevisions({ id: post.id })).items.map(
				(r) => r.version,
			),
		).toEqual([4, 3, 2, 1]);
	});

	it("rolls back post and tags if a revision append fails, for creation, update and restore", async () => {
		const { backend, ops, create, data } = setup();
		const post = await create();
		const history = await ops().listPostRevisions({ id: post.id });
		const transaction = backend.adapter.transaction.bind(backend.adapter);
		vi.spyOn(backend.adapter, "transaction").mockImplementation((run) =>
			transaction(async (tx) => {
				const createRow = tx.create.bind(tx);
				tx.create = ((args) => {
					if (args.model === "postRevision")
						throw new Error("revision insert failed");
					return createRow(args);
				}) as DBAdapter["create"];
				return run(tx);
			}),
		);
		await expect(
			ops().createPost({
				...data,
				slug: "failed",
				tags: [{ name: "Failed tag" }],
			}),
		).rejects.toThrow("revision insert failed");
		await expect(
			ops().updatePost({
				id: post.id,
				data: { ...data, title: "Failed", tags: [{ name: "Failed tag" }] },
			}),
		).rejects.toThrow("revision insert failed");
		await expect(
			ops().restorePostRevision({
				id: post.id,
				revisionId: history.items[0]!.id,
				expectedVersion: 1,
			}),
		).rejects.toThrow("revision insert failed");
		expect(await ops().listPostRevisions({ id: post.id })).toEqual(history);
		expect(await backend.adapter.findMany({ model: "post" })).toMatchObject([
			{ title: "First", revisionVersion: 1 },
		]);
		expect(await backend.adapter.findMany({ model: "tag" })).toMatchObject([
			{ name: "Original" },
		]);
		expect(await backend.adapter.count({ model: "postTag" })).toBe(1);
	});

	it("rejects sequential transaction fallbacks before any operation or direct mutation writes", async () => {
		const { backend, ops, create, data } = setup();
		const adapter = backend.adapter;
		const config = adapter.options?.adapterConfig;
		if (!config) throw new Error("Missing adapter configuration");
		expect(typeof config.transaction).toBe("function");
		const post = await create();
		const history = await ops().listPostRevisions({ id: post.id });
		const readState = async () =>
			Promise.all(
				["post", "tag", "postTag", "postRevision"].map((model) =>
					adapter.findMany({ model }),
				),
			);
		const original = await readState();
		const fallback = vi
			.spyOn(adapter, "transaction")
			.mockImplementation(async (run) => run(adapter));
		for (const configure of [
			() => {
				config.transaction = false;
			},
			() => {
				Object.defineProperty(adapter, "options", {
					value: undefined,
					configurable: true,
				});
			},
		]) {
			configure();
			const writes = [
				() =>
					ops().createPost({
						...data,
						slug: "rejected",
						tags: [{ name: "Rejected tag" }],
					}),
				() =>
					ops().updatePost({
						id: post.id,
						data: { ...data, title: "Rejected", tags: [] },
					}),
				() =>
					ops().restorePostRevision({
						id: post.id,
						revisionId: history.items[0]!.id,
						expectedVersion: 1,
					}),
				() => ops().deletePost({ id: post.id }),
				() => createPost(adapter, { ...data, slug: "rejected-direct" }),
				() =>
					updatePost(adapter, post.id, { title: "Rejected direct", tags: [] }),
				() => deletePost(adapter, post.id),
			];
			for (const write of writes) {
				await expect(Promise.resolve().then(write)).rejects.toMatchObject({
					statusCode: 500,
					code: "ATOMIC_TRANSACTION_REQUIRED",
				});
				expect(await readState()).toEqual(original);
			}
		}
		expect(fallback).not.toHaveBeenCalled();
	});

	it("freezes restore hook inputs, nested tags, facts and results before exposing them", async () => {
		const before = vi.fn();
		const after = vi.fn();
		const { ops, create } = setup({
			onBeforeUpdatePost: before,
			onAfterUpdatePost: after,
		});
		const post = await create();
		const original = (await ops().listPostRevisions({ id: post.id })).items[0]!;
		const restore = () =>
			ops().restorePostRevision({
				id: post.id,
				revisionId: original.id,
				expectedVersion: 1,
			});
		for (const mutate of [
			(data: Record<string, unknown>) => {
				data.content = "";
			},
			(data: Record<string, unknown>) => {
				data.expectedVersion = undefined;
			},
			(data: Record<string, unknown>) => {
				(data.tags as Array<Record<string, unknown>>)[0]!.id = "forged";
			},
		]) {
			before.mockImplementationOnce((_id, data, context) => {
				expect(Object.isFrozen(context.input)).toBe(true);
				expect(Object.isFrozen(context.facts)).toBe(true);
				mutate(data);
			});
			await expect(restore()).rejects.toBeInstanceOf(TypeError);
			expect((await ops().listPostRevisions({ id: post.id })).total).toBe(1);
		}
		after.mockImplementationOnce((result, context) => {
			expect(Object.isFrozen(result)).toBe(true);
			expect(Object.isFrozen(result.tags)).toBe(true);
			expect(Object.isFrozen(result.tags[0])).toBe(true);
			expect(context.result).toBe(result);
			expect(() => {
				result.tags[0].name = "Forged";
			}).toThrow(TypeError);
		});
		const restored = await restore();
		expect(restored).toMatchObject({
			content: "First content",
			revisionVersion: 2,
			tags: [{ name: "Original" }],
		});
		expect(after).toHaveBeenCalledTimes(1);
	});

	it("captures the legacy baseline on the first edit and paginates immutable history", async () => {
		const { backend, ops, data } = setup();
		const legacy = await backend.adapter.create<Post>({
			model: "post",
			data: {
				...data,
				tags: undefined,
				authorId: "editor",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		expect((await ops().listPostRevisions({ id: legacy.id })).total).toBe(0);
		await ops().updatePost({
			id: legacy.id,
			data: { ...data, title: "Edited", expectedVersion: 0 },
		});
		const first = await ops().listPostRevisions({ id: legacy.id, limit: 1 });
		const second = await ops().listPostRevisions({
			id: legacy.id,
			offset: 1,
			limit: 1,
		});
		expect(first).toMatchObject({
			total: 2,
			currentVersion: 2,
			items: [{ version: 2, title: "Edited" }],
		});
		expect(second.items[0]).toMatchObject({ version: 1, title: "First" });
		expect(second.items[0]!.actorId).toBeUndefined();
	});

	it("rejects missing tags, slug collisions, invalid snapshots and hooks without creating revisions", async () => {
		const before = vi.fn();
		const { backend, ops, create, data } = setup({
			onBeforeUpdatePost: before,
		});
		const post = await create();
		const original = (await ops().listPostRevisions({ id: post.id })).items[0]!;
		await ops().updatePost({
			id: post.id,
			data: { ...data, slug: "renamed", tags: [] },
		});
		await ops().createPost({ ...data, tags: [] });
		await expect(
			ops().restorePostRevision({
				id: post.id,
				revisionId: original.id,
				expectedVersion: 2,
			}),
		).rejects.toThrow("slug");
		await backend.adapter.delete({
			model: "post",
			where: [{ field: "slug", value: "hello" }],
		});
		await backend.adapter.deleteMany({ model: "tag", where: [] });
		await expect(
			ops().restorePostRevision({
				id: post.id,
				revisionId: original.id,
				expectedVersion: 2,
			}),
		).rejects.toThrow("tag");
		before.mockImplementationOnce(() => {
			throw new Error("Approval required");
		});
		await expect(
			ops().restorePostRevision({
				id: post.id,
				revisionId: original.id,
				expectedVersion: 2,
			}),
		).rejects.toThrow("Approval required");
		await backend.adapter.update({
			model: "postRevision",
			where: [{ field: "id", value: original.id }],
			update: { content: "" },
		});
		await expect(
			ops().restorePostRevision({
				id: post.id,
				revisionId: original.id,
				expectedVersion: 2,
			}),
		).rejects.toThrow();
		expect((await ops().listPostRevisions({ id: post.id })).total).toBe(2);
	});
});
