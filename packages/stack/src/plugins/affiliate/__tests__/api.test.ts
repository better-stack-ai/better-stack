import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter } from "@btst/db";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createBackendStack } from "../../../api";
import { defineAuthorization } from "../../../authorization";
import { createServerAuth } from "../../../authorization/server";
import {
	affiliateBackendPlugin,
	type AffiliateBackendOptions,
} from "../api/plugin";
import { affiliatePermissions } from "../permissions";
import { getReferralClick } from "../api/getters";

const authorization = defineAuthorization({
	identity: z.object({ id: z.string(), role: z.enum(["admin", "member"]) }),
	permissions: [affiliatePermissions],
	rules: ({ affiliate }) => [
		affiliate.affiliate.read.when(({ identity }) => identity?.role === "admin"),
		affiliate.affiliate.create.when(
			({ identity }) => identity?.role === "admin",
		),
		affiliate.affiliate.update.when(
			({ identity }) => identity?.role === "admin",
		),
		affiliate.affiliate.delete.when(
			({ identity }) => identity?.role === "admin",
		),
		affiliate.application.create.when(({ identity }) => identity !== null),
		affiliate.portal.read.when(({ identity }) => identity !== null),
		affiliate.portal.update.when(({ identity }) => identity !== null),
		affiliate.conversion.create.when(
			({ identity }) => identity?.role === "admin",
		),
		affiliate.commission.read.when(
			({ identity }) => identity?.role === "admin",
		),
		affiliate.commission.update.when(
			({ identity }) => identity?.role === "admin",
		),
		affiliate.payout.read.when(({ identity }) => identity?.role === "admin"),
		affiliate.payout.create.when(({ identity }) => identity?.role === "admin"),
		affiliate.payout.update.when(({ identity }) => identity?.role === "admin"),
		affiliate.payout.export.when(({ identity }) => identity?.role === "admin"),
	],
});

function setup(options: AffiliateBackendOptions = {}) {
	let adapter!: DBAdapter;
	const stack = createBackendStack({
		basePath: "/api",
		plugins: { affiliate: affiliateBackendPlugin(options) },
		adapter: (db) => {
			adapter = createMemoryAdapter(db)({});
			return adapter;
		},
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => {
				const id = request?.headers.get("x-user-id");
				return id
					? {
							id,
							role:
								request?.headers.get("x-role") === "admin"
									? ("admin" as const)
									: ("member" as const),
						}
					: null;
			},
		}),
	});
	return { stack, operations: stack.trusted.affiliate, adapter: () => adapter };
}

function request(
	path: string,
	options: {
		id?: string;
		admin?: boolean;
		method?: string;
		body?: unknown;
		cookie?: string;
	} = {},
) {
	const headers = new Headers();
	if (options.id) headers.set("x-user-id", options.id);
	if (options.admin) headers.set("x-role", "admin");
	if (options.cookie) headers.set("cookie", options.cookie);
	if (options.body) headers.set("content-type", "application/json");
	return new Request(`https://example.test/api/affiliate/${path}`, {
		method: options.method ?? "GET",
		headers,
		...(options.body ? { body: JSON.stringify(options.body) } : {}),
	});
}

async function approved(
	operations: ReturnType<typeof setup>["operations"],
	code = "partner-jane",
	userId = "jane",
) {
	const affiliate = await operations.createAffiliate({
		userId,
		name: userId,
		email: `${userId}@example.test`,
		code,
	});
	return operations.updateAffiliate({
		id: affiliate.id,
		data: { status: "approved" },
	});
}

describe("affiliate API authorization and browser attribution", () => {
	it("rejects unsafe marketing URLs and invalid commission rules at configuration time", () => {
		expect(() =>
			affiliateBackendPlugin({
				marketingAssets: [{ name: "Unsafe", url: "javascript:alert(1)" }],
			}),
		).toThrow();
		expect(() =>
			affiliateBackendPlugin({
				marketingAssets: [
					{
						name: "Unsafe banner",
						url: "https://example.test",
						bannerUrl: "data:text/html,unsafe",
					},
				],
			}),
		).toThrow();
		expect(() =>
			affiliateBackendPlugin({ defaultCommissionValue: 1.234 }),
		).toThrow();
		expect(() =>
			affiliateBackendPlugin({
				defaultCommissionType: "flat",
				defaultCommissionValue: 1.5,
			}),
		).toThrow();
	});

	it("binds applications to request identity and keeps portal data isolated", async () => {
		const { stack, operations } = setup();
		expect(
			(
				await stack.handler(
					request("apply", {
						method: "POST",
						body: { name: "Jane", email: "jane@example.test" },
					}),
				)
			).status,
		).toBe(401);
		const response = await stack.handler(
			request("apply", {
				id: "jane",
				method: "POST",
				body: {
					name: "Jane",
					email: "jane@example.test",
					userId: "victim",
					status: "approved",
					notes: "injected",
				},
			}),
		);
		expect(response.status).toBe(200);
		const affiliate = await response.json();
		expect(affiliate).toMatchObject({ userId: "jane", status: "pending" });
		const list = await stack.handler(
			request("affiliates?currency=USD&affiliateId=unknown", {
				id: "admin",
				admin: true,
			}),
		);
		expect(list.status).toBe(200);
		expect((await list.json()).items).toHaveLength(1);
		await operations.updateAffiliate({
			id: affiliate.id,
			data: { notes: "Private admin note", status: "approved" },
		});
		await operations.createConversion({
			externalRef: "order-jane",
			amount: 10000,
			attribution: { code: affiliate.code },
		});
		const ownPortal = await (
			await stack.handler(request("portal?affiliateId=victim", { id: "jane" }))
		).json();
		expect(ownPortal.affiliate.id).toBe(affiliate.id);
		expect(ownPortal.affiliate.notes).toBeUndefined();
		expect(ownPortal.commissions).toHaveLength(1);
		const otherPortal = await (
			await stack.handler(
				request(`portal?affiliateId=${affiliate.id}`, { id: "other" }),
			)
		).json();
		expect(otherPortal).toMatchObject({
			affiliate: null,
			commissions: [],
			payouts: [],
		});
		const updated = await (
			await stack.handler(
				request("portal", {
					id: "jane",
					method: "PUT",
					body: {
						name: "Jane updated",
						status: "suspended",
						commissionValue: 100,
						notes: "changed",
					},
				}),
			)
		).json();
		expect(updated).toMatchObject({ name: "Jane updated", status: "approved" });
		expect(updated.notes).toBeUndefined();
		expect(
			(await operations.getAffiliate({ id: affiliate.id })).affiliate.notes,
		).toBe("Private admin note");
	});

	it("denies member management and conversion writes before lifecycle hooks", async () => {
		const beforeApprove = vi.fn();
		const afterConversion = vi.fn();
		const beforePayout = vi.fn();
		const { stack, operations } = setup({
			hooks: {
				onBeforeApproveAffiliate: beforeApprove,
				onAfterConversion: afterConversion,
				onBeforePayout: beforePayout,
			},
		});
		const affiliate = await operations.createAffiliate({
			userId: "jane",
			name: "Jane",
			email: "jane@example.test",
			code: "partner-jane",
		});
		for (const [path, method, body] of [
			["affiliates", "GET", undefined],
			[`affiliates/${affiliate.id}`, "PUT", { status: "approved" }],
			[
				"conversions",
				"POST",
				{ amount: 10000, attribution: { code: affiliate.code } },
			],
			["payouts", "POST", { affiliateId: affiliate.id, currency: "USD" }],
			["payouts/export", "GET", undefined],
		] as const) {
			expect(
				(await stack.handler(request(path, { id: "jane", method, body })))
					.status,
			).toBe(403);
		}
		expect(beforeApprove).not.toHaveBeenCalled();
		expect(afterConversion).not.toHaveBeenCalled();
		expect(beforePayout).not.toHaveBeenCalled();
		expect((await operations.listCommissions({})).total).toBe(0);
	});

	it("records anonymous links with a secure opaque cookie and rejects unsafe redirects", async () => {
		const { stack, operations, adapter } = setup();
		const affiliate = await approved(operations);
		const trackingRequest = request(
			`track/${affiliate.code}?to=${encodeURIComponent("/pricing?plan=pro")}`,
		);
		trackingRequest.headers.set("user-agent", "x".repeat(2050));
		trackingRequest.headers.set("x-forwarded-for", "192.0.2.1");
		const response = await stack.handler(trackingRequest);
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe("/pricing?plan=pro");
		expect(response.headers.get("cache-control")).toContain("no-store");
		expect(response.headers.get("set-cookie")).toMatch(
			/^btst_affiliate=[a-zA-Z0-9_-]+; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax; Secure$/,
		);
		const clickId = response.headers
			.get("set-cookie")!
			.split(";")[0]!
			.slice("btst_affiliate=".length);
		const click = await getReferralClick(adapter(), clickId);
		expect(click?.userAgent).toBe("x".repeat(2048));
		expect(click?.ipHash).toBeFalsy();
		for (const path of [
			"https://evil.test",
			"//evil.test",
			"/\\evil.test",
			"/%2fevil.test",
		]) {
			expect(
				(
					await stack.handler(
						request(`track/${affiliate.code}?to=${encodeURIComponent(path)}`),
					)
				).status,
			).toBe(400);
		}
		expect(
			(await operations.getAffiliate({ id: affiliate.id })).stats.clicks,
		).toBe(1);
	});

	it("preserves first-touch cookies without extending their attribution window", async () => {
		const { stack, operations } = setup({
			attributionMode: "first_touch",
			attributionWindowDays: 7,
		});
		const jane = await approved(operations);
		const sam = await approved(operations, "partner-sam", "sam");
		const first = await stack.handler(request(`track/${jane.code}`));
		const cookie = first.headers.get("set-cookie")!.split(";")[0]!;
		const second = await stack.handler(
			request(`track/${sam.code}`, { cookie }),
		);
		expect(second.headers.get("set-cookie")?.split(";")[0]).toBe(cookie);
		const converted = await stack.handler(
			request(`conversions?ref=${sam.code}`, {
				id: "checkout",
				admin: true,
				method: "POST",
				cookie,
				body: { amount: 10000, externalRef: "first-touch-query" },
			}),
		);
		expect(converted.status).toBe(200);
		expect(await converted.json()).toMatchObject({
			conversion: { affiliateId: jane.id },
		});
		const fake = await stack.handler(
			request(`track/${sam.code}`, {
				cookie: "btst_affiliate=nonexistent-click",
			}),
		);
		expect(fake.status).toBe(302);
		expect(fake.headers.get("set-cookie")?.split(";")[0]).not.toBe(
			"btst_affiliate=nonexistent-click",
		);
		await operations.updateAffiliate({
			id: jane.id,
			data: { status: "suspended" },
		});
		const afterSuspension = await stack.handler(
			request(`track/${sam.code}`, { cookie }),
		);
		expect(afterSuspension.headers.get("set-cookie")?.split(";")[0]).not.toBe(
			cookie,
		);
	});

	it("attributes authorized conversion requests from cookies and query parameters", async () => {
		const { stack, operations } = setup();
		const jane = await approved(operations);
		const tracked = await stack.handler(request(`track/${jane.code}`));
		const cookie = tracked.headers.get("set-cookie")!.split(";")[0]!;
		const converted = await stack.handler(
			request("conversions", {
				id: "checkout",
				admin: true,
				method: "POST",
				cookie,
				body: { amount: 12900, externalRef: "cookie-order" },
			}),
		);
		expect(converted.status).toBe(200);
		expect(await converted.json()).toMatchObject({
			conversion: { affiliateId: jane.id, clickId: cookie.split("=")[1] },
			commission: { amount: 2580 },
		});
		const queryConverted = await stack.handler(
			request(`conversions?affiliate=${jane.code}`, {
				id: "checkout",
				admin: true,
				method: "POST",
				body: { amount: 5000, externalRef: "query-order" },
			}),
		);
		expect(queryConverted.status).toBe(200);
		expect(await queryConverted.json()).toMatchObject({
			conversion: { affiliateId: jane.id },
			commission: { amount: 1000 },
		});
		expect(await operations.createConversion({ amount: 1234 })).toBeNull();
		const unattributed = await stack.handler(
			request("conversions", {
				id: "checkout",
				admin: true,
				method: "POST",
				body: { amount: 1234 },
			}),
		);
		expect(unattributed.status).toBe(200);
		expect(await unattributed.json()).toBeNull();
		const invalid = await stack.handler(
			request("conversions?ref=INVALID!", {
				id: "checkout",
				admin: true,
				method: "POST",
				body: { amount: 1234 },
			}),
		);
		expect(invalid.status).toBe(400);
	});

	it("runs lifecycle hooks for the authorized approval, conversion, and manual payout flow", async () => {
		const beforeApprove = vi.fn();
		const afterConversion = vi.fn();
		const beforePayout = vi.fn();
		const afterPayout = vi.fn();
		const { stack, operations } = setup({
			hooks: {
				onBeforeApproveAffiliate: beforeApprove,
				onAfterConversion: afterConversion,
				onBeforePayout: beforePayout,
				onAfterPayout: afterPayout,
			},
		});
		const affiliate = await approved(operations);
		expect(beforeApprove).toHaveBeenCalledTimes(1);
		const conversion = await operations.createConversion({
			externalRef: "order-1",
			amount: 10000,
			attribution: { code: affiliate.code },
		});
		expect(afterConversion).toHaveBeenCalledTimes(1);
		await operations.updateCommission({
			id: conversion!.commission.id,
			data: { status: "approved" },
		});
		const payout = await operations.createPayout({
			affiliateId: affiliate.id,
			currency: "USD",
		});
		expect(beforePayout).toHaveBeenCalledTimes(1);
		expect(afterPayout).not.toHaveBeenCalled();
		await operations.updatePayout({
			id: payout.id,
			data: { status: "sent", reference: "bank-transfer-1" },
		});
		expect(afterPayout).toHaveBeenCalledTimes(1);
		const exported = await stack.handler(
			request("payouts/export", { id: "admin", admin: true }),
		);
		expect(exported.status).toBe(200);
		expect((await exported.json()).csv).toContain("bank-transfer-1");
	});
});
