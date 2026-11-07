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

function setup(
	options: HelpdeskBackendOptions = {},
	existingAdapter?: DBAdapter,
) {
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
			adapter = existingAdapter ?? createMemoryAdapter(db)({});
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

describe("Helpdesk ticket search", () => {
	it("scopes customer matches and counts to owned public conversations", async () => {
		const s = setup();
		const own = await create(s);
		await s.operations.replyAsAgent({
			id: own.id,
			body: "Internal canary",
			isInternalNote: true,
		});
		await s.operations.createTicket({
			customerId: "bob",
			subject: "Canary for another customer",
			body: "Other customer's public canary",
		});
		const publicTicket = await s.operations.createTicket({
			customerId: "alice",
			subject: "Shipping question",
			body: "The tracking canary is missing",
		});
		const query = "search=canary&customerId=bob&assigneeId=private-agent";
		const response = await s.request(`/tickets?${query}&limit=1`);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			items: [publicTicket],
			total: 1,
		});
		expect(
			await (await s.request(`/tickets?${query}&offset=1`)).json(),
		).toEqual({
			items: [],
			total: 1,
		});
		expect(await (await s.request("/tickets?search=internal")).json()).toEqual({
			items: [],
			total: 0,
		});
		const requestOperations = s.stack.forRequest(
			new Request("https://example.test"),
		).operations.helpdesk;
		expect(
			await requestOperations.listCustomerTickets({
				search: "canary",
				customerId: "bob",
			}),
		).toEqual({ items: [publicTicket], total: 1 });
		expect(
			JSON.stringify(
				await requestOperations.listCustomerTickets({ search: "canary" }),
			),
		).not.toMatch(/Internal|customerId|assigneeId|isInternalNote|authorId/);
	});
	it("authorizes agent note search and composes filters before pagination", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		const s = setup();
		const matches = [];
		for (let n = 0; n < 3; n++) {
			const ticket = await create(s);
			await s.operations.updateTicket({
				id: ticket.id,
				data: { priority: "urgent", status: "pending", assigneeId: "support" },
			});
			await s.operations.replyAsAgent({
				id: ticket.id,
				body: "Escalation canary",
				isInternalNote: true,
			});
			matches.push(ticket.id);
		}
		await create(s);
		const excluded = await create(s);
		await s.operations.replyAsAgent({
			id: excluded.id,
			body: "canary",
			isInternalNote: true,
		});
		const query =
			"search=CANARY&status=pending&priority=urgent&assigneeId=support&limit=1&offset=1";
		expect((await s.request(`/inbox?${query}&role=agent`)).status).toBe(403);
		const requestOperations = s.stack.forRequest(
			new Request("https://example.test"),
		).operations.helpdesk;
		await expect(
			requestOperations.listAgentTickets({ search: "canary" }),
		).rejects.toThrow();
		s.as({ id: "support", role: "agent" });
		const response = await s.request(`/inbox?${query}`);
		expect(response.status).toBe(200);
		const page = await response.json();
		expect(page.total).toBe(3);
		expect(page.items.map((ticket: { id: string }) => ticket.id)).toEqual([
			matches.sort().reverse()[1],
		]);
		expect(
			await s.stack
				.forRequest(new Request("https://example.test"))
				.operations.helpdesk.listAgentTickets({
					search: "CANARY",
					status: "pending",
					priority: "urgent",
					assigneeId: "support",
					limit: 1,
					offset: 1,
				}),
		).toEqual(page);
	});
	it("matches Unicode and escaped text literally with shared HTTP and operation validation", async () => {
		const s = setup();
		const ticket = await s.operations.createTicket({
			customerId: "alice",
			subject: "Café 東京",
			body: '<script>alert("x")</script> 100%_ [a-z]+ \\ end',
		});
		await s.operations.createTicket({
			customerId: "alice",
			subject: "Unrelated question",
			body: "Different conversation",
		});
		const requestOperations = s.stack.forRequest(
			new Request("https://example.test"),
		).operations.helpdesk;
		for (const search of [
			"  CAFE\u0301  ",
			"東京",
			'<script>alert("x")</script>',
			"%_",
			"[a-z]+",
			"\\",
		]) {
			const page = await (
				await s.request(`/tickets?${new URLSearchParams({ search })}`)
			).json();
			expect(page).toEqual({ items: [ticket], total: 1 });
			expect(await requestOperations.listCustomerTickets({ search })).toEqual(
				page,
			);
		}
		expect(
			(
				await s.request(
					`/tickets?${new URLSearchParams({ search: "a".repeat(201) })}`,
				)
			).status,
		).toBe(400);
		await expect(
			requestOperations.listCustomerTickets({ search: "a".repeat(201) }),
		).rejects.toThrow();
		await expect(
			requestOperations.listCustomerTickets({ search: 42 as never }),
		).rejects.toThrow();
		expect(await (await s.request("/tickets?search=++")).json()).toMatchObject({
			total: 2,
		});
	});
	it("searches beyond storage pages and keeps equal-timestamp pagination deterministic", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		const s = setup();
		const ids = [];
		for (let n = 0; n < 201; n++) {
			const ticket = await s.operations.createTicket({
				customerId: "alice",
				subject: `Paged ticket ${n}`,
				body: "Searchable message",
			});
			ids.push(ticket.id);
		}
		for (let n = 0; n < 202; n++) {
			await s.adapter().create({
				model: "helpdeskMessage",
				forceAllowId: true,
				data: {
					id: `message-${String(n).padStart(3, "0")}`,
					ticketId: ids[0]!,
					body: n === 201 ? "Late message canary" : "Earlier response",
					authorId: "support",
					authorType: "agent",
					isInternalNote: false,
					createdAt: new Date(),
				},
			});
		}
		expect(
			await s.operations.listCustomerTickets({
				customerId: "alice",
				search: "late message",
			}),
		).toMatchObject({ total: 1, items: [{ id: ids[0] }] });
		const expected = ids.sort().reverse().slice(199);
		for (const search of ["", "searchable"]) {
			const page = await s.operations.listCustomerTickets({
				customerId: "alice",
				search,
				offset: 199,
				limit: 2,
			});
			expect(page.total).toBe(201);
			expect(page.items.map((ticket) => ticket.id)).toEqual(expected);
		}
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

describe("Helpdesk business-calendar and resolution policy", () => {
	const calendar = {
		timeZone: "America/New_York",
		workingIntervals: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
			dayOfWeek: dayOfWeek as 1 | 2 | 3 | 4 | 5,
			start: "09:00",
			end: "17:00",
		})),
		holidays: ["2026-03-09"],
	};
	const options: HelpdeskBackendOptions = {
		businessCalendar: calendar,
		slaTargets: { urgent: 60, high: 120 },
		resolutionTargets: { urgent: 120, high: 240 },
	};
	const at = (time: string) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(time));
	};
	const urgent = (s: ReturnType<typeof setup>) =>
		s.operations.createTicket({
			customerId: "alice",
			subject: "Outage",
			body: "Help",
			priority: "urgent",
		});
	it("snapshots business policy and keeps customer projections restricted", async () => {
		at("2026-03-06T21:30:00Z");
		const mutable = structuredClone(options);
		const s = setup(mutable);
		mutable.businessCalendar!.holidays!.length = 0;
		mutable.slaTargets!.urgent = 1;
		mutable.resolutionTargets!.urgent = 1;
		const ticket = await urgent(s);
		const agent = await s.operations.getAgentTicket({ id: ticket.id });
		expect(agent.slaDueAt).toBe("2026-03-10T13:30:00.000Z");
		expect(agent.resolutionDueAt).toBe("2026-03-10T14:30:00.000Z");
		const row = await s
			.adapter()
			.findOne<{ slaPolicy: string }>({
				model: "helpdeskTicket",
				where: [{ field: "id", value: ticket.id }],
			});
		expect(JSON.parse(row!.slaPolicy)).toMatchObject({
			version: 1,
			responseTargets: { urgent: 60 },
			resolutionTargets: { urgent: 120 },
			businessCalendar: calendar,
		});
		for (const customer of [
			ticket,
			await s.operations.getCustomerTicket({
				id: ticket.id,
				customerId: "alice",
			}),
			await s.operations.listCustomerTickets({ customerId: "alice" }),
		])
			expect(JSON.stringify(customer)).not.toMatch(
				/slaDueAt|resolutionDueAt|slaPolicy|timeZone|responseTargets/,
			);
		expect(agent).not.toHaveProperty("slaPolicy");
	});
	it("uses captured policy after application configuration changes and reprioritizes outstanding targets from creation", async () => {
		at("2026-03-06T21:30:00Z");
		const original = setup(options);
		const ticket = await urgent(original);
		const changed = setup(
			{
				slaTargets: { high: 1 },
				resolutionTargets: { high: 1 },
				businessCalendar: {
					timeZone: "UTC",
					workingIntervals: [{ dayOfWeek: 1, start: "00:00", end: "24:00" }],
				},
			},
			original.adapter(),
		);
		at("2026-03-10T13:15:00Z");
		const updated = await changed.operations.updateTicket({
			id: ticket.id,
			data: { priority: "high", status: "pending" },
		});
		expect(updated.slaDueAt).toBe("2026-03-10T14:30:00.000Z");
		expect(updated.resolutionDueAt).toBe("2026-03-10T16:30:00.000Z");
		at("2026-03-10T17:00:00Z");
		const pending = await changed.operations.updateTicket({
			id: ticket.id,
			data: { status: "open" },
		});
		expect(pending.slaDueAt).toBe(updated.slaDueAt);
		expect(pending.resolutionDueAt).toBe(updated.resolutionDueAt);
	});
	it("keeps first response separate from notes/resolution and freezes completed target deadlines", async () => {
		at("2026-03-10T13:00:00Z");
		const s = setup(options);
		const ticket = await urgent(s);
		at("2026-03-10T13:10:00Z");
		const note = await s.operations.replyAsAgent({
			id: ticket.id,
			body: "Investigating",
			isInternalNote: true,
		});
		expect(note.firstRespondedAt).toBeNull();
		const resolved = await s.operations.updateTicket({
			id: ticket.id,
			data: { status: "resolved" },
		});
		expect(resolved.firstRespondedAt).toBeNull();
		const replied = await s.operations.replyAsAgent({
			id: ticket.id,
			body: "Fixed",
		});
		expect(replied.firstRespondedAt).toBe("2026-03-10T13:10:00.000Z");
		const closed = await s.operations.updateTicket({
			id: ticket.id,
			data: { status: "closed", priority: "high" },
		});
		expect(closed.slaDueAt).toBe(replied.slaDueAt);
		expect(closed.resolutionDueAt).toBe(resolved.resolutionDueAt);
		expect(closed.resolvedAt).toBe(resolved.resolvedAt);
	});
	it("reopens without resetting resolution budgets and preserves public-response completion", async () => {
		at("2026-03-10T13:00:00Z");
		const s = setup(options);
		const ticket = await urgent(s);
		const first = await s.operations.replyAsAgent({
			id: ticket.id,
			body: "Checking",
		});
		const closed = await s.operations.updateTicket({
			id: ticket.id,
			data: { status: "closed" },
		});
		at("2026-03-10T16:00:00Z");
		const opened = await s.operations.updateTicket({
			id: ticket.id,
			data: { status: "open" },
		});
		expect(opened.resolvedAt).toBeNull();
		expect(opened.resolutionDueAt).toBe(closed.resolutionDueAt);
		expect(opened.firstRespondedAt).toBe(first.firstRespondedAt);
		const resolved = await s.operations.updateTicket({
			id: ticket.id,
			data: { status: "resolved" },
		});
		expect(resolved.resolvedAt).toBe("2026-03-10T16:00:00.000Z");
		await s.operations.replyToTicket({
			id: ticket.id,
			customerId: "alice",
			body: "Still broken",
		});
		const customerReopened = await s.operations.getAgentTicket({
			id: ticket.id,
		});
		expect(customerReopened.resolvedAt).toBeNull();
		expect(customerReopened.resolutionDueAt).toBe(closed.resolutionDueAt);
	});
	it("supports elapsed resolution targets without a calendar and missing per-priority targets", async () => {
		at("2026-03-07T03:00:00Z");
		const s = setup({ resolutionTargets: { urgent: 120 } });
		const ticket = await urgent(s);
		expect(
			(await s.operations.getAgentTicket({ id: ticket.id })).resolutionDueAt,
		).toBe("2026-03-07T05:00:00.000Z");
		const high = await s.operations.updateTicket({
			id: ticket.id,
			data: { priority: "high" },
		});
		expect(high.resolutionDueAt).toBeNull();
		const back = await s.operations.updateTicket({
			id: ticket.id,
			data: { priority: "urgent" },
		});
		expect(back.resolutionDueAt).toBe("2026-03-07T05:00:00.000Z");
	});
	it("keeps migrated legacy rows on elapsed response-only rules under new configuration", async () => {
		at("2026-03-07T03:00:00Z");
		const original = setup();
		const ticket = await urgent(original);
		await original
			.adapter()
			.update({
				model: "helpdeskTicket",
				where: [{ field: "id", value: ticket.id }],
				update: { slaPolicy: null, resolutionDueAt: null },
			});
		await original.operations.replyAsAgent({ id: ticket.id, body: "Checking" });
		const configured = setup(options, original.adapter());
		const before = await configured.operations.getAgentTicket({
			id: ticket.id,
		});
		expect(before.slaDueAt).toBe("2026-03-07T04:00:00.000Z");
		expect(before.resolutionDueAt).toBeNull();
		const updated = await configured.operations.updateTicket({
			id: ticket.id,
			data: { priority: "high" },
		});
		expect(updated.slaDueAt).toBe("2026-03-07T05:00:00.000Z");
		expect(updated.resolutionDueAt).toBeNull();
	});
	it("rejects policy injection through ticket mutations and preserves authorization", async () => {
		const s = setup(options);
		const ticket = await urgent(s);
		for (const extra of [
			{ resolutionDueAt: "2099-01-01" },
			{ slaPolicy: "{}" },
			{ businessCalendar: calendar },
		]) {
			expect(
				(
					await s.request("/tickets", "POST", {
						subject: "Help",
						body: "Help",
						...extra,
					})
				).status,
			).toBe(400);
			s.as({ id: "agent", role: "agent" });
			expect(
				(
					await s.request(`/inbox/${ticket.id}`, "PUT", {
						priority: "high",
						...extra,
					})
				).status,
			).toBe(400);
		}
		s.as({ id: "alice", role: "customer" });
		expect(
			(await s.request(`/inbox/${ticket.id}`, "PUT", { priority: "high" }))
				.status,
		).toBe(403);
	});
	it("rolls back an impossible resolution deadline instead of storing a partial ticket", async () => {
		at("2026-01-01T00:00:00Z");
		const s = setup({
			businessCalendar: {
				timeZone: "UTC",
				workingIntervals: [{ dayOfWeek: 1, start: "09:00", end: "09:01" }],
			},
			slaTargets: { urgent: 1 },
			resolutionTargets: { urgent: 5_256_000 },
		});
		await expect(urgent(s)).rejects.toThrow("100 years");
		expect(await s.adapter().count({ model: "helpdeskTicket" })).toBe(0);
		expect(await s.adapter().count({ model: "helpdeskMessage" })).toBe(0);
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
