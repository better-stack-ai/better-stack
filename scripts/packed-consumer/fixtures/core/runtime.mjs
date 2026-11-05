import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { createBackendStack } from "@btst/stack/api";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import {
	createDbPlugin,
	createEndpoint,
	defineBackendPlugin,
	defineOperation,
} from "@btst/stack/plugins/api";
import { z } from "zod";

const require = createRequire(import.meta.url);
for (const name of [
	"ai-chat",
	"affiliate",
	"analytics",
	"blog",
	"calendar",
	"cms",
	"comments",
	"crm",
	"ecommerce",
	"feature-flags",
	"form-builder",
	"job-board",
	"kanban",
	"media",
	"newsletter",
	"open-api",
	"route-docs",
	"school",
	"ui-builder",
]) {
	assert.throws(() =>
		require.resolve(
			`@btst/plugin-${name}${name === "ui-builder" ? "" : name === "route-docs" ? "/client" : "/api"}`,
		),
	);
}
for (const name of [
	"@btst/components/markdown",
	"@milkdown/crepe",
	"@milkdown/kit/core",
	"ai",
	"@ai-sdk/react",
	"react-hook-form",
]) {
	assert.throws(
		() => require.resolve(name),
		`${name} must not be installed by Core`,
	);
}
for (const name of [
	"@btst/stack/plugins/blog/api",
	"@btst/stack/components/markdown",
	"@btst/stack/ui/css",
]) {
	assert.throws(() => require.resolve(name));
}

execFileSync(
	process.execPath,
	[
		"-e",
		String.raw`
const assert = require('node:assert/strict');
require('@btst/stack/api');
assert.equal(Object.keys(require.cache).some(path => /\/node_modules\/(?:react|react-dom|sonner|@milkdown)\//.test(path)), false);
`,
	],
	{ stdio: "inherit" },
);

async function verify({
	createBackendStack,
	defineAuthorization,
	definePermissions,
	permission,
	createServerAuth,
	createDbPlugin,
	createEndpoint,
	defineBackendPlugin,
	defineOperation,
}) {
	const permissions = definePermissions("consumerProbe", {
		echo: permission(z.object({ ownerId: z.string() })),
	});
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [permissions],
		rules: ({ consumerProbe }) => [
			consumerProbe.echo.when(
				({ identity, facts }) => identity?.id === facts.ownerId,
			),
		],
	});
	const input = z.object({ value: z.string().min(1, "Value is required") });
	const echo = defineOperation({
		input,
		permission: permissions.echo,
		facts: () => ({ ownerId: "owner" }),
		execute: ({ input }) => ({ value: input.value }),
	});
	const plugin = defineBackendPlugin({
		id: "consumerProbe",
		dbPlugin: createDbPlugin("consumer-probe", {}),
		operations: () => ({ echo }),
		routes: (_adapter, _context, operations) => ({
			echo: createEndpoint(
				"/echo",
				{ method: "POST", body: input },
				operations.echo.route((context) => context.body),
			),
		}),
	});
	const stack = createBackendStack({
		basePath: "/api",
		plugins: { consumerProbe: plugin },
		adapter: (db) => createMemoryAdapter(db)({}),
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => ({
				id: request.headers.get("x-owner") ?? "other",
			}),
		}),
	});
	const request = (owner, value = "HTTP operation") =>
		new Request("https://example.test/api/echo", {
			method: "POST",
			headers: { "content-type": "application/json", "x-owner": owner },
			body: JSON.stringify({ value }),
		});
	const operations = stack.forRequest(request("owner")).operations
		.consumerProbe;
	assert.deepEqual(await operations.echo({ value: "Authorized" }), {
		value: "Authorized",
	});
	await assert.rejects(
		stack
			.forRequest(request("other"))
			.operations.consumerProbe.echo({ value: "Denied" }),
		{ statusCode: 403 },
	);
	await assert.rejects(operations.echo({ value: "" }), /Value is required/);
	assert.deepEqual(
		await stack.trusted.consumerProbe.echo({ value: "Trusted job" }),
		{ value: "Trusted job" },
	);
	assert.deepEqual(await (await stack.handler(request("owner"))).json(), {
		value: "HTTP operation",
	});
	assert.equal((await stack.handler(request("other"))).status, 403);
	assert.equal((await stack.handler(request("owner", ""))).status, 400);
}

await verify({
	createBackendStack,
	defineAuthorization,
	definePermissions,
	permission,
	createServerAuth,
	createDbPlugin,
	createEndpoint,
	defineBackendPlugin,
	defineOperation,
});
await verify({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/stack/plugins/api"),
});
console.log(
	"Packed Core ESM/CJS authoring, shared operation identity, authorization, validation and feature-free API imports passed",
);
