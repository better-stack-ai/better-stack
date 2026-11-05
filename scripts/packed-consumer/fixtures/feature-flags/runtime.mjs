import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import * as core from "@btst/stack/api";
import * as authorization from "@btst/stack/authorization";
import * as server from "@btst/stack/authorization/server";
import * as flags from "@btst/plugin-feature-flags/api";
import { evaluateFlag } from "@btst/plugin-feature-flags/evaluate";
import { featureFlagsClientPlugin } from "@btst/plugin-feature-flags/client";
import { createFeatureFlagsQueryKeys } from "@btst/plugin-feature-flags/query-keys";
import { createApiClient } from "@btst/stack/plugins/client";
import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

const require = createRequire(import.meta.url);
for (const name of ["ai-chat", "blog", "newsletter", "cms"])
	assert.throws(() => require.resolve(`@btst/plugin-${name}/api`), {
		code: "MODULE_NOT_FOUND",
	});
assert.throws(() => require.resolve("@btst/components"), {
	code: "MODULE_NOT_FOUND",
});
assert.equal(featureFlagsClientPlugin().id, "featureFlags");
const definition = {
	id: "v5-flag",
	key: "checkout",
	name: "Existing checkout",
	description: null,
	type: "boolean",
	enabled: true,
	rolloutPct: null,
	segments: [],
	tags: ["beta"],
	archivedAt: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};
for (const evaluate of [
	evaluateFlag,
	require("@btst/plugin-feature-flags/evaluate").evaluateFlag,
]) {
	assert.equal(evaluate(definition), true);
	assert.equal(evaluate({ ...definition, enabled: false }), false);
	assert.equal(
		evaluate({ ...definition, archivedAt: definition.createdAt }),
		false,
	);
	assert.equal(
		evaluate(
			{ ...definition, type: "rollout", rolloutPct: 0 },
			{ userId: "same-subject" },
		),
		false,
	);
	assert.equal(
		evaluate(
			{ ...definition, type: "rollout", rolloutPct: 100 },
			{ userId: "same-subject" },
		),
		true,
	);
	const segment = {
		...definition,
		type: "segment",
		segments: [
			{ field: "email", operator: "equals", value: "zoë@example.test" },
			{ field: "tags", operator: "contains", value: "bêta" },
		],
	};
	assert.equal(
		evaluate(segment, { email: "zoë@example.test", tags: ["bêta"] }),
		true,
	);
	assert.equal(
		evaluate(segment, { email: "other@example.test", tags: ["bêta"] }),
		false,
	);
	assert.equal(evaluate(segment, {}), false);
}
async function verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	featureFlagsBackendPlugin,
	featureFlagsPermissions,
}) {
	const policy = defineAuthorization({
		identity: z.object({ id: z.string(), role: z.string() }),
		permissions: [featureFlagsPermissions],
		rules: ({ featureFlags: f }) => [
			f.flags.read.when(({ identity }) => identity?.role === "admin"),
			f.flags.create.when(({ identity }) => identity?.role === "admin"),
			f.flags.update.when(({ identity }) =>
				["admin", "editor"].includes(identity?.role),
			),
			f.flags.toggle.when(({ identity }) => identity?.role === "admin"),
			f.flags.archive.when(({ identity }) => identity?.role === "admin"),
			f.evaluations.read.when(({ identity }) => identity?.role === "admin"),
		],
	});
	const stack = createBackendStack({
		basePath: "/api",
		adapter: (db) => createMemoryAdapter(db)({}),
		plugins: {
			featureFlags: featureFlagsBackendPlugin({ evaluationLogLimit: 2 }),
		},
		auth: createServerAuth({
			authorization: policy,
			getIdentity: ({ request }) =>
				request.headers.has("x-role")
					? { id: "viewer", role: request.headers.get("x-role") }
					: null,
		}),
	});
	await stack.adapter.create({
		model: "flag",
		forceAllowId: true,
		data: {
			...definition,
			segments: "[]",
			tags: '["beta"]',
			createdAt: new Date(definition.createdAt),
			updatedAt: new Date(definition.updatedAt),
		},
	});
	const request = (path, method = "GET", body, role) =>
		stack.handler(
			new Request(`https://site.test/api/feature-flags/${path}`, {
				method,
				headers: {
					...(role ? { "x-role": role } : {}),
					"content-type": "application/json",
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		);
	assert.equal((await request("flags")).status, 401);
	assert.equal((await request("flags/checkout/log")).status, 401);
	assert.equal(
		(await request("flags", "GET", undefined, "viewer")).status,
		403,
	);
	assert.equal(
		(await request("flags/checkout", "PATCH", { enabled: false }, "editor"))
			.status,
		403,
	);
	assert.equal(
		(
			await request(
				"flags/checkout",
				"PATCH",
				{ name: "Renamed checkout" },
				"editor",
			)
		).status,
		200,
	);
	const evaluation = await request("evaluate/checkout");
	assert.equal(evaluation.headers.get("cache-control"), "private, no-store");
	assert.equal(await evaluation.json(), true);
	const existing = await (
		await request("flags/checkout", "GET", undefined, "admin")
	).json();
	assert.equal(existing.id, "v5-flag");
	assert.deepEqual(existing.tags, ["beta"]);
	assert.equal(existing.createdAt, definition.createdAt);
	assert.equal(
		(
			await request(
				"flags",
				"POST",
				{ key: "invalid_key", name: "Invalid" },
				"admin",
			)
		).status,
		400,
	);
	assert.equal(
		(
			await request(
				"flags",
				"POST",
				{ key: "checkout", name: "Duplicate" },
				"admin",
			)
		).status,
		409,
	);
	assert.equal((await request("evaluate/checkout?context=!!")).status, 400);
	await stack.trusted.featureFlags.createFlag({
		key: "beta",
		name: "Beta",
		type: "segment",
		enabled: true,
		segments: [{ field: "tags", operator: "contains", value: "bêta" }],
	});
	const context = encodeURIComponent(
		Buffer.from(JSON.stringify({ tags: ["bêta"] })).toString("base64"),
	);
	assert.equal(
		await (await request(`evaluate/beta?context=${context}`)).json(),
		true,
	);
	assert.equal(await (await request("evaluate/beta")).json(), false);
	await stack.trusted.featureFlags.toggleFlag({
		key: "checkout",
		enabled: false,
	});
	assert.equal(await (await request("evaluate/checkout")).json(), false);
	await stack.trusted.featureFlags.archiveFlag({ key: "checkout" });
	assert.equal(await (await request("evaluate/checkout")).json(), false);
	assert.deepEqual(
		(await stack.trusted.featureFlags.listFlags({})).map((f) => f.key),
		["beta"],
	);
	assert.equal(
		(
			await stack.trusted.featureFlags.listFlags({ includeArchived: true })
		).find((f) => f.key === "checkout").id,
		"v5-flag",
	);
	assert.equal(
		(await request("flags/checkout/toggle", "POST", { enabled: true }, "admin"))
			.status,
		409,
	);
	assert.ok(
		(await (await request("flags/beta/log", "GET", undefined, "admin")).json())
			.length <= 2,
	);
	return stack;
}
const stack = await verify({ ...core, ...authorization, ...server, ...flags });
await verify({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-feature-flags/api"),
});
assert.equal(
	require("@btst/plugin-feature-flags/client").featureFlagsClientPlugin().id,
	"featureFlags",
);
globalThis.fetch = (input, init) =>
	stack.handler(
		input instanceof Request ? input : new Request(String(input), init),
	);
const queries = createFeatureFlagsQueryKeys(
	createApiClient({ baseURL: "https://site.test", basePath: "/api" }),
	{ "x-role": "admin" },
);
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
assert.equal(
	(await queryClient.fetchQuery(queries.featureFlags.list({}, "admin")))[0].key,
	"beta",
);
assert.notDeepEqual(
	queries.featureFlags.list({}, "admin").queryKey,
	queries.featureFlags.list({}, "viewer").queryKey,
);
assert.notDeepEqual(
	queries.flagValues.value("beta", { tags: ["bêta"] }).queryKey,
	queries.flagValues.value("beta", { tags: ["other"] }).queryKey,
);
queryClient.clear();
