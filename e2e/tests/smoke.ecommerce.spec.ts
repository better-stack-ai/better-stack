import { expect, test } from "@playwright/test";
import { payDemoOrder, seedEcommerce } from "./helpers/ecommerce";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

test("shop persists a variant cart, verifies payment, and protects order administration", async ({
	page,
	request,
}) => {
	const [notebook] = await seedEcommerce(request, `-${Date.now()}`);
	const deniedProducts = await request.post("/api/data/shop/products", {
		data: { slug: "unauthorized", data: { name: "Unauthorized", price: 100 } },
	});
	expect([401, 403]).toContain(deniedProducts.status());
	const deniedOrders = await request.get("/api/data/shop/orders");
	expect([401, 403]).toContain(deniedOrders.status());
	const invalidWebhook = await request.post("/api/data/shop/webhook", {
		data: {
			orderId: "unknown",
			status: "paid",
			paymentRef: "forged",
			amount: 1,
			currency: "USD",
		},
	});
	expect([400, 401, 403]).toContain(invalidWebhook.status());

	await page.goto("/pages/shop");
	await expect(
		page.getByRole("heading", { name: "Products", exact: true }),
	).toBeVisible();
	await page.getByLabel("Category", { exact: true }).selectOption("Stationery");
	await expect(
		page.getByRole("heading", { name: "Weekender tote" }),
	).toHaveCount(0);
	await page.getByRole("link", { name: /Field notebook/ }).click();
	await page.getByLabel("Variant", { exact: true }).selectOption("forest");
	await expect(page.getByText("$21.00", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Add to cart", exact: true }).click();
	await page.getByRole("link", { name: "Review cart", exact: true }).click();
	await page.reload();
	await expect(
		page.getByText("Forest", { exact: false }).first(),
	).toBeVisible();
	await page.getByRole("link", { name: "Checkout", exact: true }).click();
	await page.getByLabel("Email", { exact: true }).fill("buyer@example.com");
	await page.getByLabel("Full name", { exact: true }).fill("Demo Buyer");
	await page.getByLabel("Address", { exact: true }).fill("123 Market Street");
	await page.getByLabel("City", { exact: true }).fill("Portland");
	await page.getByLabel("Postal code", { exact: true }).fill("97201");
	await page.getByLabel("Country code", { exact: true }).fill("US");
	await page.getByLabel("Discount code", { exact: true }).fill("WELCOME10");
	await page.getByRole("button", { name: "Apply", exact: true }).click();
	await expect(page.getByRole("status")).toContainText("WELCOME10 applied");
	await page
		.getByRole("button", { name: "Continue to payment", exact: true })
		.click();
	const checkoutResponse = page.waitForResponse(
		(response) =>
			response.url().endsWith("/api/data/shop/checkout") &&
			response.request().method() === "POST",
	);
	await page
		.getByRole("button", { name: "Continue to secure payment", exact: true })
		.click();
	const checkout = await checkoutResponse;
	expect(checkout.ok(), await checkout.text()).toBe(true);
	const { orderId, accessToken } = await checkout.json();
	await expect(page).toHaveURL(
		new RegExp(`/shop/orders/${orderId}/confirmation`),
	);

	const withoutToken = await request.get(
		`/api/data/shop/orders/${orderId}/confirmation`,
	);
	expect([400, 401, 403, 404]).toContain(withoutToken.status());
	const pending = await request.get(
		`/api/data/shop/orders/${orderId}/confirmation`,
		{ params: { token: accessToken } },
	);
	expect(pending.ok(), await pending.text()).toBe(true);
	const order = await pending.json();
	expect(order.total).toBe(1890);
	expect(order.paymentStatus).toBe("pending");
	await payDemoOrder(request, {
		orderId,
		amount: order.total,
		currency: order.currency,
	});
	await payDemoOrder(request, {
		orderId,
		amount: order.total,
		currency: order.currency,
	});
	await expect(
		page.getByRole("heading", { name: "Payment confirmed", exact: true }),
	).toBeVisible();
	const product = await request.get(
		`/api/data/shop/products/${notebook?.slug}`,
	);
	expect(
		(await product.json()).variants.find(
			(variant: { id: string }) => variant.id === "forest",
		).stock,
	).toBe(7);

	await setMockAuthCookie(page.context());
	await page.goto(`/pages/shop/admin/orders/${orderId}`);
	await expect(
		page.getByText("buyer@example.com", { exact: true }).first(),
	).toBeVisible();
	await page
		.getByLabel("Update order status", { exact: true })
		.selectOption("fulfilling");
	await page.getByRole("button", { name: "Save status", exact: true }).click();
	await expect(
		page.getByText("fulfilling", { exact: true }).first(),
	).toBeVisible();
	const admin = await request.get(`/api/data/shop/orders/${orderId}`, {
		headers: mockAuthHeaders(),
	});
	expect(admin.ok(), await admin.text()).toBe(true);
	const fulfilledOrder = await admin.json();
	expect(fulfilledOrder.paymentStatus).toBe("paid");
	expect(fulfilledOrder.status).toBe("fulfilling");
});
