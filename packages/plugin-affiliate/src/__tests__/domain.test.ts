import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { defineDb, type DBAdapter } from "@btst/db";
import { affiliateSchema } from "../db";
import {
	attributionFromRequest,
	createReferralLink,
	createTrackingLink,
	getReferralRedirect,
	isClickWithinWindow,
	safeLandingPath,
	selectAttributionClick,
} from "../attribution";
import { calculateCommission } from "../commission";
import {
	createAffiliate,
	createConversion,
	createPayout,
	deleteAffiliate,
	trackClick,
	updateAffiliate,
	updateCommission,
	updatePayout,
} from "../api/mutations";
import {
	exportPayouts,
	getCommission,
	getAffiliateStats,
	getPortal,
	listCommissions,
	listPayouts,
} from "../api/getters";
import type { Affiliate, ReferralClick } from "../types";

describe("affiliate ledger", () => {
	let adapter: DBAdapter;
	let affiliate: Affiliate;
	beforeEach(async () => {
		adapter = createMemoryAdapter(defineDb({}).use(affiliateSchema))({});
		affiliate = await createAffiliate(adapter, {
			userId: "partner",
			name: "Jane",
			email: "jane@example.com",
			code: "partner-jane",
		});
	});
	const approve = async () => {
		affiliate = await updateAffiliate(adapter, affiliate.id, {
			status: "approved",
		});
	};
	const convert = (externalRef = "order-1", currency = "USD") =>
		createConversion(adapter, {
			externalRef,
			amount: 12900,
			currency,
			attribution: { code: affiliate.code },
		});

	it("requires approval for attribution and keeps profile identifiers unique", async () => {
		await expect(trackClick(adapter, { code: affiliate.code })).rejects.toThrow(
			"Approved affiliate",
		);
		expect(await convert()).toBeNull();
		await expect(
			createAffiliate(adapter, {
				userId: "other",
				name: "Other",
				email: "other@example.com",
				code: affiliate.code,
			}),
		).rejects.toThrow("already in use");
		await approve();
		expect(
			await trackClick(adapter, {
				code: affiliate.code,
				landingPath: "/pricing",
				ipHash: "host-provided-hash",
				userAgent: "Affiliate test browser",
			}),
		).toMatchObject({
			landingPath: "/pricing",
			ipHash: "host-provided-hash",
			userAgent: "Affiliate test browser",
		});
		await updateAffiliate(adapter, affiliate.id, { status: "suspended" });
		expect(await convert()).toBeNull();
		await expect(
			updateAffiliate(adapter, affiliate.id, { status: "pending" }),
		).rejects.toThrow("transition");
	});
	it("creates one commission for concurrent duplicate conversions", async () => {
		await approve();
		const results = await Promise.all([convert(), convert(), convert()]);
		expect(new Set(results.map((item) => item?.conversion.id)).size).toBe(1);
		expect(results[0]?.commission.amount).toBe(2580);
		expect((await listCommissions(adapter)).total).toBe(1);
		await expect(
			createConversion(adapter, {
				externalRef: "order-1",
				amount: 10,
				attribution: { code: affiliate.code },
			}),
		).rejects.toThrow("different values");
		await expect(deleteAffiliate(adapter, affiliate.id)).rejects.toThrow(
			"financial history",
		);
	});
	it("uses authoritative click dates and affiliate override rules", async () => {
		await approve();
		await updateAffiliate(adapter, affiliate.id, {
			commissionType: "flat",
			commissionValue: 1000,
		});
		const click = await trackClick(adapter, { code: affiliate.code });
		expect(
			(
				await createConversion(adapter, {
					amount: 12900,
					attribution: { clickId: click.id },
				})
			)?.commission.amount,
		).toBe(1000);
		await adapter.update({
			model: "referralClick",
			where: [{ field: "id", value: click.id, operator: "eq" }],
			update: { createdAt: new Date(Date.now() - 31 * 86400000) },
		});
		expect(
			await createConversion(adapter, {
				amount: 12900,
				attribution: { clickId: click.id },
			}),
		).toBeNull();
		expect(
			await createConversion(adapter, {
				amount: 12900,
				attribution: { clickId: "forged" },
			}),
		).toBeNull();
		await expect(
			updateAffiliate(adapter, affiliate.id, { commissionValue: 1.5 }),
		).rejects.toThrow("integer minor units");
	});
	it("reserves commissions, prevents duplicate payouts, releases failures and settles once", async () => {
		await approve();
		const conversion = await convert();
		if (!conversion) throw new Error("Missing conversion");
		await updateCommission(adapter, conversion.commission.id, {
			status: "approved",
		});
		const attempts = await Promise.allSettled([
			createPayout(adapter, { affiliateId: affiliate.id, currency: "USD" }),
			createPayout(adapter, { affiliateId: affiliate.id, currency: "USD" }),
		]);
		expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(
			1,
		);
		const payout = (await listPayouts(adapter)).items[0];
		if (!payout) throw new Error("Missing payout");
		await expect(
			updateCommission(adapter, conversion.commission.id, { status: "voided" }),
		).rejects.toThrow("reserved");
		await updatePayout(adapter, payout.id, { status: "failed" });
		const retry = await createPayout(adapter, {
			affiliateId: affiliate.id,
			currency: "USD",
		});
		await updatePayout(adapter, retry.id, {
			status: "sent",
			reference: "transfer-42",
		});
		expect(
			(await getCommission(adapter, conversion.commission.id))?.status,
		).toBe("paid");
		expect(
			(await updatePayout(adapter, retry.id, { status: "sent" })).reference,
		).toBe("transfer-42");
		await expect(
			updatePayout(adapter, retry.id, { status: "failed" }),
		).rejects.toThrow("Only pending");
	});
	it("keeps currencies separate and escapes CSV accounting references", async () => {
		await approve();
		const usd = await convert("usd");
		const eur = await convert("eur", "EUR");
		if (!usd || !eur) throw new Error("Missing conversions");
		await updateCommission(adapter, usd.commission.id, { status: "approved" });
		await updateCommission(adapter, eur.commission.id, { status: "approved" });
		await expect(
			createPayout(adapter, {
				affiliateId: affiliate.id,
				currency: "USD",
				commissionIds: [usd.commission.id, eur.commission.id],
			}),
		).rejects.toThrow("one currency");
		const payout = await createPayout(adapter, {
			affiliateId: affiliate.id,
			currency: "USD",
		});
		expect(payout.amount).toBe(2580);
		await updatePayout(adapter, payout.id, {
			status: "sent",
			reference: '=HYPERLINK("https://example.com")',
		});
		expect(await exportPayouts(adapter)).toContain(
			'"\'=HYPERLINK(""https://example.com"")"',
		);
		expect((await getAffiliateStats(adapter, affiliate.id)).totals).toEqual([
			{ currency: "EUR", pending: 0, approved: 2580, paid: 0, voided: 0 },
			{ currency: "USD", pending: 0, approved: 0, paid: 2580, voided: 0 },
		]);
	});
	it("rejects invalid overrides as client errors and prevents imprecise totals", async () => {
		await expect(
			updateAffiliate(adapter, affiliate.id, {
				commissionType: "percent",
				commissionValue: 101,
			}),
		).rejects.toMatchObject({ statusCode: 400 });
		await approve();
		for (const externalRef of ["large-1", "large-2"]) {
			await createConversion(
				adapter,
				{
					externalRef,
					amount: Number.MAX_SAFE_INTEGER,
					attribution: { code: affiliate.code },
				},
				{ defaultCommissionValue: 100 },
			);
		}
		await expect(
			getAffiliateStats(adapter, affiliate.id),
		).rejects.toMatchObject({ code: "AFFILIATE_AMOUNT_OVERFLOW" });
	});
	it("scopes the portal by user ID and excludes internal notes", async () => {
		await updateAffiliate(adapter, affiliate.id, { notes: "Admin only" });
		expect((await getPortal(adapter, "partner")).affiliate).not.toHaveProperty(
			"notes",
		);
		expect((await getPortal(adapter, "another-user")).affiliate).toBeNull();
	});
});

describe("attribution and arithmetic", () => {
	it("respects first-touch expiry and reads opaque click cookies", () => {
		const current = {
			id: "new",
			createdAt: new Date().toISOString(),
		} as ReferralClick;
		const previous = {
			id: "old",
			createdAt: new Date(Date.now() - 86400000).toISOString(),
		} as ReferralClick;
		expect(
			selectAttributionClick(previous, current, {
				attributionMode: "first_touch",
			}).id,
		).toBe("old");
		expect(selectAttributionClick(previous, current).id).toBe("new");
		expect(
			selectAttributionClick(previous, current, {
				attributionMode: "first_touch",
				attributionWindowDays: 1,
			}).id,
		).toBe("new");
		expect(
			isClickWithinWindow({
				createdAt: new Date(Date.now() + 86400000).toISOString(),
			}),
		).toBe(false);
		expect(
			attributionFromRequest(
				new Request("https://shop.test/checkout", {
					headers: { cookie: "other=x; btst_affiliate=click-123" },
				}),
			),
		).toEqual({ clickId: "click-123" });
		expect(
			getReferralRedirect(
				"https://shop.test/pricing?plan=pro&ref=partner-jane",
				"https://shop.test/api/data",
			),
		).toBe(
			"https://shop.test/api/data/affiliate/track/partner-jane?to=%2Fpricing%3Fplan%3Dpro",
		);
	});
	it("rejects open redirects and preserves landing query parameters", () => {
		for (const path of [
			"//evil.test",
			"/\\evil.test",
			"https://evil.test",
			"/%2fexample.com",
			"/%0aLocation:evil",
			"/.//evil.test",
			"/%2e//evil.test",
			"/./%2fevil.test",
		]) {
			expect(() => safeLandingPath(path)).toThrow();
			expect(() =>
				createTrackingLink("https://shop.test/api/data", "partner-jane", path),
			).toThrow();
		}
		const canonical = "/%E6%97%A5%E6%9C%AC?campaign=%E6%98%A5";
		expect(safeLandingPath("/日本?campaign=春")).toBe(canonical);
		expect(safeLandingPath(canonical)).toBe(canonical);
		expect(
			new URL(
				createTrackingLink(
					"https://shop.test/api/data",
					"partner-jane",
					"/日本?campaign=春",
				),
			).searchParams.get("to"),
		).toBe(canonical);
		expect(
			createReferralLink(
				"https://shop.test",
				"partner-jane",
				"/pricing?plan=pro",
			),
		).toBe("https://shop.test/pricing?plan=pro&ref=partner-jane");
	});
	it("rounds percent commissions and rejects unsafe amounts", () => {
		expect(calculateCommission(101, "percent", 12.5)).toBe(13);
		expect(calculateCommission(Number.MAX_SAFE_INTEGER, "percent", 100)).toBe(
			Number.MAX_SAFE_INTEGER,
		);
		expect(() => calculateCommission(100, "percent", 100.01)).toThrow();
		expect(() => calculateCommission(100, "flat", 1.5)).toThrow();
		expect(() =>
			calculateCommission(Number.MAX_SAFE_INTEGER + 1, "percent", 20),
		).toThrow();
	});
});
