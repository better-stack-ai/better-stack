import { createMemoryAdapter } from "@btst/adapter-memory";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	cmsBackendPlugin,
	createCMSContentItem,
	getContentItemBySlug,
} from "../api";
import { cmsPermissions } from "../permissions";
import type { CMSBackendHooks, ContentItem, ContentRevision } from "../types";

function setup(hooks?: CMSBackendHooks) {
	let deniedReadId: string | undefined;
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [cmsPermissions] as const,
		rules: ({ cms }) => [
			cms.contentType.read.allow(),
			cms.record.create.when(({ identity }) => identity !== null),
			cms.record.read.when(
				({ identity, facts }) =>
					identity !== null && facts.recordId !== deniedReadId,
			),
			cms.record.update.when(
				({ identity, facts }) => identity?.id === facts.authorId,
			),
			cms.record.delete.when(
				({ identity, facts }) => identity?.id === facts.authorId,
			),
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
		plugins: {
			cms: cmsBackendPlugin({
				contentTypes: [
					{
						name: "Article",
						slug: "article",
						schema: z.object({
							title: z.string(),
							subtitle: z.string().optional(),
						}),
					},
					{
						name: "Page",
						slug: "page",
						schema: z.object({
							title: z.string(),
							related: z
								.object({ id: z.string() })
								.optional()
								.meta({
									fieldType: "relation",
									relation: {
										type: "belongsTo",
										targetType: "article",
										displayField: "title",
										creatable: true,
									},
								}),
						}),
					},
				],
				hooks,
			}),
		},
	});
	const ops = (user = "editor") =>
		backend.forRequest(
			new Request("http://localhost/api", { headers: { "x-user": user } }),
		).operations.cms;
	const create = (slug = "hello", publishAt?: string | null) =>
		ops().createContentItem({
			typeSlug: "article",
			body: { slug, data: { title: "First" }, publishAt },
		});
	return {
		backend,
		ops,
		create,
		denyRead: (id: string) => {
			deniedReadId = id;
		},
	};
}

const schedule = "2030-12-05T14:30:00.000Z";

describe("CMS revision lifecycle", () => {
	it("appends immutable snapshots for create, update and rollback, including schedule and writer", async () => {
		const afterUpdate = vi.fn();
		const { backend, ops, create } = setup({
			onAfterUpdateContent: afterUpdate,
		});
		const item = await create("hello", schedule);
		await ops().updateContentItem({
			typeSlug: "article",
			id: item.id,
			body: {
				data: { title: "Second", subtitle: "Added later" },
				publishAt: null,
			},
		});
		const history = await ops().listContentRevisions({
			typeSlug: "article",
			id: item.id,
		});
		expect(history.items.map((r) => r.version)).toEqual([2, 1]);
		expect(history.items[1]).toMatchObject({
			authorId: "editor",
			publishAt: schedule,
			data: JSON.stringify({ title: "First" }),
		});
		const restored = await ops().restoreContentRevision({
			typeSlug: "article",
			id: item.id,
			revisionId: history.items[1]!.id,
		});
		expect(restored).toMatchObject({
			id: item.id,
			slug: "hello",
			publishAt: schedule,
			parsedData: { title: "First" },
		});
		expect(restored.parsedData).not.toHaveProperty("subtitle");
		const after = await ops().listContentRevisions({
			typeSlug: "article",
			id: item.id,
		});
		expect(after.items.map((r) => r.version)).toEqual([3, 2, 1]);
		expect(after.items.slice(1)).toEqual(history.items);
		expect(afterUpdate).toHaveBeenCalledTimes(2);
		expect(
			await getContentItemBySlug(backend.adapter, "article", "hello"),
		).toMatchObject({ id: item.id, parsedData: { title: "First" } });
	});

	it("denies anonymous history/restore and another writer's restore over operations and HTTP", async () => {
		const { backend, ops, create } = setup();
		const item = await create();
		const revision = (
			await ops().listContentRevisions({ typeSlug: "article", id: item.id })
		).items[0]!;
		await expect(
			ops("").listContentRevisions({ typeSlug: "article", id: item.id }),
		).rejects.toThrow();
		await expect(
			ops("other").restoreContentRevision({
				typeSlug: "article",
				id: item.id,
				revisionId: revision.id,
			}),
		).rejects.toThrow();
		const path = `/api/content/article/${item.id}/revisions`;
		expect(
			(await backend.handler(new Request(`http://localhost${path}`))).status,
		).toBe(401);
		expect(
			(
				await backend.handler(
					new Request(`http://localhost${path}/${revision.id}/restore`, {
						method: "POST",
						headers: { "x-user": "other" },
					}),
				)
			).status,
		).toBe(403);
		expect(
			(
				await backend.adapter.findMany<ContentRevision>({
					model: "contentRevision",
				})
			).length,
		).toBe(1);
	});

	it("scopes revisions to their item and content type", async () => {
		const { ops, create } = setup();
		const item = await create();
		const other = await create("other");
		const revision = (
			await ops().listContentRevisions({ typeSlug: "article", id: item.id })
		).items[0]!;
		await expect(
			ops().restoreContentRevision({
				typeSlug: "article",
				id: other.id,
				revisionId: revision.id,
			}),
		).rejects.toMatchObject({ statusCode: 404 });
		await expect(
			ops().listContentRevisions({ typeSlug: "page", id: item.id }),
		).rejects.toMatchObject({ statusCode: 404 });
	});

	it("preserves slug uniqueness and does not append a rejected rollback", async () => {
		const { ops, create } = setup();
		const item = await create();
		const revision = (
			await ops().listContentRevisions({ typeSlug: "article", id: item.id })
		).items[0]!;
		await ops().updateContentItem({
			typeSlug: "article",
			id: item.id,
			body: { slug: "renamed" },
		});
		await create("hello");
		await expect(
			ops().restoreContentRevision({
				typeSlug: "article",
				id: item.id,
				revisionId: revision.id,
			}),
		).rejects.toMatchObject({ code: "DUPLICATE_SLUG" });
		expect(
			(await ops().listContentRevisions({ typeSlug: "article", id: item.id }))
				.total,
		).toBe(2);
	});

	it("validates ISO timestamps, preserves an omitted schedule and clears explicit null", async () => {
		const { backend, ops, create } = setup();
		await expect(create("invalid", "tomorrow")).rejects.toThrow();
		await expect(create("invalid", "2030-12-05")).rejects.toThrow();
		const item = await create("scheduled", schedule);
		expect(
			(
				await ops().updateContentItem({
					typeSlug: "article",
					id: item.id,
					body: { data: { title: "Changed" } },
				})
			).publishAt,
		).toBe(schedule);
		expect(
			(
				await ops().updateContentItem({
					typeSlug: "article",
					id: item.id,
					body: { publishAt: null },
				})
			).publishAt,
		).toBeNull();
		const response = await backend.handler(
			new Request(`http://localhost/api/content/article/${item.id}`, {
				method: "PUT",
				headers: { "x-user": "editor", "content-type": "application/json" },
				body: JSON.stringify({ publishAt: "invalid" }),
			}),
		);
		expect(response.status).toBe(400);
	});

	it("starts history on a pre-migration row without changing its data or slug lookup", async () => {
		const { backend } = setup();
		const type = (await backend.trusted.cms.listContentTypes({})).find(
			(t) => t.slug === "article",
		)!;
		const legacy = await backend.adapter.create<ContentItem>({
			model: "contentItem",
			data: {
				contentTypeId: type.id,
				slug: "legacy",
				data: '{"title":"Legacy"}',
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		expect(
			(
				await backend.trusted.cms.listContentRevisions({
					typeSlug: "article",
					id: legacy.id,
				})
			).total,
		).toBe(0);
		await backend.trusted.cms.updateContentItem({
			typeSlug: "article",
			id: legacy.id,
			body: { publishAt: schedule },
		});
		expect(
			await getContentItemBySlug(backend.adapter, "article", "legacy"),
		).toMatchObject({ data: legacy.data, publishAt: schedule });
		expect(
			(
				await backend.trusted.cms.listContentRevisions({
					typeSlug: "article",
					id: legacy.id,
				})
			).items[0],
		).toMatchObject({ version: 1, data: legacy.data });
	});

	it("records revisions for the lower-level helper used by dependent plugins", async () => {
		const { backend } = setup();
		await backend.trusted.cms.listContentTypes({});
		const item = await createCMSContentItem(backend.adapter, "article", {
			slug: "dependent",
			data: { title: "Page payload" },
			publishAt: new Date(schedule),
		});
		expect(
			(
				await backend.trusted.cms.listContentRevisions({
					typeSlug: "article",
					id: item.id,
				})
			).items[0],
		).toMatchObject({ version: 1, publishAt: schedule, data: item.data });
	});

	it("runs update hooks on rollback and leaves history unchanged when the hook denies it", async () => {
		const before = vi.fn();
		const { ops, create } = setup({ onBeforeUpdateContent: before });
		const item = await create();
		const revision = (
			await ops().listContentRevisions({ typeSlug: "article", id: item.id })
		).items[0]!;
		before.mockImplementation(() => {
			throw new Error("Approval required");
		});
		await expect(
			ops().restoreContentRevision({
				typeSlug: "article",
				id: item.id,
				revisionId: revision.id,
			}),
		).rejects.toThrow("Approval required");
		expect(
			(await ops().listContentRevisions({ typeSlug: "article", id: item.id }))
				.total,
		).toBe(1);
	});
});

it("paginates revision history without dropping versions", async () => {
	const { ops, create } = setup();
	const item = await create();
	for (let index = 0; index < 21; index++) {
		await ops().updateContentItem({
			typeSlug: "article",
			id: item.id,
			body: { data: { title: `Version ${index + 2}` } },
		});
	}
	const first = await ops().listContentRevisions({
		typeSlug: "article",
		id: item.id,
	});
	const second = await ops().listContentRevisions({
		typeSlug: "article",
		id: item.id,
		offset: 20,
	});
	expect(first.items).toHaveLength(20);
	expect(first.total).toBe(22);
	expect(second.items.map((revision) => revision.version)).toEqual([2, 1]);
});

it("restores relation junctions, checks target permissions, and clears relations absent from a snapshot", async () => {
	const { backend, ops, create, denyRead } = setup();
	const target = await create();
	const page = await ops().createContentItem({
		typeSlug: "page",
		body: { slug: "linked", data: { title: "Page" } },
	});
	const empty = (
		await ops().listContentRevisions({ typeSlug: "page", id: page.id })
	).items[0]!;
	await ops().updateContentItem({
		typeSlug: "page",
		id: page.id,
		body: { data: { related: { id: target.id } } },
	});
	const linked = (
		await ops().listContentRevisions({ typeSlug: "page", id: page.id })
	).items[0]!;
	await ops().restoreContentRevision({
		typeSlug: "page",
		id: page.id,
		revisionId: empty.id,
	});
	expect(
		await backend.adapter.findMany({
			model: "contentRelation",
			where: [{ field: "sourceId", value: page.id }],
		}),
	).toEqual([]);
	await ops().restoreContentRevision({
		typeSlug: "page",
		id: page.id,
		revisionId: linked.id,
	});
	expect(
		await backend.adapter.findMany({
			model: "contentRelation",
			where: [{ field: "sourceId", value: page.id }],
		}),
	).toMatchObject([{ targetId: target.id }]);
	denyRead(target.id);
	await expect(
		ops().restoreContentRevision({
			typeSlug: "page",
			id: page.id,
			revisionId: linked.id,
		}),
	).rejects.toMatchObject({ statusCode: 403 });
});

it("records a revision for inline related-item creation", async () => {
	const { ops } = setup();
	const page = await ops().createContentItem({
		typeSlug: "page",
		body: {
			slug: "inline",
			data: {
				title: "Page",
				related: { _new: true, data: { title: "Inline article" } },
			},
		},
	});
	const targetId = (page.parsedData.related as { id: string }).id;
	expect(
		(await ops().listContentRevisions({ typeSlug: "article", id: targetId }))
			.items[0],
	).toMatchObject({ version: 1, authorId: "editor" });
});
