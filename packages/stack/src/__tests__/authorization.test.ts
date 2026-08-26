import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DatabaseDefinition } from "@btst/db";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../authorization";
import {
	createDbPlugin,
	defineBackendPlugin,
	defineOperation,
} from "../plugins/api";
import { stack } from "../api";

const blogPermissions = definePermissions("blog", {
	post: {
		read: permission(),
		delete: permission(
			z.object({
				id: z.string(),
				authorId: z.string().optional(),
			}),
		),
	},
});

const commentsPermissions = definePermissions("comments", {
	comment: {
		delete: permission(z.object({ id: z.string() })),
	},
});

const authorization = defineAuthorization({
	identity: z.object({
		id: z.string(),
		role: z.enum(["user", "admin"]),
	}),
	permissions: [blogPermissions] as const,
	rules: ({ blog }) => [
		blog.post.read.allow(),
		blog.post.delete.when(
			({ identity, facts }) =>
				identity !== null &&
				(identity.role === "admin" || identity.id === facts.authorId),
		),
	],
});

describe("schema-backed authorization", () => {
	it("validates permission facts when the request is created", () => {
		expect(() => blogPermissions.post.delete({ id: 1 } as never)).toThrow();
		expect(blogPermissions.post.delete({ id: "post-1" })).toMatchObject({
			id: "blog:post.delete",
			facts: { id: "post-1" },
		});
	});

	it("keeps nested permission descriptors immutable", () => {
		const deletePermission = blogPermissions.post.delete;

		expect(Object.isFrozen(blogPermissions)).toBe(true);
		expect(Object.isFrozen(blogPermissions.post)).toBe(true);
		expect(Object.isFrozen(deletePermission)).toBe(true);
		expect(() => {
			(blogPermissions.post as { delete: unknown }).delete =
				commentsPermissions.comment.delete;
		}).toThrow();
		expect(blogPermissions.post.delete).toBe(deletePermission);
		expect(blogPermissions.post.delete({ id: "post-1" }).id).toBe(
			"blog:post.delete",
		);
	});

	it("supports explicit allow and conditional rules", () => {
		expect(authorization.can(blogPermissions.post.read(), null)).toBe(true);
		expect(
			authorization.can(blogPermissions.post.delete({ id: "post-1" }), {
				id: "admin-1",
				role: "admin",
			}),
		).toBe(true);
		expect(
			authorization.can(
				blogPermissions.post.delete({
					id: "post-1",
					authorId: "author-1",
				}),
				{ id: "author-1", role: "user" },
			),
		).toBe(true);
		expect(
			authorization.can(
				blogPermissions.post.delete({
					id: "post-1",
					authorId: "author-1",
				}),
				{ id: "viewer-1", role: "user" },
			),
		).toBe(false);
	});

	it("denies a registered permission without a matching rule", () => {
		const noRules = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [blogPermissions] as const,
			rules: () => [],
		});

		expect(noRules.can(blogPermissions.post.read(), null)).toBe(false);
	});

	it("rejects invalid identities and unregistered permissions", () => {
		expect(() =>
			authorization.can(blogPermissions.post.read(), {
				id: "user-1",
				role: "owner",
			} as never),
		).toThrow();
		expect(() =>
			authorization.can(
				commentsPermissions.comment.delete({ id: "comment-1" }) as never,
				null,
			),
		).toThrow(/not registered/i);
	});

	it("does not turn rule failures into denials", () => {
		const failing = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [blogPermissions] as const,
			rules: ({ blog }) => [
				blog.post.delete.when(() => {
					throw new Error("policy unavailable");
				}),
			],
		});

		expect(() =>
			failing.can(blogPermissions.post.delete({ id: "post-1" }), null),
		).toThrow("policy unavailable");
	});

	it("runs operations backed by permissions without fact schemas", async () => {
		const navigationPermissions = definePermissions("navigation", {
			visit: permission(),
		});
		const operation = defineOperation({
			input: z.object({ path: z.string() }),
			permission: navigationPermissions.visit,
			facts: () => undefined,
			execute: ({ input, facts }) => {
				expect(facts).toBeUndefined();
				return input.path;
			},
		});
		expect(Object.isFrozen(operation)).toBe(true);
		expect("run" in operation).toBe(false);
		expect(Object.getOwnPropertySymbols(operation)).toEqual([]);
		const navigationPlugin = defineBackendPlugin({
			name: "navigation",
			dbPlugin: createDbPlugin("navigation", {}),
			operations: () => ({ visit: operation }),
			routes: () => ({}),
		});
		const backend = stack({
			basePath: "/api",
			plugins: { navigation: navigationPlugin },
			adapter: (db: DatabaseDefinition) => createMemoryAdapter(db)({}),
		});

		await expect(
			backend.internal.navigation.visit({ path: "/docs" }),
		).resolves.toBe("/docs");
	});

	it("deep-freezes validated input and trusted facts before lifecycle hooks", async () => {
		const guardedPermissions = definePermissions("guarded", {
			update: permission(z.object({ target: z.object({ id: z.string() }) })),
		});
		const guardedOperation = defineOperation({
			input: z.object({ target: z.object({ id: z.string() }) }),
			permission: guardedPermissions.update,
			facts: ({ input }) => ({ target: { id: input.target.id } }),
			before: ({ input, facts }) => {
				expect(Object.isFrozen(input)).toBe(true);
				expect(Object.isFrozen(input.target)).toBe(true);
				expect(Object.isFrozen(facts)).toBe(true);
				expect(Object.isFrozen(facts.target)).toBe(true);
				expect(() => {
					(input.target as { id: string }).id = "another-record";
				}).toThrow();
				expect(() => {
					(facts.target as { id: string }).id = "another-record";
				}).toThrow();
			},
			execute: ({ input }) => input.target.id,
		});
		const guardedPlugin = defineBackendPlugin({
			name: "guarded",
			dbPlugin: createDbPlugin("guarded", {}),
			operations: () => ({ update: guardedOperation }),
			routes: () => ({}),
		});
		const backend = stack({
			basePath: "/api",
			plugins: { guarded: guardedPlugin },
			adapter: (db: DatabaseDefinition) => createMemoryAdapter(db)({}),
		});

		await expect(
			backend.internal.guarded.update({ target: { id: "record-1" } }),
		).resolves.toBe("record-1");
	});
});
