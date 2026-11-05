import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { build } from "vite";
import { createMemoryAdapter } from "@btst/adapter-memory";
import * as core from "@btst/stack/api";
import * as authorization from "@btst/stack/authorization";
import * as serverAuth from "@btst/stack/authorization/server";
import * as client from "@btst/stack/client";
import * as pluginClient from "@btst/stack/plugins/client";
import * as newsletter from "@btst/plugin-newsletter/api";
import * as newsletterClient from "@btst/plugin-newsletter/client";
import * as permissions from "@btst/plugin-newsletter/permissions";
import * as queries from "@btst/plugin-newsletter/query-keys";
import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

const require = createRequire(import.meta.url);
for (const name of [
	"@btst/plugin-blog/api",
	"@btst/plugin-ai-chat/api",
	"@btst/components/markdown",
]) {
	assert.throws(() => require.resolve(name), /Cannot find module/);
}
async function verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	newsletterBackendPlugin,
	newsletterClientPlugin,
	newsletterPermissions,
	createNewsletterQueryKeys,
	createApiClient,
	createClientStack,
}) {
	const operator = ({ identity }) => identity?.id === "editor";
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [newsletterPermissions],
		rules: ({ newsletter }) => [
			newsletter.subscriber.read.when(operator),
			newsletter.subscriber.create.when(operator),
			newsletter.campaign.read.when(operator),
			newsletter.campaign.create.when(operator),
			newsletter.campaign.update.when(operator),
			newsletter.campaign.send.when(operator),
			newsletter.analytics.read.when(operator),
		],
	});
	const emails = [];
	const stack = createBackendStack({
		basePath: "/api",
		adapter: (db) => createMemoryAdapter(db)({}),
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => {
				const id = request.headers.get("x-user");
				return id ? { id } : null;
			},
		}),
		plugins: {
			newsletter: newsletterBackendPlugin({
				emailAdapter: {
					async send(email) {
						emails.push(email);
						return { messageId: `stub-${emails.length}` };
					},
				},
				unsubscribeBaseURL: "https://example.test/api/newsletter",
			}),
		},
	});
	const request = (id) =>
		new Request("https://example.test/api", { headers: { "x-user": id } });
	const operations = stack.forRequest(request("editor")).operations.newsletter;
	await stack.adapter.create({
		model: "newsletterCampaign",
		forceAllowId: true,
		data: {
			id: "existing-v5-campaign",
			subject: "Existing edition",
			fromName: "Editor",
			fromEmail: "editor@example.test",
			body: "# Existing content",
			format: "markdown",
			tags: '["readers"]',
			status: "draft",
			createdAt: new Date("2026-01-01T00:00:00Z"),
			updatedAt: new Date("2026-01-01T00:00:00Z"),
		},
	});

	const legacyToken = "a".repeat(64);
	await stack.adapter.create({
		model: "newsletterSubscriber",
		forceAllowId: true,
		data: {
			id: "existing-v5-subscriber",
			email: "archive@example.test",
			status: "subscribed",
			tags: '["archive"]',
			confirmedAt: new Date("2026-01-01T00:00:00Z"),
			createdAt: new Date("2026-01-01T00:00:00Z"),
		},
	});
	await stack.adapter.create({
		model: "newsletterSend",
		forceAllowId: true,
		data: {
			id: "existing-v5-send",
			key: "historical-edition:existing-v5-subscriber",
			campaignId: "historical-edition",
			subscriberId: "existing-v5-subscriber",
			email: "archive@example.test",
			status: "sent",
			links: "[]",
			trackingToken: createHash("sha256").update("b".repeat(64)).digest("hex"),
			unsubscribeToken: createHash("sha256").update(legacyToken).digest("hex"),
			sentAt: new Date("2026-01-01T00:00:00Z"),
		},
	});
	assert.equal(
		(await operations.getSubscriber({ id: "existing-v5-subscriber" }))
			.confirmedAt,
		"2026-01-01T00:00:00.000Z",
	);
	assert.equal(
		(
			await stack.handler(
				new Request(
					`https://example.test/api/newsletter/unsubscribe?token=${legacyToken}`,
				),
			)
		).status,
		200,
	);
	assert.equal(
		(await operations.getSubscriber({ id: "existing-v5-subscriber" })).status,
		"unsubscribed",
	);

	const existing = await operations.getCampaign({ id: "existing-v5-campaign" });
	assert.equal(existing.id, "existing-v5-campaign");
	assert.deepEqual(existing.tags, ["readers"]);
	assert.equal(existing.createdAt, "2026-01-01T00:00:00.000Z");
	await operations.updateCampaign({
		id: existing.id,
		data: { subject: "Migrated edition" },
	});
	await operations.createSubscriber({
		email: "reader@example.test",
		tags: ["readers"],
	});
	await operations.createSubscriber({
		email: "other@example.test",
		tags: ["other"],
	});
	await operations.createSubscriber({
		email: "optout@example.test",
		tags: ["readers"],
		status: "unsubscribed",
	});
	await assert.rejects(
		operations.createSubscriber({ email: "invalid" }),
		/email/,
	);
	await assert.rejects(
		stack
			.forRequest(request("denied"))
			.operations.newsletter.getCampaign({ id: existing.id }),
		{ statusCode: 403 },
	);
	assert.equal(
		(
			await stack.handler(
				new Request("https://example.test/api/newsletter/campaigns"),
			)
		).status,
		401,
	);
	assert.equal(Object.hasOwn(stack.raw, "newsletter"), false);
	const previousFetch = globalThis.fetch;
	globalThis.fetch = (input, init) => stack.handler(new Request(input, init));
	try {
		const queryClient = new QueryClient();
		const api = createApiClient({
			baseURL: "https://example.test",
			basePath: "/api",
		});
		const keys = createNewsletterQueryKeys(api, { "x-user": "editor" });
		const key = keys.newsletterCampaigns.detail(existing.id, { id: "editor" });
		assert.notDeepEqual(
			key.queryKey,
			keys.newsletterCampaigns.detail(existing.id, { id: "other" }).queryKey,
		);
		await queryClient.prefetchQuery(key);
		assert.equal(
			queryClient.getQueryData(key.queryKey).subject,
			"Migrated edition",
		);
		queryClient.clear();
		const resolved = createClientStack({
			api: {
				baseURL: "https://example.test",
				basePath: "/api",
				headers: { "x-user": "editor" },
			},
			site: { baseURL: "https://example.test", basePath: "/pages" },
			queryClient,
			plugins: {
				newsletter: newsletterClientPlugin({
					identityPartition: { id: "editor" },
				}),
			},
		});
		assert.equal(resolved.context.plugins.newsletter.id, "newsletter");
		const route = resolved.router.getRoute(
			`/newsletter/campaigns/${existing.id}`,
		);
		assert.ok(route?.loader);
		await route.loader();
		assert.equal(
			queryClient.getQueryData(key.queryKey).subject,
			"Migrated edition",
		);
		assert.equal(
			queryClient.getQueryData(key.queryKey).createdAt,
			"2026-01-01T00:00:00.000Z",
		);
		queryClient.clear();
	} finally {
		globalThis.fetch = previousFetch;
	}
	await operations.sendCampaign({ id: existing.id });
	assert.equal(emails.length, 1);
	assert.equal(emails[0].to, "reader@example.test");
	assert.match(emails[0].html, /<h1>Existing content<\/h1>/);
	const token = emails[0].html.match(/unsubscribe\?token=([a-f0-9]{64})/)[1];
	const unsub = await stack.handler(
		new Request(
			`https://example.test/api/newsletter/unsubscribe?token=${token}`,
		),
	);
	assert.equal(unsub.status, 200);
	assert.equal(
		(await operations.listSubscribers({ query: "reader@" })).items[0].status,
		"unsubscribed",
	);
	assert.equal(
		JSON.stringify(await operations.listSubscribers({})).includes("Token"),
		false,
	);
	await assert.rejects(operations.sendCampaign({ id: existing.id }), {
		statusCode: 409,
	});
	assert.equal(
		(await operations.getCampaignStats({ id: existing.id })).delivered,
		1,
	);
}
await verify({
	...core,
	...authorization,
	...serverAuth,
	...client,
	...pluginClient,
	...newsletter,
	...newsletterClient,
	...permissions,
	...queries,
});
await verify(
	Object.assign(
		{},
		...[
			"@btst/stack/api",
			"@btst/stack/authorization",
			"@btst/stack/authorization/server",
			"@btst/stack/client",
			"@btst/stack/plugins/client",
			"@btst/plugin-newsletter/api",
			"@btst/plugin-newsletter/client",
			"@btst/plugin-newsletter/permissions",
			"@btst/plugin-newsletter/query-keys",
		].map((name) => require(name)),
	),
);
// Exercise real BTST CommonJS modules while allowing upstream Milkdown's import-only subpaths.
const alias = [];
for (const name of ["@btst/stack", "@btst/plugin-newsletter"]) {
	const manifest = JSON.parse(
		await readFile(`node_modules/${name}/package.json`, "utf8"),
	);
	for (const [entry, target] of Object.entries(manifest.exports)) {
		if (!target.require) continue;
		const id = name + entry.slice(1);
		const replacement = require.resolve(id);
		assert.match(replacement, /\.cjs$/);
		alias.push({
			find: new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
			replacement,
		});
	}
}
await build({
	resolve: { conditions: ["module", "browser", "production", "import"], alias },
	build: { emptyOutDir: false, rollupOptions: { input: "commonjs.html" } },
});
console.log(
	"Packed Newsletter ESM/CJS: independent installation, operations/auth/validation, existing data, targeted delivery, unsubscribe, query prefetch and CJS editor bundle passed",
);
