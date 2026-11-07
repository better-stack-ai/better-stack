import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter } from "@btst/db";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import {
	kanbanBackendPlugin,
	type KanbanBackendHooks,
} from "@btst/plugin-kanban/api";
import { kanbanPermissions } from "@btst/plugin-kanban/permissions";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { crmBackendPlugin, type CrmBackendOptions } from "../api/plugin";
import { crmPermissions } from "../permissions";
import type { CrmOwner } from "../types";

function setup(
	options: CrmBackendOptions = {},
	canAssign = true,
	kanbanHooks?: KanbanBackendHooks,
) {
	let adapter!: DBAdapter;
	const assignments = vi.fn((_context: unknown) => canAssign);
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [crmPermissions, kanbanPermissions],
		rules: ({ crm, kanban }) => [
			crm.deal.read.when(() => true),
			crm.pipeline.read.when(() => true),
			crm.deal.assign.when(assignments),
			crm.owner.read.when(() => true),
			crm.deal.update.when(() => true),
			crm.deal.create.when(() => true),
			kanban.task.update.when(() => true),
		],
	});
	const stack = createBackendStack({
		basePath: "/api",
		auth: createServerAuth({
			authorization,
			getIdentity: () => ({ id: "alice" }),
		}),
		plugins: {
			kanban: kanbanBackendPlugin({ hooks: kanbanHooks }),
			crm: crmBackendPlugin(options),
		},
		adapter: (db) => {
			adapter = createMemoryAdapter(db)({});
			return adapter;
		},
	});
	const request = (path: string, body?: unknown, method = "POST") =>
		stack.handler(
			new Request(
				`https://example.test/api${path}`,
				body === undefined
					? undefined
					: {
							method,
							headers: { "content-type": "application/json" },
							body: JSON.stringify(body),
						},
			),
		);
	const seed = async () => {
		const board = await stack.trusted.crm.createPipeline({
			name: "Sales",
			stages: ["Lead"],
		});
		const deal = await stack.trusted.crm.createDeal({
			title: "Contract",
			pipelineId: board.id,
			stage: board.columns[0]!.id,
		});
		return { board, deal };
	};
	return {
		stack,
		operations: stack.trusted.crm,
		adapter: () => adapter,
		request,
		seed,
		assignments,
	};
}
const staff: CrmOwner[] = [
	{ id: "alice", name: "Alice" },
	{ id: "bob", name: "Bob" },
];

describe("CRM deal ownership", () => {
	it("projects the canonical task assignee and supports assignment, reassignment, removed staff, and clearing", async () => {
		let members = [...staff];
		const { operations, seed, adapter } = setup({
			staffDirectory: () => members,
		});
		const { deal } = await seed();
		expect(deal.ownerId).toBeNull();
		let assigned = await operations.assignDealOwner({
			id: deal.id,
			ownerId: "alice",
			expectedOwnerId: null,
		});
		expect(assigned.ownerId).toBe("alice");
		expect(
			(
				await adapter().findOne<{ assigneeId: string }>({
					model: "kanbanTask",
					where: [{ field: "id", value: deal.taskId, operator: "eq" }],
				})
			)?.assigneeId,
		).toBe("alice");
		assigned = await operations.assignDealOwner({
			id: deal.id,
			ownerId: "bob",
			expectedOwnerId: "alice",
		});
		members = [];
		expect((await operations.getDealById({ id: deal.id })).ownerId).toBe("bob");
		await expect(
			operations.assignDealOwner({
				id: deal.id,
				ownerId: "alice",
				expectedOwnerId: "bob",
			}),
		).rejects.toMatchObject({ statusCode: 400 });
		expect(
			(
				await operations.assignDealOwner({
					id: deal.id,
					ownerId: null,
					expectedOwnerId: "bob",
				})
			).ownerId,
		).toBeNull();
		await adapter().update({
			model: "kanbanTask",
			where: [{ field: "id", value: deal.taskId, operator: "eq" }],
			update: { assigneeId: "legacy-staff" },
		});
		expect((await operations.getDealById({ id: deal.id })).ownerId).toBe(
			"legacy-staff",
		);
	});
	it("requires an explicit authorized operation, validates identities, and exposes authoritative owner facts", async () => {
		const directory = vi.fn(() => staff);
		const { request, seed, assignments } = setup({ staffDirectory: directory });
		const { deal, board } = await seed();
		expect(
			(
				await request(`/crm/deals/${deal.id}/owner`, {
					ownerId: "outsider",
					expectedOwnerId: null,
				})
			).status,
		).toBe(400);
		expect(
			(await request(`/crm/deals/${deal.id}`, { ownerId: "outsider" }, "PUT"))
				.status,
		).toBe(400);
		expect(
			(
				await request("/crm/deals", {
					title: "Bypass",
					pipelineId: board.id,
					stage: board.columns[0]!.id,
					ownerId: "outsider",
				})
			).status,
		).toBe(400);
		expect(
			(
				await request(`/crm/deals/${deal.id}/owner`, {
					ownerId: "bob",
					expectedOwnerId: null,
				})
			).status,
		).toBe(200);
		expect(assignments.mock.calls.at(-1)?.[0]).toMatchObject({
			facts: {
				id: deal.id,
				taskId: deal.taskId,
				pipelineId: board.id,
				ownerId: null,
				currentOwnerId: null,
				proposedOwnerId: "bob",
			},
		});
		const deniedDirectory = vi.fn(() => staff);
		const denied = setup({ staffDirectory: deniedDirectory }, false);
		const deniedDeal = (await denied.seed()).deal;
		expect(
			(
				await denied.request(`/crm/deals/${deniedDeal.id}/owner`, {
					ownerId: "bob",
					expectedOwnerId: null,
				})
			).status,
		).toBe(403);
		expect(deniedDirectory).not.toHaveBeenCalled();
	});
	it("rejects arbitrary task reassignment through the associated Kanban operation", async () => {
		const { stack, seed, request } = setup({ staffDirectory: () => staff });
		const { deal } = await seed();
		expect(
			(
				await request(
					`/tasks/${deal.taskId}`,
					{ assigneeId: "outsider" },
					"PUT",
				)
			).status,
		).toBe(400);
		await expect(
			stack.trusted.kanban.updateTask({
				id: deal.taskId,
				data: { assigneeId: "outsider" },
			}),
		).rejects.toMatchObject({ statusCode: 400 });
		await stack.trusted.kanban.updateTask({
			id: deal.taskId,
			data: { title: "Renamed", assigneeId: null },
		});
		expect((await stack.trusted.crm.getDealById({ id: deal.id })).title).toBe(
			"Renamed",
		);
	});
	it("filters pipeline and deal lists before pagination and resolves current user from authenticated identity", async () => {
		const { operations, seed, request } = setup({
			staffDirectory: () => staff,
		});
		const { board, deal } = await seed();
		await operations.assignDealOwner({
			id: deal.id,
			ownerId: "alice",
			expectedOwnerId: null,
		});
		const other = await operations.createDeal({
			title: "Other",
			pipelineId: board.id,
			stage: board.columns[0]!.id,
		});
		await operations.assignDealOwner({
			id: other.id,
			ownerId: "bob",
			expectedOwnerId: null,
		});
		await operations.createDeal({
			title: "Unassigned",
			pipelineId: board.id,
			stage: board.columns[0]!.id,
		});
		expect(
			await operations.listDeals({ ownerId: "bob", limit: 1 }),
		).toMatchObject({ total: 1, items: [{ id: other.id }] });
		expect(await operations.listDeals({ owner: "unassigned" })).toMatchObject({
			total: 1,
			items: [{ ownerId: null }],
		});
		const mine = await (
			await request("/crm/deals?owner=current&limit=1")
		).json();
		expect(mine).toMatchObject({
			total: 1,
			items: [{ id: deal.id, ownerId: "alice" }],
		});
		const pipeline = await (
			await request(`/crm/pipelines/${board.id}?owner=current`)
		).json();
		expect(pipeline.deals).toHaveLength(1);
		expect(pipeline.columns[0].tasks).toHaveLength(1);
		expect(pipeline.deals[0].ownerId).toBe("alice");
		const pipelines = await (
			await request("/crm/pipelines?owner=unassigned")
		).json();
		expect(pipelines.items[0].deals).toHaveLength(1);
		expect(await (await request("/crm/owners")).json()).toEqual({
			items: staff,
			currentUserId: "alice",
		});
		expect((await operations.listDeals({})).total).toBe(3);
	});
	it("lets only one concurrent reassignment win and rejects stale clients", async () => {
		const { operations, seed } = setup({
			staffDirectory: async () => {
				await Promise.resolve();
				return staff;
			},
		});
		const { deal } = await seed();
		const outcomes = await Promise.allSettled(
			staff.map((owner) =>
				operations.assignDealOwner({
					id: deal.id,
					ownerId: owner.id,
					expectedOwnerId: null,
				}),
			),
		);
		expect(
			outcomes.filter((outcome) => outcome.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			outcomes.find((outcome) => outcome.status === "rejected"),
		).toMatchObject({ reason: { statusCode: 409 } });
		await expect(
			operations.assignDealOwner({
				id: deal.id,
				ownerId: "alice",
				expectedOwnerId: null,
			}),
		).rejects.toMatchObject({ statusCode: 409 });
	});
	it("does not overwrite edits made while membership validation is pending", async () => {
		const { operations, seed, adapter } = setup({
			staffDirectory: async () => {
				await adapter().update({
					model: "kanbanTask",
					where: [{ field: "id", value: deal.taskId, operator: "eq" }],
					update: {
						title: "Concurrent title",
						updatedAt: new Date(Date.now() + 1000),
					},
				});
				return staff;
			},
		});
		const { deal } = await seed();
		await expect(
			operations.assignDealOwner({
				id: deal.id,
				ownerId: "alice",
				expectedOwnerId: null,
			}),
		).rejects.toMatchObject({ statusCode: 409 });
		expect(await operations.getDealById({ id: deal.id })).toMatchObject({
			title: "Concurrent title",
			ownerId: null,
		});
	});
	it("keeps assignment outside a concurrent Kanban transaction rollback", async () => {
		let enterTransaction!: () => void;
		const transactionEntered = new Promise<void>((resolve) => {
			enterTransaction = resolve;
		});
		let enterAssignment!: () => void;
		const assignmentEntered = new Promise<void>((resolve) => {
			enterAssignment = resolve;
		});
		const { operations, seed, stack, adapter } = setup(
			{
				staffDirectory: async () => {
					await transactionEntered;
					return staff;
				},
			},
			true,
			{
				onBeforeUpdateTask: async () => {
					enterTransaction();
					await assignmentEntered;
					throw new Error("Reject concurrent task edit");
				},
			},
		);
		const { deal } = await seed();
		const originalIncrement = adapter().incrementOne;
		adapter().incrementOne = ((input) => {
			enterAssignment();
			return originalIncrement(input);
		}) as DBAdapter["incrementOne"];
		const assignment = operations.assignDealOwner({
			id: deal.id,
			ownerId: "alice",
			expectedOwnerId: null,
		});
		const edit = stack.trusted.kanban.updateTask({
			id: deal.taskId,
			data: { title: "Rejected edit" },
		});
		const result = await Promise.allSettled([assignment, edit]);
		expect(result[0]).toMatchObject({
			status: "fulfilled",
			value: { ownerId: "alice" },
		});
		expect(result[1]).toMatchObject({ status: "rejected" });
		expect(await operations.getDealById({ id: deal.id })).toMatchObject({
			ownerId: "alice",
			title: "Contract",
		});
	});
	it("fails closed without a directory and permits clearing a legacy owner", async () => {
		const { operations, seed, adapter } = setup();
		const { deal } = await seed();
		await expect(
			operations.assignDealOwner({
				id: deal.id,
				ownerId: "alice",
				expectedOwnerId: null,
			}),
		).rejects.toMatchObject({ statusCode: 400 });
		await adapter().update({
			model: "kanbanTask",
			where: [{ field: "id", value: deal.taskId, operator: "eq" }],
			update: { assigneeId: "legacy" },
		});
		expect(
			(
				await operations.assignDealOwner({
					id: deal.id,
					ownerId: null,
					expectedOwnerId: "legacy",
				})
			).ownerId,
		).toBeNull();
	});
});
