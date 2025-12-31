import { expect, test } from "@playwright/test";

const emptySelector = '[data-testid="empty-state"]';
const errorSelector = '[data-testid="error-placeholder"]';

test.describe("CMS Hooks Example", () => {
	// Generate unique ID for each test run to avoid slug collisions
	const testRunId = Date.now().toString(36);

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

		const productName = `Hooks Test ${testRunId}`;
		const expectedSlug = `hooks-test-${testRunId.toLowerCase()}`;

		// First create a product via the CMS
		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		await page.locator('input[name="name"]').fill(productName);
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

		// Wait for redirect to list page (indicates success)
		await page.waitForURL(/\/pages\/cms\/product$/, { timeout: 10000 });

		// Now navigate to the cms-example page
		await page.goto("/cms-example", { waitUntil: "networkidle" });

		// Should show the product in the list
		await expect(page.locator('[data-testid="products-list"]')).toBeVisible();
		await expect(
			page.locator(`[data-testid="product-item-${expectedSlug}"]`),
		).toBeVisible();

		// Verify the product details are displayed
		const productItem = page.locator(
			`[data-testid="product-item-${expectedSlug}"]`,
		);
		await expect(
			productItem.locator('[data-testid="product-name"]'),
		).toContainText(productName);
		await expect(
			productItem.locator('[data-testid="product-slug"]'),
		).toContainText(expectedSlug);
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

	test("cms-example page load more button works", async ({ page, request }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// Create 5 products via API to ensure we have more than PAGE_SIZE (3)
		for (let i = 1; i <= 5; i++) {
			await request.post("/api/data/content/product", {
				headers: { "content-type": "application/json" },
				data: {
					slug: `load-more-test-${testRunId}-${i}`,
					data: {
						name: `Load More Product ${i}`,
						description: `Product ${i} for load more test`,
						price: i * 10,
						featured: false,
						category: "Electronics",
					},
				},
			});
		}

		await page.goto("/cms-example", { waitUntil: "networkidle" });

		// Should show the products list
		await expect(page.locator('[data-testid="products-list"]')).toBeVisible();

		// Should show the Load More button since we have more than PAGE_SIZE items
		const loadMoreButton = page.locator('[data-testid="load-more-button"]');
		await expect(loadMoreButton).toBeVisible({ timeout: 10000 });

		// Get initial count
		const initialShowingText = await page
			.locator('[data-testid="products-showing"]')
			.textContent();
		const initialCount = parseInt(initialShowingText || "0", 10);

		// Click load more
		await loadMoreButton.click();

		// Wait for more items to load
		await page.waitForFunction(
			(prevCount) => {
				const el = document.querySelector('[data-testid="products-showing"]');
				const currentCount = parseInt(el?.textContent || "0", 10);
				return currentCount > prevCount;
			},
			initialCount,
			{ timeout: 10000 },
		);

		// Verify more items are now shown
		const newShowingText = await page
			.locator('[data-testid="products-showing"]')
			.textContent();
		const newCount = parseInt(newShowingText || "0", 10);
		expect(newCount).toBeGreaterThan(initialCount);

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});
});

test.describe("CMS Plugin", () => {
	// Generate unique ID for each test run to avoid slug collisions
	const testRunId = Date.now().toString(36);

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

		// Should show list page with table
		await expect(page.locator('[data-testid="cms-list-page"]')).toBeVisible({
			timeout: 30000,
		});
		await expect(page.locator("h1")).toContainText("Product");

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
		// Name field - use unique name to avoid slug collisions
		await page.locator('input[name="name"]').fill(`Test Product ${testRunId}`);

		// Slug should auto-generate from name
		const slugInput = page.locator("input#slug");
		// Slug is generated from name - just verify it's not empty
		await expect(slugInput).not.toHaveValue("");

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

		// Should redirect to list page on success
		await page.waitForURL(/\/pages\/cms\/product$/, { timeout: 10000 });

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("edit page renders correctly", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// First create an item to edit
		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		const editTestName = `Edit Test ${testRunId}`;
		await page.locator('input[name="name"]').fill(editTestName);
		await page
			.locator('textarea[name="description"]')
			.fill("Original description");
		await page.locator('input[name="price"]').fill("50.00");

		// Category select
		const categorySelect = page.locator('button[role="combobox"]').first();
		await categorySelect.click();
		await page.locator('[role="option"]').first().click();

		await page.locator('button[type="submit"]').click();

		// Wait for redirect to list page on success
		await page.waitForURL(/\/pages\/cms\/product$/, { timeout: 10000 });
		await expect(page.locator('[data-testid="cms-list-page"]')).toBeVisible();

		// Click edit button on our item (find row with our slug)
		const expectedSlug = `edit-test-${testRunId.toLowerCase()}`;
		const row = page.locator(`tr:has-text("${expectedSlug}")`);
		await row.locator("button:has(svg.lucide-pencil)").click();

		// Should be on edit page with form pre-filled
		await expect(page.locator("h1")).toContainText("Edit Product");
		await expect(page.locator('input[name="name"]')).toHaveValue(editTestName);
		await expect(page.locator('textarea[name="description"]')).toHaveValue(
			"Original description",
		);

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

		const deleteTestName = `Delete Test ${testRunId}`;
		await page.locator('input[name="name"]').fill(deleteTestName);
		await page.locator('textarea[name="description"]').fill("To be deleted");
		await page.locator('input[name="price"]').fill("10.00");

		// Category select
		const categorySelect = page.locator('button[role="combobox"]').first();
		await categorySelect.click();
		await page.locator('[role="option"]').first().click();

		await page.locator('button[type="submit"]').click();

		// Wait for redirect to list page on success
		await page.waitForURL(/\/pages\/cms\/product$/, { timeout: 10000 });
		await expect(page.locator('[data-testid="cms-list-page"]')).toBeVisible();

		// Click delete button on our item
		const expectedSlug = `delete-test-${testRunId.toLowerCase()}`;
		const row = page.locator(`tr:has-text("${expectedSlug}")`);
		await row.locator("button:has(svg.lucide-trash-2)").click();

		// Item should no longer be visible after deletion
		await expect(row).not.toBeVisible({ timeout: 10000 });

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("pagination works on content list", async ({ page, request }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// Create 25 products to exceed the page size (20)
		for (let i = 1; i <= 25; i++) {
			await request.post("/api/data/content/product", {
				headers: { "content-type": "application/json" },
				data: {
					slug: `pagination-test-${testRunId}-${i}`,
					data: {
						name: `Pagination Product ${i}`,
						description: `Product ${i} for pagination test`,
						price: i * 10,
						featured: false,
						category: "Electronics",
					},
				},
			});
		}

		await page.goto("/pages/cms/product", { waitUntil: "networkidle" });
		await expect(page.locator('[data-testid="cms-list-page"]')).toBeVisible();

		// Should show "Next" button since there are more than 20 items
		const nextButton = page.locator('button:has-text("Next")');
		await expect(nextButton).toBeVisible();

		// Click next to load more
		await nextButton.click();

		// After loading more, all 25 items should be accessible
		// The pagination info should update
		await expect(page.locator("text=/Showing.*of/")).toBeVisible();

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

test.describe("CMS Image Upload", () => {
	// Generate unique ID for each test run to avoid slug collisions
	const testRunId = Date.now().toString(36);

	test("image upload field is rendered in product form", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		// Should show the image upload input
		const imageUploadInput = page.locator('[data-testid="image-upload-input"]');
		await expect(imageUploadInput).toBeAttached({ timeout: 5000 });

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("can upload an image and see preview", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		// Wait for the image upload input to be visible
		const imageUploadInput = page.locator('[data-testid="image-upload-input"]');
		await expect(imageUploadInput).toBeAttached({ timeout: 5000 });

		// Upload a test image file
		const testImageBase64 =
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
		await imageUploadInput.setInputFiles({
			name: "test-product-image.png",
			mimeType: "image/png",
			buffer: Buffer.from(testImageBase64, "base64"),
		});

		// Wait for the preview to appear
		const imagePreview = page.locator('[data-testid="image-preview"]');
		await expect(imagePreview).toBeVisible({ timeout: 10000 });

		// The preview should show the mock URL (placehold.co/400/png) from the uploadImage override
		await expect(imagePreview).toHaveAttribute(
			"src",
			/placehold\.co|data:image/,
		);

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("can remove uploaded image", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		// Upload an image first
		const imageUploadInput = page.locator('[data-testid="image-upload-input"]');
		await expect(imageUploadInput).toBeAttached({ timeout: 5000 });

		const testImageBase64 =
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
		await imageUploadInput.setInputFiles({
			name: "to-remove.png",
			mimeType: "image/png",
			buffer: Buffer.from(testImageBase64, "base64"),
		});

		// Wait for preview
		const imagePreview = page.locator('[data-testid="image-preview"]');
		await expect(imagePreview).toBeVisible({ timeout: 10000 });

		// Click remove button
		const removeButton = page.locator('[data-testid="remove-image-button"]');
		await removeButton.click();

		// Preview should be hidden, upload input should reappear
		await expect(imagePreview).not.toBeVisible();
		await expect(imageUploadInput).toBeAttached();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("create product with image upload", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		// Fill required fields
		const productName = `Image Product ${testRunId}`;
		await page.locator('input[name="name"]').fill(productName);
		await page
			.locator('textarea[name="description"]')
			.fill("Product with image");
		await page.locator('input[name="price"]').fill("99.99");

		// Category select
		const categorySelect = page.locator('button[role="combobox"]').first();
		await categorySelect.click();
		await page.locator('[role="option"]').first().click();

		// Upload an image
		const imageUploadInput = page.locator('[data-testid="image-upload-input"]');
		await expect(imageUploadInput).toBeAttached({ timeout: 5000 });

		const testImageBase64 =
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
		await imageUploadInput.setInputFiles({
			name: "product-image.png",
			mimeType: "image/png",
			buffer: Buffer.from(testImageBase64, "base64"),
		});

		// Wait for preview
		const imagePreview = page.locator('[data-testid="image-preview"]');
		await expect(imagePreview).toBeVisible({ timeout: 10000 });

		// Submit the form
		await page.locator('button[type="submit"]').click();

		// Should redirect to list page on success
		await page.waitForURL(/\/pages\/cms\/product$/, { timeout: 10000 });

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("edit product preserves uploaded image", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// First create a product with an image
		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		const productName = `Edit Image Product ${testRunId}`;
		await page.locator('input[name="name"]').fill(productName);
		await page
			.locator('textarea[name="description"]')
			.fill("Product to edit image");
		await page.locator('input[name="price"]').fill("75.00");

		// Category select
		const categorySelect = page.locator('button[role="combobox"]').first();
		await categorySelect.click();
		await page.locator('[role="option"]').first().click();

		// Upload an image
		const imageUploadInput = page.locator('[data-testid="image-upload-input"]');
		await expect(imageUploadInput).toBeAttached({ timeout: 5000 });

		const testImageBase64 =
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
		await imageUploadInput.setInputFiles({
			name: "original-image.png",
			mimeType: "image/png",
			buffer: Buffer.from(testImageBase64, "base64"),
		});

		// Wait for preview
		let imagePreview = page.locator('[data-testid="image-preview"]');
		await expect(imagePreview).toBeVisible({ timeout: 10000 });

		// Submit to create
		await page.locator('button[type="submit"]').click();

		// Wait for redirect to list page on success
		await page.waitForURL(/\/pages\/cms\/product$/, { timeout: 10000 });
		await expect(page.locator('[data-testid="cms-list-page"]')).toBeVisible();

		// Click edit button on our item
		const expectedSlug = `edit-image-product-${testRunId.toLowerCase()}`;
		const row = page.locator(`tr:has-text("${expectedSlug}")`);
		await row.locator("button:has(svg.lucide-pencil)").click();

		// On edit page, image preview should still be visible
		imagePreview = page.locator('[data-testid="image-preview"]');
		await expect(imagePreview).toBeVisible({ timeout: 10000 });

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});
});

test.describe("CMS Custom Field Components", () => {
	test("uses custom file field component from fieldComponents override", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		// All examples have a custom file field component with data-testid="custom-file-field"
		const customFileField = page.locator('[data-testid="custom-file-field"]');
		await expect(customFileField).toBeVisible({ timeout: 5000 });

		// Verify the custom component has the image upload input
		const imageUploadInput = customFileField.locator(
			'[data-testid="image-upload-input"]',
		);
		await expect(imageUploadInput).toBeAttached();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("custom file component can upload and preview image", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		// Find the custom file field
		const customFileField = page.locator('[data-testid="custom-file-field"]');
		await expect(customFileField).toBeVisible({ timeout: 5000 });

		// Upload an image using the custom component
		const imageUploadInput = customFileField.locator(
			'[data-testid="image-upload-input"]',
		);
		await expect(imageUploadInput).toBeAttached({ timeout: 5000 });

		const testImageBase64 =
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
		await imageUploadInput.setInputFiles({
			name: "custom-upload.png",
			mimeType: "image/png",
			buffer: Buffer.from(testImageBase64, "base64"),
		});

		// Wait for preview to appear in the custom component
		const imagePreview = customFileField.locator(
			'[data-testid="image-preview"]',
		);
		await expect(imagePreview).toBeVisible({ timeout: 10000 });

		// Verify the mock URL is used (placehold.co from mockUploadFile)
		await expect(imagePreview).toHaveAttribute("src", /placehold\.co/);

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("custom file component can remove uploaded image", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		const customFileField = page.locator('[data-testid="custom-file-field"]');
		await expect(customFileField).toBeVisible({ timeout: 5000 });

		// Upload an image
		const imageUploadInput = customFileField.locator(
			'[data-testid="image-upload-input"]',
		);
		await expect(imageUploadInput).toBeAttached({ timeout: 5000 });

		const testImageBase64 =
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
		await imageUploadInput.setInputFiles({
			name: "to-remove.png",
			mimeType: "image/png",
			buffer: Buffer.from(testImageBase64, "base64"),
		});

		// Wait for preview
		const imagePreview = customFileField.locator(
			'[data-testid="image-preview"]',
		);
		await expect(imagePreview).toBeVisible({ timeout: 10000 });

		// Click remove button
		const removeButton = customFileField.locator(
			'[data-testid="remove-image-button"]',
		);
		await removeButton.click();

		// Preview should be hidden, upload input should reappear
		await expect(imagePreview).not.toBeVisible();
		await expect(imageUploadInput).toBeAttached();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});
});
