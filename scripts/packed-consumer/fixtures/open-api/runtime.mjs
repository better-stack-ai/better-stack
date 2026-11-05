import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { createMemoryAdapter } from "@btst/adapter-memory";
import * as core from "@btst/stack/api";
import * as auth from "@btst/stack/authorization";
import * as server from "@btst/stack/authorization/server";
import * as authoring from "@btst/stack/plugins/api";
import * as openApi from "@btst/plugin-open-api/api";
import { z } from "zod";

const require = createRequire(import.meta.url);
for (const name of ["blog", "ai-chat", "comments", "newsletter"])
	assert.throws(() => require.resolve(`@btst/plugin-${name}/api`), {
		code: "MODULE_NOT_FOUND",
	});
assert.throws(() => require.resolve("@btst/components"), {
	code: "MODULE_NOT_FOUND",
});

async function verify(
	{
		createBackendStack,
		defineAuthorization,
		definePermissions,
		permission,
		createServerAuth,
		createDbPlugin,
		createEndpoint,
		defineBackendPlugin,
		defineOperation,
		openApiBackendPlugin,
		generateOpenAPISchema,
		z,
	},
	format,
) {
	const permissions = definePermissions("records", {
		read: permission(z.object({ owner: z.string() })),
		create: permission(),
		internal: permission(),
	});
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [permissions],
		rules: ({ records }) => [
			records.read.when(({ identity, facts }) => identity?.id === facts.owner),
			records.create.allow(),
			records.internal.when(() => false),
		],
	});
	let routeConstructions = 0;
	let composedContext;
	let executions = 0;
	let identities = 0;
	const feature = defineBackendPlugin({
		id: "records",
		dbPlugin: createDbPlugin("records", {
			record: {
				modelName: "record",
				fields: {
					title: { type: "string", required: true },
					owner: { type: "string", required: true },
				},
			},
		}),
		operations: (adapter) => ({
			read: defineOperation({
				input: z.object({ id: z.string().min(1) }),
				permission: permissions.read,
				facts: () => ({ owner: "owner", serverSecret: "never-document" }),
				execute: ({ input }) => {
					executions++;
					return adapter.findOne({
						model: "record",
						where: [{ field: "id", value: input.id }],
					});
				},
			}),
			create: defineOperation({
				input: z.object({ title: z.string().min(1) }),
				permission: permissions.create,
				facts: () => undefined,
				execute: ({ input }) => ({ title: input.title }),
			}),
			internal: defineOperation({
				input: z.object({}),
				permission: permissions.internal,
				facts: () => undefined,
				execute: () => "never-document",
			}),
		}),
		routes: (_adapter, context, operations) => {
			composedContext = context;
			routeConstructions++;
			return {
				read: createEndpoint(
					"/records/:id",
					{
						method: "GET",
						requireRequest: true,
						metadata: { openapi: { summary: "Read existing record" } },
					},
					operations.read.route((ctx) => ctx.params),
				),
				create: createEndpoint(
					"/records",
					{
						method: "POST",
						requireRequest: true,
						body: z.object({ title: z.string().min(1) }),
					},
					operations.create.route((ctx) => ctx.body),
				),
			};
		},
	});
	const plugin = openApiBackendPlugin({
		title: "Packed <Records>",
		description: "Existing application routes",
		version: "5.2.0",
		path: "/docs",
		theme: "moon",
		nonce: 'nonce"value',
	});
	assert.equal(plugin.id, "openApi");
	const stack = createBackendStack({
		basePath: "/api/data",
		plugins: { openApi: plugin, records: feature },
		adapter: (db) => createMemoryAdapter(db)({}),
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => {
				identities++;
				return request.headers.has("x-user")
					? { id: request.headers.get("x-user") }
					: null;
			},
		}),
	});
	await stack.adapter.create({
		model: "record",
		forceAllowId: true,
		data: { id: "v5-record", title: "Existing v5 record", owner: "owner" },
	});
	const request = (path, user, body) =>
		stack.handler(
			new Request(`https://site.test/api/data${path}`, {
				method: body ? "POST" : "GET",
				headers: {
					...(user ? { "x-user": user } : {}),
					...(body ? { "content-type": "application/json" } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		);
	assert.equal(routeConstructions, 1);
	const response = await request("/open-api/schema");
	assert.equal(response.status, 200);
	const schema = await response.json();
	assert.equal(schema.openapi, "3.1.0");
	assert.deepEqual(schema.info, {
		title: "Packed <Records>",
		description: "Existing application routes",
		version: "5.2.0",
	});
	assert.equal(schema.servers[0].url, "/api/data");
	assert.deepEqual(Object.keys(schema.paths), ["/records", "/records/{id}"]);
	assert.equal(schema.paths["/records/{id}"].get.operationId, "records_read");
	assert.equal(
		schema.paths["/records/{id}"].get["x-btst-access"],
		"permission",
	);
	assert.equal(
		schema.paths["/records/{id}"].get["x-btst-permission"],
		"records:read",
	);
	assert.equal(
		schema.paths["/records/{id}"].get.summary,
		"Read existing record",
	);
	assert.equal(
		schema.paths["/records"].post.requestBody.content["application/json"].schema
			.properties.title.type,
		"string",
	);
	assert.ok(schema.paths["/records/{id}"].get.responses["401"]);
	assert.ok(schema.paths["/records/{id}"].get.responses["403"]);
	const serialized = JSON.stringify(schema);
	for (const secret of ["internal", "serverSecret", "never-document", "owner"])
		assert.ok(!serialized.includes(secret));
	const reference = await request("/docs");
	assert.equal(reference.status, 200);
	assert.match(reference.headers.get("content-type"), /text\/html/);
	const html = await reference.text();
	assert.match(html, /<title>Packed &lt;Records&gt;<\/title>/);
	assert.match(html, /nonce="nonce&quot;value"/);
	assert.match(
		html,
		/https:\/\/cdn\.jsdelivr\.net\/npm\/@scalar\/api-reference/,
	);
	await writeFile(`dist/reference-${format}.html`, html);
	assert.equal(identities, 0);
	assert.equal(executions, 0);
	assert.equal(routeConstructions, 1);
	const direct = generateOpenAPISchema(composedContext, {
		title: "Public generator",
		version: "custom",
	});
	assert.equal(direct.info.title, "Public generator");
	assert.equal(direct.info.version, "custom");
	assert.equal(
		direct.paths["/records/{id}"].get["x-btst-permission"],
		"records:read",
	);
	assert.equal((await request("/records/v5-record")).status, 401);
	assert.equal((await request("/records/v5-record", "other")).status, 403);
	assert.equal((await request("/records", "owner", { title: "" })).status, 400);
	const existing = await request("/records/v5-record", "owner");
	assert.equal(existing.status, 200);
	assert.deepEqual(await existing.json(), {
		id: "v5-record",
		title: "Existing v5 record",
		owner: "owner",
	});
	assert.equal(executions, 1);
	const disabled = createBackendStack({
		basePath: "/api/data",
		plugins: {
			openApi: openApiBackendPlugin({ disableDefaultReference: true }),
		},
		adapter: (db) => createMemoryAdapter(db)({}),
	});
	assert.equal(
		(
			await disabled.handler(
				new Request("https://site.test/api/data/reference"),
			)
		).status,
		404,
	);
	assert.equal(
		(
			await disabled.handler(
				new Request("https://site.test/api/data/open-api/schema"),
			)
		).status,
		200,
	);
}

await verify(
	{ ...core, ...auth, ...server, ...authoring, ...openApi, z },
	"esm",
);
await verify(
	{
		...require("@btst/stack/api"),
		...require("@btst/stack/authorization"),
		...require("@btst/stack/authorization/server"),
		...require("@btst/stack/plugins/api"),
		...require("@btst/plugin-open-api/api"),
		z: require("zod").z,
	},
	"commonjs",
);
console.log(
	"Open API ESM/CommonJS metadata, reference, auth, validation and existing-data checks passed",
);
