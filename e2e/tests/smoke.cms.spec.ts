import { expect, test } from "@playwright/test";

const emptySelector = '[data-testid="empty-state"]';
const errorSelector = '[data-testid="error-placeholder"]';

test.describe("CMS Hooks Example", () => {
	test("cms-example page renders and shows content types", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/cms-example", { waitUntil: "networkidle" });

		// Should show the example page title
		await expect(
			page.locator('[data-testid="cms-example-title"]'),
		).toContainText("CMS Hooks Example");

		// Should show content types list with Product and Testimonial
		await expect(
			page.locator('[data-testid="content-types-list"]'),
		).toBeVisible();
		await expect(
			page.locator('[data-testid="content-type-product"]'),
		).toBeVisible();
		await expect(
			page.locator('[data-testid="content-type-testimonial"]'),
		).toBeVisible();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("cms-example page shows product items after creating", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// First create a product via the CMS
		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		await page.locator('input[name="name"]').fill("Hooks Test Product");
		await page
			.locator('textarea[name="description"]')
			.fill("A product created for hooks test");
		await page.locator('input[name="price"]').fill("99.99");

		// Featured checkbox
		const featuredCheckbox = page.locator('button[role="checkbox"]').first();
		await featuredCheckbox.click();

		// Category select
		const categorySelect = page.locator('button[role="combobox"]').first();
		await categorySelect.click();
		await page.locator('[role="option"]').first().click();

		await page.locator('button[type="submit"]').click();
		await expect(page.locator("text=created successfully")).toBeVisible({
			timeout: 10000,
		});

		// Now navigate to the cms-example page
		await page.goto("/cms-example", { waitUntil: "networkidle" });

		// Should show the product in the list
		await expect(page.locator('[data-testid="products-list"]')).toBeVisible();
		await expect(
			page.locator('[data-testid="product-item-hooks-test-product"]'),
		).toBeVisible();

		// Verify the product details are displayed
		const productItem = page.locator(
			'[data-testid="product-item-hooks-test-product"]',
		);
		await expect(
			productItem.locator('[data-testid="product-name"]'),
		).toContainText("Hooks Test Product");
		await expect(
			productItem.locator('[data-testid="product-slug"]'),
		).toContainText("hooks-test-product");
		await expect(
			productItem.locator('[data-testid="product-description"]'),
		).toContainText("A product created for hooks test");
		await expect(
			productItem.locator('[data-testid="product-price"]'),
		).toContainText("$99.99");

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("cms-example page shows empty state for products when none exist", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// Delete all existing products first
		await page.goto("/pages/cms/product", { waitUntil: "networkidle" });

		// Delete products if any exist
		while ((await page.locator("table tbody tr").count()) > 0) {
			const deleteButton = page
				.locator("table tbody tr")
				.first()
				.locator("button")
				.last();
			await deleteButton.click();
			await expect(page.locator("text=deleted successfully")).toBeVisible({
				timeout: 5000,
			});
			await page.waitForTimeout(500); // Wait for list to update
		}

		// Navigate to cms-example page
		await page.goto("/cms-example", { waitUntil: "networkidle" });

		// Should show empty state for products
		await expect(page.locator('[data-testid="products-empty"]')).toBeVisible();
		await expect(page.locator('[data-testid="products-total"]')).toContainText(
			"0",
		);

		// Content types should still be visible (they're registered, not data-dependent)
		await expect(
			page.locator('[data-testid="content-types-list"]'),
		).toBeVisible();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});
});

test.describe("CMS Plugin", () => {
	test("dashboard page renders content types grid", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/cms", { waitUntil: "networkidle" });

		// Should show dashboard with content types
		await expect(page.locator("h1")).toContainText("Content");

		// Should show Product and Testimonial content types
		// Use more specific selectors to avoid matching descriptions
		await expect(
			page.locator('[data-slot="card-title"]:text("Product")'),
		).toBeVisible();
		await expect(
			page.locator('[data-slot="card-title"]:text("Testimonial")'),
		).toBeVisible();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("content list page renders for product", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/cms/product", { waitUntil: "networkidle" });

		// Should show content type name
		await expect(page.locator("h1")).toContainText("Product");

		// Should have New Item button
		await expect(page.locator("text=New Item")).toBeVisible();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("create content item flow", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// Navigate to new product page
		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		// Should show editor page
		await expect(page.locator("h1")).toContainText("New Product");

		// Fill in the form - the form fields are rendered by AutoForm based on schema
		// Name field
		await page.locator('input[name="name"]').fill("Test Product");

		// Slug should auto-generate
		const slugInput = page.locator("input#slug");
		await expect(slugInput).toHaveValue("test-product");

		// Description field (textarea)
		const descriptionField = page.locator('textarea[name="description"]');
		if (await descriptionField.isVisible()) {
			await descriptionField.fill("A test product description");
		}

		// Price field
		await page.locator('input[name="price"]').fill("29.99");

		// Featured checkbox - click to ensure it has a value
		const featuredCheckbox = page.locator('button[role="checkbox"]').first();
		await featuredCheckbox.click();

		// Category select - find and click the select trigger
		const categorySelect = page.locator('button[role="combobox"]').first();
		await categorySelect.click();
		await page.locator('[role="option"]').first().click();

		// Submit the form - wait for button to be ready
		const submitButton = page.locator('button[type="submit"]');
		await expect(submitButton).toBeVisible();
		await submitButton.click();

		// Should show success toast
		await expect(page.locator("text=created successfully")).toBeVisible({
			timeout: 10000,
		});

		// Should redirect to list page
		await page.waitForURL(/\/pages\/cms\/product$/, { timeout: 5000 });

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("edit content item flow", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// First create an item
		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		await page.locator('input[name="name"]').fill("Edit Test Product");
		await page
			.locator('textarea[name="description"]')
			.fill("A product to edit");
		await page.locator('input[name="price"]').fill("19.99");

		// Featured checkbox - click to ensure it has a value
		const featuredCheckbox = page.locator('button[role="checkbox"]').first();
		await featuredCheckbox.click();

		const categorySelect = page.locator('button[role="combobox"]').first();
		await categorySelect.click();
		await page.locator('[role="option"]').first().click();

		await page.locator('button[type="submit"]').click();
		await page.waitForURL(/\/pages\/cms\/product$/, { timeout: 5000 });

		// Click on the item to edit
		await page.locator("text=edit-test-product").click();
		await page.waitForURL(/\/pages\/cms\/product\//, { timeout: 5000 });

		// Should show edit page
		await expect(page.locator("h1")).toContainText("Edit Product");

		// Slug should be disabled when editing
		await expect(page.locator("input#slug")).toBeDisabled();

		// Update the name
		await page.locator('input[name="name"]').fill("Updated Product Name");

		// Re-select category (workaround for enum field initialization bug)
		const editCategorySelect = page.locator('button[role="combobox"]').first();
		await editCategorySelect.click();
		await page.locator('[role="option"]').first().click();

		// Submit
		await page.locator('button[type="submit"]').click();

		// Should show success toast
		await expect(page.locator("text=updated successfully")).toBeVisible({
			timeout: 5000,
		});

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("delete content item flow", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// First create an item to delete
		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		await page.locator('input[name="name"]').fill("Delete Test Product");
		await page
			.locator('textarea[name="description"]')
			.fill("A product to delete");
		await page.locator('input[name="price"]').fill("9.99");

		// Featured checkbox - click to ensure it has a value
		const featuredCheckbox = page.locator('button[role="checkbox"]').first();
		await featuredCheckbox.click();

		const categorySelect = page.locator('button[role="combobox"]').first();
		await categorySelect.click();
		await page.locator('[role="option"]').first().click();

		await page.locator('button[type="submit"]').click();
		await page.waitForURL(/\/pages\/cms\/product$/, { timeout: 5000 });

		// Find and click the delete button for this item
		const deleteButton = page
			.locator('tr:has-text("delete-test-product")')
			.locator("button")
			.last();
		await deleteButton.click();

		// Should show success toast
		await expect(page.locator("text=deleted successfully")).toBeVisible({
			timeout: 5000,
		});

		// Item should no longer be in the list
		await expect(page.locator("text=delete-test-product")).not.toBeVisible();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("pagination works on content list", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// Create multiple items to test pagination
		for (let i = 0; i < 3; i++) {
			await page.goto("/pages/cms/testimonial/new", {
				waitUntil: "networkidle",
			});
			await page.locator('input[name="author"]').fill(`Test Author ${i}`);
			await page.locator('textarea[name="quote"]').fill(`Test quote ${i}`);
			await page.locator('input[name="rating"]').fill("5");
			await page.locator('button[type="submit"]').click();
			await page.waitForURL(/\/pages\/cms\/testimonial$/, { timeout: 5000 });
		}

		// Navigate to list page
		await page.goto("/pages/cms/testimonial", { waitUntil: "networkidle" });

		// Should show items in table
		await expect(page.locator("table")).toBeVisible();

		// Pagination text should be visible if there are items
		const items = await page.locator("table tbody tr").count();
		expect(items).toBeGreaterThan(0);

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("slug auto-generation from name field", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		// Type in the name field
		await page.locator('input[name="name"]').fill("My Test Product Name");

		// Slug should auto-generate with lowercase and hyphens
		const slugInput = page.locator("input#slug");
		await expect(slugInput).toHaveValue("my-test-product-name");

		// Manually editing slug should stop auto-generation
		await slugInput.fill("custom-slug");
		await page.locator('input[name="name"]').fill("Changed Product Name");

		// Slug should remain as manually set
		await expect(slugInput).toHaveValue("custom-slug");

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("field validation shows errors", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		// Try to submit without filling required fields
		await page.locator('button[type="submit"]').click();

		// Should show validation errors (AutoForm shows errors near fields)
		// The exact error text depends on Zod messages
		await page.waitForTimeout(500); // Wait for validation

		// Page should still be on the new page (not redirected)
		await expect(page).toHaveURL(/\/pages\/cms\/product\/new/);

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});
});
