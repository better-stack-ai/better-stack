import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import * as core from "@btst/stack/api";
import * as auth from "@btst/stack/authorization";
import * as server from "@btst/stack/authorization/server";
import * as helpdesk from "@btst/plugin-helpdesk/api";
import * as permissions from "@btst/plugin-helpdesk/permissions";
import { helpdeskClientPlugin } from "@btst/plugin-helpdesk/client";
import { createHelpdeskQueryKeys } from "@btst/plugin-helpdesk/query-keys";
import { createApiClient } from "@btst/stack/plugins/client";
import { createClientStack } from "@btst/stack/client";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { z } from "zod";

const require = createRequire(import.meta.url);
assert.throws(() => require.resolve("@btst/plugin-ai-chat/api"), {
	code: "MODULE_NOT_FOUND",
});
assert.throws(() => require.resolve("@btst/components"), {
	code: "MODULE_NOT_FOUND",
});
assert.equal(helpdeskClientPlugin().id, "helpdesk");
assert.equal(
	require("@btst/plugin-helpdesk/client").helpdeskClientPlugin().id,
	"helpdesk",
);

function serializedMemory(db) {
	const adapter = createMemoryAdapter(db)({});
	let tail = Promise.resolve();
	const result = { ...adapter, id: "serialized-memory-test" };
	for (const method of [
		"create",
		"findOne",
		"findMany",
		"count",
		"update",
		"updateMany",
		"delete",
		"deleteMany",
		"consumeOne",
		"transaction",
	]) {
		result[method] = async (input) => {
			let release;
			const previous = tail;
			tail = new Promise((resolve) => {
				release = resolve;
			});
			await previous;
			try {
				return await adapter[method](input);
			} finally {
				release();
			}
		};
	}
	return result;
}

async function verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	helpdeskBackendPlugin,
	helpdeskPermissions,
}) {
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string(), role: z.enum(["customer", "agent"]) }),
		permissions: [helpdeskPermissions],
		rules: ({ helpdesk: h }) => [
			...Object.values(h.customerTicket).map((p) =>
				p.when(({ identity }) => identity !== null),
			),
			...Object.values(h.ticket).map((p) =>
				p.when(({ identity }) => identity?.role === "agent"),
			),
			...Object.values(h.cannedReply).map((p) =>
				p.when(({ identity }) => identity?.role === "agent"),
			),
		],
	});
	const stack = createBackendStack({
		basePath: "/api",
		adapter: serializedMemory,
		plugins: {
			helpdesk: helpdeskBackendPlugin({ slaTargets: { urgent: 15 } }),
		},
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => {
				const id = request.headers.get("x-user");
				return id ? { id, role: id === "agent" ? "agent" : "customer" } : null;
			},
		}),
	});
	const request = (path, method = "GET", body, user = "customer") =>
		stack.handler(
			new Request(`https://example.test/api/helpdesk${path}`, {
				method,
				headers: {
					...(user ? { "x-user": user } : {}),
					...(body ? { "content-type": "application/json" } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		);
	assert.equal((await request("/tickets", "GET", undefined, "")).status, 401);
	let response = await request("/tickets", "POST", {
		subject: "Cannot access invoices",
		body: "Please help",
		priority: "urgent",
	});
	assert.equal(response.status, 200);
	const ticket = await response.json();
	for (const field of [
		"customerId",
		"assigneeId",
		"slaDueAt",
		"firstRespondedAt",
		"lockVersion",
	])
		assert.equal(field in ticket, false);
	assert.equal(
		(await request(`/tickets/${ticket.id}`, "GET", undefined, "other")).status,
		404,
	);
	assert.equal((await request("/inbox")).status, 403);
	response = await request(`/inbox/${ticket.id}`, "GET", undefined, "agent");
	const agentTicket = await response.json();
	assert.equal(
		Date.parse(agentTicket.slaDueAt) - Date.parse(agentTicket.createdAt),
		15 * 60_000,
	);
	response = await request(
		`/inbox/${ticket.id}/replies`,
		"POST",
		{ body: "Private billing investigation", isInternalNote: true },
		"agent",
	);
	assert.equal(response.status, 200);
	let detail = await (
		await request(`/inbox/${ticket.id}`, "GET", undefined, "agent")
	).json();
	assert.equal(detail.firstRespondedAt, null);
	assert.ok(detail.messages.some((message) => message.isInternalNote));
	response = await request(
		`/inbox/${ticket.id}/replies`,
		"POST",
		{ body: "Your invoice is available now" },
		"agent",
	);
	assert.equal(response.status, 200);
	detail = await (
		await request(`/inbox/${ticket.id}`, "GET", undefined, "agent")
	).json();
	assert.ok(detail.firstRespondedAt);
	response = await request(
		`/inbox/${ticket.id}`,
		"PUT",
		{ status: "resolved", assigneeId: "agent" },
		"agent",
	);
	assert.equal(response.status, 200);
	assert.ok((await response.json()).resolvedAt);
	const customer = await (await request(`/tickets/${ticket.id}`)).json();
	assert.deepEqual(
		customer.messages.map((message) => message.body),
		["Please help", "Your invoice is available now"],
	);
	for (const message of customer.messages) {
		assert.equal("authorId" in message, false);
		assert.equal("isInternalNote" in message, false);
	}
	assert.doesNotMatch(
		JSON.stringify(customer),
		/Private billing investigation|assigneeId|slaDueAt/,
	);
	assert.equal((await request("/canned-replies")).status, 403);
	response = await request(
		"/canned-replies",
		"POST",
		{ title: "Invoice ready", body: "Your invoice is ready." },
		"agent",
	);
	assert.equal(response.status, 200);
	const canned = await response.json();
	assert.equal(
		(
			await request(
				`/canned-replies/${canned.id}`,
				"DELETE",
				undefined,
				"agent",
			)
		).status,
		200,
	);
}
await verify({ ...core, ...auth, ...server, ...helpdesk, ...permissions });
await verify({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-helpdesk/api"),
	...require("@btst/plugin-helpdesk/permissions"),
});

const queryClient = new QueryClient();
const calls = [];
globalThis.fetch = async (input, init) => {
	calls.push({ url: String(input), headers: new Headers(init?.headers) });
	return Response.json({ items: [], total: 0 });
};
const stack = createClientStack({
	api: {
		baseURL: "https://example.test",
		basePath: "/api",
		headers: { "x-user": "customer" },
	},
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient,
	plugins: { helpdesk: helpdeskClientPlugin() },
});
await stack.router.getRoute("/helpdesk").loader();
assert.equal(calls.length, 1);
assert.equal(calls[0].headers.get("x-user"), "customer");
assert.doesNotThrow(() => JSON.stringify(dehydrate(queryClient)));
const keys = createHelpdeskQueryKeys(
	createApiClient({ baseURL: "https://example.test", basePath: "/api" }),
);
assert.notDeepEqual(
	keys.helpdeskCustomerTickets.list({}, { id: "a" }).queryKey,
	keys.helpdeskCustomerTickets.list({}, { id: "b" }).queryKey,
);
assert.notDeepEqual(
	keys.helpdeskCustomerTickets.detail("ticket", { id: "a" }).queryKey,
	keys.helpdeskAgentTickets.detail("ticket", { id: "a" }).queryKey,
);
