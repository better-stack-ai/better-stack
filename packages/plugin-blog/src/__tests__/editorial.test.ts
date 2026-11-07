import { createMemoryAdapter } from "@btst/adapter-memory";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { blogBackendPlugin, type BlogBackendHooks } from "../api";
import { blogPermissions } from "../permissions";

function setup(editorialWorkflow = true, hooks?: BlogBackendHooks) {
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [blogPermissions] as const,
		rules: ({ blog }) => [
			blog.post.read.when(
				({ identity, facts }) =>
					facts.scope === "published" ||
					(facts.scope === "post" && (!facts.exists || facts.published)) ||
					identity?.id === "author" ||
					identity?.id === "reviewer",
			),
			blog.post.create.when(({ identity }) => identity?.id === "author"),
			blog.post.update.when(
				({ identity, facts }) => identity?.id === facts.authorId,
			),
			blog.post.history.when(
				({ identity }) =>
					identity?.id === "author" || identity?.id === "reviewer",
			),
			blog.post.restore.when(
				({ identity, facts }) => identity?.id === facts.authorId,
			),
			blog.post.editorialRead.when(
				({ identity, facts }) =>
					identity?.id === facts.authorId || identity?.id === "reviewer",
			),
			blog.post.submit.when(
				({ identity, facts }) => identity?.id === facts.authorId,
			),
			blog.post.requestChanges.when(
				({ identity }) => identity?.id === "reviewer",
			),
			blog.post.approve.when(({ identity }) => identity?.id === "reviewer"),
			blog.post.publish.when(({ identity }) => identity?.id === "reviewer"),
			blog.tag.read.allow(),
		],
	});
	const auth = createServerAuth({
		authorization,
		getIdentity: ({ request }) => {
			const id = request.headers.get("x-user");
			return id ? { id } : null;
		},
	});
	const backend = createBackendStack({
		basePath: "/api",
		adapter: (db) => createMemoryAdapter(db)({}),
		auth,
		plugins: { blog: blogBackendPlugin({ editorialWorkflow, hooks }) },
	});
	const reconfigure = (enabled: boolean) =>
		createBackendStack({
			basePath: "/api",
			adapter: () => backend.adapter,
			auth,
			plugins: { blog: blogBackendPlugin({ editorialWorkflow: enabled }) },
		});
	const ops = (user = "author", stack = backend) =>
		stack.forRequest(
			new Request("http://localhost/api", { headers: { "x-user": user } }),
		).operations.blog;
	const data = {
		title: "Original title",
		content: "Original public content",
		excerpt: "Original excerpt",
		slug: "original",
		published: false,
		tags: [{ name: "Original tag" }],
	};
	const create = () => ops().createPost(data);
	const working = (slug = data.slug) => ops().getEditorialPost({ slug });
	const publish = async (slug = data.slug) => {
		let post = await working(slug);
		await ops().submitPost(versionInput(post));
		post = await working(slug);
		await ops("reviewer").approvePost(versionInput(post));
		post = await working(slug);
		await ops("reviewer").publishPost(versionInput(post));
		return working(slug);
	};
	return { backend, reconfigure, ops, create, working, publish, data };
}

function versionInput(post: {
	id: string;
	revisionVersion?: number;
	editorial: { version: number };
}) {
	return {
		id: post.id,
		expectedVersion: post.revisionVersion ?? 0,
		expectedEditorialVersion: post.editorial.version,
	};
}

describe("Blog editorial workflow", () => {
	it("enforces approval and publication permissions in operations and rejects publication shortcuts", async () => {
		const { backend, ops, create, working, data } = setup();
		await expect(
			ops().createPost({ ...data, published: true }),
		).rejects.toThrow();
		expect(await backend.adapter.count({ model: "postRevision" })).toBe(0);
		const post = await create();
		await expect(
			ops().updatePost({
				id: post.id,
				data: { ...data, published: true, expectedVersion: 1 },
			}),
		).rejects.toThrow();
		await expect(
			ops().approvePost(versionInput(await working())),
		).rejects.toThrow();
		await expect(
			ops().publishPost(versionInput(await working())),
		).rejects.toThrow();
		await expect(
			ops("").getEditorialPost({ slug: data.slug }),
		).rejects.toThrow();
		await expect(
			ops("stranger").getEditorialPost({ slug: data.slug }),
		).rejects.toThrow();
		expect((await ops().listPostRevisions({ id: post.id })).total).toBe(1);
		expect((await ops("").listPosts({ published: true })).items).toEqual([]);
	});

	it("records server-derived review metadata against immutable revisions and requires resubmission after changes", async () => {
		const { ops, create, working } = setup();
		const post = await create();
		const revision = (await ops().listPostRevisions({ id: post.id })).items[0]!;
		await ops().submitPost(versionInput(await working()));
		expect((await working()).editorial).toMatchObject({
			status: "submitted",
			submittedRevisionId: revision.id,
			actorId: "author",
		});
		await ops("reviewer").requestPostChanges({
			...versionInput(await working()),
			comment: "Clarify the introduction",
		});
		expect((await working()).editorial).toMatchObject({
			status: "changes-requested",
			actorId: "reviewer",
			comment: "Clarify the introduction",
		});
		await expect(
			ops("reviewer").approvePost(versionInput(await working())),
		).rejects.toThrow();
		await ops().submitPost(versionInput(await working()));
		await ops("reviewer").approvePost(versionInput(await working()));
		const approved = await working();
		expect(approved.editorial).toMatchObject({
			status: "approved",
			approvedRevisionId: revision.id,
			actorId: "reviewer",
		});
		expect(new Date(approved.editorial.updatedAt!).getTime()).not.toBeNaN();
		expect((await ops().listPostRevisions({ id: post.id })).items).toEqual([
			revision,
		]);
	});

	it("cannot forge approval metadata through the HTTP post update body", async () => {
		const { backend, ops, create, working, data } = setup();
		const post = await create();
		const response = await backend.handler(
			new Request(`http://localhost/api/posts/${post.id}`, {
				method: "PUT",
				headers: { "content-type": "application/json", "x-user": "author" },
				body: JSON.stringify({
					...data,
					expectedVersion: 1,
					editorialStatus: "approved",
					approvedRevisionId: "forged",
					editorial: { status: "approved", actorId: "reviewer" },
				}),
			}),
		);
		expect(response.status).toBeLessThan(300);
		const current = await working();
		expect(current.editorial.status).toBe("draft");
		expect(current.editorial.approvedRevisionId).toBeFalsy();
		await expect(
			ops("reviewer").publishPost(versionInput(current)),
		).rejects.toThrow();
	});

	it("invalidates approval on edits and restore without changing the approved public version", async () => {
		const { ops, create, working, publish, data } = setup();
		const post = await create();
		await publish();
		const original = (await ops().listPostRevisions({ id: post.id })).items[0]!;
		await ops().updatePost({
			id: post.id,
			data: { ...data, title: "Private revision", expectedVersion: 1 },
		});
		const edited = await working();
		expect(edited.editorial.status).toBe("draft");
		expect(edited.editorial.approvedRevisionId).toBeFalsy();
		await expect(
			ops("reviewer").publishPost(versionInput(edited)),
		).rejects.toThrow();
		expect((await ops("").listPosts({ slug: data.slug })).items[0]!.title).toBe(
			"Original title",
		);
		await ops().submitPost(versionInput(edited));
		await ops("reviewer").approvePost(versionInput(await working()));
		await ops().restorePostRevision({
			id: post.id,
			revisionId: original.id,
			expectedVersion: 2,
		});
		expect((await working()).editorial.status).toBe("draft");
		expect((await working()).editorial.approvedRevisionId).toBeFalsy();
		expect((await ops("").listPosts({ slug: data.slug })).items[0]!.title).toBe(
			"Original title",
		);
	});

	it("filters public slug, tags, search and pagination using the live snapshot while drafts remain private", async () => {
		const { backend, ops, create, publish, data } = setup();
		const post = await create();
		const live = await publish();
		await ops().updatePost({
			id: post.id,
			data: {
				...data,
				title: "Private needle",
				content: "Secret content needle",
				slug: "private-slug",
				tags: [{ name: "Private tag" }],
				expectedVersion: 1,
			},
		});
		const publicPost = (await ops("").listPosts({ slug: data.slug })).items[0]!;
		expect(publicPost).toMatchObject({
			title: data.title,
			content: data.content,
			slug: data.slug,
			tags: [{ name: "Original tag" }],
		});
		expect(publicPost).not.toHaveProperty("editorial");
		expect(publicPost).not.toHaveProperty("actorId");
		expect(publicPost).not.toHaveProperty("approvedRevisionId");
		expect(
			(await ops("").listPosts({ published: true, query: "needle" })).total,
		).toBe(0);
		expect((await ops("").listPosts({ slug: "private-slug" })).items).toEqual(
			[],
		);
		expect(
			(await ops("").listPosts({ published: true, tagSlug: "private-tag" }))
				.total,
		).toBe(0);
		expect(
			await ops("").listPosts({
				published: true,
				tagSlug: "original-tag",
				limit: 1,
				offset: 0,
			}),
		).toMatchObject({ total: 1, items: [{ id: post.id }] });
		expect(
			(
				await ops("").listPosts({
					published: true,
					tagSlug: "original-tag",
					limit: 1,
					offset: 1,
				})
			).items,
		).toEqual([]);
		const qc = new QueryClient();
		await backend.raw.blog.prefetchForRoute("post", qc, { slug: data.slug });
		expect(
			JSON.stringify(
				qc
					.getQueryCache()
					.getAll()
					.map((query) => query.state.data),
			),
		).toContain(data.content);
		expect(
			JSON.stringify(
				qc
					.getQueryCache()
					.getAll()
					.map((query) => query.state.data),
			),
		).not.toContain("needle");
		const editorQc = new QueryClient();
		await backend.raw.blog.prefetchForRoute("editPost", editorQc, {
			slug: data.slug,
		});
		expect(editorQc.getQueryCache().getAll()).toEqual([]);
		expect(
			(await ops("").listTags({})).some((tag) => tag.name === "Private tag"),
		).toBe(false);
		const navigation = await ops("").getNextPreviousPosts({
			date: new Date(new Date(live.createdAt).getTime() + 1000).toISOString(),
		});
		expect(navigation.previous).toMatchObject({
			id: post.id,
			title: data.title,
		});
		expect(
			(await ops("author").getEditorialPost({ slug: "private-slug" })).title,
		).toBe("Private needle");
	});

	it("rejects stale reviewer writes and concurrent contradictory decisions without rewriting revision history", async () => {
		const { ops, create, working, data } = setup();
		const post = await create();
		await ops().submitPost(versionInput(await working()));
		const stale = versionInput(await working());
		await ops().updatePost({
			id: post.id,
			data: { ...data, title: "New draft", expectedVersion: 1 },
		});
		await expect(ops("reviewer").approvePost(stale)).rejects.toMatchObject({
			statusCode: 409,
		});
		await ops().submitPost(versionInput(await working()));
		const input = versionInput(await working());
		const outcomes = await Promise.allSettled([
			ops("reviewer").approvePost(input),
			ops("reviewer").requestPostChanges({ ...input, comment: "Needs work" }),
		]);
		expect(
			outcomes.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			outcomes.find((result) => result.status === "rejected"),
		).toMatchObject({ reason: { statusCode: 409 } });
		expect(
			(await ops().listPostRevisions({ id: post.id })).items.map(
				(revision) => revision.version,
			),
		).toEqual([2, 1]);
	});

	it("keeps a concurrent author edit private while a reviewer decides on the preceding revision", async () => {
		const { ops, create, working, publish, data } = setup();
		const post = await create();
		await publish();
		await ops().updatePost({
			id: post.id,
			data: { ...data, title: "Submitted draft", expectedVersion: 1 },
		});
		await ops().submitPost(versionInput(await working()));
		const reviewInput = versionInput(await working());
		const edit = () =>
			ops().updatePost({
				id: post.id,
				data: { ...data, title: "Newer private edit", expectedVersion: 2 },
			});
		const outcomes = await Promise.allSettled([
			ops("reviewer").approvePost(reviewInput),
			edit(),
		]);
		if (outcomes[1]!.status === "rejected") {
			expect(outcomes[1]).toMatchObject({ reason: { statusCode: 409 } });
			await edit();
		}
		const current = await working();
		expect(current).toMatchObject({
			title: "Newer private edit",
			revisionVersion: 3,
			editorial: { status: "draft" },
		});
		expect(current.editorial.approvedRevisionId).toBeFalsy();
		await expect(
			ops("reviewer").publishPost(versionInput(current)),
		).rejects.toThrow();
		expect((await ops("").listPosts({ published: true })).items[0]!.title).toBe(
			data.title,
		);
	});

	it("keeps editorial protection when configuration is disabled and preserves legacy simple authoring", async () => {
		const { ops, create, publish, data, reconfigure } = setup();
		const post = await create();
		await publish();
		await ops().updatePost({
			id: post.id,
			data: { ...data, title: "Private", expectedVersion: 1 },
		});
		const disabled = reconfigure(false);
		expect(
			(await ops("", disabled).listPosts({ published: true })).items[0]!.title,
		).toBe(data.title);
		await expect(
			ops("author", disabled).updatePost({
				id: post.id,
				data: { ...data, title: "Bypass", published: true, expectedVersion: 2 },
			}),
		).rejects.toThrow();
		const simple = setup(false);
		const legacy = await simple
			.ops()
			.createPost({ ...simple.data, published: true });
		expect(
			(await simple.ops("").listPosts({ published: true })).items[0]!.id,
		).toBe(legacy.id);
		await simple.ops().updatePost({
			id: legacy.id,
			data: {
				...simple.data,
				title: "Immediate",
				published: true,
				expectedVersion: 1,
			},
		});
		expect(
			(await simple.ops("").listPosts({ published: true })).items[0]!.title,
		).toBe("Immediate");
	});

	it("does not change content or review state when authorized before hooks reject a write", async () => {
		const beforeUpdate = vi.fn();
		const beforeEditorial = vi.fn();
		const { ops, create, working, data } = setup(true, {
			onBeforeUpdatePost: beforeUpdate,
			onBeforeEditorialTransition: beforeEditorial,
		});
		const post = await create();
		const original = await working();
		beforeEditorial.mockRejectedValueOnce(new Error("Review unavailable"));
		await expect(ops().submitPost(versionInput(original))).rejects.toThrow(
			"Review unavailable",
		);
		expect(await working()).toEqual(original);
		await ops().submitPost(versionInput(original));
		const submitted = await working();
		beforeUpdate.mockRejectedValueOnce(new Error("Editing unavailable"));
		await expect(
			ops().updatePost({
				id: post.id,
				data: { ...data, title: "Rejected", expectedVersion: 1 },
			}),
		).rejects.toThrow("Editing unavailable");
		expect(await working()).toEqual(submitted);
		expect((await ops().listPostRevisions({ id: post.id })).total).toBe(1);
	});

	it("captures the existing live version before enabling review on its first edit", async () => {
		const { ops, data, reconfigure } = setup(false);
		const post = await ops().createPost({ ...data, published: true });
		const enabled = reconfigure(true);
		await ops("author", enabled).updatePost({
			id: post.id,
			data: {
				...data,
				title: "Unapproved edit",
				published: false,
				expectedVersion: 1,
			},
		});
		expect(
			(await ops("", enabled).listPosts({ published: true })).items[0]!.title,
		).toBe(data.title);
		expect(
			(await ops("author", enabled).getEditorialPost({ slug: data.slug }))
				.title,
		).toBe("Unapproved edit");
	});
	it.each([
		"search",
		"slug",
		"tag",
		"page",
		"tags",
		"navigation",
		"ssg",
	] as const)(
		"does not expose the first protected edit when activation races a public %s read",
		async (surface) => {
			const { backend, ops, reconfigure, data } = setup(false);
			const post = await ops().createPost({ ...data, published: true });
			const enabled = reconfigure(true);
			const count = backend.adapter.count.bind(backend.adapter);
			let activated = false;
			vi.spyOn(backend.adapter, "count").mockImplementation(async (args) => {
				const result = await count(args);
				const activationProbe =
					args.model === "editorialActivation" ||
					(args.model === "post" &&
						args.where?.some((clause) => clause.field === "editorialEnabled"));
				if (!activated && activationProbe) {
					activated = true;
					await ops("author", enabled).updatePost({
						id: post.id,
						data: {
							...data,
							title: "Private needle",
							content: "Secret needle",
							slug: "private-slug",
							tags: [{ name: "Private tag" }],
							expectedVersion: 1,
						},
					});
				}
				return result;
			});
			if (surface === "search") {
				expect(
					(await ops("").listPosts({ published: true, query: "needle" })).total,
				).toBe(0);
			} else if (surface === "slug") {
				expect(
					(await ops("").listPosts({ slug: data.slug })).items,
				).toMatchObject([{ title: data.title }]);
			} else if (surface === "tag") {
				expect(
					(
						await ops("").listPosts({
							published: true,
							tagSlug: "original-tag",
							limit: 1,
						})
					).items,
				).toMatchObject([{ title: data.title }]);
			} else if (surface === "page") {
				expect(
					(await ops("").listPosts({ published: true, limit: 1 })).items,
				).toMatchObject([{ title: data.title }]);
			} else if (surface === "tags") {
				expect((await ops("").listTags({})).map((tag) => tag.name)).toEqual([
					"Original tag",
				]);
			} else if (surface === "navigation") {
				expect(
					(
						await ops("").getNextPreviousPosts({
							date: new Date(
								new Date(post.createdAt).getTime() + 1000,
							).toISOString(),
						})
					).previous,
				).toMatchObject({ title: data.title });
			} else {
				const qc = new QueryClient();
				await backend.raw.blog.prefetchForRoute("post", qc, {
					slug: data.slug,
				});
				expect(qc.getQueryData(["posts", "detail", data.slug])).toMatchObject({
					title: data.title,
				});
			}
			expect(activated).toBe(true);
		},
	);
	it("does not lose the activation guard if the last protected post is deleted during a public read", async () => {
		const { backend, ops, reconfigure, data } = setup(false);
		const post = await ops().createPost({ ...data, published: true });
		const enabled = reconfigure(true);
		const count = backend.adapter.count.bind(backend.adapter);
		const findMany = backend.adapter.findMany.bind(backend.adapter);
		let activated = false;
		let deleted = false;
		vi.spyOn(backend.adapter, "count").mockImplementation(async (args) => {
			const result = await count(args);
			if (!activated && args.model === "editorialActivation") {
				activated = true;
				await ops("author", enabled).updatePost({
					id: post.id,
					data: { ...data, title: "Private needle", expectedVersion: 1 },
				});
			}
			return result;
		});
		vi.spyOn(backend.adapter, "findMany").mockImplementation(async (args) => {
			const result = await findMany(args);
			if (activated && !deleted && args.model === "post") {
				deleted = true;
				await backend.trusted.blog.deletePost({ id: post.id });
			}
			return result;
		});
		expect(
			await ops("").listPosts({ published: true, limit: 1 }),
		).toMatchObject({ items: [], total: 0 });
		expect(deleted).toBe(true);
		expect(await count({ model: "editorialActivation" })).toBeGreaterThan(0);
	});
});
