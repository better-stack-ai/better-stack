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
	const reservedSlug = await request.post("/api/data/shop/products", {
		headers: mockAuthHeaders(),
		data: {
			slug: "cart",
			data: { name: "Reserved slug product", price: 100, status: "published" },
		},
	});
	expect([200, 201, 409]).toContain(reservedSlug.status());

	await page.goto("/pages/shop");
	await page.waitForLoadState("networkidle");
	await page.getByRole("link", { name: /Reserved slug product/ }).click();
	await expect(page).toHaveURL(/\/shop\/products\/cart$/);
	await expect(
		page.getByRole("heading", { name: "Reserved slug product", exact: true }),
	).toBeVisible();
	await page.getByRole("link", { name: "All products", exact: true }).click();
	await expect(page).toHaveURL(/\/shop$/);
	await expect(
		page.getByRole("heading", { name: "Products", exact: true }),
	).toBeVisible();
	await page
		.getByRole("combobox", { name: "Category", exact: true })
		.selectOption("Stationery");
	await expect(
		page.getByRole("heading", { name: "Weekender backpack" }),
	).toHaveCount(0);
	await page
		.getByRole("link", { name: /Field notebook/ })
		.and(page.locator(`[href="/pages/shop/products/${notebook?.slug}"]`))
		.click();
	await page
		.getByRole("combobox", { name: "Variant", exact: true })
		.selectOption("forest");
	await expect(page.getByText("$21.00", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Add to cart", exact: true }).click();
	await page.getByRole("link", { name: /^Review cart \(1\)$/ }).click();
	await expect(page).toHaveURL(/\/shop\/cart$/);
	await page.reload();
	await expect(
		page.getByRole("heading", { name: "Your cart", exact: true }),
	).toBeVisible();
	await expect(page.getByText("Forest", { exact: true })).toBeVisible();
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
	const confirmationRequest = page.waitForRequest((request) => {
		const url = new URL(request.url());
		return (
			/\/api\/data\/shop\/orders\/[^/]+\/confirmation$/.test(url.pathname) &&
			url.searchParams.has("token")
		);
	});
	await page
		.getByRole("button", { name: "Continue to secure payment", exact: true })
		.click();
	const checkout = await checkoutResponse;
	expect(checkout.ok()).toBe(true);
	const confirmationURL = new URL((await confirmationRequest).url());
	const orderId = confirmationURL.pathname.split("/").at(-2)!;
	const accessToken = confirmationURL.searchParams.get("token")!;
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
	await expect
		.poll(() =>
			page.evaluate(() =>
				Object.keys(sessionStorage).filter((key) => key.endsWith(":checkout")),
			),
		)
		.toEqual([]);
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
		.getByRole("combobox", { name: "Update order status", exact: true })
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
