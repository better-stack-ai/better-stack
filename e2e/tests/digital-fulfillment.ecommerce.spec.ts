import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { payDemoOrder } from "./helpers/ecommerce";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

test("verified digital delivery protects guest downloads, claiming, and revoked purchases", async ({
	page,
	request,
	baseURL,
}) => {
	const synced = await request.get("/api/data/content-types", {
		headers: mockAuthHeaders(),
	});
	expect(synced.ok(), await synced.text()).toBe(true);
	const created = await request.post("/api/data/shop/products", {
		headers: mockAuthHeaders(),
		data: {
			slug: `digital-field-guide-${Date.now()}`,
			data: {
				name: "Digital field guide",
				description: "A private guide delivered after verified payment.",
				price: 1200,
				currency: "USD",
				stock: 10,
				status: "published",
			},
		},
	});
	expect(created.ok(), await created.text()).toBe(true);
	const product = await created.json();
	const checkout = await request.post("/api/data/shop/checkout", {
		data: {
			items: [{ productId: product.id, quantity: 2 }],
			email: "guest-digital@example.com",
			shippingAddress: {
				name: "Digital Buyer",
				line1: "123 Market Street",
				city: "Portland",
				postalCode: "97201",
				country: "US",
			},
			idempotencyKey: randomUUID(),
		},
	});
	expect(checkout.ok(), await checkout.text()).toBe(true);
	const { orderId, accessToken } = await checkout.json();
	const orderPath = `/api/data/shop/orders/${orderId}`;
	const confirmationPath = `${orderPath}/confirmation`;
	await page.addInitScript(
		({ key, value }) => sessionStorage.setItem(key, value),
		{
			key: `btst:ecommerce:order:${JSON.stringify({ baseURL, basePath: "/api/data" })}:${orderId}`,
			value: accessToken,
		},
	);
	await page.goto(`/pages/shop/orders/${orderId}/confirmation`);
	await expect(
		page.getByRole("heading", { name: "Waiting for payment confirmation" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Download", exact: true }),
	).toHaveCount(0);
	await page.screenshot({
		path: test.info().outputPath("before-verified-payment.png"),
	});
	await Promise.all([
		payDemoOrder(request, { orderId, amount: 2400, currency: "USD" }),
		payDemoOrder(request, { orderId, amount: 2400, currency: "USD" }),
	]);
	await expect(
		page.getByRole("heading", { name: "Payment confirmed", exact: true }),
	).toBeVisible();
	const paid = await request.get(confirmationPath, {
		params: { token: accessToken },
	});
	const paidOrder = await paid.json();
	expect(paidOrder.deliveryGrants).toHaveLength(1);
	expect(paidOrder.deliveryGrants[0]).toMatchObject({
		status: "active",
		quantity: 2,
	});
	const grantId = paidOrder.deliveryGrants[0].id;
	const downloadPath = `${orderPath}/deliveries/${grantId}/download`;
	for (const token of [undefined, accessToken, "wrong-guest-capability"]) {
		const denied = await request.post(downloadPath, { data: { token } });
		expect([400, 401, 403, 404]).toContain(denied.status());
	}
	const issued = await request.post(`${orderPath}/deliveries/guest-token`, {
		headers: mockAuthHeaders(),
		data: { expiresInSeconds: 3600 },
	});
	expect(issued.ok(), await issued.text()).toBe(true);
	const capability = await issued.json();
	await page
		.getByLabel("Guest delivery capability", { exact: true })
		.fill(capability.token);
	const downloaded = page.waitForEvent("download");
	await page.getByRole("button", { name: "Download", exact: true }).click();
	expect((await downloaded).suggestedFilename()).toBe("field-guide.txt");
	const bytes = await request.post(downloadPath, {
		data: { token: capability.token },
	});
	expect(bytes.ok(), await bytes.text()).toBe(true);
	expect(await bytes.text()).toContain("BTST Field Guide");
	expect(bytes.headers()["cache-control"]).toContain("no-store");
	await page.screenshot({
		path: test.info().outputPath("after-verified-delivery.png"),
	});
	await setMockAuthCookie(page.context(), "user-1");
	await page.reload();
	await page
		.getByLabel("Guest delivery capability", { exact: true })
		.fill(capability.token);
	await page
		.getByRole("button", { name: "Claim delivery to my account", exact: true })
		.click();
	await expect(
		page.getByLabel("Guest delivery capability", { exact: true }),
	).toHaveCount(0);
	const crossCustomer = await request.post(downloadPath, {
		headers: mockAuthHeaders("user-2"),
		data: {},
	});
	expect([401, 403, 404]).toContain(crossCustomer.status());
	const owner = await request.post(downloadPath, {
		headers: mockAuthHeaders("user-1"),
		data: {},
	});
	expect(owner.ok(), await owner.text()).toBe(true);
	const refundBody = JSON.stringify({
		orderId,
		status: "refunded",
		paymentRef: `demo-${orderId}`,
		amount: 2400,
		currency: "USD",
	});
	for (let attempt = 0; attempt < 2; attempt++) {
		const refunded = await request.post("/api/data/shop/webhook", {
			data: refundBody,
			headers: {
				"content-type": "application/json",
				"x-demo-signature": createHmac("sha256", "btst-ecommerce-e2e-only")
					.update(refundBody)
					.digest("hex"),
			},
		});
		expect(refunded.ok(), await refunded.text()).toBe(true);
	}
	await page.reload();
	await expect(
		page.getByRole("heading", { name: "Order cancelled" }),
	).toBeVisible();
	await expect(
		page.getByRole("region", { name: "Digital delivery" }),
	).toContainText("revoked");
	await expect(
		page.getByRole("button", { name: "Download", exact: true }),
	).toHaveCount(0);
	const revoked = await request.post(downloadPath, {
		headers: mockAuthHeaders("user-1"),
		data: {},
	});
	expect([400, 401, 403, 404, 409, 410]).toContain(revoked.status());
	await page.screenshot({
		path: test.info().outputPath("after-refund-revoked.png"),
	});
	await setMockAuthCookie(page.context());
	await page.goto(`/pages/shop/admin/orders/${orderId}`);
	await expect(
		page.getByRole("region", { name: "Digital delivery" }),
	).toContainText("revoked");
	await expect(
		page.getByText("guest-digital@example.com", { exact: true }).first(),
	).toBeVisible();
});
