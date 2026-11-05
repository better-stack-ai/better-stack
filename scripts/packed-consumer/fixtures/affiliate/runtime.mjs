import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import * as core from "@btst/stack/api";
import * as auth from "@btst/stack/authorization";
import * as server from "@btst/stack/authorization/server";
import * as affiliate from "@btst/plugin-affiliate/api";
import * as attribution from "@btst/plugin-affiliate/attribution";
import * as permissions from "@btst/plugin-affiliate/permissions";
import * as queries from "@btst/plugin-affiliate/query-keys";
import { affiliateClientPlugin } from "@btst/plugin-affiliate/client";
import { z } from "zod";
const require = createRequire(import.meta.url);
assert.equal(affiliateClientPlugin().id, "affiliate");
assert.equal(
	require("@btst/plugin-affiliate/client").affiliateClientPlugin().id,
	"affiliate",
);
assert.throws(() => require.resolve("@btst/plugin-ai-chat/api"), {
	code: "MODULE_NOT_FOUND",
});
async function verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	affiliateBackendPlugin,
	affiliatePermissions,
	attributionFromRequest,
	createTrackingLink,
	createAffiliateQueryKeys,
}) {
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [affiliatePermissions],
		rules: ({ affiliate: a }) => [
			a.affiliate.read.when(({ identity }) => identity?.id === "admin"),
			a.application.create.when(({ identity }) => identity !== null),
			a.portal.read.when(({ identity }) => identity !== null),
			a.portal.update.when(({ identity }) => identity !== null),
			a.conversion.create.when(({ identity }) => identity?.id === "admin"),
		],
	});
	assert.throws(
		() =>
			createBackendStack({
				plugins: { affiliate: affiliateBackendPlugin() },
				adapter: (db) => createMemoryAdapter(db)({}),
			}),
		/requires a server auth adapter/,
	);
	const stack = createBackendStack({
		basePath: "/api",
		plugins: {
			affiliate: affiliateBackendPlugin({ siteOrigin: "https://site.test" }),
		},
		adapter: (db) => createMemoryAdapter(db)({}),
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => {
				const id = request.headers.get("x-user");
				return id ? { id } : null;
			},
		}),
	});
	const request = (path, method = "GET", body, user) =>
		stack.handler(
			new Request(`https://example.test/api/affiliate/${path}`, {
				method,
				headers: {
					...(user ? { "x-user": user } : {}),
					...(body ? { "content-type": "application/json" } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		);
	assert.equal(
		(
			await request("apply", "POST", {
				name: "Jane",
				email: "jane@example.test",
			})
		).status,
		401,
	);
	const applied = await (
		await request(
			"apply",
			"POST",
			{
				name: "Jane",
				email: "jane@example.test",
				code: "packed-jane",
				userId: "victim",
				status: "approved",
			},
			"jane",
		)
	).json();
	assert.equal(applied.userId, "jane");
	assert.equal(applied.status, "pending");
	assert.equal(
		(await request("affiliates", "GET", undefined, "jane")).status,
		403,
	);
	assert.equal(
		(
			await request(
				"conversions",
				"POST",
				{ amount: 10000, attribution: { code: applied.code } },
				"jane",
			)
		).status,
		403,
	);
	assert.equal(
		(await request("apply", "POST", { name: "", email: "bad" }, "other"))
			.status,
		400,
	);
	await stack.trusted.affiliate.updateAffiliate({
		id: applied.id,
		data: { status: "approved", notes: "Private note" },
	});
	const tracking = await request(
		`track/${applied.code}?to=${encodeURIComponent("/pricing?plan=pro")}`,
	);
	assert.equal(tracking.status, 302);
	assert.equal(
		tracking.headers.get("location"),
		"https://site.test/pricing?plan=pro",
	);
	const cookie = tracking.headers.get("set-cookie");
	assert.match(cookie, /^btst_affiliate=.+; HttpOnly; SameSite=Lax; Secure$/);
	const fromCookie = attributionFromRequest(
		new Request("https://site.test/checkout", { headers: { cookie } }),
	);
	assert.ok(fromCookie.clickId);
	assert.equal(
		(
			await request(
				`track/${applied.code}?to=${encodeURIComponent("//evil.test")}`,
			)
		).status,
		400,
	);
	assert.throws(() =>
		createTrackingLink("https://example.test/api", applied.code, "//evil.test"),
	);
	const first = await stack.trusted.affiliate.createConversion({
		externalRef: "packed-order",
		amount: 10000,
		attribution: fromCookie,
	});
	const duplicate = await stack.trusted.affiliate.createConversion({
		externalRef: "packed-order",
		amount: 10000,
		attribution: fromCookie,
	});
	assert.equal(first.conversion.id, duplicate.conversion.id);
	assert.equal(first.commission.amount, 2000);
	await stack.trusted.affiliate.updateCommission({
		id: first.commission.id,
		data: { status: "approved" },
	});
	const batch = await stack.trusted.affiliate.createPayout({
		affiliateId: applied.id,
		currency: "USD",
	});
	await assert.rejects(
		stack.trusted.affiliate.createPayout({
			affiliateId: applied.id,
			currency: "USD",
		}),
	);
	await stack.trusted.affiliate.updatePayout({
		id: batch.id,
		data: { status: "failed" },
	});
	const retry = await stack.trusted.affiliate.createPayout({
		affiliateId: applied.id,
		currency: "USD",
	});
	await stack.trusted.affiliate.updatePayout({
		id: retry.id,
		data: { status: "sent", reference: "offline-transfer" },
	});
	const own = await (await request("portal", "GET", undefined, "jane")).json();
	assert.equal(own.affiliate.id, applied.id);
	assert.equal(own.affiliate.notes, undefined);
	assert.equal(own.commissions[0].status, "paid");
	assert.equal(
		(await (await request("portal", "GET", undefined, "other")).json())
			.affiliate,
		null,
	);
	await stack.adapter.create({
		model: "affiliate",
		forceAllowId: true,
		data: {
			id: "existing-v5-affiliate",
			userId: "existing",
			name: "Existing partner",
			email: "existing@example.test",
			code: "existing-partner",
			status: "approved",
			payoutDetails: '{"bank":"existing"}',
			createdAt: new Date("2025-01-01T00:00:00Z"),
			updatedAt: new Date("2025-01-02T00:00:00Z"),
		},
	});
	const existing = await (
		await request("portal", "GET", undefined, "existing")
	).json();
	assert.equal(existing.affiliate.id, "existing-v5-affiliate");
	assert.equal(existing.affiliate.createdAt, "2025-01-01T00:00:00.000Z");
	assert.equal(existing.affiliate.payoutDetails, '{"bank":"existing"}');
	assert.equal(stack.raw.affiliate, undefined);
	const keys = createAffiliateQueryKeys(async () => undefined);
	assert.deepEqual(
		keys.affiliatePortal.detail({ identity: { id: "jane" } }).queryKey,
		["affiliatePortal", "detail", { identity: { id: "jane" } }],
	);
	assert.deepEqual(keys.affiliates.list({ limit: 25 }, "jane").queryKey, [
		"affiliates",
		"list",
		{ limit: 25 },
		"jane",
	]);
}
await verify({
	...core,
	...auth,
	...server,
	...affiliate,
	...attribution,
	...permissions,
	...queries,
});
await verify({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-affiliate/api"),
	...require("@btst/plugin-affiliate/attribution"),
	...require("@btst/plugin-affiliate/permissions"),
	...require("@btst/plugin-affiliate/query-keys"),
});
console.log(
	"Packed Affiliate ESM+CJS authorization, attribution, ledger safeguards, existing data and browser-only protected data contract passed",
);
