import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import * as core from "@btst/stack/api";
import * as auth from "@btst/stack/authorization";
import * as server from "@btst/stack/authorization/server";
import * as analytics from "@btst/plugin-analytics/api";
import * as permissions from "@btst/plugin-analytics/permissions";
import {
	analyticsClientPlugin,
	createAnalyticsTracker,
} from "@btst/plugin-analytics/client";
import { createAnalyticsQueryKeys } from "@btst/plugin-analytics/query-keys";
import { createApiClient } from "@btst/stack/plugins/client";
import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

const require = createRequire(import.meta.url);
for (const name of ["ai-chat", "blog", "comments"])
	assert.throws(() => require.resolve(`@btst/plugin-${name}/api`), {
		code: "MODULE_NOT_FOUND",
	});
assert.throws(() => require.resolve("@btst/components"), {
	code: "MODULE_NOT_FOUND",
});
assert.equal(analyticsClientPlugin().id, "analytics");
assert.equal(await createAnalyticsTracker().pageView("/server"), false);

async function verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	analyticsBackendPlugin,
	analyticsPermissions,
}) {
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string(), role: z.string() }),
		permissions: [analyticsPermissions],
		rules: ({ analytics }) => [
			analytics.dashboard.read.when(
				({ identity }) => identity?.role === "admin",
			),
			analytics.dashboard.export.when(
				({ identity }) => identity?.role === "admin",
			),
			analytics.events.cleanup.when(
				({ identity }) => identity?.role === "admin",
			),
		],
	});
	const stack = createBackendStack({
		basePath: "/api",
		adapter: (db) => createMemoryAdapter(db)({}),
		plugins: {
			analytics: analyticsBackendPlugin({
				sessionSecret: "packed-analytics-secret",
			}),
		},
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) =>
				request.headers.has("x-role")
					? { id: "viewer", role: request.headers.get("x-role") }
					: null,
		}),
	});
	const request = (
		path,
		body,
		role,
		agent = "Mozilla/5.0 Chrome/131.0 Safari/537.36",
	) =>
		stack.handler(
			new Request(`https://site.test/api/analytics/${path}`, {
				method: body ? "POST" : "GET",
				headers: {
					"user-agent": agent,
					...(role ? { "x-role": role } : {}),
					...(body ? { "content-type": "application/json" } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		);
	await stack.adapter.create({
		model: "pageView",
		forceAllowId: true,
		data: {
			id: "v5-view",
			path: "/existing",
			sessionId: "v5-daily-hash",
			timestamp: new Date(),
		},
	});
	await stack.adapter.create({
		model: "customEvent",
		forceAllowId: true,
		data: {
			id: "v5-event",
			name: "existing_signup",
			path: "/existing",
			sessionId: "v5-daily-hash",
			timestamp: new Date(),
		},
	});
	for (const path of [
		"dashboard",
		"pages",
		"referrers",
		"events",
		"realtime",
		"export",
	])
		assert.equal((await request(path)).status, 401);
	assert.equal((await request("dashboard", undefined, "member")).status, 403);
	assert.equal((await request("retention", {}, "member")).status, 403);
	assert.equal(
		(
			await request("pageviews", {
				path: "https://private.test",
				sessionId: "browser-session-123456",
			})
		).status,
		400,
	);
	assert.deepEqual(
		await (
			await request(
				"pageviews",
				{ path: "/bot", sessionId: "browser-session-123456" },
				undefined,
				"Googlebot",
			)
		).json(),
		{ accepted: false },
	);
	assert.deepEqual(
		await (
			await request("pageviews", {
				path: "/pricing?token=secret#fragment",
				referrer: "https://search.test/find?email=private",
				sessionId: "browser-session-123456",
			})
		).json(),
		{ accepted: true },
	);
	assert.equal(
		(
			await request("events", {
				name: "signup",
				path: "/pricing",
				sessionId: "browser-session-123456",
				properties: { plan: "pro" },
			})
		).status,
		200,
	);
	const stats = await (await request("dashboard", undefined, "admin")).json();
	assert.equal(stats.pageViews, 2);
	assert.equal(stats.uniqueVisitors, 2);
	assert.ok(stats.topEvents.some((event) => event.name === "existing_signup"));
	assert.ok(stats.topPages.some((page) => page.path === "/existing"));
	assert.ok(stats.topPages.some((page) => page.path === "/pricing"));
	assert.ok(
		stats.topReferrers.some(
			(row) =>
				row.referrer === "search.test" && row.views === 1 && row.visitors === 1,
		),
	);
	const csv = await (await request("export", undefined, "admin")).text();
	assert.match(csv, /existing_signup/);
	assert.match(csv, /v5-daily-hash/);
	assert.doesNotMatch(csv, /browser-session|token=|fragment|email=|Mozilla/);
	assert.match(csv, /[a-f0-9]{64}/);
	assert.equal(
		(await stack.trusted.analytics.getDashboardStats({})).pageViews,
		2,
	);
	const oldRow = await stack.adapter.findOne({
		model: "pageView",
		where: [{ field: "id", value: "v5-view" }],
	});
	assert.equal(oldRow.id, "v5-view");
	assert.equal(oldRow.path, "/existing");
	return stack;
}
const stack = await verify({
	...core,
	...auth,
	...server,
	...analytics,
	...permissions,
});
await verify({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-analytics/api"),
	...require("@btst/plugin-analytics/permissions"),
});
assert.equal(
	require("@btst/plugin-analytics/client").analyticsClientPlugin().id,
	"analytics",
);
globalThis.fetch = (input, init) =>
	stack.handler(
		input instanceof Request ? input : new Request(String(input), init),
	);
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const queries = createAnalyticsQueryKeys(
	createApiClient({ baseURL: "https://site.test", basePath: "/api" }),
	{ "x-role": "admin" },
);
const stats = await queryClient.fetchQuery(
	queries.analyticsDashboard.stats({}, "admin"),
);
assert.equal(stats.pageViews, 2);
assert.notDeepEqual(
	queries.analyticsDashboard.stats({}, "admin").queryKey,
	queries.analyticsDashboard.stats({}, "member").queryKey,
);
queryClient.clear();
