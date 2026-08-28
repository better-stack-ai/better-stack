import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DatabaseDefinition } from "@btst/db";
import {
	defineAuthorization,
	defineAuthorizationContract,
	definePermissions,
	permission,
} from "../authorization";
import { createServerAuth } from "../authorization/server";
import {
	createDbPlugin,
	defineBackendPlugin,
	defineOperation,
	definePassthroughOperation,
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
	it("exposes a versioned rule-free contract for the registered schemas", () => {
		const contract = defineAuthorizationContract({
			identity: z.object({
				id: z.string(),
				role: z.enum(["user", "admin"]),
			}),
			permissions: [blogPermissions] as const,
		});
		const localAuthorization = defineAuthorization({
			contract,
			rules: ({ blog }) => [blog.post.read.allow()],
		});

		expect(contract.permissionIds).toEqual([
			"blog:post.delete",
			"blog:post.read",
		]);
		expect(contract.version).toMatch(/^auth_[0-9a-f]{16}$/);
		expect(contract.parseIdentity({ id: "user-1", role: "user" })).toEqual({
			id: "user-1",
			role: "user",
		});
		expect(
			contract.parsePermission({
				id: "blog:post.delete",
				facts: { id: "post-1" },
			}),
		).toMatchObject({
			id: "blog:post.delete",
			facts: { id: "post-1" },
		});
		expect(() =>
			contract.parsePermission({
				id: "blog:post.delete",
				facts: { id: 1 },
			}),
		).toThrow();
		expect(localAuthorization.contract).toBe(contract);
	});

	it("binds backend rules when the contract uses a separate physical stack copy", async () => {
		const fixtureRoot = mkdtempSync(
			join(process.cwd(), "node_modules/.btst-authorization-copies-"),
		);
		const copyPackage = (name: string) => {
			const packageRoot = join(fixtureRoot, name, "node_modules/@btst/stack");
			const authorizationRoot = join(packageRoot, "src/authorization");
			mkdirSync(authorizationRoot, { recursive: true });
			copyFileSync(
				join(process.cwd(), "package.json"),
				join(packageRoot, "package.json"),
			);
			copyFileSync(
				join(process.cwd(), "src/authorization/index.ts"),
				join(authorizationRoot, "index.ts"),
			);
			return pathToFileURL(join(authorizationRoot, "index.ts")).href;
		};

		try {
			const contractCopy = (await import(
				copyPackage("contract")
			)) as typeof import("../authorization");
			const backendCopy = (await import(
				copyPackage("backend")
			)) as typeof import("../authorization");
			const publishedPermissions = contractCopy.definePermissions("documents", {
				read: contractCopy.permission(z.object({ id: z.string() })),
			});
			const publishedContract = contractCopy.defineAuthorizationContract({
				identity: z.object({ id: z.string() }),
				permissions: [publishedPermissions] as const,
			});
			const backendAuthorization = backendCopy.defineAuthorization({
				contract: publishedContract,
				rules: ({ documents }) => [documents.read.allow()],
			});
			const request = publishedPermissions.read({ id: "document-1" });
			const rebuiltContract = backendCopy.defineAuthorizationContract({
				identity: z.object({ id: z.string() }),
				permissions: [publishedPermissions] as const,
			});

			expect(backendCopy.isPermissionRequest(request)).toBe(true);
			expect(rebuiltContract.version).toBe(publishedContract.version);
			expect(backendAuthorization.can(request, { id: "user-1" })).toBe(true);
		} finally {
			rmSync(fixtureRoot, { recursive: true, force: true });
		}
	});

	it("rejects internal marker keys in permission trees", () => {
		expect(() =>
			definePermissions("reserved", {
				"__btst.authorization.permission-catalog.v1": permission(),
			}),
		).toThrowError(
			'Permission key "__btst.authorization.permission-catalog.v1" is reserved.',
		);
	});

	it("derives the same contract version from equivalent schemas", () => {
		const createContract = () =>
			defineAuthorizationContract({
				identity: z.object({ id: z.string() }),
				permissions: [
					definePermissions("documents", {
						read: permission(z.object({ id: z.string() })),
					}),
				] as const,
			});

		expect(createContract().version).toBe(createContract().version);

		const changed = defineAuthorizationContract({
			identity: z.object({ id: z.string(), tenantId: z.string() }),
			permissions: [
				definePermissions("documents", {
					read: permission(z.object({ id: z.string() })),
				}),
			] as const,
		});
		expect(changed.version).not.toBe(createContract().version);

		const changedFacts = defineAuthorizationContract({
			identity: z.object({ id: z.string() }),
			permissions: [
				definePermissions("documents", {
					read: permission(z.object({ id: z.string(), revision: z.number() })),
				}),
			] as const,
		});
		expect(changedFacts.version).not.toBe(createContract().version);

		const stripIdentity = defineAuthorizationContract({
			identity: z.object({ id: z.string() }),
			permissions: [blogPermissions] as const,
		});
		const strictIdentity = defineAuthorizationContract({
			identity: z.strictObject({ id: z.string() }),
			permissions: [blogPermissions] as const,
		});
		expect(strictIdentity.version).not.toBe(stripIdentity.version);

		const stringMetadata = defineAuthorizationContract({
			identity: z.object({ id: z.string(), value: z.string() }),
			permissions: [blogPermissions] as const,
		});
		const misleadingMetadata = defineAuthorizationContract({
			identity: z.object({
				id: z.string(),
				value: z.number().meta({ type: "string" }),
			}),
			permissions: [blogPermissions] as const,
		});
		expect(misleadingMetadata.version).not.toBe(stringMetadata.version);

		const optionalIdentityField = defineAuthorizationContract({
			identity: z.object({ id: z.string(), value: z.string().optional() }),
			permissions: [blogPermissions] as const,
		});
		expect(optionalIdentityField.version).not.toBe(stringMetadata.version);

		const constrainedIdentity = defineAuthorizationContract({
			identity: z.object({ id: z.string().min(1).max(100) }),
			permissions: [blogPermissions] as const,
		});
		expect(constrainedIdentity.parseIdentity({ id: "user-1" })).toEqual({
			id: "user-1",
		});
		const constrainedFacts = definePermissions("constrained", {
			read: permission(z.array(z.string()).min(1).max(3)),
		});
		const constrainedFactsContract = defineAuthorizationContract({
			identity: z.object({ id: z.string() }),
			permissions: [constrainedFacts] as const,
		});
		expect(
			constrainedFactsContract.parsePermission({
				id: "constrained:read",
				facts: ["one", "two"],
			}),
		).toMatchObject({ facts: ["one", "two"] });
	});

	it("rejects opaque schema behavior that cannot be derived into a version", () => {
		const message =
			"Authorization contract schemas must be fully representable as JSON Schema; custom refinements, transforms, and other opaque behavior are unsupported because they cannot be derived into a stable version.";
		expect(() =>
			defineAuthorizationContract({
				identity: z
					.object({ id: z.string() })
					.refine(({ id }) => id.startsWith("user_")),
				permissions: [blogPermissions] as const,
			}),
		).toThrowError(message);

		expect(() =>
			defineAuthorizationContract({
				identity: z.object({ id: z.string() }),
				permissions: [
					definePermissions("opaque", {
						read: permission(z.string().transform((value) => value.length)),
					}),
				] as const,
			}),
		).toThrowError(message);

		for (const schema of [
			z.coerce.string(),
			z.preprocess((value) => String(value), z.string()),
			z.string().overwrite((value) => value.trim()),
			z.string().catch("fallback"),
			z.string().default("fallback"),
			z.string().prefault("fallback"),
			z.string().regex(/post/i),
			z.stringFormat("tenant", (value) => value.startsWith("tenant_")),
			z.stringFormat("email", () => true),
			z.url({ hostname: /example\.com/ }),
			z.jwt({ alg: "HS256" }),
			z.number().min(Number.POSITIVE_INFINITY),
			z.number().multipleOf(0),
			z.number().multipleOf(-1),
			z.string().min(-1),
			z.string().max(-1),
			z.string().min(1.5),
			z.array(z.string()).min(-1),
			z.array(z.string()).max(1.5),
			z.string().exactOptional(),
			z.lazy(() => z.string()),
			z
				.object({ value: z.string() })
				.check(z.property("value", z.string().startsWith("x"))),
			z.success(z.string()),
			z.file(),
			z.literal(Number.NaN),
			z.literal(Number.POSITIVE_INFINITY),
			z.literal(Number.NEGATIVE_INFINITY),
		]) {
			expect(() =>
				defineAuthorizationContract({
					identity: z.object({ id: z.string() }),
					permissions: [
						definePermissions("opaque", { read: permission(schema) }),
					] as const,
				}),
			).toThrowError(message);
		}
	});

	it("rejects identity schemas that can violate the public identity shape", () => {
		for (const identity of [z.any(), z.object({ id: z.any() })]) {
			expect(() =>
				defineAuthorizationContract({
					identity,
					permissions: [blogPermissions] as const,
				}),
			).toThrow();
		}
	});

	it("snapshots the registered catalog tuple before versioning", () => {
		const permissions = [blogPermissions];
		const contract = defineAuthorizationContract({
			identity: z.object({ id: z.string() }),
			permissions,
		});

		(permissions as unknown as unknown[]).push(commentsPermissions);
		expect(contract.permissions).toEqual([blogPermissions]);
		expect(Object.isFrozen(contract.permissions)).toBe(true);
		expect(() =>
			(contract.permissions as unknown as unknown[]).push(commentsPermissions),
		).toThrow();
	});

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
				return { path: input.path } as const;
			},
		});
		expect(Object.isFrozen(operation)).toBe(true);
		expect("run" in operation).toBe(false);
		expect(Object.getOwnPropertySymbols(operation)).toEqual([]);
		expect(operation.access).toBe("authorized");
		expect(operation.resultMode).toBe("immutable");
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

		const result = await backend.internal.navigation.visit({ path: "/docs" });
		expect(result).toEqual({ path: "/docs" });
		expect(Object.isFrozen(result)).toBe(true);
		expect(() => {
			(result as { path: string }).path = "/changed";
		}).toThrow();
	});

	it("keeps explicit public passthrough operations in the full lifecycle", async () => {
		const publicPermissions = definePermissions("publicStream", {
			start: permission(z.object({ requestId: z.string() })),
		});
		const events: string[] = [];
		const response = new Response("stream");
		const operation = definePassthroughOperation({
			input: z.object({ requestId: z.string() }),
			permission: publicPermissions.start,
			access: "public",
			facts: ({ input }) => {
				events.push("facts");
				return { requestId: input.requestId };
			},
			before: ({ identity }) => {
				events.push("before");
				expect(identity).toBeNull();
			},
			execute: () => {
				events.push("execute");
				return response;
			},
			after: ({ result }) => {
				events.push("after");
				expect(result).toBe(response);
			},
		});
		const plugin = defineBackendPlugin({
			name: "publicStream",
			dbPlugin: createDbPlugin("publicStream", {}),
			operations: () => ({ start: operation }),
			routes: () => ({}),
		});
		const backend = stack({
			basePath: "/api",
			plugins: { publicStream: plugin },
			adapter: (db: DatabaseDefinition) => createMemoryAdapter(db)({}),
			auth: createServerAuth({
				authorization: defineAuthorization({
					identity: z.object({ id: z.string() }),
					permissions: [publicPermissions] as const,
					rules: () => [],
				}),
				getIdentity: () => {
					throw new Error("public operation must not resolve identity");
				},
			}),
		});

		await expect(
			backend
				.forRequest(new Request("http://localhost/api/public-stream"))
				.api.publicStream.start({ requestId: "request-1" }),
		).resolves.toBe(response);
		expect(operation.access).toBe("public");
		expect(operation.resultMode).toBe("passthrough");
		expect(events).toEqual(["facts", "before", "execute", "after"]);
	});

	it("rejects invalid operation access instead of treating it as public", () => {
		const invalidAccessPermissions = definePermissions("invalidAccess", {
			read: permission(),
		});
		expect(() =>
			defineOperation({
				input: z.object({}),
				permission: invalidAccessPermissions.read,
				access: "publik" as never,
				facts: () => undefined,
				execute: () => ({ ok: true }),
			}),
		).toThrow(/access/i);
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

	it("authorizes compound permissions before entering the operation lifecycle", async () => {
		const compoundPermissions = definePermissions("compound", {
			source: permission(z.object({ allowed: z.boolean() })),
			target: permission(z.object({ type: z.string() })),
		});
		const compoundAuthorization = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [compoundPermissions] as const,
			rules: ({ compound }) => [
				compound.source.when(({ facts }) => facts.allowed),
			],
		});
		const events: string[] = [];
		const compoundOperation = defineOperation({
			input: z.object({ targetType: z.string(), allowed: z.boolean() }),
			permission: compoundPermissions.source,
			facts: ({ input }) => ({ allowed: input.allowed }),
			additionalPermissions: ({ input }) => {
				events.push("derive");
				if (input.targetType === "throws") {
					throw new Error("compound derivation should not run");
				}
				return [compoundPermissions.target({ type: input.targetType })];
			},
			before: () => {
				events.push("before");
			},
			execute: () => {
				events.push("execute");
				return { success: true } as const;
			},
			onError: () => {
				events.push("error");
			},
		});
		const compoundPlugin = defineBackendPlugin({
			name: "compound",
			dbPlugin: createDbPlugin("compound", {}),
			operations: () => ({ create: compoundOperation }),
			routes: () => ({}),
		});
		const backend = stack({
			basePath: "/api",
			plugins: { compound: compoundPlugin },
			adapter: (db: DatabaseDefinition) => createMemoryAdapter(db)({}),
			auth: createServerAuth({
				authorization: compoundAuthorization,
				getIdentity: () => ({ id: "user-1" }),
			}),
		});

		await expect(
			backend
				.forRequest(new Request("http://localhost/api/compound"))
				.api.compound.create({ targetType: "secret", allowed: true }),
		).rejects.toMatchObject({ statusCode: 403 });
		expect(events).toEqual(["derive"]);

		events.length = 0;
		await expect(
			backend
				.forRequest(new Request("http://localhost/api/compound"))
				.api.compound.create({ targetType: "throws", allowed: false }),
		).rejects.toMatchObject({ statusCode: 403 });
		expect(events).toEqual([]);

		await expect(
			backend.internal.compound.create({
				targetType: "secret",
				allowed: false,
			}),
		).resolves.toEqual({ success: true });
		expect(events).toEqual(["derive", "before", "execute"]);
	});
});
