import { test, expect, type Page } from "@playwright/test";

// Helper to get the UI Builder component editor
function getUIBuilder(page: Page) {
	return page.getByTestId("component-editor");
}

// Helper to get the layers panel
function getLayersPanel(page: Page) {
	return page.getByTestId("page-config-panel");
}

test.describe("UI Builder Plugin - Admin Pages", () => {
	// Generate unique ID for each test run to avoid slug collisions
	const testRunId = Date.now().toString(36);

	test("pages list page renders", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/ui-builder", { waitUntil: "networkidle" });

		// Should show the pages list page with title
		await expect(
			page.getByRole("heading", { name: "UI Builder Pages", level: 1 }),
		).toBeVisible();

		// Should show create button (it's a link styled as button)
		await expect(
			page.getByRole("link", { name: /create page/i }).first(),
		).toBeVisible();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("new page renders with UI Builder", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/ui-builder/new", { waitUntil: "networkidle" });

		// Should show the page builder page with slug input
		await expect(page.getByTestId("page-builder-page")).toBeVisible({
			timeout: 30000,
		});

		// Should show the UI Builder component
		await expect(getUIBuilder(page)).toBeVisible({ timeout: 30000 });

		// Should show layers panel or similar
		await expect(getLayersPanel(page)).toBeVisible();

		// Should show Save button
		await expect(page.getByRole("button", { name: "Save" })).toBeVisible();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("create page flow", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/ui-builder/new", { waitUntil: "networkidle" });

		// Wait for the UI Builder to finish loading
		await expect(page.getByTestId("page-builder-page")).toBeVisible({
			timeout: 30000,
		});
		await expect(getUIBuilder(page)).toBeVisible({ timeout: 30000 });

		// Fill in page slug
		const pageSlug = `test-page-${testRunId}`;
		await page.getByPlaceholder("my-page-slug").fill(pageSlug);

		// Wait for the UI Builder to be ready (layers panel visible)
		await expect(getLayersPanel(page)).toBeVisible();

		// The UI Builder will have default layers, so just save
		await page.waitForTimeout(1000); // Allow initial state to settle

		// Save the page
		await page.getByRole("button", { name: "Save" }).click();

		// Should show success toast
		await expect(page.locator("text=/saved/i")).toBeVisible({
			timeout: 10000,
		});

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("edit page flow", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// First create a page
		await page.goto("/pages/ui-builder/new", { waitUntil: "networkidle" });
		await expect(page.getByTestId("page-builder-page")).toBeVisible({
			timeout: 30000,
		});
		await expect(getUIBuilder(page)).toBeVisible({ timeout: 30000 });

		const pageSlug = `edit-test-${testRunId}`;
		await page.getByPlaceholder("my-page-slug").fill(pageSlug);

		// Wait for UI Builder to be ready
		await expect(getLayersPanel(page)).toBeVisible();
		await page.waitForTimeout(1000);

		// Save the page
		await page.getByRole("button", { name: "Save" }).click();
		// Use .first() to avoid strict mode violation if multiple toasts appear
		await expect(page.locator("text=/saved/i").first()).toBeVisible({
			timeout: 10000,
		});

		// Wait for first toast to disappear before proceeding
		await expect(page.locator("text=/saved/i")).not.toBeVisible({
			timeout: 10000,
		});

		// We should now be on the edit page
		await expect(page.getByTestId("page-builder-page")).toBeVisible();
		await expect(getUIBuilder(page)).toBeVisible();

		// Change status to published
		await page.getByRole("combobox").click();
		await page.getByRole("option", { name: "Published" }).click();

		// Save changes
		await page.getByRole("button", { name: "Save" }).click();
		await expect(page.locator("text=/saved/i").first()).toBeVisible({
			timeout: 10000,
		});

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("delete page flow", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// First create a page
		await page.goto("/pages/ui-builder/new", { waitUntil: "networkidle" });
		await expect(page.getByTestId("page-builder-page")).toBeVisible({
			timeout: 30000,
		});
		await expect(getUIBuilder(page)).toBeVisible({ timeout: 30000 });

		const pageSlug = `delete-test-${testRunId}`;
		await page.getByPlaceholder("my-page-slug").fill(pageSlug);

		// Wait for UI Builder to be ready
		await expect(getLayersPanel(page)).toBeVisible();
		await page.waitForTimeout(1000);

		// Save the page
		await page.getByRole("button", { name: "Save" }).click();
		await expect(page.locator("text=/saved/i")).toBeVisible({
			timeout: 10000,
		});

		// Navigate to pages list
		await page.goto("/pages/ui-builder", { waitUntil: "networkidle" });

		// Find and click delete button on our page using the dropdown menu
		const row = page.locator(`tr:has-text("${pageSlug}")`);
		await expect(row).toBeVisible({ timeout: 10000 });
		await row.getByRole("button").click(); // Open dropdown menu
		await page.getByRole("menuitem", { name: "Delete" }).click();

		// Confirm deletion in the alert dialog
		await page.getByRole("button", { name: "Delete" }).click();

		// Should show success toast
		await expect(page.locator("text=/deleted/i")).toBeVisible({
			timeout: 10000,
		});

		// Page should no longer be visible
		await expect(row).not.toBeVisible();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});
});

test.describe("UI Builder - Public Page Rendering", () => {
	const testRunId = Date.now().toString(36);

	test("public page renders content from UI Builder", async ({
		page,
		request,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// Create a page via CMS API (using ui-builder-page content type)
		const pageSlug = `public-render-test-${testRunId}`;
		const layers = JSON.stringify([
			{
				id: "root",
				type: "div",
				name: "Page Root",
				props: { className: "p-8" },
				children: [
					{
						id: "heading",
						type: "h1",
						name: "Heading",
						props: { className: "text-3xl font-bold mb-4" },
						children: "Welcome to UI Builder",
					},
					{
						id: "text",
						type: "p",
						name: "Paragraph",
						props: { className: "text-lg text-muted-foreground" },
						children: "This page was created with UI Builder.",
					},
				],
			},
		]);

		const response = await request.post("/api/data/content/ui-builder-page", {
			headers: { "content-type": "application/json" },
			data: {
				slug: pageSlug,
				data: {
					layers: layers,
					variables: "[]",
					status: "published",
				},
			},
		});

		// Ensure the page was created successfully
		const responseText = await response.text();
		expect(
			response.ok(),
			`Page creation failed with status ${response.status()}: ${responseText}`,
		).toBe(true);

		// Navigate to public preview page
		await page.goto(`/preview/${pageSlug}`, { waitUntil: "networkidle" });

		// Wait for page to finish loading
		await expect(page.getByText("Loading page...")).not.toBeVisible({
			timeout: 15000,
		});

		// Should render the UI Builder page content
		await expect(page.getByText("Welcome to UI Builder")).toBeVisible({
			timeout: 10000,
		});
		await expect(
			page.getByText("This page was created with UI Builder."),
		).toBeVisible();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("public page shows not found for non-existent page", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			// Filter out expected 404 network errors
			if (msg.type() === "error" && !msg.text().includes("404")) {
				errors.push(msg.text());
			}
		});

		// Navigate to non-existent page
		await page.goto("/preview/non-existent-page-slug", {
			waitUntil: "networkidle",
		});

		// Should show not found message
		await expect(page.getByText("Page Not Found")).toBeVisible({
			timeout: 10000,
		});

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("public page renders with components", async ({ page, request }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// Create a page with shadcn/ui components via CMS API
		const pageSlug = `component-render-test-${testRunId}`;
		const layers = JSON.stringify([
			{
				id: "root",
				type: "Flexbox",
				name: "Container",
				props: {
					className: "p-8 gap-4",
					direction: "column",
					align: "center",
				},
				children: [
					{
						id: "badge",
						type: "Badge",
						name: "Status Badge",
						props: { variant: "secondary" },
						children: [
							{
								id: "badge-text",
								type: "span",
								name: "Badge Text",
								props: {},
								children: "New Feature",
							},
						],
					},
					{
						id: "title",
						type: "h1",
						name: "Title",
						props: { className: "text-2xl font-bold" },
						children: "Component Showcase",
					},
					{
						id: "button",
						type: "Button",
						name: "CTA Button",
						props: { variant: "default" },
						children: [
							{
								id: "btn-text",
								type: "span",
								name: "Button Text",
								props: {},
								children: "Get Started",
							},
						],
					},
				],
			},
		]);

		const response = await request.post("/api/data/content/ui-builder-page", {
			headers: { "content-type": "application/json" },
			data: {
				slug: pageSlug,
				data: {
					layers: layers,
					variables: "[]",
					status: "published",
				},
			},
		});

		expect(response.ok()).toBe(true);

		// Navigate to public preview page
		await page.goto(`/preview/${pageSlug}`, { waitUntil: "networkidle" });

		// Wait for page to finish loading
		await expect(page.getByText("Loading page...")).not.toBeVisible({
			timeout: 15000,
		});

		// Should render all components
		await expect(page.getByText("New Feature")).toBeVisible({ timeout: 10000 });
		await expect(page.getByText("Component Showcase")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Get Started" }),
		).toBeVisible();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});
});
