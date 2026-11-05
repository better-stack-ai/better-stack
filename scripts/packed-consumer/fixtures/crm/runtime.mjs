import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { crmBackendPlugin } from "@btst/plugin-crm/api";
import { crmClientPlugin } from "@btst/plugin-crm/client";
import { crmPermissions } from "@btst/plugin-crm/permissions";
import { createCrmQueryKeys } from "@btst/plugin-crm/query-keys";
import { kanbanBackendPlugin } from "@btst/plugin-kanban/api";
import { kanbanPermissions } from "@btst/plugin-kanban/permissions";
import { createApiClient } from "@btst/stack/plugins/client";
import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

const require = createRequire(import.meta.url);
assert.equal(crmClientPlugin().id, "crm");
assert.equal(require("@btst/plugin-crm/client").crmClientPlugin().id, "crm");
assert.throws(() => require.resolve("@btst/plugin-ai-chat/api"), {
	code: "MODULE_NOT_FOUND",
});

async function verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	crmBackendPlugin,
	crmPermissions,
	kanbanBackendPlugin,
	kanbanPermissions,
	createCrmQueryKeys,
	createApiClient,
}) {
	const operator = ({ identity }) => identity?.id === "operator";
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [crmPermissions, kanbanPermissions],
		rules: ({ crm, kanban }) => [
			crm.contact.read.when(operator),
			crm.contact.create.when(operator),
			crm.company.read.when(operator),
			crm.company.create.when(operator),
			crm.pipeline.read.when(operator),
			crm.pipeline.create.when(operator),
			crm.deal.read.when(operator),
			crm.deal.create.when(operator),
			crm.deal.move.when(operator),
			crm.activity.read.when(operator),
			crm.activity.create.when(operator),
			kanban.board.read.when(operator),
			kanban.task.update.when(operator),
		],
	});
	const auth = createServerAuth({
		authorization,
		getIdentity: ({ request }) => {
			const id = request.headers.get("x-user");
			return id ? { id } : null;
		},
	});
	assert.throws(
		() =>
			createBackendStack({
				plugins: { crm: crmBackendPlugin() },
				adapter: (db) => createMemoryAdapter(db)({}),
				auth,
			}),
		/CRM requires the Kanban backend plugin/,
	);
	const stack = createBackendStack({
		basePath: "/api",
		plugins: { kanban: kanbanBackendPlugin(), crm: crmBackendPlugin() },
		adapter: (db) => createMemoryAdapter(db)({}),
		auth,
	});
	const request = (id) =>
		new Request("https://example.test/api", { headers: { "x-user": id } });
	const operations = stack.forRequest(request("operator")).operations;
	await stack.adapter.create({
		model: "crmContact",
		forceAllowId: true,
		data: {
			id: "existing-v5-contact",
			firstName: "Existing",
			lastName: "Contact",
			tags: '["customer"]',
			customFields: '{"region":"west"}',
			createdAt: new Date("2026-01-01T00:00:00Z"),
			updatedAt: new Date("2026-01-01T00:00:00Z"),
		},
	});
	const existing = await operations.crm.getContactById({
		id: "existing-v5-contact",
	});
	assert.deepEqual(existing.tags, ["customer"]);
	assert.deepEqual(existing.customFields, { region: "west" });
	assert.equal(existing.createdAt, "2026-01-01T00:00:00.000Z");
	const company = await operations.crm.createCompany({
		name: "Packed company",
	});
	const contact = await operations.crm.createContact({
		firstName: "Ada",
		companyId: company.id,
		email: "ada@example.test",
	});
	assert.equal(contact.companyId, company.id);
	const pipeline = await operations.crm.createPipeline({
		name: "Packed sales",
		stages: ["Lead", "Qualified"],
	});
	const deal = await operations.crm.createDeal({
		title: "Packed deal",
		pipelineId: pipeline.id,
		stage: pipeline.columns[0].id,
		contactId: contact.id,
		companyId: company.id,
		value: 1234,
	});
	await operations.crm.logActivity({
		type: "note",
		body: "Packed activity",
		contactId: contact.id,
		dealId: deal.id,
	});
	const activities = await operations.crm.listActivities({ dealId: deal.id });
	assert.equal(activities.items[0].body, "Packed activity");
	const moved = await operations.crm.moveDeal({
		id: deal.id,
		stage: pipeline.columns[1].id,
		order: 0,
	});
	assert.equal(moved.stage, pipeline.columns[1].id);
	const board = await operations.kanban.getBoard({ id: pipeline.id });
	assert.equal(board.columns[1].tasks[0].id, deal.taskId);
	await operations.kanban.updateTask({
		id: deal.taskId,
		data: { title: "Renamed through Kanban" },
	});
	assert.equal(
		(await operations.crm.getDealById({ id: deal.id })).title,
		"Renamed through Kanban",
	);
	await assert.rejects(
		stack
			.forRequest(request("denied"))
			.operations.crm.getContactById({ id: contact.id }),
		{ statusCode: 403 },
	);
	await assert.rejects(
		operations.crm.createContact({ firstName: "" }),
		/firstName/,
	);
	assert.equal(
		(await stack.handler(new Request("https://example.test/api/crm/contacts")))
			.status,
		401,
	);
	assert.equal(Object.hasOwn(stack.raw, "crm"), false);
	const previousFetch = globalThis.fetch;
	globalThis.fetch = (input, init) => stack.handler(new Request(input, init));
	try {
		const queryClient = new QueryClient();
		const client = createApiClient({
			baseURL: "https://example.test",
			basePath: "/api",
		});
		const key = createCrmQueryKeys(client, {
			"x-user": "operator",
		}).crmPipelines.detail(pipeline.id, { id: "operator" });
		await queryClient.prefetchQuery(key);
		const data = queryClient.getQueryData(key.queryKey);
		assert.equal(data.deals[0].title, "Renamed through Kanban");
		assert.equal(typeof data.createdAt, "string");
		queryClient.clear();
	} finally {
		globalThis.fetch = previousFetch;
	}
}

await verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	crmBackendPlugin,
	crmPermissions,
	kanbanBackendPlugin,
	kanbanPermissions,
	createCrmQueryKeys,
	createApiClient,
});
await verify({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-crm/api"),
	...require("@btst/plugin-crm/permissions"),
	...require("@btst/plugin-crm/query-keys"),
	...require("@btst/plugin-kanban/api"),
	...require("@btst/plugin-kanban/permissions"),
	...require("@btst/stack/plugins/client"),
});
console.log(
	"Packed CRM/Kanban ESM+CJS operations, auth, linked data, existing records and query prefetch passed",
);
