import { expect, test } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

test("affiliate application, cookie attribution, commission review, payout, and own portal", async ({
	page,
	request,
}) => {
	const suffix = Date.now().toString();
	const userId = `partner-${suffix}`;
	const code = `jane-${suffix}`;
	const name = `Jane Partner ${suffix}`;
	const base = "/api/data/affiliate";
	const headers = mockAuthHeaders();
	const anonymous = await request.get(`${base}/affiliates`);
	expect([401, 403]).toContain(anonymous.status());

	await setMockAuthCookie(page.context(), userId);
	await page.goto("/pages/affiliate/apply");
	await expect(
		page.getByRole("heading", { name: "Become an affiliate", exact: true }),
	).toBeVisible();
	await page.getByLabel("Name", { exact: true }).fill(name);
	await page
		.getByLabel("Email", { exact: true })
		.fill(`jane-${suffix}@example.com`);
	await page.getByLabel(/^Referral code/).fill(code);
	await page.getByLabel(/^Payout details/).fill("Manual bank transfer");
	await page
		.getByRole("button", { name: "Submit application", exact: true })
		.click();
	await expect(page.getByRole("status")).toContainText("Application submitted");

	const listed = await request.get(`${base}/affiliates`, { headers });
	expect(listed.ok(), await listed.text()).toBe(true);
	const affiliate = (await listed.json()).items.find(
		(item: { code: string }) => item.code === code,
	);
	expect(affiliate).toMatchObject({ userId, status: "pending" });
	const forgedConversion = await request.post(`${base}/conversions`, {
		headers: mockAuthHeaders(userId),
		data: { amount: 12900, attribution: { code } },
	});
	expect(forgedConversion.status()).toBe(403);

	await setMockAuthCookie(page.context());
	await page.goto(`/pages/affiliate/admin/affiliates/${affiliate.id}`);
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
	await page
		.getByRole("combobox", { name: "Status", exact: true })
		.selectOption("approved");
	await page
		.getByLabel("Internal notes", { exact: true })
		.fill("Admin-only review note");
	await page.getByRole("button", { name: "Save profile", exact: true }).click();
	await expect(page.getByRole("status")).toContainText(
		"Affiliate profile saved",
	);

	await setMockAuthCookie(page.context(), userId);
	await page.goto("/pages/affiliate/portal");
	await page.getByLabel(/^Landing page path/).fill("/pages/affiliate/portal");
	await page
		.getByRole("button", { name: "Generate referral link", exact: true })
		.click();
	const link = await page
		.getByLabel("Tracking link", { exact: true })
		.inputValue();
	expect(link).toContain(`/affiliate/track/${code}?to=`);
	await page.goto(link);
	await expect(page).toHaveURL(/\/pages\/affiliate\/portal$/);
	const cookie = (await page.context().cookies()).find(
		(item) => item.name === "btst_affiliate",
	);
	expect(cookie?.httpOnly).toBe(true);

	const order = {
		externalRef: `order-${suffix}`,
		amount: 12900,
		currency: "USD",
	};
	const conversionHeaders = {
		cookie: `${headers.cookie}; btst_affiliate=${cookie!.value}`,
	};
	const converted = await request.post(`${base}/conversions`, {
		headers: conversionHeaders,
		data: order,
	});
	expect(converted.ok(), await converted.text()).toBe(true);
	const result = await converted.json();
	expect(result).toMatchObject({
		conversion: { affiliateId: affiliate.id, amount: 12900 },
		commission: { amount: 2580, status: "pending" },
	});
	const replay = await request.post(`${base}/conversions`, {
		headers: conversionHeaders,
		data: order,
	});
	expect(replay.ok(), await replay.text()).toBe(true);
	expect((await replay.json()).commission.id).toBe(result.commission.id);

	await setMockAuthCookie(page.context());
	await page.goto("/pages/affiliate/admin/commissions");
	await page
		.getByRole("button", {
			name: `Approve commission ${result.commission.id}`,
			exact: true,
		})
		.click();
	await expect(page.getByRole("status")).toContainText("Commission approved");
	await page.goto("/pages/affiliate/admin/payouts");
	await page.getByLabel("Affiliate ID", { exact: true }).fill(affiliate.id);
	await page.getByLabel("Currency", { exact: true }).fill("USD");
	await page
		.getByRole("button", { name: "Create payout batch", exact: true })
		.click();
	await expect(page.getByRole("status")).toContainText("Payout batch created");
	const payouts = await request.get(`${base}/payouts`, {
		headers,
		params: { affiliateId: affiliate.id },
	});
	const payout = (await payouts.json()).items[0];
	expect(payout).toMatchObject({
		amount: 2580,
		status: "pending",
		currency: "USD",
	});
	const duplicate = await request.post(`${base}/payouts`, {
		headers,
		data: { affiliateId: affiliate.id, currency: "USD" },
	});
	expect(duplicate.status()).toBe(409);
	await page
		.getByRole("button", {
			name: `Record payout result ${payout.id}`,
			exact: true,
		})
		.click();
	await page
		.getByRole("combobox", { name: "Payment result", exact: true })
		.selectOption("sent");
	await page
		.getByLabel("Payment reference", { exact: true })
		.fill(`bank-${suffix}`);
	await page
		.getByRole("button", { name: "Save payout result", exact: true })
		.click();
	await expect(page.getByRole("status")).toContainText(
		"Payout result recorded",
	);
	const exported = await request.get(`${base}/payouts/export`, { headers });
	expect(exported.ok(), await exported.text()).toBe(true);
	expect((await exported.json()).csv).toContain(`bank-${suffix}`);

	await setMockAuthCookie(page.context(), userId);
	await page.goto("/pages/affiliate/portal");
	await expect(
		page.getByRole("heading", { name: "Affiliate portal", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("region", { name: "Commission totals", exact: true }),
	).toContainText("$25.80");
	await expect(
		page.getByRole("table", { name: /payout history/i }),
	).toContainText("Sent");
	const own = await request.get(`${base}/portal`, {
		headers: mockAuthHeaders(userId),
	});
	const ownData = await own.json();
	expect(ownData.affiliate.notes).toBeUndefined();
	expect(ownData.stats).toMatchObject({
		clicks: 1,
		conversions: 1,
		totals: [{ currency: "USD", paid: 2580 }],
	});
	const other = await request.get(
		`${base}/portal?affiliateId=${affiliate.id}`,
		{ headers: mockAuthHeaders("unrelated-affiliate") },
	);
	expect(await other.json()).toMatchObject({
		affiliate: null,
		commissions: [],
		payouts: [],
	});
});
