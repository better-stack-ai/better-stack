import { createMemoryAdapter } from "@btst/adapter-memory";
import { defineDb, type DatabaseDefinition } from "@btst/db";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { stack } from "../../../api";
import { defineAuthorization } from "../../../authorization";
import {
	createServerAuth,
	type ServerAuth,
} from "../../../authorization/server";
import { blogBackendPlugin, type BlogBackendHooks } from "../api";
import { blogPermissions } from "../permissions";
import type { Post } from "../types";

const memoryAdapter = (db: DatabaseDefinition) => createMemoryAdapter(db)({});

describe("Blog authorization inventory", () => {
	it("covers every maintained HTTP and programmatic operation with a stable descriptor", () => {
		const plugin = blogBackendPlugin();
		const adapter = memoryAdapter(defineDb({}).use(plugin.dbPlugin));
		const operations = plugin.operations?.(adapter);

		expect(Object.keys(operations ?? {}).sort()).toEqual([
			"createPost",
			"deletePost",
			"getNextPreviousPosts",
			"listPosts",
			"listTags",
			"updatePost",
		]);
		expect(
			Object.fromEntries(
				Object.entries(operations ?? {}).map(([key, operation]) => [
					key,
					operation.permission.id,
				]),
			),
		).toEqual({
			listPosts: "blog:post.read",
			createPost: "blog:post.create",
			updatePost: "blog:post.update",
			deletePost: "blog:post.delete",
			getNextPreviousPosts: "blog:post.read",
			listTags: "blog:tag.read",
		});
		expect(blogPermissions.post.read({ scope: "published" })).toMatchObject({
			id: "blog:post.read",
		});
		expect(blogPermissions.post.create({ publish: "draft" })).toMatchObject({
			id: "blog:post.create",
		});
		expect(
			blogPermissions.post.update({
				id: "post-1",
				publish: "publish",
			}),
		).toMatchObject({ id: "blog:post.update" });
		expect(blogPermissions.tag.read()).toMatchObject({
			id: "blog:tag.read",
		});
	});
});

const authorization = defineAuthorization({
	identity: z.object({
		id: z.string(),
		role: z.enum(["user", "admin"]),
	}),
	permissions: [blogPermissions] as const,
	rules: ({ blog }) => [
		blog.post.read.when(({ identity, facts }) => {
			if (facts.scope === "published") return true;
			if (facts.scope === "post" && (!facts.exists || facts.published)) {
				return true;
			}
			return (
				identity?.role === "admin" ||
				(facts.scope === "post" && identity?.id === facts.authorId)
			);
		}),
		blog.post.create.when(
			({ identity, facts }) =>
				identity !== null &&
				(facts.publish === "draft" || identity.role === "admin"),
		),
		blog.post.update.when(
			({ identity, facts }) =>
				identity !== null &&
				(identity.role === "admin" ||
					(identity.id === facts.authorId && facts.publish === "unchanged")),
		),
		blog.post.delete.when(
			({ identity, facts }) =>
				identity !== null &&
				(identity.role === "admin" || identity.id === facts.authorId),
		),
		blog.tag.read.allow(),
	],
});

function createAuth(
	getIdentity: (
		request: Request,
	) =>
		| { id: string; role: "user" | "admin" }
		| null
		| Promise<{ id: string; role: "user" | "admin" } | null> = (request) => {
		const id = request.headers.get("x-user-id");
		const role = request.headers.get("x-user-role");
		if (!id || (role !== "user" && role !== "admin")) return null;
		return { id, role };
	},
) {
	return createServerAuth({
		authorization,
		getIdentity: ({ request }) => getIdentity(request),
	});
}

function makeBackend(options?: {
	hooks?: BlogBackendHooks;
	auth?: ServerAuth<any>;
}) {
	return stack({
		basePath: "/api",
		plugins: { blog: blogBackendPlugin(options?.hooks) },
		adapter: memoryAdapter,
		...(options?.auth ? { auth: options.auth as never } : {}),
	});
}

async function seedPost(
	backend: ReturnType<typeof makeBackend>,
	slug: string,
	authorId: string | null = "author-1",
) {
	return backend.adapter.create<Post>({
		model: "post",
		data: {
			...(authorId ? { authorId } : {}),
			title: "Authorization tracer",
			slug,
			content: "Content",
			excerpt: "Excerpt",
			published: true,
			tags: [],
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}

async function postExists(backend: ReturnType<typeof makeBackend>, id: string) {
	return !!(await backend.adapter.findOne<Post>({
		model: "post",
		where: [{ field: "id", value: id }],
	}));
}

function deleteRequest(id: string, identity?: { id: string; role: string }) {
	return new Request(`http://localhost/api/posts/${id}`, {
		method: "DELETE",
		headers: identity
			? { "x-user-id": identity.id, "x-user-role": identity.role }
			: undefined,
	});
}

function request(
	path: string,
	options?: {
		method?: string;
		identity?: { id: string; role: string };
		body?: unknown;
	},
) {
	const headers = new Headers();
	if (options?.identity) {
		headers.set("x-user-id", options.identity.id);
		headers.set("x-user-role", options.identity.role);
	}
	if (options?.body !== undefined) {
		headers.set("content-type", "application/json");
	}
	return new Request(`http://localhost/api${path}`, {
		method: options?.method ?? "GET",
		headers,
		...(options?.body !== undefined
			? { body: JSON.stringify(options.body) }
			: {}),
	});
}

const protectedBlogOperations = [
	"listPosts",
	"createPost",
	"updatePost",
	"deletePost",
] as const;
type ProtectedBlogOperation = (typeof protectedBlogOperations)[number];

const protectedCreateInput = {
	title: "Protected operation",
	content: "Content",
	excerpt: "Excerpt",
	slug: "protected-operation",
	published: false,
	tags: [],
};

function protectedLifecycleHooks(events: string[]): BlogBackendHooks {
	const observed = () => {
		events.push("lifecycle");
	};
	return {
		onBeforeListPosts: observed,
		onListPostsError: observed,
		onBeforeCreatePost: observed,
		onCreatePostError: observed,
		onBeforeUpdatePost: observed,
		onUpdatePostError: observed,
		onBeforeDeletePost: observed,
		onDeletePostError: observed,
	};
}

async function invokeProtectedOperation(
	backend: ReturnType<typeof makeBackend>,
	operation: ProtectedBlogOperation,
	operationRequest: Request,
) {
	const api = backend.forRequest(operationRequest).api.blog;
	switch (operation) {
		case "listPosts":
			return api.listPosts({ published: false });
		case "createPost":
			return api.createPost(protectedCreateInput);
		case "updatePost": {
			const post = await seedPost(backend, "protected-update", "admin-1");
			return api.updatePost({
				id: post.id,
				data: { ...protectedCreateInput, title: "Updated" },
			});
		}
		case "deletePost": {
			const post = await seedPost(backend, "protected-delete", "admin-1");
			return api.deletePost({ id: post.id });
		}
	}
}

describe("Blog operation-first authorization", () => {
	it.each(protectedBlogOperations)(
		"keeps %s identity failures outside the lifecycle",
		async (operation) => {
			const events: string[] = [];
			const backend = makeBackend({
				auth: createAuth(() => {
					throw new Error("session unavailable");
				}),
				hooks: protectedLifecycleHooks(events),
			});

			await expect(
				invokeProtectedOperation(backend, operation, request("/protected")),
			).rejects.toThrow("session unavailable");
			expect(events).toEqual([]);
		},
	);

	it("keeps every protected operation's rule failure and missing rule outside the lifecycle", async () => {
		const failingAuthorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.literal("admin") }),
			permissions: [blogPermissions] as const,
			rules: ({ blog }) => [
				blog.post.read.when(() => {
					throw new Error("policy unavailable");
				}),
				blog.post.create.when(() => {
					throw new Error("policy unavailable");
				}),
				blog.post.update.when(() => {
					throw new Error("policy unavailable");
				}),
				blog.post.delete.when(() => {
					throw new Error("policy unavailable");
				}),
			],
		});
		const missingRuleAuthorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.literal("admin") }),
			permissions: [blogPermissions] as const,
			rules: () => [],
		});

		for (const [authorizationDefinition, expected] of [
			[failingAuthorization, "policy unavailable"],
			[missingRuleAuthorization, { statusCode: 403 }],
		] as const) {
			const events: string[] = [];
			const backend = makeBackend({
				auth: createServerAuth({
					authorization: authorizationDefinition,
					getIdentity: () => ({ id: "admin-1", role: "admin" as const }),
				}),
				hooks: protectedLifecycleHooks(events),
			});
			for (const operation of protectedBlogOperations) {
				const result = expect(
					invokeProtectedOperation(
						backend,
						operation,
						request("/protected", {
							identity: { id: "admin-1", role: "admin" },
						}),
					),
				).rejects;
				if (typeof expected === "string") {
					await result.toThrow(expected);
				} else {
					await result.toMatchObject(expected);
				}
			}
			expect(events).toEqual([]);
		}
	});

	it.each(["listPosts", "createPost", "updatePost", "deletePost"] as const)(
		"keeps %s trusted-fact loader failures outside the lifecycle",
		async (operation) => {
			const events: string[] = [];
			const backend = makeBackend({
				auth: createAuth(),
				hooks: protectedLifecycleHooks(events),
			});
			let call: Promise<unknown>;
			if (operation === "listPosts") {
				vi.spyOn(backend.adapter, "findOne").mockRejectedValueOnce(
					new Error("facts unavailable"),
				);
				call = backend
					.forRequest(
						request("/protected", {
							identity: { id: "admin-1", role: "admin" },
						}),
					)
					.api.blog.listPosts({ slug: "protected-detail" });
			} else if (operation === "createPost") {
				vi.spyOn(
					blogPermissions.post.create.schema,
					"parse",
				).mockImplementationOnce(() => {
					throw new Error("facts unavailable");
				});
				call = backend
					.forRequest(
						request("/protected", {
							identity: { id: "admin-1", role: "admin" },
						}),
					)
					.api.blog.createPost(protectedCreateInput);
			} else {
				const post = await seedPost(backend, `facts-${operation}`, "admin-1");
				vi.spyOn(backend.adapter, "findOne").mockRejectedValueOnce(
					new Error("facts unavailable"),
				);
				const api = backend.forRequest(
					request("/protected", {
						identity: { id: "admin-1", role: "admin" },
					}),
				).api.blog;
				call =
					operation === "updatePost"
						? api.updatePost({
								id: post.id,
								data: { ...protectedCreateInput, title: "Updated" },
							})
						: api.deletePost({ id: post.id });
			}

			await expect(call).rejects.toThrow("facts unavailable");
			expect(events).toEqual([]);
		},
	);

	it("makes published reads and tags explicitly public while protecting drafts", async () => {
		const events: string[] = [];
		const backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeListPosts: (filter, context) => {
					events.push(`before:${String(filter.published)}`);
					expect(context).toMatchObject({
						identity:
							filter.published === true
								? null
								: { id: "admin-1", role: "admin" },
						facts: {
							scope: filter.published === true ? "published" : "drafts",
						},
						input: filter,
						request: expect.any(Request),
					});
				},
				onPostsRead: (posts, _filter, context) => {
					events.push(`after:${posts.length}`);
					expect(context.result.items).toBe(posts);
				},
				onListPostsError: () => {
					events.push("error");
				},
			},
		});
		await seedPost(backend, "public-post");
		const draft = await seedPost(backend, "draft-post", "author-1");
		await backend.adapter.update<Post>({
			model: "post",
			where: [{ field: "id", value: draft.id }],
			update: { published: false },
		});

		const published = await backend.handler(request("/posts?published=true"));
		expect(published.status).toBe(200);
		expect((await published.json()).items).toHaveLength(1);
		expect(events).toEqual(["before:true", "after:1"]);

		events.length = 0;
		const anonymousDrafts = await backend.handler(
			request("/posts?published=false"),
		);
		const viewerDrafts = await backend.handler(
			request("/posts?published=false", {
				identity: { id: "viewer-1", role: "user" },
			}),
		);
		expect(anonymousDrafts.status).toBe(401);
		expect(viewerDrafts.status).toBe(403);
		expect(events).toEqual([]);

		const adminDrafts = await backend.handler(
			request("/posts?published=false", {
				identity: { id: "admin-1", role: "admin" },
			}),
		);
		expect(adminDrafts.status).toBe(200);
		expect((await adminDrafts.json()).items).toHaveLength(1);

		const tags = await backend.handler(request("/tags"));
		expect(tags.status).toBe(200);
		expect(await tags.json()).toEqual([]);
	});

	it("derives post-detail visibility on the server", async () => {
		const backend = makeBackend({ auth: createAuth() });
		const draft = await seedPost(backend, "owner-draft", "author-1");
		await backend.adapter.update<Post>({
			model: "post",
			where: [{ field: "id", value: draft.id }],
			update: { published: false },
		});

		const anonymous = await backend.handler(request("/posts?slug=owner-draft"));
		expect(
			authorization.can(blogPermissions.post.read({ scope: "published" }), {
				id: "viewer-1",
				role: "user",
			}),
		).toBe(true);
		const viewer = await backend.handler(
			request("/posts?slug=owner-draft", {
				identity: { id: "viewer-1", role: "user" },
			}),
		);
		expect(anonymous.status).toBe(401);
		expect(viewer.status).toBe(403);

		const ownerResult = await backend
			.forRequest(
				request("/posts?slug=owner-draft", {
					identity: { id: "author-1", role: "user" },
				}),
			)
			.api.blog.listPosts({ slug: "owner-draft" });
		expect(ownerResult.items).toHaveLength(1);

		const missing = await backend.handler(request("/posts?slug=missing"));
		expect(missing.status).toBe(200);
		expect((await missing.json()).items).toEqual([]);
	});

	it("does not expose a draft created after a missing post detail is authorized", async () => {
		let backend: ReturnType<typeof makeBackend>;
		backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeListPosts: async (filter) => {
					if (filter.slug !== "new-draft") return;
					await backend.adapter.create<Post>({
						model: "post",
						data: {
							title: "New draft",
							slug: "new-draft",
							content: "Private",
							excerpt: "Private",
							published: false,
							tags: [],
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					});
				},
			},
		});

		await expect(
			backend
				.forRequest(request("/posts?slug=new-draft"))
				.api.blog.listPosts({ slug: "new-draft" }),
		).rejects.toMatchObject({
			statusCode: 409,
			code: "POST_READ_STATE_CHANGED",
		});
	});

	it("does not expose a post unpublished after public detail authorization", async () => {
		let backend: ReturnType<typeof makeBackend>;
		backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeListPosts: async (filter) => {
					if (filter.slug !== "newly-private") return;
					await backend.adapter.update<Post>({
						model: "post",
						where: [{ field: "slug", value: filter.slug }],
						update: { published: false },
					});
				},
			},
		});
		await seedPost(backend, "newly-private");

		await expect(
			backend
				.forRequest(request("/posts?slug=newly-private"))
				.api.blog.listPosts({ slug: "newly-private" }),
		).rejects.toMatchObject({
			statusCode: 409,
			code: "POST_READ_STATE_CHANGED",
		});
	});

	it("keeps public navigation and tags on the same HTTP/request/internal operations", async () => {
		const events: string[] = [];
		const getIdentity = vi.fn(() => null);
		const backend = makeBackend({
			auth: createAuth(getIdentity),
			hooks: {
				onBeforeNextPreviousPosts: (_query, context) => {
					events.push(`before:${context.facts.scope}`);
				},
				onNextPreviousPostsRead: (_result, context) => {
					events.push(`after:${context.facts.scope}`);
				},
			},
		});
		await seedPost(backend, "navigation-post");

		const navigationPath = "/posts/next-previous?date=2030-01-01T00:00:00.000Z";
		const navigationInput = { date: "2030-01-01T00:00:00.000Z" };
		const navigation = await backend.handler(request(navigationPath));
		expect(navigation.status).toBe(200);
		expect(await navigation.json()).toMatchObject({
			previous: { slug: "navigation-post" },
			next: null,
		});
		expect(
			await backend
				.forRequest(request(navigationPath))
				.api.blog.getNextPreviousPosts(navigationInput),
		).toMatchObject({ previous: { slug: "navigation-post" }, next: null });

		getIdentity.mockClear();
		expect(
			await backend.internal.blog.getNextPreviousPosts(navigationInput),
		).toMatchObject({ previous: { slug: "navigation-post" }, next: null });
		expect(events).toEqual([
			"before:published",
			"after:published",
			"before:published",
			"after:published",
			"before:published",
			"after:published",
		]);

		const tagsResponse = await backend.handler(request("/tags"));
		expect(tagsResponse.status).toBe(200);
		expect(await tagsResponse.json()).toEqual([]);
		expect(
			await backend.forRequest(request("/tags")).api.blog.listTags({}),
		).toEqual([]);
		getIdentity.mockClear();
		expect(await backend.internal.blog.listTags({})).toEqual([]);

		const internalDrafts = await backend.internal.blog.listPosts({
			published: false,
		});
		expect(internalDrafts.items).toEqual([]);
		expect(getIdentity).not.toHaveBeenCalled();
	});

	it("uses trusted create/update facts across HTTP, request, and internal entry points", async () => {
		const events: string[] = [];
		const backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeCreatePost: (_data, context) => {
					events.push(`create:before:${context.identity?.id ?? "internal"}`);
					expect(context.facts).toEqual({
						publish: context.input.published ? "published" : "draft",
					});
				},
				onPostCreated: (post, context) => {
					events.push(`create:after:${post.authorId ?? "none"}`);
					expect(context.result).toBe(post);
				},
				onBeforeUpdatePost: (_id, _data, context) => {
					events.push(
						`update:before:${context.identity?.id ?? "internal"}:${context.facts.publish}`,
					);
				},
				onPostUpdated: (post, context) => {
					events.push(`update:after:${String(post.published)}`);
					expect(context.result).toBe(post);
				},
			},
		});
		const createBody = {
			title: "Created through operation",
			content: "Content",
			excerpt: "Excerpt",
			slug: "created-through-operation",
			published: false,
			tags: [],
		};

		const anonymousCreate = await backend.handler(
			request("/posts", { method: "POST", body: createBody }),
		);
		expect(anonymousCreate.status).toBe(401);
		expect(events).toEqual([]);

		const owner = { id: "author-1", role: "user" as const };
		const createdResponse = await backend.handler(
			request("/posts", {
				method: "POST",
				identity: owner,
				body: createBody,
			}),
		);
		expect(createdResponse.status).toBe(200);
		const created = (await createdResponse.json()) as Post;
		expect(created).toMatchObject({
			authorId: "author-1",
			slug: "created-through-operation",
			published: false,
		});
		expect(events).toEqual(["create:before:author-1", "create:after:author-1"]);

		const requestCreated = await backend
			.forRequest(request("/posts", { method: "POST", identity: owner }))
			.api.blog.createPost({
				...createBody,
				slug: "request-created-operation",
			});
		expect(requestCreated.authorId).toBe("author-1");
		const internalCreated = await backend.internal.blog.createPost({
			...createBody,
			slug: "internal-created-operation",
		});
		expect(internalCreated.authorId).toBeUndefined();

		const eventsBeforeDeniedCreate = events.length;
		const ownerPublishedCreate = await backend.handler(
			request("/posts", {
				method: "POST",
				identity: owner,
				body: { ...createBody, slug: "owner-published", published: true },
			}),
		);
		expect(
			authorization.can(
				blogPermissions.post.create({ publish: "draft" }),
				owner,
			),
		).toBe(true);
		expect(ownerPublishedCreate.status).toBe(403);
		expect(events).toHaveLength(eventsBeforeDeniedCreate);

		const adminPublishedCreate = await backend.handler(
			request("/posts", {
				method: "POST",
				identity: { id: "admin-1", role: "admin" },
				body: { ...createBody, slug: "admin-published", published: true },
			}),
		);
		expect(adminPublishedCreate.status).toBe(200);
		expect(await adminPublishedCreate.json()).toMatchObject({
			authorId: "admin-1",
			published: true,
		});

		const spoofedBrowserFacts = blogPermissions.post.update({
			id: created.id,
			authorId: "viewer-1",
			publish: "unchanged",
		});
		expect(
			authorization.can(spoofedBrowserFacts, {
				id: "viewer-1",
				role: "user",
			}),
		).toBe(true);
		const eventsBeforeAnonymousUpdate = events.length;
		const anonymousUpdate = await backend.handler(
			request(`/posts/${created.id}`, {
				method: "PUT",
				body: { ...createBody, title: "Anonymous edit" },
			}),
		);
		expect(anonymousUpdate.status).toBe(401);
		expect(events).toHaveLength(eventsBeforeAnonymousUpdate);
		const httpOwnerUpdate = await backend.handler(
			request(`/posts/${created.id}`, {
				method: "PUT",
				identity: owner,
				body: { ...createBody, title: "HTTP owner edit" },
			}),
		);
		expect(httpOwnerUpdate.status).toBe(200);
		await expect(
			backend
				.forRequest(
					request("/posts", {
						identity: { id: "viewer-1", role: "user" },
					}),
				)
				.api.blog.updatePost({
					id: created.id,
					data: { ...createBody, title: "Spoofed" },
				}),
		).rejects.toMatchObject({ statusCode: 403 });

		await backend
			.forRequest(request("/posts", { identity: owner }))
			.api.blog.updatePost({
				id: created.id,
				data: { ...createBody, title: "Owner edit" },
			});
		expect(events).toContain("update:before:author-1:unchanged");

		await expect(
			backend
				.forRequest(request("/posts", { identity: owner }))
				.api.blog.updatePost({
					id: created.id,
					data: { ...createBody, published: true },
				}),
		).rejects.toMatchObject({ statusCode: 403 });

		await backend
			.forRequest(
				request("/posts", {
					identity: { id: "admin-1", role: "admin" },
				}),
			)
			.api.blog.updatePost({
				id: created.id,
				data: { ...createBody, published: true },
			});
		expect(events).toContain("update:before:admin-1:publish");

		await backend.internal.blog.updatePost({
			id: created.id,
			data: createBody,
		});
		expect(events).toContain("update:before:internal:unpublish");
	});

	it("does not apply a publish update when authoritative state changes after authorization", async () => {
		let backend: ReturnType<typeof makeBackend>;
		backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeUpdatePost: async (id) => {
					await backend.adapter.update<Post>({
						model: "post",
						where: [{ field: "id", value: id }],
						update: { published: false },
					});
				},
			},
		});
		const post = await seedPost(backend, "publish-race", "author-1");

		await expect(
			backend
				.forRequest(
					request(`/posts/${post.id}`, {
						identity: { id: "author-1", role: "user" },
					}),
				)
				.api.blog.updatePost({
					id: post.id,
					data: { ...protectedCreateInput, published: true },
				}),
		).rejects.toMatchObject({
			statusCode: 409,
			code: "POST_STATE_CHANGED",
		});
		expect(
			await backend.adapter.findOne<Post>({
				model: "post",
				where: [{ field: "id", value: post.id }],
			}),
		).toMatchObject({ published: false });
	});
});

describe("Blog delete one-rule authorization tracer", () => {
	it("returns 401 for anonymous HTTP deletion and 403 for an authenticated denial", async () => {
		const lifecycleEvents: string[] = [];
		const backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeDeletePost: () => {
					lifecycleEvents.push("before");
				},
				onPostDeleted: () => {
					lifecycleEvents.push("after");
				},
				onDeletePostError: () => {
					lifecycleEvents.push("error");
					throw new Error("hook must not replace denial");
				},
			},
		});
		const anonymousPost = await seedPost(backend, "anonymous-post");
		const authorlessPost = await seedPost(backend, "authorless-post", null);
		const viewerPost = await seedPost(backend, "viewer-post");

		const anonymous = await backend.handler(deleteRequest(anonymousPost.id));
		const authorless = await backend.handler(deleteRequest(authorlessPost.id));
		const viewer = await backend.handler(
			deleteRequest(viewerPost.id, { id: "viewer-1", role: "user" }),
		);

		expect(anonymous.status).toBe(401);
		expect(authorless.status).toBe(401);
		expect(viewer.status).toBe(403);
		expect(await postExists(backend, anonymousPost.id)).toBe(true);
		expect(await postExists(backend, authorlessPost.id)).toBe(true);
		expect(await postExists(backend, viewerPost.id)).toBe(true);
		expect(lifecycleEvents).toEqual([]);
	});

	it("derives trusted facts and allows the owner through HTTP", async () => {
		const backend = makeBackend({ auth: createAuth() });
		const post = await seedPost(backend, "owned-post", "author-1");

		const response = await backend.handler(
			deleteRequest(post.id, { id: "author-1", role: "user" }),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(await postExists(backend, post.id)).toBe(false);
	});

	it("ignores spoofed browser ownership facts", async () => {
		const backend = makeBackend({ auth: createAuth() });
		const post = await seedPost(backend, "spoofed-delete", "author-1");
		expect(
			authorization.can(
				blogPermissions.post.delete({
					id: post.id,
					authorId: "viewer-1",
				}),
				{ id: "viewer-1", role: "user" },
			),
		).toBe(true);

		const response = await backend.handler(
			deleteRequest(post.id, { id: "viewer-1", role: "user" }),
		);
		expect(response.status).toBe(403);
		expect(await postExists(backend, post.id)).toBe(true);
	});

	it("powers the authorized request API with the same operation", async () => {
		let hookContext: unknown;
		const backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeDeletePost: async (_id, context) => {
					hookContext = context;
				},
			},
		});
		const post = await seedPost(backend, "request-post", "author-1");

		await expect(
			backend
				.forRequest(deleteRequest(post.id, { id: "viewer-1", role: "user" }))
				.api.blog.deletePost({ id: post.id }),
		).rejects.toMatchObject({ statusCode: 403 });
		expect(await postExists(backend, post.id)).toBe(true);

		await backend
			.forRequest(deleteRequest(post.id, { id: "author-1", role: "user" }))
			.api.blog.deletePost({ id: post.id });
		expect(hookContext).toMatchObject({
			identity: { id: "author-1", role: "user" },
			input: { id: post.id },
			facts: { id: post.id, authorId: "author-1" },
			request: expect.any(Request),
		});
		expect(await postExists(backend, post.id)).toBe(false);
	});

	it("freezes lifecycle identity without corrupting the request auth cache", async () => {
		let beforeCalls = 0;
		const backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeDeletePost: (_id, context) => {
					beforeCalls += 1;
					if (context.identity) {
						(context.identity as { id: string }).id = "author-2";
					}
				},
			},
		});
		const viewerPost = await seedPost(backend, "viewer-owned", "viewer-1");
		const otherPost = await seedPost(backend, "other-owned", "author-2");
		const request = deleteRequest(viewerPost.id, {
			id: "viewer-1",
			role: "user",
		});
		const requestApi = backend.forRequest(request).api.blog;

		await expect(requestApi.deletePost({ id: viewerPost.id })).rejects.toThrow(
			"Cannot assign to read only property",
		);
		await expect(
			requestApi.deletePost({ id: otherPost.id }),
		).rejects.toMatchObject({ statusCode: 403 });

		expect(beforeCalls).toBe(1);
		expect(await postExists(backend, viewerPost.id)).toBe(true);
		expect(await postExists(backend, otherPost.id)).toBe(true);
	});

	it("keeps trusted internal calls validated and lifecycle-aware without resolving identity", async () => {
		const events: string[] = [];
		const getIdentity = vi.fn(() => ({
			id: "viewer-1",
			role: "user" as const,
		}));
		const backend = makeBackend({
			auth: createAuth(getIdentity),
			hooks: {
				onBeforeDeletePost: (id) => {
					events.push(`before:${id}`);
				},
				onPostDeleted: (id, context) => {
					events.push(`after:${id}`);
					expect(context).toMatchObject({
						identity: null,
						input: { id },
						facts: { id, authorId: "author-1" },
						result: { success: true },
					});
				},
				onDeletePostError: (_error, context) => {
					events.push(`error:${context.params?.id ?? "invalid"}`);
				},
			},
		});
		const post = await seedPost(backend, "internal-post");

		await backend.internal.blog.deletePost({ id: post.id });

		expect(events).toEqual([`before:${post.id}`, `after:${post.id}`]);
		expect(getIdentity).not.toHaveBeenCalled();
		expect(await postExists(backend, post.id)).toBe(false);
		await expect(
			backend.internal.blog.deletePost({ id: 1 } as never),
		).rejects.toBeInstanceOf(z.ZodError);
		expect(events).toEqual([`before:${post.id}`, `after:${post.id}`]);
	});

	it("does not enter the lifecycle when trusted fact derivation fails", async () => {
		const onDeletePostError = vi.fn();
		const backend = makeBackend({
			hooks: { onDeletePostError },
		});
		const post = await seedPost(backend, "fact-failure");
		vi.spyOn(backend.adapter, "findOne").mockRejectedValueOnce(
			new Error("database unavailable"),
		);

		await expect(
			backend.internal.blog.deletePost({ id: post.id }),
		).rejects.toThrow("database unavailable");

		expect(onDeletePostError).not.toHaveBeenCalled();
		expect(await postExists(backend, post.id)).toBe(true);
	});

	it("runs the error lifecycle after authorization without replacing the operation error", async () => {
		const events: string[] = [];
		const backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeDeletePost: (_id, context) => {
					events.push(`before:${context.identity?.id}`);
				},
				onDeletePostError: (error, context) => {
					events.push(`error:${context.identity?.id}:${error.message}`);
					throw new Error("observability unavailable");
				},
			},
		});
		const post = await seedPost(backend, "execution-failure", "author-1");
		vi.spyOn(backend.adapter, "delete").mockRejectedValueOnce(
			new Error("delete unavailable"),
		);

		await expect(
			backend
				.forRequest(deleteRequest(post.id, { id: "author-1", role: "user" }))
				.api.blog.deletePost({ id: post.id }),
		).rejects.toThrow("delete unavailable");

		expect(events).toEqual([
			"before:author-1",
			"error:author-1:delete unavailable",
		]);
		expect(await postExists(backend, post.id)).toBe(true);
	});

	it("normalizes non-Error failures for the Blog error hook", async () => {
		let observedError: Error | undefined;
		const backend = makeBackend({
			hooks: {
				onDeletePostError: (error) => {
					observedError = error;
				},
			},
		});
		const post = await seedPost(backend, "non-error-failure");
		vi.spyOn(backend.adapter, "delete").mockRejectedValueOnce(
			"delete unavailable",
		);

		await expect(
			backend.internal.blog.deletePost({ id: post.id }),
		).rejects.toBe("delete unavailable");
		expect(observedError).toBeInstanceOf(Error);
		expect(observedError?.message).toBe("delete unavailable");
	});

	it("preserves allow-all behavior when authorization is omitted", async () => {
		const backend = makeBackend();
		const post = await seedPost(backend, "legacy-post");

		const response = await backend.handler(deleteRequest(post.id));

		expect(response.status).toBe(200);
		expect(await postExists(backend, post.id)).toBe(false);
	});

	it("keeps identity and rule failures as errors", async () => {
		const identityLifecycleEvents: string[] = [];
		const identityFailure = makeBackend({
			auth: createAuth(() => {
				throw new Error("session unavailable");
			}),
			hooks: {
				onBeforeDeletePost: () => {
					identityLifecycleEvents.push("before");
				},
				onPostDeleted: () => {
					identityLifecycleEvents.push("after");
				},
				onDeletePostError: () => {
					identityLifecycleEvents.push("error");
					throw new Error("hook must not replace identity failure");
				},
			},
		});
		const identityFailurePost = await seedPost(
			identityFailure,
			"identity-failure",
		);

		await expect(
			identityFailure
				.forRequest(deleteRequest(identityFailurePost.id))
				.api.blog.deletePost({ id: identityFailurePost.id }),
		).rejects.toThrow("session unavailable");
		expect(await postExists(identityFailure, identityFailurePost.id)).toBe(
			true,
		);
		expect(identityLifecycleEvents).toEqual([]);

		const failingAuthorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.literal("admin") }),
			permissions: [blogPermissions] as const,
			rules: ({ blog }) => [
				blog.post.delete.when(() => {
					throw new Error("policy unavailable");
				}),
			],
		});
		const ruleLifecycleEvents: string[] = [];
		const ruleFailure = stack({
			basePath: "/api",
			plugins: {
				blog: blogBackendPlugin({
					onBeforeDeletePost: () => {
						ruleLifecycleEvents.push("before");
					},
					onPostDeleted: () => {
						ruleLifecycleEvents.push("after");
					},
					onDeletePostError: () => {
						ruleLifecycleEvents.push("error");
						throw new Error("hook must not replace rule failure");
					},
				}),
			},
			adapter: memoryAdapter,
			auth: createServerAuth({
				authorization: failingAuthorization,
				getIdentity: () => ({ id: "admin-1", role: "admin" as const }),
			}),
		});
		const ruleFailurePost = await seedPost(
			ruleFailure as ReturnType<typeof makeBackend>,
			"rule-failure",
		);

		await expect(
			ruleFailure
				.forRequest(deleteRequest(ruleFailurePost.id))
				.api.blog.deletePost({ id: ruleFailurePost.id }),
		).rejects.toThrow("policy unavailable");
		expect(ruleLifecycleEvents).toEqual([]);
		expect(
			await postExists(
				ruleFailure as ReturnType<typeof makeBackend>,
				ruleFailurePost.id,
			),
		).toBe(true);

		const missingRuleAuthorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.literal("admin") }),
			permissions: [blogPermissions] as const,
			rules: () => [],
		});
		const missingRuleLifecycleEvents: string[] = [];
		const missingRule = stack({
			basePath: "/api",
			plugins: {
				blog: blogBackendPlugin({
					onBeforeDeletePost: () => {
						missingRuleLifecycleEvents.push("before");
					},
					onPostDeleted: () => {
						missingRuleLifecycleEvents.push("after");
					},
					onDeletePostError: () => {
						missingRuleLifecycleEvents.push("error");
						throw new Error("hook must not replace missing-rule denial");
					},
				}),
			},
			adapter: memoryAdapter,
			auth: createServerAuth({
				authorization: missingRuleAuthorization,
				getIdentity: () => ({ id: "admin-1", role: "admin" as const }),
			}),
		});
		const missingRulePost = await seedPost(
			missingRule as ReturnType<typeof makeBackend>,
			"missing-rule",
		);

		await expect(
			missingRule
				.forRequest(deleteRequest(missingRulePost.id))
				.api.blog.deletePost({ id: missingRulePost.id }),
		).rejects.toMatchObject({ statusCode: 403 });
		expect(missingRuleLifecycleEvents).toEqual([]);
		expect(
			await postExists(
				missingRule as ReturnType<typeof makeBackend>,
				missingRulePost.id,
			),
		).toBe(true);
	});
});
