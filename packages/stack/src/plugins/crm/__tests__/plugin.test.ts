import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter } from "@btst/db";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createBackendStack } from "../../../api";
import { defineAuthorization } from "../../../authorization";
import { createServerAuth } from "../../../authorization/server";
import { kanbanBackendPlugin } from "../../kanban/api/plugin";
import { crmBackendPlugin, type CrmBackendOptions } from "../api/plugin";
import { crmPermissions } from "../permissions";
import { kanbanPermissions } from "../../kanban/permissions";

function setup(
	options: CrmBackendOptions = {},
	identity: { id: string } | null = null,
) {
	let adapter!: DBAdapter;
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [crmPermissions, kanbanPermissions],
		rules: () => [],
	});
	const stack = createBackendStack({
		basePath: "/api",
		auth: createServerAuth({ authorization, getIdentity: () => identity }),
		plugins: { kanban: kanbanBackendPlugin(), crm: crmBackendPlugin(options) },
		adapter: (db) => {
			adapter = createMemoryAdapter(db)({});
			return adapter;
		},
	});
	return { stack, operations: stack.trusted.crm, adapter: () => adapter };
}

async function pipeline(
	operations: ReturnType<typeof setup>["operations"],
	name = "Sales",
) {
	const board = await operations.createPipeline({
		name,
		stages: ["Lead", "Qualified", "Won"],
	});
	return { board, stage: board.columns[0]!.id, next: board.columns[1]!.id };
}

describe("CRM operation flows", () => {
	it("rejects anonymous requests before hooks and exposes no SSG raw business API", async () => {
		const hook = vi.fn();
		const { stack } = setup({ hooks: { onBeforeCreateContact: hook } });
		const response = await stack.handler(
			new Request("https://example.test/api/crm/contacts", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ firstName: "Private" }),
			}),
		);
		expect(response.status).toBe(401);
		expect(hook).not.toHaveBeenCalled();
		const denied = setup(
			{ hooks: { onBeforeCreateContact: hook } },
			{ id: "unprivileged" },
		);
		expect(
			(
				await denied.stack.handler(
					new Request("https://example.test/api/crm/contacts", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ firstName: "Denied" }),
					}),
				)
			).status,
		).toBe(403);
		expect(hook).not.toHaveBeenCalled();
		expect(stack.raw).not.toHaveProperty("crm");
	});
	it("searches tags and custom fields, updates contacts and unlinks companies without deleting contacts", async () => {
		const { operations } = setup();
		const company = await operations.createCompany({ name: "Northwind" });
		const contact = await operations.createContact({
			firstName: "Ada",
			email: "ada@example.test",
			companyId: company.id,
			tags: ["enterprise"],
			customFields: { region: "Pacific" },
		});
		await operations.createContact({ firstName: "Grace", tags: ["other"] });
		expect(
			(
				await operations.listContacts({ search: "pacific", tag: "enterprise" })
			).items.map((c) => c.id),
		).toEqual([contact.id]);
		expect(
			(await operations.listContacts({ search: "ada@example.test" })).total,
		).toBe(1);
		const updated = await operations.updateContact({
			id: contact.id,
			data: { phone: "555-0100", customFields: { region: "Atlantic" } },
		});
		expect(updated.phone).toBe("555-0100");
		expect(updated.tags).toEqual(["enterprise"]);
		expect((await operations.listContacts({ search: "firstname" })).total).toBe(
			0,
		);
		expect((await operations.listContacts({ search: "northwind" })).total).toBe(
			1,
		);
		expect((await operations.listContacts({ search: "pacific" })).total).toBe(
			0,
		);
		await operations.deleteCompany({ id: company.id });
		expect(
			(await operations.getContactById({ id: contact.id })).companyId,
		).toBeNull();
		await expect(
			operations.createContact({ firstName: "Bad", companyId: "missing" }),
		).rejects.toThrow("Company not found");
	});
	it("keeps Kanban as deal source of truth, prevents cross-pipeline moves and removes linked tasks on deletion", async () => {
		const { operations, adapter } = setup();
		const a = await pipeline(operations);
		const b = await pipeline(operations, "Onboarding");
		const deal = await operations.createDeal({
			title: "Annual contract",
			pipelineId: a.board.id,
			stage: a.stage,
			value: 25000,
			currency: "EUR",
		});
		expect(
			(await operations.getPipeline({ id: a.board.id })).columns[0]!.tasks![0]!
				.id,
		).toBe(deal.taskId);
		await expect(
			operations.moveDeal({ id: deal.id, stage: b.stage }),
		).rejects.toThrow("Stage does not belong");
		await operations.moveDeal({ id: deal.id, stage: a.next, order: 2 });
		expect((await operations.getDealById({ id: deal.id })).stage).toBe(a.next);
		await adapter().update({
			model: "kanbanTask",
			where: [{ field: "id", value: deal.taskId, operator: "eq" }],
			update: { columnId: a.stage, title: "Renamed from Kanban" },
		});
		expect(await operations.getDealById({ id: deal.id })).toMatchObject({
			stage: a.stage,
			title: "Renamed from Kanban",
		});
		await operations.updateDeal({
			id: deal.id,
			data: {
				title: "Updated contract",
				status: "won",
				closeDate: "2026-12-01T00:00:00Z",
			},
		});
		const preserved = await operations.updateDeal({
			id: deal.id,
			data: { value: 26000 },
		});
		expect(preserved).toMatchObject({ currency: "EUR", status: "won" });
		const task = await adapter().findOne<{ title: string }>({
			model: "kanbanTask",
			where: [{ field: "id", value: deal.taskId, operator: "eq" }],
		});
		expect(task?.title).toBe("Updated contract");
		await operations.deleteDeal({ id: deal.id });
		expect(
			await adapter().findOne({
				model: "kanbanTask",
				where: [{ field: "id", value: deal.taskId, operator: "eq" }],
			}),
		).toBeNull();
		expect((await operations.listDeals({})).total).toBe(0);
		const removedInKanban = await operations.createDeal({
			title: "Deleted externally",
			pipelineId: a.board.id,
			stage: a.stage,
		});
		await adapter().delete({
			model: "kanbanTask",
			where: [{ field: "id", value: removedInKanban.taskId, operator: "eq" }],
		});
		await expect(
			operations.getDealById({ id: removedInKanban.id }),
		).rejects.toThrow("Deal not found");
		expect((await operations.listDeals({})).total).toBe(0);
	});
	it("logs contact and deal timelines and delivers due reminders once across concurrent runs", async () => {
		const deliver = vi.fn();
		const { operations } = setup({ hooks: { onActivityReminder: deliver } });
		const { board, stage } = await pipeline(operations);
		const contact = await operations.createContact({ firstName: "Ada" });
		const deal = await operations.createDeal({
			title: "Renewal",
			pipelineId: board.id,
			stage,
			contactId: contact.id,
		});
		const due = await operations.logActivity({
			type: "call",
			body: "Discuss renewal",
			contactId: contact.id,
			dealId: deal.id,
			dueAt: "2020-01-01T00:00:00Z",
		});
		const completed = await operations.logActivity({
			type: "meeting",
			body: "Already complete",
			contactId: contact.id,
			dueAt: "2020-01-01T00:00:00Z",
		});
		await operations.updateActivity({
			id: completed.id,
			data: { completedAt: "2020-01-02T00:00:00Z" },
		});
		expect((await operations.listActivities({ dealId: deal.id })).total).toBe(
			1,
		);
		await Promise.all([
			operations.sendDueReminders({}),
			operations.sendDueReminders({}),
		]);
		expect(deliver).toHaveBeenCalledTimes(1);
		expect(await operations.sendDueReminders({})).toEqual({ sent: 0 });
		await operations.updateActivity({
			id: due.id,
			data: { dueAt: "2020-02-01T00:00:00Z" },
		});
		await operations.sendDueReminders({});
		expect(deliver).toHaveBeenCalledTimes(2);
		await operations.deleteContact({ id: contact.id });
		expect(
			(await operations.getDealById({ id: deal.id })).contactId,
		).toBeNull();
		expect(
			(await operations.listActivities({ contactId: contact.id })).total,
		).toBe(0);
	});
	it("retries failed reminder delivery and rejects invalid relationships and payloads", async () => {
		const deliver = vi
			.fn()
			.mockRejectedValueOnce(new Error("Delivery failed"))
			.mockResolvedValue(undefined);
		const { operations } = setup({ hooks: { onActivityReminder: deliver } });
		const contact = await operations.createContact({ firstName: "Ada" });
		await operations.logActivity({
			type: "email",
			body: "Send follow-up",
			contactId: contact.id,
			dueAt: "2020-01-01T00:00:00Z",
		});
		await expect(operations.sendDueReminders({})).rejects.toThrow(
			"Delivery failed",
		);
		expect(await operations.sendDueReminders({})).toEqual({ sent: 1 });
		await expect(
			operations.logActivity({ type: "note", body: "No owner" }),
		).rejects.toThrow();
		await expect(
			operations.logActivity({
				type: "note",
				body: "Missing owner",
				contactId: "missing",
			}),
		).rejects.toThrow("Contact not found");
		await expect(
			operations.createContact({ firstName: "Ada", email: "invalid" }),
		).rejects.toThrow();
	});
});
