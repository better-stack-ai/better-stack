import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../authorization";

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
			({ identity, params }) =>
				identity?.role === "admin" || identity?.id === params.authorId,
		),
	],
});

describe("schema-backed authorization", () => {
	it("validates permission facts when the request is created", () => {
		expect(() => blogPermissions.post.delete({ id: 1 } as never)).toThrow();
		expect(blogPermissions.post.delete({ id: "post-1" })).toMatchObject({
			id: "blog:post.delete",
			params: { id: "post-1" },
		});
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
});
