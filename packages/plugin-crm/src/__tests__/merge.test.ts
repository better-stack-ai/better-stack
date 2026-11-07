import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter, DatabaseDefinition } from "@btst/db";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { kanbanBackendPlugin } from "@btst/plugin-kanban/api";
import { kanbanPermissions } from "@btst/plugin-kanban/permissions";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { crmBackendPlugin, type CrmBackendOptions } from "../api/plugin";
import { normalizeCrmDomain, normalizeCrmEmail } from "../api/normalization";
import { crmPermissions } from "../permissions";
import type { MergePreview } from "../types";

/** Serialize every adapter call so memory rollback cannot overwrite concurrent writes. */
function isolatedMemoryAdapter(db: DatabaseDefinition): DBAdapter {
	const adapter = createMemoryAdapter(db)({});
	let tail = Promise.resolve();
	const locked = async <T>(run: () => Promise<T>): Promise<T> => {
		let release = () => {};
		const previous = tail;
		tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			return await run();
		} finally {
			release();
		}
	};
	return {
		...adapter,
		id: "isolated-memory-crm-test",
		create: ((input) =>
			locked(() => adapter.create(input))) as DBAdapter["create"],
		findOne: ((input) =>
			locked(() => adapter.findOne(input))) as DBAdapter["findOne"],
		findMany: ((input) =>
			locked(() => adapter.findMany(input))) as DBAdapter["findMany"],
		count: (input) => locked(() => adapter.count(input)),
		update: ((input) =>
			locked(() => adapter.update(input))) as DBAdapter["update"],
		updateMany: (input) => locked(() => adapter.updateMany(input)),
		incrementOne: ((input) =>
			locked(() => adapter.incrementOne(input))) as DBAdapter["incrementOne"],
		delete: ((input) =>
			locked(() => adapter.delete(input))) as DBAdapter["delete"],
		deleteMany: (input) => locked(() => adapter.deleteMany(input)),
		consumeOne: ((input) =>
			locked(() => adapter.consumeOne(input))) as DBAdapter["consumeOne"],
		transaction: ((run) =>
			locked(() => adapter.transaction(run))) as DBAdapter["transaction"],
	};
}

function setup(
	options: CrmBackendOptions = {},
	role: "manager" | "reader" | null = "manager",
	isolated = true,
) {
	const facts: unknown[] = [];
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string(), role: z.string() }),
		permissions: [crmPermissions, kanbanPermissions],
		rules: ({ crm }) => [
			crm.contact.read.when(() => true),
			crm.company.read.when(() => true),
			crm.contact.update.when(({ identity }) => identity?.role === "manager"),
			crm.company.update.when(({ identity }) => identity?.role === "manager"),
			crm.contact.delete.when(({ identity }) => identity?.role === "manager"),
			crm.company.delete.when(({ identity }) => identity?.role === "manager"),
			crm.contact.merge.when(({ identity, facts: pair }) => {
				facts.push(pair);
				return identity?.role === "manager";
			}),
			crm.company.merge.when(({ identity }) => identity?.role === "manager"),
		],
	});
	const stack = createBackendStack({
		basePath: "/api",
		auth: createServerAuth({
			authorization,
			getIdentity: () => (role ? { id: role, role } : null),
		}),
		plugins: { kanban: kanbanBackendPlugin(), crm: crmBackendPlugin(options) },
		adapter: (db) =>
			isolated ? isolatedMemoryAdapter(db) : createMemoryAdapter(db)({}),
	});
	return { stack, operations: stack.trusted.crm, facts };
}

const choices = (
	preview: MergePreview<unknown>,
	selection: "survivor" | "source" = "survivor",
) =>
	Object.fromEntries(
		preview.fields
			.filter((field) => field.conflict)
			.map((field) => [field.name, selection]),
	);

describe("CRM duplicate review and merge", () => {
	it("documents exact email and company normalization without provider or name identity inference", () => {
		expect(normalizeCrmEmail("  A.Person+sales@Example.COM  ")).toBe(
			"a.person+sales@example.com",
		);
		expect(normalizeCrmEmail(" ")).toBeNull();
		expect(normalizeCrmDomain("https://WWW.Example.COM.:443/about")).toBe(
			"example.com",
		);
		expect(normalizeCrmDomain("example.com:8080/path")).toBe("example.com");
		expect(normalizeCrmDomain("ftp://example.com")).toBeNull();
		expect(normalizeCrmDomain("https://user:password@example.com")).toBeNull();
	});

	it("returns bounded suggestions and allows creation of duplicate email contacts", async () => {
		const { operations } = setup();
		const anchor = await operations.createContact({
			firstName: "Anchor",
			email: "Person@Example.com",
		});
		for (let index = 0; index < 3; index++)
			await operations.createContact({
				firstName: `Duplicate ${index}`,
				email: "person@example.com",
			});
		await operations.createContact({
			firstName: "Anchor",
			email: "person+other@example.com",
		});
		const first = await operations.listContactDuplicates({
			id: anchor.id,
			limit: 2,
		});
		const second = await operations.listContactDuplicates({
			id: anchor.id,
			limit: 2,
			offset: 2,
		});
		expect(first).toMatchObject({
			total: 3,
			identityVerified: false,
			normalizedValue: "person@example.com",
		});
		expect(first.items).toHaveLength(2);
		expect(second.items).toHaveLength(1);
		expect(
			new Set([...first.items, ...second.items].map((item) => item.id)).size,
		).toBe(3);
		expect(
			[...first.items, ...second.items].map((item) => item.id),
		).not.toContain(anchor.id);
	});

	it("requires explicit conflicts and preserves fields, custom values, tags, every activity, and deal links", async () => {
		const { stack, operations } = setup();
		const survivor = await operations.createContact({
			firstName: "Avery",
			email: "old@example.com",
			tags: ["shared", "customer"],
			customFields: { region: "west", retained: "yes", empty: "" },
		});
		const source = await operations.createContact({
			firstName: "Avery Source",
			email: "new@example.com",
			phone: "555-0100",
			tags: ["shared", "lead"],
			customFields: { region: "east", imported: "yes", sourceEmpty: "" },
		});
		const board = await operations.createPipeline({ name: "Sales" });
		const deal = await operations.createDeal({
			title: "Annual plan",
			pipelineId: board.id,
			stage: board.columns[0]!.id,
			contactId: source.id,
		});
		const activityIds = [];
		for (let index = 0; index < 2; index++)
			activityIds.push(
				(
					await operations.logActivity({
						type: "note",
						body: "Same text, separate events",
						contactId: source.id,
						dealId: deal.id,
					})
				).id,
			);
		const preview = await operations.previewContactMerge({
			survivorId: survivor.id,
			sourceId: source.id,
		});
		expect(preview.relationships).toEqual(
			expect.arrayContaining([
				{ name: "crmDeal.contactId", count: 1 },
				{ name: "crmActivity.contactId", count: 2 },
			]),
		);
		const input = {
			survivorId: survivor.id,
			sourceId: source.id,
			versions: preview.versions,
		};
		await expect(
			operations.mergeContacts({ ...input, choices: {} }),
		).rejects.toThrow("Choose a value");
		await expect(
			operations.mergeContacts({
				...input,
				choices: { ...choices(preview), revision: "source" },
			}),
		).rejects.toThrow("Unknown merge field");
		const merged = await operations.mergeContacts({
			...input,
			choices: {
				...choices(preview),
				email: "source",
				"customFields.region": "source",
			},
		});
		expect(merged).toMatchObject({
			id: survivor.id,
			firstName: "Avery",
			email: "new@example.com",
			phone: "555-0100",
			customFields: {
				region: "east",
				retained: "yes",
				imported: "yes",
				empty: "",
				sourceEmpty: "",
			},
		});
		expect([...merged.tags].sort()).toEqual(["customer", "lead", "shared"]);
		expect((await operations.getDealById({ id: deal.id })).contactId).toBe(
			survivor.id,
		);
		expect(
			(await operations.listActivities({ contactId: survivor.id })).items
				.map((activity) => activity.id)
				.sort(),
		).toEqual(activityIds.sort());
		await expect(operations.getContactById({ id: source.id })).rejects.toThrow(
			"Contact not found",
		);
		for (const email of ["old@example.com", "new@example.com"])
			expect(
				(await operations.listContacts({ email })).items.map((item) => item.id),
			).toEqual([survivor.id]);
		const audits = await stack.adapter.findMany<{
			sourceSnapshot: string;
			survivorSnapshot: string;
			choices: string;
		}>({ model: "crmMerge" });
		expect(audits).toHaveLength(1);
		expect(JSON.parse(audits[0]!.sourceSnapshot)).toMatchObject({
			id: source.id,
			email: "new@example.com",
		});
		expect(JSON.parse(audits[0]!.survivorSnapshot)).toMatchObject({
			id: survivor.id,
			email: "old@example.com",
		});
	});

	it("moves company contacts and deals and invalidates an earlier contact merge preview", async () => {
		const { operations } = setup();
		const survivor = await operations.createCompany({
			name: "Example",
			domain: "https://www.example.com/about",
		});
		const source = await operations.createCompany({
			name: "Example Inc",
			domain: "example.com",
		});
		expect(
			(await operations.listCompanyDuplicates({ id: survivor.id })).items.map(
				(item) => item.id,
			),
		).toEqual([source.id]);
		const contact = await operations.createContact({
			firstName: "Customer",
			companyId: source.id,
		});
		const other = await operations.createContact({ firstName: "Other" });
		const contactPreview = await operations.previewContactMerge({
			survivorId: other.id,
			sourceId: contact.id,
		});
		const board = await operations.createPipeline({ name: "Company sales" });
		const deal = await operations.createDeal({
			title: "Company deal",
			pipelineId: board.id,
			stage: board.columns[0]!.id,
			companyId: source.id,
		});
		const preview = await operations.previewCompanyMerge({
			survivorId: survivor.id,
			sourceId: source.id,
		});
		await operations.mergeCompanies({
			survivorId: survivor.id,
			sourceId: source.id,
			versions: preview.versions,
			choices: choices(preview),
		});
		expect(
			(await operations.getContactById({ id: contact.id })).companyId,
		).toBe(survivor.id);
		expect((await operations.getDealById({ id: deal.id })).companyId).toBe(
			survivor.id,
		);
		await expect(
			operations.mergeContacts({
				survivorId: other.id,
				sourceId: contact.id,
				versions: contactPreview.versions,
				choices: choices(contactPreview),
			}),
		).rejects.toThrow("Records changed since preview");
	});

	it("rejects stale edits, forged IDs, self merges, and a previously consumed source", async () => {
		const { operations } = setup();
		const a = await operations.createContact({ firstName: "A" });
		const b = await operations.createContact({ firstName: "B" });
		await expect(
			operations.previewContactMerge({ survivorId: a.id, sourceId: a.id }),
		).rejects.toThrow();
		await expect(
			operations.previewContactMerge({ survivorId: a.id, sourceId: "forged" }),
		).rejects.toThrow("Contact not found");
		const preview = await operations.previewContactMerge({
			survivorId: a.id,
			sourceId: b.id,
		});
		await operations.updateContact({ id: b.id, data: { phone: "edited" } });
		await expect(
			operations.mergeContacts({
				survivorId: a.id,
				sourceId: b.id,
				versions: preview.versions,
				choices: choices(preview),
			}),
		).rejects.toThrow("Records changed since preview");
		const fresh = await operations.previewContactMerge({
			survivorId: a.id,
			sourceId: b.id,
		});
		const input = {
			survivorId: a.id,
			sourceId: b.id,
			versions: fresh.versions,
			choices: choices(fresh),
		};
		await operations.mergeContacts(input);
		await expect(operations.mergeContacts(input)).rejects.toThrow(
			"Contact not found",
		);
		await expect(
			operations.previewContactMerge({ survivorId: b.id, sourceId: a.id }),
		).rejects.toThrow("Contact not found");
	});

	it("rejects a merge when a concurrent source edit commits before its transaction", async () => {
		const { stack, operations } = setup();
		const survivor = await operations.createContact({ firstName: "Survivor" });
		const source = await operations.createContact({ firstName: "Source" });
		const preview = await operations.previewContactMerge({
			survivorId: survivor.id,
			sourceId: source.id,
		});
		let entered = () => {};
		let release = () => {};
		const ready = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const proceed = new Promise<void>((resolve) => {
			release = resolve;
		});
		const transact = stack.adapter.transaction.bind(stack.adapter);
		const paused = vi
			.spyOn(stack.adapter, "transaction")
			.mockImplementation((async (run) => {
				entered();
				await proceed;
				return transact(run);
			}) as DBAdapter["transaction"]);
		const pending = operations.mergeContacts({
			survivorId: survivor.id,
			sourceId: source.id,
			versions: preview.versions,
			choices: choices(preview),
		});
		await ready;
		await operations.updateContact({
			id: source.id,
			data: { phone: "concurrent edit" },
		});
		release();
		await expect(pending).rejects.toThrow("Records changed since preview");
		paused.mockRestore();
		expect((await operations.getContactById({ id: source.id })).phone).toBe(
			"concurrent edit",
		);
		expect(await stack.adapter.count({ model: "crmMerge" })).toBe(0);
	});

	it("permits only one concurrent merge and preserves aliases through a later merge", async () => {
		const { operations } = setup();
		const a = await operations.createContact({
			firstName: "A",
			email: "a@example.com",
		});
		const b = await operations.createContact({
			firstName: "B",
			email: "b@example.com",
		});
		const c = await operations.createContact({
			firstName: "C",
			email: "c@example.com",
		});
		const preview = await operations.previewContactMerge({
			survivorId: b.id,
			sourceId: a.id,
		});
		const input = {
			survivorId: b.id,
			sourceId: a.id,
			versions: preview.versions,
			choices: choices(preview),
		};
		const attempts = await Promise.allSettled([
			operations.mergeContacts(input),
			operations.mergeContacts(input),
		]);
		expect(
			attempts.filter((attempt) => attempt.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			attempts.filter((attempt) => attempt.status === "rejected"),
		).toHaveLength(1);
		const next = await operations.previewContactMerge({
			survivorId: c.id,
			sourceId: b.id,
		});
		await operations.mergeContacts({
			survivorId: c.id,
			sourceId: b.id,
			versions: next.versions,
			choices: choices(next),
		});
		for (const email of ["a@example.com", "b@example.com", "c@example.com"])
			expect(
				(await operations.listContacts({ email })).items.map((item) => item.id),
			).toEqual([c.id]);
	});

	it("rolls back revision claims and earlier relationship writes when a later relationship fails", async () => {
		const { stack, operations } = setup();
		const survivor = await operations.createContact({ firstName: "Survivor" });
		const source = await operations.createContact({ firstName: "Source" });
		const board = await operations.createPipeline({ name: "Rollback" });
		const deal = await operations.createDeal({
			title: "Keep source link",
			pipelineId: board.id,
			stage: board.columns[0]!.id,
			contactId: source.id,
		});
		const activity = await operations.logActivity({
			type: "note",
			body: "Keep history",
			contactId: source.id,
		});
		const preview = await operations.previewContactMerge({
			survivorId: survivor.id,
			sourceId: source.id,
		});
		const transact = stack.adapter.transaction.bind(stack.adapter);
		const fault = vi.spyOn(stack.adapter, "transaction").mockImplementation(((
			run,
		) =>
			transact(async (tx) =>
				run({
					...tx,
					updateMany: async (input) => {
						if (input.model === "crmActivity")
							throw new Error("Injected relationship failure");
						return tx.updateMany(input);
					},
				}),
			)) as DBAdapter["transaction"]);
		await expect(
			operations.mergeContacts({
				survivorId: survivor.id,
				sourceId: source.id,
				versions: preview.versions,
				choices: choices(preview),
			}),
		).rejects.toThrow("Injected relationship failure");
		fault.mockRestore();
		expect((await operations.getDealById({ id: deal.id })).contactId).toBe(
			source.id,
		);
		expect(
			(await operations.listActivities({ contactId: source.id })).items.map(
				(item) => item.id,
			),
		).toEqual([activity.id]);
		expect(
			(
				await operations.previewContactMerge({
					survivorId: survivor.id,
					sourceId: source.id,
				})
			).versions,
		).toEqual(preview.versions);
		expect(await stack.adapter.count({ model: "crmMerge" })).toBe(0);
	});

	it("fails closed for the ordinary memory adapter and requires explicit manager permissions", async () => {
		const raw = setup({}, "manager", false);
		const a = await raw.operations.createContact({ firstName: "A" });
		const b = await raw.operations.createContact({ firstName: "B" });
		const preview = await raw.operations.previewContactMerge({
			survivorId: a.id,
			sourceId: b.id,
		});
		await expect(
			raw.operations.mergeContacts({
				survivorId: a.id,
				sourceId: b.id,
				versions: preview.versions,
				choices: choices(preview),
			}),
		).rejects.toThrow("isolated transaction support");
		for (const role of ["reader", null] as const) {
			const { stack, operations } = setup({}, role);
			const contact = await operations.createContact({ firstName: "Private" });
			const request = new Request(
				"https://example.test/api/crm/contacts/duplicates?id=" + contact.id,
			);
			expect((await stack.handler(request)).status).toBe(role ? 403 : 401);
		}
		const { stack, operations, facts } = setup();
		const survivor = await operations.createContact({ firstName: "Manager" });
		const source = await operations.createContact({ firstName: "Source" });
		await stack
			.forRequest(new Request("https://example.test"))
			.operations.crm.previewContactMerge({
				survivorId: survivor.id,
				sourceId: source.id,
			});
		expect(facts).toContainEqual({
			survivorId: survivor.id,
			sourceId: source.id,
		});
	});
});
