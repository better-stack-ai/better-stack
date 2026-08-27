import { createMemoryAdapter } from "@btst/adapter-memory";
import { defineDb, type DatabaseDefinition } from "@btst/db";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { stack } from "../../../api";
import { defineAuthorization } from "../../../authorization";
import { createServerAuth } from "../../../authorization/server";
import type { StackServerAuthProvider } from "../../../shared/auth-types";
import { commentsBackendPlugin, type CommentsBackendOptions } from "../api";
import { commentsPermissions } from "../permissions";
import type { Comment, CommentLike } from "../types";

const memoryAdapter = (db: DatabaseDefinition) => createMemoryAdapter(db)({});

const authorization = defineAuthorization({
	identity: z.object({
		id: z.string(),
		role: z.enum(["user", "moderator"]),
	}),
	permissions: [commentsPermissions] as const,
	rules: ({ comments }) => [
		comments.thread.read.when(({ identity, facts }) => {
			if (facts.scope === "public") return true;
			if (facts.scope === "own") {
				return (
					identity?.id === facts.authorId || identity?.role === "moderator"
				);
			}
			return identity?.role === "moderator";
		}),
		comments.thread.createComment.when(({ identity }) => identity !== null),
		comments.comment.edit.when(
			({ identity, facts }) =>
				identity?.id === facts.authorId || identity?.role === "moderator",
		),
		comments.comment.delete.when(
			({ identity, facts }) =>
				identity?.id === facts.authorId || identity?.role === "moderator",
		),
		comments.comment.react.when(
			({ identity, facts }) => identity !== null && facts.status === "approved",
		),
		comments.comment.moderate.when(
			({ identity }) => identity?.role === "moderator",
		),
	],
});

type Identity = { id: string; role: "user" | "moderator" };

function createAuth(
	getIdentity: (
		request: Request,
	) => Identity | null | Promise<Identity | null> = (request) => {
		const id = request.headers.get("x-user-id");
		const role = request.headers.get("x-user-role");
		if (!id || (role !== "user" && role !== "moderator")) return null;
		return { id, role };
	},
) {
	return createServerAuth({
		authorization,
		getIdentity: ({ request }) => getIdentity(request),
	});
}

function makeBackend(options?: {
	plugin?: CommentsBackendOptions;
	auth?: StackServerAuthProvider;
}) {
	return stack({
		basePath: "/api",
		plugins: { comments: commentsBackendPlugin(options?.plugin) },
		adapter: memoryAdapter,
		...(options?.auth ? { auth: options.auth } : {}),
	});
}

function request(
	path: string,
	options?: { method?: string; identity?: Identity; body?: unknown },
) {
	const headers = new Headers();
	if (options?.identity) {
		headers.set("x-user-id", options.identity.id);
		headers.set("x-user-role", options.identity.role);
	}
	if (options?.body !== undefined)
		headers.set("content-type", "application/json");
	return new Request(`http://localhost/api${path}`, {
		method: options?.method ?? "GET",
		headers,
		...(options?.body === undefined
			? {}
			: { body: JSON.stringify(options.body) }),
	});
}

async function seedComment(
	backend: ReturnType<typeof makeBackend>,
	overrides: Partial<Comment> = {},
) {
	return backend.adapter.create<Comment>({
		model: "comment",
		data: {
			resourceId: "post-1",
			resourceType: "post",
			parentId: null,
			authorId: "owner-1",
			body: "Authorization tracer",
			status: "approved",
			likes: 0,
			createdAt: new Date("2026-01-01T00:00:00.000Z"),
			updatedAt: new Date("2026-01-01T00:00:00.000Z"),
			...overrides,
		},
	});
}

const owner = { id: "owner-1", role: "user" } as const;
const viewer = { id: "viewer-1", role: "user" } as const;
const moderator = { id: "moderator-1", role: "moderator" } as const;

describe("Comments authorization inventory", () => {
	it("covers every maintained transport operation with one descriptor", () => {
		const plugin = commentsBackendPlugin();
		const adapter = memoryAdapter(defineDb({}).use(plugin.dbPlugin));
		const operations = plugin.operations?.(adapter);
		const expected = [
			"createComment",
			"deleteComment",
			"getCommentCount",
			"listComments",
			"toggleLike",
			"updateComment",
			"updateCommentStatus",
		];

		expect(Object.keys(operations ?? {}).sort()).toEqual(expected);
		expect(
			Object.fromEntries(
				Object.entries(operations ?? {}).map(([name, operation]) => [
					name,
					operation.permission.id,
				]),
			),
		).toEqual({
			listComments: "comments:thread.read",
			getCommentCount: "comments:thread.read",
			createComment: "comments:thread.createComment",
			updateComment: "comments:comment.edit",
			toggleLike: "comments:comment.react",
			updateCommentStatus: "comments:comment.moderate",
			deleteComment: "comments:comment.delete",
		});

		const backend = makeBackend({ auth: createAuth() });
		expect(
			Object.keys(backend.forRequest(request("/comments")).api.comments).sort(),
		).toEqual(expected);
		expect(Object.keys(backend.internal.comments).sort()).toEqual(expected);
		expect(Object.keys(backend.api.comments).sort()).toEqual([
			"getCommentById",
			"getCommentCount",
			"listComments",
		]);
		expect(
			"getCommentById" in backend.forRequest(request("/comments")).api.comments,
		).toBe(false);
		expect("getCommentById" in backend.internal.comments).toBe(false);
		expect(
			"toggleCommentLike" in
				backend.forRequest(request("/comments")).api.comments,
		).toBe(false);
		expect("toggleCommentLike" in backend.internal.comments).toBe(false);
		expect("prefetchForRoute" in backend.api.comments).toBe(false);
		expect(
			"prefetchForRoute" in
				backend.forRequest(request("/comments")).api.comments,
		).toBe(false);
		expect("prefetchForRoute" in backend.internal.comments).toBe(false);

		const routeNames = Object.keys(
			(backend.router as unknown as { endpoints: Record<string, unknown> })
				.endpoints,
		)
			.filter((name) => name.startsWith("comments_"))
			.sort();
		expect(routeNames).toEqual([
			"comments_createComment",
			"comments_deleteComment",
			"comments_getCommentCount",
			"comments_listComments",
			"comments_toggleLike",
			"comments_updateComment",
			"comments_updateCommentStatus",
		]);
	});

	it("validates the schema-backed vocabulary at runtime", () => {
		expect(
			commentsPermissions.thread.read({
				scope: "public",
				resourceId: "post-1",
				resourceType: "post",
			}),
		).toMatchObject({ id: "comments:thread.read" });
		expect(() =>
			commentsPermissions.comment.edit({
				commentId: "comment-1",
				authorId: "owner-1",
				status: "published" as "approved",
			}),
		).toThrow();
	});
});

describe("Comments operation-first authorization", () => {
	it("enforces anonymous, owner, non-owner and moderator behavior across the catalog", async () => {
		const backend = makeBackend({
			auth: createAuth(),
			plugin: {
				autoApprove: true,
				onBeforePost: () => ({ authorId: owner.id }),
			},
		});
		const comment = await seedComment(backend);

		const anonymousCreate = await backend.handler(
			request("/comments", {
				method: "POST",
				body: {
					resourceId: "post-1",
					resourceType: "post",
					body: "Anonymous",
				},
			}),
		);
		expect(anonymousCreate.status).toBe(401);
		expect(
			await backend
				.forRequest(request("/comments", { identity: viewer }))
				.api.comments.createComment({
					resourceId: "post-1",
					resourceType: "post",
					body: "Authenticated",
				}),
		).toMatchObject({ authorId: viewer.id });

		await expect(
			backend
				.forRequest(request("/comments", { identity: viewer }))
				.api.comments.updateComment({ id: comment.id, data: { body: "No" } }),
		).rejects.toMatchObject({ statusCode: 403 });
		expect(
			await backend
				.forRequest(request("/comments", { identity: owner }))
				.api.comments.updateComment({
					id: comment.id,
					data: { body: "Owner edit" },
				}),
		).toMatchObject({ body: "Owner edit" });
		expect(
			await backend
				.forRequest(request("/comments", { identity: moderator }))
				.api.comments.updateComment({
					id: comment.id,
					data: { body: "Moderator edit" },
				}),
		).toMatchObject({ body: "Moderator edit" });

		const anonymousLike = await backend.handler(
			request(`/comments/${comment.id}/like`, { method: "POST", body: {} }),
		);
		expect(anonymousLike.status).toBe(401);
		expect(
			await backend
				.forRequest(request("/comments", { identity: viewer }))
				.api.comments.toggleLike({ id: comment.id }),
		).toEqual({ likes: 1, isLiked: true });

		const pending = await seedComment(backend, { status: "pending" });
		await expect(
			backend
				.forRequest(request("/comments", { identity: viewer }))
				.api.comments.toggleLike({ id: pending.id }),
		).rejects.toMatchObject({ statusCode: 403 });
		await expect(
			backend
				.forRequest(request("/comments", { identity: owner }))
				.api.comments.updateCommentStatus({
					id: pending.id,
					data: { status: "approved" },
				}),
		).rejects.toMatchObject({ statusCode: 403 });
		expect(
			await backend
				.forRequest(request("/comments", { identity: moderator }))
				.api.comments.updateCommentStatus({
					id: pending.id,
					data: { status: "approved" },
				}),
		).toMatchObject({ status: "approved" });

		const viewerOwned = await seedComment(backend, { authorId: viewer.id });
		await expect(
			backend
				.forRequest(request("/comments", { identity: owner }))
				.api.comments.deleteComment({ id: viewerOwned.id }),
		).rejects.toMatchObject({ statusCode: 403 });
		expect(
			await backend
				.forRequest(request("/comments", { identity: moderator }))
				.api.comments.deleteComment({ id: viewerOwned.id }),
		).toEqual({ success: true });
	});

	it("protects non-public counts with the same explicit read scopes", async () => {
		const backend = makeBackend({ auth: createAuth() });
		await seedComment(backend);
		await seedComment(backend, { status: "pending" });

		const approved = await backend.handler(
			request("/comments/count?resourceId=post-1&resourceType=post"),
		);
		expect(approved.status).toBe(200);
		expect(await approved.json()).toEqual({ count: 1 });

		const anonymousPending = await backend.handler(
			request(
				"/comments/count?resourceId=post-1&resourceType=post&status=pending",
			),
		);
		const viewerPending = await backend.handler(
			request(
				"/comments/count?resourceId=post-1&resourceType=post&status=pending",
				{
					identity: viewer,
				},
			),
		);
		expect(anonymousPending.status).toBe(401);
		expect(viewerPending.status).toBe(403);
		expect(
			await backend
				.forRequest(request("/comments", { identity: moderator }))
				.api.comments.getCommentCount({
					resourceId: "post-1",
					resourceType: "post",
					status: "pending",
				}),
		).toEqual({ count: 1 });
	});

	it("makes approved threads explicitly public and scopes private rows on the server", async () => {
		const backend = makeBackend({ auth: createAuth() });
		await seedComment(backend);
		await seedComment(backend, {
			authorId: owner.id,
			status: "pending",
			body: "Owner pending",
			createdAt: new Date("2026-01-02T00:00:00.000Z"),
		});
		await seedComment(backend, {
			authorId: viewer.id,
			status: "pending",
			body: "Viewer pending",
			createdAt: new Date("2026-01-03T00:00:00.000Z"),
		});

		const publicResponse = await backend.handler(
			request("/comments?resourceId=post-1&resourceType=post"),
		);
		expect(publicResponse.status).toBe(200);
		expect(
			(await publicResponse.json()).items.map((item: Comment) => item.status),
		).toEqual(["approved"]);

		const ownerResult = await backend
			.forRequest(request("/comments", { identity: owner }))
			.api.comments.listComments({
				resourceId: "post-1",
				resourceType: "post",
			});
		expect(ownerResult.items.map((item) => item.body)).toEqual([
			"Authorization tracer",
			"Owner pending",
		]);
		expect(
			ownerResult.items.some((item) => item.body === "Viewer pending"),
		).toBe(false);

		const anonymousModeration = await backend.handler(
			request("/comments?status=pending"),
		);
		const viewerModeration = await backend.handler(
			request("/comments?status=pending", { identity: viewer }),
		);
		expect(anonymousModeration.status).toBe(401);
		expect(viewerModeration.status).toBe(403);
		const moderation = await backend
			.forRequest(request("/comments", { identity: moderator }))
			.api.comments.listComments({ status: "pending" });
		expect(moderation.items).toHaveLength(2);

		await expect(
			backend
				.forRequest(request("/comments", { identity: viewer }))
				.api.comments.listComments({ authorId: owner.id }),
		).rejects.toMatchObject({ statusCode: 403 });
		expect(
			await backend
				.forRequest(request("/comments", { identity: owner }))
				.api.comments.listComments({ authorId: owner.id }),
		).toMatchObject({ total: 2 });
	});

	it("uses request identity for authorship and reactions instead of spoofable input", async () => {
		const backend = makeBackend({
			auth: createAuth(),
			plugin: { autoApprove: true },
		});
		const api = backend.forRequest(request("/comments", { identity: viewer }))
			.api.comments;
		const created = await api.createComment({
			resourceId: "post-1",
			resourceType: "post",
			body: "Viewer comment",
			authorId: owner.id,
		});
		expect(created.authorId).toBe(viewer.id);

		await api.toggleLike({ id: created.id, authorId: owner.id });
		const like = await backend.adapter.findOne<CommentLike>({
			model: "commentLike",
			where: [{ field: "commentId", value: created.id }],
		});
		expect(like?.authorId).toBe(viewer.id);

		const httpCreated = await backend.handler(
			request("/comments", {
				method: "POST",
				identity: owner,
				body: {
					resourceId: "post-1",
					resourceType: "post",
					body: "HTTP owner",
					authorId: viewer.id,
				},
			}),
		);
		expect(httpCreated.status).toBe(200);
		expect((await httpCreated.json()).authorId).toBe(owner.id);
	});

	it("reloads ownership and status facts before every protected mutation", async () => {
		let backend: ReturnType<typeof makeBackend>;
		backend = makeBackend({
			auth: createAuth(),
			plugin: {
				onBeforeEdit: async (id) => {
					await backend.adapter.update<Comment>({
						model: "comment",
						where: [{ field: "id", value: id }],
						update: { authorId: viewer.id },
					});
				},
			},
		});
		const comment = await seedComment(backend);

		const spoofedBrowserDescriptor = commentsPermissions.comment.edit({
			commentId: comment.id,
			authorId: owner.id,
			status: "approved",
		});
		expect(authorization.can(spoofedBrowserDescriptor, owner)).toBe(true);
		await expect(
			backend
				.forRequest(request("/comments", { identity: owner }))
				.api.comments.updateComment({
					id: comment.id,
					data: { body: "Stale edit" },
				}),
		).rejects.toMatchObject({ statusCode: 409, code: "COMMENT_STATE_CHANGED" });
		expect(
			await backend.adapter.findOne<Comment>({
				model: "comment",
				where: [{ field: "id", value: comment.id }],
			}),
		).toMatchObject({ body: "Authorization tracer", authorId: viewer.id });
	});

	it("keeps authorization failures outside the lifecycle and exposes typed immutable context after auth", async () => {
		const events: string[] = [];
		const backend = makeBackend({
			auth: createAuth(),
			plugin: {
				onBeforeEdit: (_id, _data, context) => {
					events.push(
						`before:${context.identity?.id}:${context.facts.authorId}`,
					);
					expect(Object.isFrozen(context)).toBe(true);
					expect(Object.isFrozen(context.input)).toBe(true);
				},
				onAfterEdit: (result, context) => {
					events.push(`after:${result.body}`);
					expect(context.result).toBe(result);
				},
			},
		});
		const comment = await seedComment(backend);

		await expect(
			backend
				.forRequest(request("/comments", { identity: viewer }))
				.api.comments.updateComment({
					id: comment.id,
					data: { body: "Denied" },
				}),
		).rejects.toMatchObject({ statusCode: 403 });
		expect(events).toEqual([]);

		await backend
			.forRequest(request("/comments", { identity: owner }))
			.api.comments.updateComment({
				id: comment.id,
				data: { body: "Allowed" },
			});
		expect(events).toEqual(["before:owner-1:owner-1", "after:Allowed"]);
	});

	it("keeps identity, rule, and missing-rule failures before lifecycle hooks", async () => {
		const missingRules = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.literal("user") }),
			permissions: [commentsPermissions] as const,
			rules: () => [],
		});
		const cases = [
			createAuth(() => {
				throw new Error("session unavailable");
			}),
			createServerAuth({
				authorization: missingRules,
				getIdentity: () => ({ id: owner.id, role: "user" as const }),
			}),
		] as const;

		for (const auth of cases) {
			const lifecycle = vi.fn();
			const backend = makeBackend({
				auth,
				plugin: { onBeforeDelete: lifecycle },
			});
			const comment = await seedComment(backend);
			await expect(
				backend
					.forRequest(request("/comments", { identity: owner }))
					.api.comments.deleteComment({ id: comment.id }),
			).rejects.toSatisfy(
				(error: unknown) =>
					error instanceof Error &&
					(error.message === "session unavailable" ||
						(error as Error & { statusCode?: number }).statusCode === 403),
			);
			expect(lifecycle).not.toHaveBeenCalled();
		}
	});

	it("keeps HTTP, request and internal transports on the same validated lifecycle", async () => {
		const events: string[] = [];
		const getIdentity = vi.fn((operationRequest: Request) => {
			const id = operationRequest.headers.get("x-user-id");
			const role = operationRequest.headers.get("x-user-role");
			return id && (role === "user" || role === "moderator")
				? ({ id, role } as Identity)
				: null;
		});
		const backend = makeBackend({
			auth: createAuth(getIdentity),
			plugin: {
				onBeforePost: (_input, context) => {
					events.push(`before:${context.identity?.id ?? "internal"}`);
				},
				onAfterPost: (comment, context) => {
					events.push(`after:${comment.authorId}`);
					expect(context.result).toBe(comment);
				},
			},
		});
		const input = {
			resourceId: "post-1",
			resourceType: "post",
			body: "Parity",
		};

		const http = await backend.handler(
			request("/comments", { method: "POST", identity: owner, body: input }),
		);
		expect(http.status).toBe(200);
		const requestCreated = await backend
			.forRequest(request("/comments", { identity: viewer }))
			.api.comments.createComment(input);
		getIdentity.mockClear();
		const internalCreated = await backend.internal.comments.createComment({
			...input,
			authorId: "job-1",
		});

		expect((await http.json()).authorId).toBe(owner.id);
		expect(requestCreated.authorId).toBe(viewer.id);
		expect(internalCreated.authorId).toBe("job-1");
		expect(getIdentity).not.toHaveBeenCalled();
		expect(events).toEqual([
			"before:owner-1",
			"after:owner-1",
			"before:viewer-1",
			"after:viewer-1",
			"before:internal",
			"after:job-1",
		]);

		await expect(
			backend.internal.comments.createComment({
				...input,
				body: "",
				authorId: "job-1",
			}),
		).rejects.toThrow();
	});

	it("preserves permissive RC operation behavior only when no auth provider is configured", async () => {
		const unauthenticatedBackend = makeBackend({ auth: createAuth() });
		const noAuthBackend = makeBackend({
			plugin: {
				onBeforePost: () => ({ authorId: "legacy-session-user" }),
			},
		});
		const protectedComment = await seedComment(unauthenticatedBackend);
		const trustedComment = await seedComment(noAuthBackend);

		const denied = await unauthenticatedBackend.handler(
			request(`/comments/${protectedComment.id}`, { method: "DELETE" }),
		);
		expect(denied.status).toBe(401);
		const allowed = await noAuthBackend.handler(
			request(`/comments/${trustedComment.id}`, { method: "DELETE" }),
		);
		expect(allowed.status).toBe(200);

		const legacyCreate = await noAuthBackend.handler(
			request("/comments", {
				method: "POST",
				body: {
					resourceId: "post-1",
					resourceType: "post",
					body: "RC hook authorship",
				},
			}),
		);
		expect(legacyCreate.status).toBe(200);
		expect(await legacyCreate.json()).toMatchObject({
			authorId: "legacy-session-user",
		});
	});
});
