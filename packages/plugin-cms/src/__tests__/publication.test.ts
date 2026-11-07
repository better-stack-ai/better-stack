import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter as Adapter } from "@btst/db";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	cmsBackendPlugin,
	CMS_QUERY_KEYS,
	getContentItemsByRelation,
	getAllContentItems,
	getContentItemById,
	getContentItemBySlug,
} from "../api";
import { cmsPermissions } from "../permissions";
import type { CMSBackendHooks } from "../types";

const policy = {
	stateField: "status",
	scheduledValue: "scheduled",
	publishedValue: "published",
};
const schema = z.object({
	title: z.string(),
	status: z.enum(["draft", "scheduled", "published"]),
});
const due = "2020-01-01T10:00:00.000Z";
const future = "2099-01-01T10:00:00.000Z";
function setup(hooks?: CMSBackendHooks) {
	let adapter!: Adapter;
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [cmsPermissions] as const,
		rules: ({ cms }) => [
			cms.contentType.read.allow(),
			cms.record.create.allow(),
			cms.record.update.allow(),
			cms.record.delete.allow(),
			cms.record.read.when(
				({ identity, facts }) => !!identity || facts.view === "content",
			),
		],
	});
	const backend = createBackendStack({
		basePath: "/api",
		adapter: (db) => (adapter = createMemoryAdapter(db)({})),
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) =>
				request.headers.has("x-editor") ? { id: "editor" } : null,
		}),
		plugins: {
			cms: cmsBackendPlugin({
				contentTypes: [
					{
						name: "Article",
						slug: "article",
						schema: schema.extend({
							related: z
								.object({ id: z.string() })
								.optional()
								.meta({
									fieldType: "relation",
									relation: {
										type: "belongsTo",
										targetType: "page",
										displayField: "title",
									},
								}),
						}),
						publication: policy,
					},
					{ name: "Page", slug: "page", schema },
				],
				hooks,
			}),
		},
	});
	const ops = backend.trusted.cms;
	const create = (
		slug: string,
		status = "scheduled",
		publishAt: string | null = due,
		typeSlug = "article",
	) =>
		ops.createContentItem({
			typeSlug,
			body: { slug, data: { title: slug, status }, publishAt },
		});
	return { backend, ops, create, adapter: () => adapter };
}

describe("CMS scheduled publication", () => {
	it("keeps outstanding schedules and private states out of public list/detail/search/SSG while editors retain access", async () => {
		const { backend, ops, create, adapter } = setup();
		const hidden = await create("future", "published", future);
		await create("draft", "draft", null);
		await create("overdue", "scheduled", due);
		const visible = await create("visible", "published", null);
		const publicOps = backend.forRequest(new Request("http://localhost/api"))
			.operations.cms;
		const page = await publicOps.listContentItems({
			typeSlug: "article",
			query: { view: "content", limit: 1 },
		});
		expect(page).toMatchObject({ total: 1, items: [{ id: visible.id }] });
		expect(
			(
				await publicOps.listContentItems({
					typeSlug: "article",
					query: { view: "content", search: "future" },
				})
			).total,
		).toBe(0);
		expect(
			(
				await publicOps.listContentItems({
					typeSlug: "article",
					query: { view: "content", slug: "future" },
				})
			).total,
		).toBe(0);
		await expect(
			publicOps.getContentItem({
				typeSlug: "article",
				id: hidden.id,
				view: "content",
			}),
		).rejects.toMatchObject({ statusCode: 404 });
		await expect(
			publicOps.getContentItem({ typeSlug: "article", id: hidden.id }),
		).rejects.toThrow();
		expect(
			(await ops.listContentItems({ typeSlug: "article", query: {} })).total,
		).toBe(4);
		expect(
			await getContentItemById(
				adapter(),
				hidden.id,
				{ view: "content" },
				policy,
			),
		).toBeNull();
		expect(
			await getContentItemBySlug(
				adapter(),
				"article",
				"future",
				{ view: "content" },
				policy,
			),
		).toBeNull();
		expect(
			(
				await getAllContentItems(
					adapter(),
					"article",
					{ view: "content" },
					policy,
				)
			).total,
		).toBe(1);
		const qc = new QueryClient();
		await backend.raw.cms.prefetchForRoute("contentList", qc, {
			typeSlug: "article",
			view: "content",
		});
		const cached = qc.getQueryData<any>(
			CMS_QUERY_KEYS.contentList({
				typeSlug: "article",
				view: "content",
				limit: 20,
			}),
		);
		expect(cached.pages[0].total).toBe(1);
		expect(qc.getQueryData(CMS_QUERY_KEYS.typesList())).toBeUndefined();
		await backend.raw.cms.prefetchForRoute("editContent", qc, {
			typeSlug: "page",
			id: hidden.id,
			view: "content",
		});
		expect(
			qc.getQueryData(
				CMS_QUERY_KEYS.contentDetail("page", hidden.id, { view: "content" }),
			),
		).toBeNull();
	});

	it("publishes once across concurrent dispatches, records a revision, and invokes update/revalidation hooks", async () => {
		const before = vi.fn(),
			after = vi.fn(),
			revalidate = vi.fn();
		const { ops, create } = setup({
			onBeforeUpdateContent: before,
			onAfterUpdateContent: after,
			onAfterPublishContent: revalidate,
		});
		const item = await create("due");
		const runs = await Promise.all([
			ops.dispatchDueContent({}),
			ops.dispatchDueContent({}),
		]);
		expect(runs.flatMap((run) => run.published)).toEqual([item.id]);
		expect(runs.flatMap((run) => run.failures)).toEqual([]);
		expect(before).toHaveBeenCalledTimes(1);
		expect(after).toHaveBeenCalledTimes(1);
		expect(revalidate).toHaveBeenCalledTimes(1);
		const published = await ops.getContentItem({
			typeSlug: "article",
			id: item.id,
		});
		expect(published).toMatchObject({
			publishAt: null,
			parsedData: { status: "published" },
		});
		const revisions = await ops.listContentRevisions({
			typeSlug: "article",
			id: item.id,
		});
		expect(revisions.items.map((r) => r.version)).toEqual([2, 1]);
		expect(JSON.parse(revisions.items[0]!.data).status).toBe("published");
	});

	it("rechecks cancellation and rescheduling that occur in a before-update hook", async () => {
		let change: (() => Promise<unknown>) | undefined;
		const { ops, create, adapter } = setup({
			onBeforeUpdateContent: async () => {
				await change?.();
			},
		});
		for (const publishAt of [null, new Date(future)]) {
			const item = await create(publishAt ? "rescheduled" : "canceled");
			change = () =>
				adapter().update({
					model: "contentItem",
					where: [{ field: "id", value: item.id }],
					update: { publishAt },
				});
			const run = await ops.dispatchDueContent({});
			expect(run.skipped).toEqual([item.id]);
			expect(run.published).toEqual([]);
			expect(
				(await ops.listContentRevisions({ typeSlug: "article", id: item.id }))
					.total,
			).toBe(1);
		}
	});

	it("does not activate unconfigured types, future schedules, or explicitly cleared schedules", async () => {
		const { ops, create } = setup();
		const legacy = await create("legacy", "scheduled", due, "page");
		await create("future", "scheduled", future);
		const cleared = await create("cleared");
		await ops.updateContentItem({
			typeSlug: "article",
			id: cleared.id,
			body: { publishAt: null },
		});
		expect(await ops.dispatchDueContent({})).toMatchObject({
			scanned: 0,
			published: [],
			failures: [],
		});
		expect(
			(
				await ops.listContentItems({
					typeSlug: "page",
					query: { view: "content" },
				})
			).items[0]!.id,
		).toBe(legacy.id);
	});

	it("filters direct and inverse relation content before counts and pagination", async () => {
		const { ops, create } = setup();
		const target = await create("target", "published", null, "page");
		for (const [slug, status, publishAt] of [
			["hidden", "scheduled", due],
			["visible", "published", null],
		] as const) {
			await ops.createContentItem({
				typeSlug: "article",
				body: {
					slug,
					data: { title: slug, status, related: { id: target.id } },
					publishAt,
				},
			});
		}
		const direct = await ops.listContentByRelation({
			typeSlug: "article",
			query: {
				field: "related",
				targetId: target.id,
				view: "content",
				limit: 1,
			},
		});
		expect(direct).toMatchObject({ total: 1, items: [{ slug: "visible" }] });
		const inverse = await ops.listInverseRelationItems({
			slug: "page",
			sourceType: "article",
			query: {
				itemId: target.id,
				fieldName: "related",
				view: "content",
				limit: 1,
			},
		});
		expect(inverse).toMatchObject({ total: 1, items: [{ slug: "visible" }] });
	});

	it("rechecks visibility when relation data changes after the metadata read", async () => {
		const { ops, create, adapter } = setup();
		const target = await create("target", "published", null, "page");
		const source = await ops.createContentItem({
			typeSlug: "article",
			body: {
				slug: "source",
				data: {
					title: "source",
					status: "published",
					related: { id: target.id },
				},
				publishAt: null,
			},
		});
		const originalFindMany = adapter().findMany.bind(adapter());
		const spy = vi
			.spyOn(adapter(), "findMany")
			.mockImplementation(async (input: any) => {
				if (input.model === "contentItem" && input.join) {
					await adapter().update({
						model: "contentItem",
						where: [{ field: "id", value: source.id }],
						update: { publishAt: new Date(future) },
					});
				}
				return originalFindMany(input);
			});
		const result = await getContentItemsByRelation(
			adapter(),
			"article",
			{ field: "related", targetId: target.id, view: "content" },
			policy,
		);
		expect(result.items).toEqual([]);
		spy.mockRestore();
	});

	it("rejects request dispatch and invalid limits and policies", async () => {
		const { backend, ops } = setup();
		await expect(
			backend
				.forRequest(new Request("http://localhost/api"))
				.operations.cms.dispatchDueContent({}),
		).rejects.toMatchObject({ statusCode: 403 });
		await expect(ops.dispatchDueContent({ limit: 101 })).rejects.toThrow();
		expect(() =>
			cmsBackendPlugin({
				contentTypes: [
					{
						name: "Invalid",
						slug: "invalid",
						schema,
						publication: { ...policy, stateField: "missing" },
					},
				],
			}),
		).toThrow("Invalid publication policy");
	});

	it("rolls back content if revision persistence fails and reports postcommit revalidation failures", async () => {
		const { ops, create, adapter } = setup({
			onAfterPublishContent: () => {
				throw new Error("cache offline");
			},
		});
		const item = await create("rollback");
		const originalTransaction = adapter().transaction.bind(adapter());
		adapter().transaction = ((callback) =>
			originalTransaction(async (tx) => {
				const originalCreate = tx.create.bind(tx);
				tx.create = ((input: any) =>
					input.model === "contentRevision"
						? Promise.reject(new Error("revision offline"))
						: originalCreate(input)) as typeof tx.create;
				return callback(tx);
			})) as Adapter["transaction"];
		const failed = await ops.dispatchDueContent({});
		expect(failed.failures).toMatchObject([
			{ id: item.id, published: false, message: "revision offline" },
		]);
		expect(
			(await ops.getContentItem({ typeSlug: "article", id: item.id }))
				.parsedData.status,
		).toBe("scheduled");
		adapter().transaction = originalTransaction;
		const retried = await ops.dispatchDueContent({});
		expect(retried.published).toEqual([item.id]);
		expect(retried.failures).toMatchObject([
			{ id: item.id, published: true, message: "cache offline" },
		]);
		expect((await ops.dispatchDueContent({})).published).toEqual([]);
	});

	it("uses a bounded stable cursor so persistent failures cannot starve later due items", async () => {
		const { ops, create, adapter } = setup({
			onBeforeUpdateContent: () => {
				throw new Error("denied");
			},
		});
		await create("a");
		await create("b");
		await create("c");
		const ids: string[] = [];
		let after: string | undefined;
		do {
			const run = await ops.dispatchDueContent({ limit: 1, after });
			expect(run.scanned).toBeLessThanOrEqual(1);
			ids.push(...run.failures.map((failure) => failure.id));
			after = run.nextCursor ?? undefined;
		} while (after);
		expect(new Set(ids).size).toBe(3);
		expect(await adapter().count({ model: "contentItem" })).toBe(3);
	});
});
