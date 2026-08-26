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
			({ identity, params }) =>
				identity?.role === "admin" || identity?.id === params.authorId,
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
	authorId = "author-1",
) {
	return backend.adapter.create<Post>({
		model: "post",
		data: {
			authorId,
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
		const backend = makeBackend({ auth: createAuth() });
		const anonymousPost = await seedPost(backend, "anonymous-post");
		const viewerPost = await seedPost(backend, "viewer-post");

		const anonymous = await backend.handler(deleteRequest(anonymousPost.id));
		const viewer = await backend.handler(
			deleteRequest(viewerPost.id, { id: "viewer-1", role: "user" }),
		);

		expect(anonymous.status).toBe(401);
		expect(viewer.status).toBe(403);
		expect(await postExists(backend, anonymousPost.id)).toBe(true);
		expect(await postExists(backend, viewerPost.id)).toBe(true);
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
		const backend = makeBackend({ auth: createAuth() });
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
				onPostDeleted: (id) => {
					events.push(`after:${id}`);
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
	});

	it("preserves allow-all behavior when authorization is omitted", async () => {
		const backend = makeBackend();
		const post = await seedPost(backend, "legacy-post");

		const response = await backend.handler(deleteRequest(post.id));

		expect(response.status).toBe(200);
		expect(await postExists(backend, post.id)).toBe(false);
	});

	it("keeps identity and rule failures as errors", async () => {
		const identityFailure = makeBackend({
			auth: createAuth(() => {
				throw new Error("session unavailable");
			}),
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

		const failingAuthorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.literal("admin") }),
			permissions: [blogPermissions] as const,
			rules: ({ blog }) => [
				blog.post.delete.when(() => {
					throw new Error("policy unavailable");
				}),
			],
		});
		const ruleFailure = stack({
			basePath: "/api",
			plugins: { blog: blogBackendPlugin() },
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
	});
});
