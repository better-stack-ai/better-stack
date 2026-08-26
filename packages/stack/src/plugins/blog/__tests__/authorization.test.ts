import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DatabaseDefinition } from "@btst/db";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { stack } from "../../../api";
import { defineAuthorization } from "../../../authorization";
import { createServerAuth } from "../../../authorization/server";
import { blogBackendPlugin, type BlogBackendHooks } from "../api";
import { blogPermissions } from "../permissions";
import type { Post } from "../types";
import type { StackServerAuthProvider } from "../../../shared/auth-types";

const memoryAdapter = (db: DatabaseDefinition) => createMemoryAdapter(db)({});

const authorization = defineAuthorization({
	identity: z.object({
		id: z.string(),
		role: z.enum(["user", "admin"]),
	}),
	permissions: [blogPermissions] as const,
	rules: ({ blog }) => [
		blog.post.delete.when(
			({ identity, facts }) =>
				identity !== null &&
				(identity.role === "admin" || identity.id === facts.authorId),
		),
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
	auth?: StackServerAuthProvider;
}) {
	return stack({
		basePath: "/api",
		plugins: { blog: blogBackendPlugin(options?.hooks) },
		adapter: memoryAdapter,
		...(options?.auth ? { auth: options.auth } : {}),
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
