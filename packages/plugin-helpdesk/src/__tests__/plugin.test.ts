import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter } from "@btst/db";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	helpdeskBackendPlugin,
	type HelpdeskBackendOptions,
} from "../api/plugin";
import { serializeCustomerMessage } from "../api/serializers";
import { helpdeskPermissions } from "../permissions";
import type { HelpdeskTicketDetail, MessageRecord } from "../types";

function setup(options: HelpdeskBackendOptions = {}) {
	let identity: {
		id: string;
		role: "customer" | "agent";
		email?: string;
	} | null = {
		id: "alice",
		role: "customer",
		email: "alice@example.test",
	};
	let adapter!: DBAdapter;
	let canReadAgent = true;
	let canReadCustomer = true;
	const authorization = defineAuthorization({
		identity: z.object({
			id: z.string(),
			role: z.enum(["customer", "agent"]),
			email: z.email().optional(),
		}),
		permissions: [helpdeskPermissions],
		rules: ({ helpdesk }) => [
			// Broad customer grants deliberately exercise operation-level ownership guards.
			helpdesk.customerTicket.list.when(({ identity }) => !!identity),
			helpdesk.customerTicket.create.when(({ identity }) => !!identity),
			helpdesk.customerTicket.read.when(
				({ identity }) => !!identity && canReadCustomer,
			),
			helpdesk.customerTicket.reply.when(({ identity }) => !!identity),
			helpdesk.ticket.list.when(({ identity }) => identity?.role === "agent"),
			helpdesk.ticket.read.when(
				({ identity }) => identity?.role === "agent" && canReadAgent,
			),
			helpdesk.ticket.update.when(({ identity }) => identity?.role === "agent"),
			helpdesk.ticket.reply.when(({ identity }) => identity?.role === "agent"),
			helpdesk.cannedReply.list.when(
				({ identity }) => identity?.role === "agent",
			),
			helpdesk.cannedReply.create.when(
				({ identity }) => identity?.role === "agent",
			),
			helpdesk.cannedReply.update.when(
				({ identity }) => identity?.role === "agent",
			),
			helpdesk.cannedReply.delete.when(
				({ identity }) => identity?.role === "agent",
			),
		],
	});
	const stack = createBackendStack({
		basePath: "/api",
		auth: createServerAuth({ authorization, getIdentity: () => identity }),
		plugins: { helpdesk: helpdeskBackendPlugin(options) },
		adapter: (db) => {
			adapter = createMemoryAdapter(db)({});
			return adapter;
		},
	});
	const request = (path: string, method = "GET", body?: unknown) =>
		stack.handler(
			new Request(`https://example.test/api/helpdesk${path}`, {
				method,
				headers:
					body === undefined
						? undefined
						: { "content-type": "application/json" },
				body: body === undefined ? undefined : JSON.stringify(body),
			}),
		);
	return {
		stack,
		operations: stack.trusted.helpdesk,
		denyCustomerRead: () => {
			canReadCustomer = false;
		},
		denyAgentRead: () => {
			canReadAgent = false;
		},
		request,
		adapter: () => adapter,
		as: (value: typeof identity) => {
			identity = value;
		},
	};
}
const create = (s: ReturnType<typeof setup>, customerId = "alice") =>
	s.operations.createTicket({
		subject: "Invoice issue",
		body: "Please correct the invoice",
		customerId,
	});
afterEach(() => vi.useRealTimers());

describe("Helpdesk authorization and customer isolation", () => {
	it("requires shared authorization and rejects anonymous requests", async () => {
		expect(() =>
			createBackendStack({
				basePath: "/api",
				plugins: { helpdesk: helpdeskBackendPlugin() },
				adapter: (db) => createMemoryAdapter(db)({}),
			}),
		).toThrow("Helpdesk requires stack authorization");
		const s = setup();
		s.as(null);
		for (const path of ["/tickets", "/inbox", "/canned-replies"])
			expect((await s.request(path)).status).toBe(401);
	});
	it("binds customer ownership to identity on HTTP and request operations", async () => {
		const s = setup();
		const alice = await create(s);
		const bob = await create(s, "bob");
		const page = await (
			await s.request("/tickets?customerId=bob&assigneeId=secret-agent")
		).json();
		expect(page.total).toBe(1);
		expect(page.items.map((t: { id: string }) => t.id)).toEqual([alice.id]);
		for (const [method, path, body] of [
			["GET", `/tickets/${bob.id}`, undefined],
			["POST", `/tickets/${bob.id}/replies`, { body: "attack" }],
		] as const)
			expect((await s.request(path, method, body)).status).toBe(404);
		const scoped = s.stack.forRequest(new Request("https://example.test"))
			.operations.helpdesk;
		await expect(
			scoped.getCustomerTicket({ id: bob.id, customerId: "bob" }),
		).rejects.toThrow("Ticket not found");
		const ticket = await scoped.createTicket({
			subject: "Mine",
			body: "Hello",
			customerId: "bob",
		});
		expect(
			(await s.operations.getAgentTicket({ id: ticket.id })).customerId,
		).toBe("alice");
		expect(
			(await s.operations.getAgentTicket({ id: bob.id })).messages,
		).toHaveLength(1);
	});
	it("never turns an empty authenticated customer ID into an unscoped list", async () => {
		const s = setup();
		const ticket = await create(s);
		await create(s, "bob");
		s.as({ id: "", role: "customer" });
		expect((await s.request("/tickets")).status).toBe(401);
		expect((await s.request(`/tickets/${ticket.id}`)).status).toBe(401);
		expect(
			(
				await s.request("/tickets", "POST", {
					subject: "Attempt",
					body: "Attempt",
				})
			).status,
		).toBe(401);
		const { listCustomerTickets } = await import("../api/getters");
		expect(
			(await listCustomerTickets(s.adapter(), { limit: 50, offset: 0 }, ""))
				.total,
		).toBe(0);
	});

	it("strips internal notes and agent fields from every customer response", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		const s = setup();
		const ticket = await create(s);
		await s.operations.updateTicket({
			id: ticket.id,
			data: { assigneeId: "private-agent" },
		});
		const before = await s.operations.getCustomerTicket({
			id: ticket.id,
			customerId: "alice",
		});
		vi.advanceTimersByTime(60_000);
		await s.operations.replyAsAgent({
			id: ticket.id,
			body: "Private billing suspicion",
			isInternalNote: true,
			authorId: "private-agent",
		});
		const detail = await (await s.request(`/tickets/${ticket.id}`)).json();
		expect(detail.updatedAt).toBe(before.updatedAt);
		expect(Object.keys(detail).sort()).toEqual(
			[
				"id",
				"subject",
				"status",
				"priority",
				"resolvedAt",
				"createdAt",
				"updatedAt",
				"messages",
			].sort(),
		);
		expect(detail.messages).toHaveLength(1);
		expect(Object.keys(detail.messages[0]).sort()).toEqual(
			["id", "ticketId", "body", "authorType", "createdAt"].sort(),
		);
		expect(
			JSON.stringify(await (await s.request("/tickets")).json()),
		).not.toMatch(
			/customerId|assigneeId|slaDueAt|firstRespondedAt|lockVersion|private-agent|Private billing/,
		);
		const response = await s.request(`/tickets/${ticket.id}/replies`, "POST", {
			body: "Public customer reply",
		});
		expect(response.status).toBe(200);
		expect(await response.text()).not.toMatch(
			/Private billing|private-agent|isInternalNote|authorId/,
		);
		expect(
			serializeCustomerMessage({ isInternalNote: true } as MessageRecord),
		).toBeNull();
		const agent = await s.operations.getAgentTicket({ id: ticket.id });
		expect(agent.messages.map((m) => m.body)).toContain(
			"Private billing suspicion",
		);
		expect(agent.messages.find((m) => m.isInternalNote)?.authorId).toBe(
			"private-agent",
		);
	});
	it("requires customer read access before a reply can return conversation history", async () => {
		const s = setup();
		const ticket = await create(s);
		await s.operations.replyAsAgent({
			id: ticket.id,
			body: "Previous public response",
		});
		s.denyCustomerRead();
		expect((await s.request(`/tickets/${ticket.id}`)).status).toBe(403);
		const response = await s.request(`/tickets/${ticket.id}/replies`, "POST", {
			body: "Attempt",
		});
		expect(response.status).toBe(403);
		expect(await response.text()).not.toContain("Previous public response");
		expect(
			(await s.operations.getAgentTicket({ id: ticket.id })).messages,
		).toHaveLength(2);
	});

	it("requires agent read access before returning a conversation from a reply", async () => {
		const s = setup();
		const ticket = await create(s);
		await s.operations.replyAsAgent({
			id: ticket.id,
			body: "Private discussion",
			isInternalNote: true,
		});
		s.as({ id: "agent", role: "agent" });
		s.denyAgentRead();
		const response = await s.request(`/inbox/${ticket.id}/replies`, "POST", {
			body: "Attempt",
		});
		expect(response.status).toBe(403);
		expect(await response.text()).not.toContain("Private discussion");
		expect(
			(await s.operations.getAgentTicket({ id: ticket.id })).messages,
		).toHaveLength(2);
	});

	it("rejects customer note/owner/actor injection and agent-only operations", async () => {
		const s = setup();
		const ticket = await create(s);
		for (const extra of [
			{ isInternalNote: true },
			{ authorId: "agent" },
			{ customerId: "bob" },
		])
			expect(
				(
					await s.request(`/tickets/${ticket.id}/replies`, "POST", {
						body: "Attempt",
						...extra,
					})
				).status,
			).toBe(400);
		expect(
			(
				await s.request("/tickets", "POST", {
					subject: "Attempt",
					body: "Attempt",
					customerId: "bob",
				})
			).status,
		).toBe(400);
		for (const [method, path, body] of [
			["GET", "/inbox", undefined],
			["GET", `/inbox/${ticket.id}`, undefined],
			["PUT", `/inbox/${ticket.id}`, { status: "closed" }],
			[
				"POST",
				`/inbox/${ticket.id}/replies`,
				{ body: "note", isInternalNote: true },
			],
			["GET", "/canned-replies", undefined],
			["POST", "/canned-replies", { title: "Secret", body: "Private" }],
		] as const)
			expect((await s.request(path, method, body)).status).toBe(403);
		expect((await s.operations.getAgentTicket({ id: ticket.id })).status).toBe(
			"open",
		);
	});
});

describe("Helpdesk ticket lifecycle", () => {
	it("computes priority SLA, preserves first public response, resolves and reopens", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		const s = setup({ slaTargets: { urgent: 10, high: 30 } });
		const ticket = await s.operations.createTicket({
			subject: "Outage",
			body: "Help",
			priority: "urgent",
			customerId: "alice",
		});
		expect(
			(await s.operations.getAgentTicket({ id: ticket.id })).slaDueAt,
		).toBe("2026-01-01T00:10:00.000Z");
		vi.advanceTimersByTime(60_000);
		const note = await s.operations.replyAsAgent({
			id: ticket.id,
			body: "Investigate",
			isInternalNote: true,
		});
		expect(note.firstRespondedAt).toBeNull();
		const first = await s.operations.replyAsAgent({
			id: ticket.id,
			body: "We're checking",
		});
		expect(first.firstRespondedAt).toBe("2026-01-01T00:01:00.000Z");
		vi.advanceTimersByTime(60_000);
		const second = await s.operations.replyAsAgent({
			id: ticket.id,
			body: "Progress",
		});
		expect(second.firstRespondedAt).toBe(first.firstRespondedAt);
		const resolved = await s.operations.updateTicket({
			id: ticket.id,
			data: { priority: "high", status: "resolved", assigneeId: "agent" },
		});
		expect(resolved.slaDueAt).toBe("2026-01-01T00:30:00.000Z");
		expect(resolved.resolvedAt).toBe("2026-01-01T00:02:00.000Z");
		const reopened = await s.operations.replyToTicket({
			id: ticket.id,
			body: "Still broken",
			customerId: "alice",
		});
		expect(reopened.status).toBe("open");
		expect(reopened.resolvedAt).toBeNull();
		await s.operations.updateTicket({
			id: ticket.id,
			data: { status: "closed", assigneeId: null },
		});
		await expect(
			s.operations.replyToTicket({
				id: ticket.id,
				body: "Again",
				customerId: "alice",
			}),
		).rejects.toThrow("Closed tickets");
		await expect(
			s.operations.replyAsAgent({ id: ticket.id, body: "Again" }),
		).rejects.toThrow("Closed tickets");
	});
	it("serializes concurrent replies without losing messages or overwriting first response", async () => {
		const s = setup();
		const ticket = await create(s);
		const replies = await Promise.all(
			Array.from({ length: 4 }, (_, n) =>
				s.operations.replyAsAgent({ id: ticket.id, body: `Response ${n}` }),
			),
		);
		const detail = await s.operations.getAgentTicket({ id: ticket.id });
		expect(detail.messages).toHaveLength(5);
		expect(new Set(replies.map((r) => r.firstRespondedAt)).size).toBe(1);
	});
	it("rolls back the ticket when the opening message cannot be stored", async () => {
		const s = setup();
		const adapter = s.adapter();
		const transact = adapter.transaction.bind(adapter);
		vi.spyOn(adapter, "transaction").mockImplementation((run) =>
			transact((tx) =>
				run({
					...tx,
					create: ((options: { model: string }) => {
						if (options.model === "helpdeskMessage")
							throw new Error("Storage failed");
						return tx.create(options as Parameters<typeof tx.create>[0]);
					}) as typeof tx.create,
				}),
			),
		);
		await expect(create(s)).rejects.toThrow("Storage failed");
		expect(await adapter.count({ model: "helpdeskTicket" })).toBe(0);
		expect(await adapter.count({ model: "helpdeskMessage" })).toBe(0);
	});
	it("supports agent filters and canned reply management through HTTP", async () => {
		const s = setup();
		const ticket = await create(s);
		s.as({ id: "support", role: "agent" });
		expect(
			(
				await s.request(`/inbox/${ticket.id}`, "PUT", {
					priority: "urgent",
					status: "pending",
					assigneeId: "support",
				})
			).status,
		).toBe(200);
		const page = await (
			await s.request(
				"/inbox?status=pending&priority=urgent&assigneeId=support",
			)
		).json();
		expect(page.total).toBe(1);
		expect(
			(await (await s.request("/inbox?status=resolved")).json()).total,
		).toBe(0);
		const reply: HelpdeskTicketDetail = await (
			await s.request(`/inbox/${ticket.id}/replies`, "POST", {
				body: "Only staff",
				isInternalNote: true,
			})
		).json();
		expect(reply.messages.at(-1)?.authorId).toBe("support");
		const canned = await (
			await s.request("/canned-replies", "POST", {
				title: "Invoice",
				body: "We will review your invoice.",
			})
		).json();
		expect(
			(
				await s.request(`/canned-replies/${canned.id}`, "PUT", {
					title: "Billing",
					body: "Updated reply",
				})
			).status,
		).toBe(200);
		expect(
			(await (await s.request("/canned-replies")).json()).items[0].title,
		).toBe("Billing");
		expect(
			(await s.request(`/canned-replies/${canned.id}`, "DELETE")).status,
		).toBe(200);
		expect((await (await s.request("/canned-replies")).json()).total).toBe(0);
	});
	it("rejects invalid SLA targets and invalid ticket data", async () => {
		for (const urgent of [0, -1, Number.POSITIVE_INFINITY, Number.MAX_VALUE])
			expect(() => setup({ slaTargets: { urgent } })).toThrow();
		const s = setup();
		expect(
			(await s.request("/tickets", "POST", { subject: "  ", body: "Hello" }))
				.status,
		).toBe(400);
		expect((await s.request("/tickets?limit=101")).status).toBe(400);
	});
});

describe("Helpdesk optional integrations", () => {
	it("passes agent-only requester metadata to creation and resolution hooks without repeating a resolution", async () => {
		const onAfterCreateTicket = vi.fn();
		const onAfterResolveTicket = vi.fn();
		const s = setup({ hooks: { onAfterCreateTicket, onAfterResolveTicket } });
		const response = await s.request("/tickets", "POST", {
			subject: "Billing",
			body: "Please help",
			requesterEmail: "victim@example.test",
		});
		expect(response.status).toBe(200);
		const customerTicket = await response.json();
		expect(customerTicket).not.toHaveProperty("requesterEmail");
		expect(onAfterCreateTicket).toHaveBeenCalledWith(
			expect.objectContaining({
				id: customerTicket.id,
				customerId: "alice",
				requesterEmail: "alice@example.test",
			}),
			{ request: expect.any(Request) },
		);
		expect(
			(await s.operations.getAgentTicket({ id: customerTicket.id }))
				.requesterEmail,
		).toBe("alice@example.test");
		await s.operations.updateTicket({
			id: customerTicket.id,
			data: { status: "resolved" },
		});
		await s.operations.updateTicket({
			id: customerTicket.id,
			data: { status: "closed" },
		});
		await s.operations.updateTicket({
			id: customerTicket.id,
			data: { priority: "high" },
		});
		expect(onAfterResolveTicket).toHaveBeenCalledTimes(1);
		await s.operations.updateTicket({
			id: customerTicket.id,
			data: { status: "open" },
		});
		await s.operations.updateTicket({
			id: customerTicket.id,
			data: { status: "closed" },
		});
		expect(onAfterResolveTicket).toHaveBeenCalledTimes(2);
		expect(onAfterResolveTicket).toHaveBeenLastCalledWith(
			expect.objectContaining({
				requesterEmail: "alice@example.test",
				status: "closed",
			}),
			{ request: undefined },
		);
	});
	it("ignores forged requester emails in request operations and preserves trusted job inputs", async () => {
		const onAfterCreateTicket = vi.fn();
		const s = setup({ hooks: { onAfterCreateTicket } });
		const requestOperations = s.stack.forRequest(
			new Request("https://example.test"),
		).operations.helpdesk;
		const scoped = await requestOperations.createTicket({
			subject: "Billing",
			body: "Help",
			requesterEmail: "victim@example.test",
		});
		expect(
			(await s.operations.getAgentTicket({ id: scoped.id })).requesterEmail,
		).toBe("alice@example.test");
		s.as({ id: "alice", role: "customer" });
		const noEmailResponse = await s.request("/tickets", "POST", {
			subject: "Billing",
			body: "Help",
			requesterEmail: "victim@example.test",
		});
		expect(noEmailResponse.status).toBe(200);
		const noEmail = await noEmailResponse.json();
		expect(
			(await s.operations.getAgentTicket({ id: noEmail.id })).requesterEmail,
		).toBeNull();
		expect(
			onAfterCreateTicket.mock.calls.map(([ticket]) => ticket.requesterEmail),
		).toEqual(["alice@example.test", null]);
		const trusted = await s.operations.createTicket({
			subject: "Imported support request",
			body: "Help",
			customerId: "imported-customer",
			requesterEmail: "imported@example.test",
		});
		expect(
			(await s.operations.getAgentTicket({ id: trusted.id })).requesterEmail,
		).toBe("imported@example.test");
	});
	it("validates email and never runs integration hooks for denied ticket writes", async () => {
		const onAfterCreateTicket = vi.fn();
		const onAfterResolveTicket = vi.fn();
		const s = setup({ hooks: { onAfterCreateTicket, onAfterResolveTicket } });
		expect(
			(
				await s.request("/tickets", "POST", {
					subject: "Billing",
					body: "Help",
					requesterEmail: "invalid",
				})
			).status,
		).toBe(400);
		expect(onAfterCreateTicket).not.toHaveBeenCalled();
		const ticket = await create(s);
		expect(
			(await s.request(`/inbox/${ticket.id}`, "PUT", { status: "resolved" }))
				.status,
		).toBe(403);
		expect(onAfterResolveTicket).not.toHaveBeenCalled();
	});
});
