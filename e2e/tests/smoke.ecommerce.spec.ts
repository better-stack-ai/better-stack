import { expect, test } from "@playwright/test";
import { payDemoOrder, seedEcommerce } from "./helpers/ecommerce";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

test("discount management and live checkout breakdown use authoritative quotes", async ({
	page,
	request,
}) => {
	const [notebook] = await seedEcommerce(request, `-quotes-${Date.now()}`);
	await setMockAuthCookie(page.context());
	await page.goto("/pages/shop/admin/orders");
	await page.getByRole("tab", { name: "Discount Codes", exact: true }).click();
	const code = `QUOTE${Date.now()}`;
	await page.getByLabel("Code", { exact: true }).fill(code);
	await page.getByLabel("Percentage", { exact: true }).fill("10");
	await page.getByLabel("Maximum uses (optional)").fill("3");
	await page
		.getByRole("button", { name: "Create discount code", exact: true })
		.click();
	const row = page
		.getByRole("row")
		.filter({ has: page.getByRole("cell", { name: code, exact: true }) });
	await expect(row).toContainText("0 / 3");
	await page.goto(`/pages/shop/products/${notebook!.slug}`);
	await page.waitForLoadState("networkidle");
	await page
		.getByRole("combobox", { name: "Variant", exact: true })
		.selectOption("forest");
	await expect(page.getByText("$21.00", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Add to cart", exact: true }).click();
	await page.goto("/pages/shop/checkout");
	await page.getByLabel("Email", { exact: true }).fill("quote@example.com");
	await page.getByLabel("Full name", { exact: true }).fill("Demo Buyer");
	await page.getByLabel("Address", { exact: true }).fill("123 Market Street");
	await page.getByLabel("City", { exact: true }).fill("Toronto");
	await page.getByLabel("Postal code", { exact: true }).fill("M5V 2T6");
	await page.getByLabel("Country code", { exact: true }).fill("CA");
	await page.getByLabel("Discount code", { exact: true }).fill(code);
	await page.getByRole("button", { name: "Apply", exact: true }).click();
	const totals = page.getByRole("definition");
	await expect(totals).toHaveText([
		"$21.00",
		"-$2.10",
		"$15.00",
		"$4.40",
		"$38.30",
	]);
	await page.getByLabel("Country code", { exact: true }).fill("US");
	await expect(totals).toHaveText([
		"$21.00",
		"-$2.10",
		"$0.00",
		"$0.00",
		"$18.90",
	]);
	await page.getByLabel("Country code", { exact: true }).fill("CA");
	await expect(totals).toHaveText([
		"$21.00",
		"-$2.10",
		"$15.00",
		"$4.40",
		"$38.30",
	]);
	const listed = await request.get("/api/data/shop/discounts", {
		headers: mockAuthHeaders(),
	});
	expect(
		(await listed.json()).items.find(
			(item: { code: string }) => item.code === code,
		).uses,
	).toBe(0);
	await page
		.getByRole("button", { name: "Continue to payment", exact: true })
		.click();
	let created!: { orderId: string; quote: Record<string, number> };
	// Capture the real response before the payment redirect replaces the document.
	await page.route("**/shop/checkout", async (route) => {
		const response = await route.fetch();
		created = await response.json();
		await route.fulfill({ response });
	});
	await page
		.getByRole("button", { name: "Continue to secure payment", exact: true })
		.click();
	await page.waitForURL(/\/confirmation$/);
	expect(created.quote).toMatchObject({
		subtotal: 2100,
		discount: 210,
		shipping: 1500,
		tax: 440,
		total: 3830,
	});
	await page.goto("/pages/shop/admin/orders");
	await page.getByRole("tab", { name: "Discount Codes", exact: true }).click();
	await expect(row).toContainText("1 / 3");
	page.once("dialog", (dialog) => dialog.accept());
	await page
		.getByRole("button", { name: `Delete ${code}`, exact: true })
		.click();
	await expect(row).toHaveCount(0);
	const order = await request.get(`/api/data/shop/orders/${created.orderId}`, {
		headers: mockAuthHeaders(),
	});
	expect(await order.json()).toMatchObject(created.quote);
});

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

test("checkout retries a lost response when its own reservation rejects fresh quotes", async ({
	page,
	request,
}) => {
	const stamp = Date.now();
	const [product] = await seedEcommerce(request, `-lost-response-${stamp}`);
	const code = `RECOVER${stamp}`;
	const discount = await request.post("/api/data/shop/discounts", {
		headers: mockAuthHeaders(),
		data: { code, type: "percent", value: 10, maxUses: 1 },
	});
	expect(discount.ok(), await discount.text()).toBe(true);
	await page.goto(`/pages/shop/products/${product!.slug}`);
	await page.waitForLoadState("networkidle");
	await page.getByRole("button", { name: "Add to cart", exact: true }).click();
	await page.goto("/pages/shop/checkout");
	for (const [label, value] of [
		["Email", "retry@example.com"],
		["Full name", "Demo Buyer"],
		["Address", "123 Market Street"],
		["City", "Portland"],
		["Postal code", "97201"],
		["Country code", "US"],
	] as const)
		await page.getByLabel(label, { exact: true }).fill(value);
	await page.getByLabel("Discount code", { exact: true }).fill(code);
	await page.getByRole("button", { name: "Apply", exact: true }).click();
	await expect(page.getByRole("status")).toContainText(`${code} applied`);
	await page
		.getByRole("button", { name: "Continue to payment", exact: true })
		.click();
	const bodies: Record<string, unknown>[] = [];
	const orders: string[] = [];
	await page.route("**/api/data/shop/checkout", async (route) => {
		bodies.push(route.request().postDataJSON());
		const response = await route.fetch();
		expect(response.ok()).toBe(true);
		orders.push((await response.json()).orderId);
		if (bodies.length === 1) await route.abort("failed");
		else await route.fulfill({ response });
	});
	const quoteRejected = page.waitForResponse(
		(response) =>
			response.url().endsWith("/api/data/shop/checkout/quote") &&
			response.status() === 400,
	);
	const payment = page.getByRole("button", {
		name: "Continue to secure payment",
		exact: true,
	});
	await payment.click();
	await quoteRejected;
	await expect(payment).toBeEnabled();
	const retryScreenshot = test
		.info()
		.outputPath("lost-response-checkout-retry.png");
	await page.screenshot({ path: retryScreenshot });
	await test.info().attach("lost-response-checkout-retry", {
		path: retryScreenshot,
		contentType: "image/png",
	});
	await payment.click();
	await page.waitForURL(/\/confirmation$/);
	expect(bodies).toHaveLength(2);
	expect(bodies[1]).toEqual(bodies[0]);
	expect(orders).toEqual([orders[0], orders[0]]);
	const order = await request.get(`/api/data/shop/orders/${orders[0]}`, {
		headers: mockAuthHeaders(),
	});
	expect(await order.json()).toMatchObject({
		discount: 180,
		total: 1620,
		paymentStatus: "pending",
	});
	const listed = await request.get("/api/data/shop/discounts", {
		headers: mockAuthHeaders(),
	});
	expect(
		(await listed.json()).items.find(
			(item: { code: string }) => item.code === code,
		).uses,
	).toBe(1);
});

test("checkout preserves and resumes a discounted payment across cart changes", async ({
	page,
	request,
}) => {
	const stamp = Date.now();
	const [product] = await seedEcommerce(request, `-discount-lock-${stamp}`);
	const code = `ONCE-${stamp}`;
	const createdDiscount = await request.post("/api/data/shop/discounts", {
		headers: mockAuthHeaders(),
		data: { code, type: "percent", value: 10, maxUses: 1 },
	});
	expect(createdDiscount.ok(), await createdDiscount.text()).toBe(true);
	const checkoutBodies: Record<string, unknown>[] = [];
	const checkoutOrders: string[] = [];
	let browserDiscountValidations = 0;
	page.on("request", (request) => {
		if (
			request.method() === "POST" &&
			request.url().endsWith("/api/data/shop/discounts/validate")
		)
			browserDiscountValidations++;
	});
	await page.goto(`/pages/shop/products/${product!.slug}`);
	await page.waitForLoadState("networkidle");
	await page.getByRole("button", { name: "Add to cart", exact: true }).click();
	await page.getByRole("link", { name: /^Review cart \(1\)$/ }).click();
	await page.getByRole("link", { name: "Checkout", exact: true }).click();
	for (const [label, value] of [
		["Email", "buyer@example.com"],
		["Full name", "Demo Buyer"],
		["Address", "123 Market Street"],
		["City", "Portland"],
		["Postal code", "97201"],
		["Country code", "US"],
	] as const)
		await page.getByLabel(label, { exact: true }).fill(value);
	const discount = page.getByLabel("Discount code", { exact: true });
	const apply = page.getByRole("button", { name: "Apply", exact: true });
	await discount.fill(code);
	await expect(discount).toBeEnabled();
	await expect(apply).toBeEnabled();
	await apply.click();
	await expect(page.getByRole("status")).toContainText(`${code} applied`);
	const summary = page.getByRole("complementary").filter({
		has: page.getByRole("heading", { name: "Order summary", exact: true }),
	});
	const originalLine = summary.getByText("Field notebook (Navy) × 1", {
		exact: true,
	});
	const originalTotal = summary.getByText("$16.20", { exact: true });
	const cartNotice = summary.getByRole("status").filter({
		hasText: "Cart changes apply to a future order.",
	});
	const drawer = page.getByRole("dialog", { name: /Your cart/ });
	await page
		.getByRole("button", { name: "Continue to payment", exact: true })
		.click();

	let releaseCheckout!: () => void;
	const checkoutResponse = new Promise<void>((resolve) => {
		releaseCheckout = resolve;
	});
	await page.route("**/api/data/shop/checkout", async (route) => {
		checkoutBodies.push(route.request().postDataJSON());
		await checkoutResponse;
		const response = await route.fetch();
		const result = await response.json();
		if (response.ok()) checkoutOrders.push(result.orderId);
		await route.fulfill({
			response,
			json: response.ok()
				? { ...result, payment: { clientSecret: "test-embedded-payment" } }
				: result,
		});
	});
	const submitted = page.waitForRequest(
		(request) =>
			request.url().endsWith("/api/data/shop/checkout") &&
			request.method() === "POST",
	);
	await page
		.getByRole("button", { name: "Continue to secure payment", exact: true })
		.click();
	await submitted;
	try {
		await expect(discount).toBeDisabled();
		await expect(apply).toBeDisabled();
		await page.getByRole("button", { name: "Open cart", exact: true }).click();
		await drawer
			.getByRole("spinbutton", {
				name: "Quantity for Field notebook Navy",
				exact: true,
			})
			.fill("2");
		await page.keyboard.press("Escape");
		await expect(drawer).not.toBeVisible();
		await expect(originalLine).toBeVisible();
		await expect(originalTotal).toBeVisible();
		await expect(cartNotice).toBeVisible();
	} finally {
		releaseCheckout();
	}
	const embeddedPayment = page.getByRole("alert").filter({
		hasText: "This payment provider requires a payment form.",
	});
	await expect(embeddedPayment).toBeVisible();
	await expect(discount).toBeDisabled();
	await expect(apply).toBeDisabled();
	await expect(
		page.getByRole("button", { name: "Edit shipping", exact: true }),
	).toBeDisabled();
	await page.getByRole("button", { name: "Open cart", exact: true }).click();
	await drawer
		.getByRole("spinbutton", {
			name: "Quantity for Field notebook Navy",
			exact: true,
		})
		.fill("3");
	await page.keyboard.press("Escape");
	await expect(drawer).not.toBeVisible();
	await expect(embeddedPayment).toBeVisible();
	await expect(originalLine).toBeVisible();
	await expect(originalTotal).toBeVisible();
	await expect(cartNotice).toBeVisible();
	await page.getByRole("button", { name: "Open cart", exact: true }).click();
	await drawer
		.getByRole("button", { name: "Remove Field notebook Navy", exact: true })
		.click();
	await expect(
		drawer.getByText("Your cart is empty.", { exact: true }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(drawer).not.toBeVisible();
	await expect(embeddedPayment).toBeVisible();
	await expect(originalLine).toBeVisible();
	await expect(originalTotal).toBeVisible();
	await expect(cartNotice).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Checkout", exact: true }),
	).toBeVisible();
	expect(checkoutBodies).toHaveLength(1);
	const orderId = checkoutOrders[0]!;
	const order = await request.get(`/api/data/shop/orders/${orderId}`, {
		headers: mockAuthHeaders(),
	});
	expect(order.ok(), await order.text()).toBe(true);
	expect(await order.json()).toMatchObject({
		discount: 180,
		total: 1620,
		paymentStatus: "pending",
	});
	const exhaustedDiscount = await request.post(
		"/api/data/shop/discounts/validate",
		{
			data: {
				code,
				items: [{ productId: product!.id, variantId: "navy", quantity: 1 }],
			},
		},
	);
	expect(exhaustedDiscount.status()).toBe(400);
	expect(await exhaustedDiscount.text()).toContain("usage limit");
	await page.reload();
	await expect.poll(() => checkoutBodies.length).toBe(2);
	await expect(embeddedPayment).toBeVisible();
	expect(checkoutBodies[1]).toEqual(checkoutBodies[0]);
	expect(checkoutOrders).toEqual([orderId, orderId]);
	expect(browserDiscountValidations).toBe(1);
	await expect(originalLine).toBeVisible();
	await expect(originalTotal).toBeVisible();
	await expect(discount).toHaveValue(code);
	await expect(discount).toBeDisabled();
	await page.evaluate((id) => {
		const attemptKey = Object.keys(sessionStorage).find((key) =>
			key.endsWith(":checkout"),
		);
		const tokenKey = Object.keys(sessionStorage).find(
			(key) =>
				key.startsWith("btst:ecommerce:order:") && key.endsWith(`:${id}`),
		);
		if (!attemptKey || !tokenKey)
			throw new Error("Expected a saved checkout and private token");
		const { orderId: _orderId, ...interruptedAttempt } = JSON.parse(
			sessionStorage.getItem(attemptKey)!,
		);
		sessionStorage.setItem(attemptKey, JSON.stringify(interruptedAttempt));
		sessionStorage.removeItem(tokenKey);
	}, orderId);
	await page.reload();
	await expect.poll(() => checkoutBodies.length).toBe(3);
	await expect(embeddedPayment).toBeVisible();
	expect(checkoutBodies[2]).toEqual(checkoutBodies[0]);
	expect(checkoutOrders).toEqual([orderId, orderId, orderId]);
	expect(browserDiscountValidations).toBe(1);
	await expect(originalLine).toBeVisible();
	await expect(originalTotal).toBeVisible();
	await expect(discount).toHaveValue(code);
	await expect(discount).toBeDisabled();
	const stock = await request.get(`/api/data/shop/products/${product!.slug}`);
	expect(
		(await stock.json()).variants.find(
			(variant: { id: string }) => variant.id === "navy",
		).stock,
	).toBe(11);
});
