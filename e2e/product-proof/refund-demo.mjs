import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { expect } from "@playwright/test";

const admin = "admin-refund-demo";
const errors = [];
let orderId;
let product;
let code;
let payment;

async function api(baseURL, path, method = "GET", data, headers = {}) {
	const response = await fetch(`${baseURL}/api/data${path}`, {
		method,
		headers: {
			cookie: `btst.example_session=mock-session-${admin}`,
			...(data ? { "content-type": "application/json" } : {}),
			...headers,
		},
		...(data
			? { body: typeof data === "string" ? data : JSON.stringify(data) }
			: {}),
		signal: AbortSignal.timeout(10000),
	});
	assert.ok(
		response.ok,
		`${method} ${path}: ${response.status} ${await response.clone().text()}`,
	);
	return response.json();
}

async function paid(baseURL) {
	const body = JSON.stringify({ ...payment, status: "paid" });
	return api(baseURL, "/shop/webhook", "POST", body, {
		"x-demo-signature": createHmac("sha256", "btst-ecommerce-e2e-only")
			.update(body)
			.digest("hex"),
	});
}

const refundRegion = (page) =>
	page.getByRole("region", { name: "Refund", exact: true });

export const config = {
	baseURL: process.env.PRODUCT_PROOF_BASE_URL ?? "http://localhost:3109",
	outDir: "../docs/assets/refunds/after",
	videoName: "full-order-refund",
	viewport: { width: 1440, height: 1000 },
	captionHold: 3000,
	captionStyle: { accent: "#2563eb" },
	async signIn({ context, baseURL }) {
		errors.length = 0;
		context.on("page", (page) => {
			page.on("pageerror", (error) => errors.push(error.message));
			page.on("console", (message) => {
				if (message.type() === "error") errors.push(message.text());
			});
		});
		await context.addCookies([
			{
				name: "btst.example_session",
				value: `mock-session-${admin}`,
				url: baseURL,
				httpOnly: true,
				sameSite: "Lax",
			},
		]);
		const stamp = Date.now();
		await api(baseURL, "/content-types");
		product = await api(baseURL, "/shop/products", "POST", {
			slug: `refund-demo-${stamp}`,
			data: {
				name: "Field notebook",
				description: "Stitched notebook for notes and plans.",
				price: 2100,
				currency: "USD",
				stock: 8,
				status: "published",
				images: [],
			},
		});
		code = `DEMOREFUND${stamp}`;
		await api(baseURL, "/shop/discounts", "POST", {
			code,
			type: "percent",
			value: 10,
			maxUses: 1,
		});
		const checkout = await api(baseURL, "/shop/checkout", "POST", {
			items: [{ productId: product.id, quantity: 1 }],
			email: "refund-demo@example.com",
			shippingAddress: {
				name: "Demo Buyer",
				line1: "123 Market Street",
				city: "Portland",
				postalCode: "97201",
				country: "US",
			},
			discountCode: code,
			idempotencyKey: randomUUID(),
		});
		orderId = checkout.orderId;
		payment = {
			orderId,
			amount: 1890,
			currency: "USD",
			paymentRef: `demo-uncertain-${orderId}`,
		};
		await paid(baseURL);
	},
};

export const beats = [
	{
		name: "Eligible paid order",
		async run({ page, goto, caption }) {
			await goto(`/pages/shop/admin/orders/${orderId}`);
			await page.addStyleTag({
				content: "body { padding-bottom: 110px !important; }",
			});
			const refund = refundRegion(page);
			await expect(
				refund.getByRole("button", {
					name: "Refund full order ($18.90)",
					exact: true,
				}),
			).toBeEnabled();
			await refund.evaluate((element) =>
				element.scrollIntoView({ block: "center" }),
			);
			await caption(
				"The refund uses the paid order's saved $18.90 total. Returns and fulfillment stay separate.",
			);
		},
	},
	{
		name: "Explicit full refund confirmation",
		async run({ page, caption }) {
			await refundRegion(page)
				.getByRole("button", {
					name: "Refund full order ($18.90)",
					exact: true,
				})
				.click();
			const dialog = page.getByRole("dialog", {
				name: "Refund the full order?",
			});
			await expect(dialog).toContainText("$18.90");
			await expect(dialog).toContainText("Items will not be restocked");
			await caption(
				"An explicit confirmation returns $18.90 to the original payment without restocking items.",
			);
		},
	},
	{
		name: "Timeout records an uncertain attempt",
		async run({ page, caption, baseURL }) {
			await page
				.getByRole("dialog")
				.getByRole("button", { name: "Confirm refund $18.90", exact: true })
				.click();
			const refund = refundRegion(page);
			await expect(refund).toContainText("Refund status: uncertain");
			await expect(
				refund.getByRole("button", { name: /Refund full order/ }),
			).toHaveCount(0);
			const attempt = (await api(baseURL, `/shop/orders/${orderId}/refund`))
				.attempt;
			const repeated = await api(
				baseURL,
				`/shop/orders/${orderId}/refund`,
				"POST",
				{ confirm: true },
			);
			assert.equal(repeated.attempt.id, attempt.id);
			await refund.evaluate((element) =>
				element.scrollIntoView({ block: "center" }),
			);
			await caption(
				"A lost provider response records uncertainty. Repeating the action keeps the same refund attempt.",
				3600,
			);
		},
	},
	{
		name: "Provider reconciliation confirms one refund",
		async run({ page, caption, baseURL }) {
			const refund = refundRegion(page);
			await refund
				.getByRole("button", { name: "Check provider status", exact: true })
				.click();
			await expect(refund).toContainText("Refund status: confirmed");
			await paid(baseURL);
			const result = await api(
				baseURL,
				`/shop/orders/${orderId}/refund/reconcile`,
				"POST",
			);
			assert.deepEqual(
				result.attempt.history.map((entry) => entry.status),
				["pending", "uncertain", "confirmed"],
			);
			const order = await api(baseURL, `/shop/orders/${orderId}`);
			assert.equal(order.paymentStatus, "refunded");
			assert.equal(order.status, "paid");
			const currentProduct = await api(
				baseURL,
				`/shop/products/${product.slug}`,
			);
			assert.equal(currentProduct.stock, 7);
			const discounts = await api(baseURL, "/shop/discounts");
			assert.equal(discounts.items.find((item) => item.code === code).uses, 1);
			await refund.evaluate((element) =>
				element.scrollIntoView({ block: "center" }),
			);
			await caption(
				"The provider confirms the refund. The history is preserved; stock and discount use remain unchanged.",
				3600,
			);
			assert.deepEqual(errors, [], `Browser errors: ${errors.join("; ")}`);
		},
	},
];
