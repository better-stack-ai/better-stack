import { createMemoryAdapter } from "@btst/adapter-memory";
import { defineDb, type DatabaseDefinition } from "@btst/db";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { stack } from "../../../api";
import { defineAuthorization } from "../../../authorization";
import { createServerAuth } from "../../../authorization/server";
import type { StackServerAuthProvider } from "../../../shared/auth-types";
import { cmsBackendPlugin, type CMSBackendHooks } from "../api";
import { cmsPermissions } from "../permissions";
import type { ContentItem } from "../types";

const memoryAdapter = (db: DatabaseDefinition) => createMemoryAdapter(db)({});

const articleSchema = z.object({ title: z.string() });
const contentTypes = [
	{ name: "Article", slug: "article", schema: articleSchema },
	{ name: "Secret", slug: "secret", schema: articleSchema },
];

const authorization = defineAuthorization({
	identity: z.object({
		id: z.string(),
		role: z.enum(["user", "admin"]),
	}),
	permissions: [cmsPermissions] as const,
	rules: ({ cms }) => [
		cms.contentType.read.allow(),
		cms.record.read.allow(),
		cms.record.create.when(({ identity }) => identity !== null),
		cms.record.update.when(
			({ identity, facts }) =>
				identity !== null &&
				(identity.role === "admin" || identity.id === facts.authorId),
		),
		cms.record.delete.when(
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
	auth?: StackServerAuthProvider;
	hooks?: CMSBackendHooks;
}) {
	return stack({
		basePath: "/api",
		plugins: {
			cms: cmsBackendPlugin({
				contentTypes,
				...(options?.hooks ? { hooks: options.hooks } : {}),
			}),
		},
		adapter: memoryAdapter,
		...(options?.auth ? { auth: options.auth } : {}),
	});
}

function request(
	path: string,
	options?: {
		method?: string;
		identity?: { id: string; role: "user" | "admin" };
		body?: unknown;
	},
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
		...(options?.body !== undefined
			? { body: JSON.stringify(options.body) }
			: {}),
	});
}

async function seedRecord(
	backend: ReturnType<typeof makeBackend>,
	options: { typeSlug?: string; slug: string; authorId?: string },
) {
	const typeSlug = options.typeSlug ?? "article";
	const contentType = (await backend.api.cms.getAllContentTypes()).find(
		(value) => value.slug === typeSlug,
	);
	if (!contentType) throw new Error(`Missing test content type ${typeSlug}`);
	return backend.adapter.create<ContentItem>({
		model: "contentItem",
		data: {
			contentTypeId: contentType.id,
			slug: options.slug,
			data: JSON.stringify({ title: options.slug }),
			...(options.authorId ? { authorId: options.authorId } : {}),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}

describe("CMS authorization inventory", () => {
	it("binds every maintained route behavior to the CMS catalog", () => {
		const plugin = cmsBackendPlugin({ contentTypes });
		const adapter = memoryAdapter(defineDb({}).use(plugin.dbPlugin));
		const operations = plugin.operations?.(adapter);
		expect(Object.keys(operations ?? {}).sort()).toEqual([
			"createContentItem",
			"deleteContentItem",
			"getContentItem",
			"getContentItemPopulated",
			"getContentTypeBySlug",
			"getInverseRelations",
			"listContentByRelation",
			"listContentItems",
			"listContentTypes",
			"listInverseRelationItems",
			"updateContentItem",
		]);
		expect(
			Object.fromEntries(
				Object.entries(operations ?? {}).map(([name, operation]) => [
					name,
					operation.permission.id,
				]),
			),
		).toEqual({
			listContentTypes: "cms:contentType.read",
			getContentTypeBySlug: "cms:contentType.read",
			listContentItems: "cms:record.read",
			getContentItem: "cms:record.read",
			createContentItem: "cms:record.create",
			updateContentItem: "cms:record.update",
			deleteContentItem: "cms:record.delete",
			getContentItemPopulated: "cms:record.read",
			listContentByRelation: "cms:record.read",
			getInverseRelations: "cms:contentType.read",
			listInverseRelationItems: "cms:record.read",
		});

		expect(
			cmsPermissions.record.update({
				contentType: "article",
				recordId: "record-1",
				authorId: "author-1",
			}),
		).toMatchObject({ id: "cms:record.update" });
		expect(() =>
			cmsPermissions.record.update({
				contentType: "article",
				recordId: 1,
			} as never),
		).toThrow();
		if (false) {
			// @ts-expect-error CMS descriptors reject the RC fact vocabulary.
			cmsPermissions.record.delete({ typeSlug: "article", id: "record-1" });
		}
	});

	it("keeps raw SSG helpers out of request and internal operation namespaces", async () => {
		const backend = makeBackend();
		const operationRequest = request("/content-types");
		expect(typeof backend.api.cms.prefetchForRoute).toBe("function");
		expect(
			"prefetchForRoute" in backend.forRequest(operationRequest).api.cms,
		).toBe(false);
		expect("prefetchForRoute" in backend.internal.cms).toBe(false);
	});
});

describe("CMS operation-first authorization", () => {
	it("keeps public reads explicit and preserves HTTP/request/internal parity", async () => {
		const backend = makeBackend({ auth: createAuth() });
		const seeded = await seedRecord(backend, {
			slug: "public-article",
			authorId: "author-1",
		});

		const http = await backend.handler(request("/content/article"));
		expect(http.status).toBe(200);
		expect((await http.json()).items).toHaveLength(1);
		const requestResult = await backend
			.forRequest(request("/content/article"))
			.api.cms.listContentItems({ typeSlug: "article", query: {} });
		expect(requestResult.items[0]?.id).toBe(seeded.id);
		const internalResult = await backend.internal.cms.listContentItems({
			typeSlug: "article",
			query: {},
		});
		expect(internalResult.items[0]?.id).toBe(seeded.id);
		expect(
			authorization.can(
				cmsPermissions.record.read({ contentType: "article" }),
				null,
			),
		).toBe(true);
	});

	it("returns 401/403 and derives identity plus ownership on the server", async () => {
		const events: string[] = [];
		const backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeCreate: (_data, context) => {
					if (false) {
						// @ts-expect-error Authorized lifecycle input is immutable.
						context.input.body.slug = "rewritten";
						// @ts-expect-error Nested CMS input is immutable.
						context.input.body.data.title = "rewritten";
					}
					events.push(`create:${context.identity?.id}`);
					expect(context.facts).toEqual({ contentType: "article" });
				},
				onAfterCreate: (item, context) => {
					if (false) {
						// @ts-expect-error Authorized lifecycle results are deeply immutable.
						item.contentType!.slug = "rewritten";
					}
					events.push(`created:${item.authorId}`);
					expect(context.result).toBe(item);
				},
				onBeforeUpdate: (_id, _data, context) => {
					events.push(`update:${context.identity?.id}`);
				},
				onAfterUpdate: (item, context) => {
					events.push(`updated:${item.authorId}`);
					expect(context.result).toBe(item);
				},
				onBeforeDelete: (_id, context) => {
					events.push(`delete:${context.identity?.id ?? "internal"}`);
				},
				onAfterDelete: (_id, context) => {
					events.push(`deleted:${context.result.success}`);
				},
			},
		});
		const body = { slug: "owned", data: { title: "Owned" } };
		const anonymousCreate = await backend.handler(
			request("/content/article", { method: "POST", body }),
		);
		expect(anonymousCreate.status).toBe(401);
		expect(events).toEqual([]);

		const createdResponse = await backend.handler(
			request("/content/article", {
				method: "POST",
				identity: { id: "author-1", role: "user" },
				body,
			}),
		);
		expect(createdResponse.status).toBe(200);
		const created = (await createdResponse.json()) as ContentItem;
		expect(created.authorId).toBe("author-1");
		expect(events).toEqual(["create:author-1", "created:author-1"]);

		const denied = await backend.handler(
			request(`/content/article/${created.id}`, {
				method: "PUT",
				identity: { id: "viewer-1", role: "user" },
				body: { data: { title: "Spoofed" } },
			}),
		);
		expect(denied.status).toBe(403);
		expect(events).toHaveLength(2);

		const updated = await backend
			.forRequest(
				request(`/content/article/${created.id}`, {
					identity: { id: "author-1", role: "user" },
				}),
			)
			.api.cms.updateContentItem({
				typeSlug: "article",
				id: created.id,
				body: { data: { title: "Owner update" } },
			});
		expect(
			(updated as unknown as { parsedData: { title: string } }).parsedData
				.title,
		).toBe("Owner update");
		expect(events).toContain("update:author-1");

		await backend.internal.cms.deleteContentItem({
			typeSlug: "article",
			id: created.id,
		});
		expect(events).toContain("delete:internal");
		expect(events).toContain("deleted:true");
		expect(
			await backend.adapter.findOne({
				model: "contentItem",
				where: [{ field: "id", value: created.id }],
			}),
		).toBeFalsy();
	});

	it("ignores spoofed browser ownership and content-type facts", async () => {
		const backend = makeBackend({ auth: createAuth() });
		const record = await seedRecord(backend, {
			typeSlug: "secret",
			slug: "private",
			authorId: "author-1",
		});
		expect(
			authorization.can(
				cmsPermissions.record.delete({
					contentType: "article",
					recordId: record.id,
					authorId: "viewer-1",
				}),
				{ id: "viewer-1", role: "user" },
			),
		).toBe(true);

		const spoofedOwner = await backend.handler(
			request(`/content/secret/${record.id}`, {
				method: "DELETE",
				identity: { id: "viewer-1", role: "user" },
			}),
		);
		expect(spoofedOwner.status).toBe(403);
		const spoofedType = await backend.handler(
			request(`/content/article/${record.id}`, {
				identity: { id: "viewer-1", role: "user" },
			}),
		);
		expect(spoofedType.status).toBe(404);
	});

	it("derives detail-by-slug facts for UI Builder and other page renderers", async () => {
		const ownerReadAuthorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.enum(["user", "admin"]) }),
			permissions: [cmsPermissions] as const,
			rules: ({ cms }) => [
				cms.record.read.when(
					({ identity, facts }) =>
						identity?.id === facts.authorId && facts.recordId !== undefined,
				),
			],
		});
		const backend = makeBackend({
			auth: createServerAuth({
				authorization: ownerReadAuthorization,
				getIdentity: ({ request: currentRequest }) => {
					const id = currentRequest.headers.get("x-user-id");
					return id ? { id, role: "user" as const } : null;
				},
			}),
		});
		const record = await seedRecord(backend, {
			slug: "rendered-page",
			authorId: "owner-1",
		});

		const owner = await backend.handler(
			request("/content/article?slug=rendered-page&limit=1", {
				identity: { id: "owner-1", role: "user" },
			}),
		);
		expect(owner.status).toBe(200);
		expect((await owner.json()).items[0]?.id).toBe(record.id);
		const viewer = await backend.handler(
			request("/content/article?slug=rendered-page&limit=1", {
				identity: { id: "viewer-1", role: "user" },
			}),
		);
		expect(viewer.status).toBe(403);
	});

	it("keeps anonymous by-slug rendering public without exposing the admin list", async () => {
		const publicPageAuthorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.enum(["user", "admin"]) }),
			permissions: [cmsPermissions] as const,
			rules: ({ cms }) => [
				cms.record.read.when(
					({ facts }) =>
						facts.contentType === "article" && facts.recordId !== undefined,
				),
			],
		});
		const backend = makeBackend({
			auth: createServerAuth({
				authorization: publicPageAuthorization,
				getIdentity: () => null,
			}),
		});
		const record = await seedRecord(backend, {
			slug: "public-render",
			authorId: "owner-1",
		});

		const publicRender = await backend.handler(
			request("/content/article?slug=public-render&limit=1"),
		);
		expect(publicRender.status).toBe(200);
		expect((await publicRender.json()).items[0]?.id).toBe(record.id);
		expect(await backend.handler(request("/content/article"))).toMatchObject({
			status: 401,
		});
	});

	it("does not return a by-slug record whose ownership changes after authorization", async () => {
		const ownerReadAuthorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.literal("user") }),
			permissions: [cmsPermissions] as const,
			rules: ({ cms }) => [
				cms.record.read.when(
					({ identity, facts }) => identity?.id === facts.authorId,
				),
			],
		});
		const backend = makeBackend({
			auth: createServerAuth({
				authorization: ownerReadAuthorization,
				getIdentity: () => ({ id: "owner-1", role: "user" as const }),
			}),
		});
		const record = await seedRecord(backend, {
			slug: "ownership-race",
			authorId: "owner-1",
		});
		const findMany = backend.adapter.findMany.bind(backend.adapter);
		vi.spyOn(backend.adapter, "findMany").mockImplementation(async (query) => {
			if (query.model === "contentItem") {
				await backend.adapter.update<ContentItem>({
					model: "contentItem",
					where: [{ field: "id", value: record.id }],
					update: { authorId: "other-owner" },
				});
			}
			return findMany(query);
		});

		const response = await backend.handler(
			request("/content/article?slug=ownership-race&limit=1"),
		);
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			code: "RECORD_STATE_CHANGED",
		});
	});

	it("keeps identity, missing-rule, policy, fact, and input failures outside hooks", async () => {
		const events: string[] = [];
		const hooks: CMSBackendHooks = {
			onBeforeDelete: () => {
				events.push("before");
			},
			onAfterDelete: () => {
				events.push("after");
			},
			onError: () => {
				events.push("error");
			},
		};
		const identityFailure = makeBackend({
			auth: createAuth(() => {
				throw new Error("session unavailable");
			}),
			hooks,
		});
		const identityRecord = await seedRecord(identityFailure, {
			slug: "identity-failure",
			authorId: "author-1",
		});
		await expect(
			identityFailure.forRequest(request("/delete")).api.cms.deleteContentItem({
				typeSlug: "article",
				id: identityRecord.id,
			}),
		).rejects.toThrow("session unavailable");

		for (const [rule, expected] of [
			[undefined, { statusCode: 403 }],
			["throw", "policy unavailable"],
		] as const) {
			const definition = defineAuthorization({
				identity: z.object({ id: z.string(), role: z.literal("user") }),
				permissions: [cmsPermissions] as const,
				rules: ({ cms }) =>
					rule === "throw"
						? [
								cms.record.delete.when(() => {
									throw new Error("policy unavailable");
								}),
							]
						: [],
			});
			const backend = makeBackend({
				auth: createServerAuth({
					authorization: definition,
					getIdentity: () => ({ id: "author-1", role: "user" as const }),
				}),
				hooks,
			});
			const record = await seedRecord(backend, {
				slug: `rule-${rule ?? "missing"}`,
				authorId: "author-1",
			});
			const rejection = expect(
				backend.forRequest(request("/delete")).api.cms.deleteContentItem({
					typeSlug: "article",
					id: record.id,
				}),
			).rejects;
			if (typeof expected === "string") await rejection.toThrow(expected);
			else await rejection.toMatchObject(expected);
		}

		const factFailure = makeBackend({ hooks });
		vi.spyOn(factFailure.adapter, "findOne").mockRejectedValueOnce(
			new Error("facts unavailable"),
		);
		await expect(
			factFailure.internal.cms.deleteContentItem({
				typeSlug: "article",
				id: "missing",
			}),
		).rejects.toThrow("facts unavailable");
		await expect(
			factFailure.internal.cms.deleteContentItem({
				typeSlug: "article",
				id: 1,
			} as never),
		).rejects.toBeInstanceOf(z.ZodError);
		expect(events).toEqual([]);
	});

	it("detects ownership changes after authorization before an update commits", async () => {
		const events: string[] = [];
		let backend: ReturnType<typeof makeBackend>;
		backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeUpdate: async (id) => {
					events.push("before");
					await backend.adapter.update<ContentItem>({
						model: "contentItem",
						where: [{ field: "id", value: id }],
						update: { authorId: "other-owner" },
					});
				},
				onAfterUpdate: () => {
					events.push("after");
				},
				onError: (_error, operation, context) => {
					events.push(`error:${operation}`);
					expect(context.error).toMatchObject({
						code: "RECORD_STATE_CHANGED",
					});
				},
			},
		});
		const record = await seedRecord(backend, {
			slug: "stale-owner",
			authorId: "author-1",
		});
		await expect(
			backend
				.forRequest(
					request(`/content/article/${record.id}`, {
						identity: { id: "author-1", role: "user" },
					}),
				)
				.api.cms.updateContentItem({
					typeSlug: "article",
					id: record.id,
					body: { data: { title: "Must not commit" } },
				}),
		).rejects.toMatchObject({ statusCode: 409, code: "RECORD_STATE_CHANGED" });
		expect(events).toEqual(["before", "error:update"]);
		const persisted = await backend.adapter.findOne<ContentItem>({
			model: "contentItem",
			where: [{ field: "id", value: record.id }],
		});
		expect(JSON.parse(persisted?.data ?? "{}").title).toBe("stale-owner");
	});

	it("preserves permissive compatibility when authorization is omitted", async () => {
		const backend = makeBackend();
		const response = await backend.handler(
			request("/content/article", {
				method: "POST",
				body: { slug: "legacy", data: { title: "Legacy" } },
			}),
		);
		expect(response.status).toBe(200);
	});
});
