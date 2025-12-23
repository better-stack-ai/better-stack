import { test, expect, type Page } from "@playwright/test";

// Helper functions for finding form builder UI elements using data-testid
function getPalette(page: Page) {
	return page.getByTestId("form-builder-palette");
}

function getCanvas(page: Page) {
	return page.getByTestId("form-builder-canvas");
}

function getCanvasDropZone(page: Page) {
	return page.getByTestId("canvas-drop-zone");
}

function getPaletteItem(page: Page, itemName: string, exact = false) {
	return getPalette(page).getByText(itemName, { exact });
}

test.describe("Form Builder Plugin - Admin Pages", () => {
	// Generate unique ID for each test run to avoid slug collisions
	const testRunId = Date.now().toString(36);

	test("forms list page renders", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/forms", { waitUntil: "networkidle" });

		// Should show the forms list page with title (level 1 heading)
		await expect(
			page.getByRole("heading", { name: "Forms", level: 1 }),
		).toBeVisible();

		// Should show create button (it's a link styled as button) - take first since empty state also has one
		await expect(
			page.getByRole("link", { name: /new form/i }).first(),
		).toBeVisible();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("new form page renders with form builder", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/forms/new", { waitUntil: "networkidle" });

		// Should show form builder page with name input
		await expect(page.getByTestId("form-builder-page")).toBeVisible();
		await expect(page.getByPlaceholder("Enter form name")).toBeVisible();

		// Should show the form builder components palette
		await expect(
			page.getByRole("heading", { name: "Components" }),
		).toBeVisible();

		// Should show palette items (Email is always visible near top)
		await expect(page.getByText("Email", { exact: true })).toBeVisible();
		await expect(page.getByText("Text Area")).toBeVisible();

		// Should show empty canvas
		await expect(page.getByText("Drop components here")).toBeVisible();

		// Should show Create button
		await expect(page.getByRole("button", { name: "Create" })).toBeVisible();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("create form flow", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/forms/new", { waitUntil: "networkidle" });

		// Wait for the lazy-loaded form builder to finish loading
		await expect(page.getByTestId("form-builder-page")).toBeVisible({
			timeout: 30000,
		});

		// Fill in form name
		const formName = `Contact Form ${testRunId}`;
		await page.getByPlaceholder("Enter form name").fill(formName);

		// Find the Email item in the palette section
		const emailItem = getPaletteItem(page, "Email", true);
		await expect(emailItem).toBeVisible({ timeout: 5000 });

		// Find the canvas drop zone
		const dropZone = getCanvasDropZone(page);
		await expect(dropZone).toBeVisible();

		// Add an email field by dragging from palette to canvas
		await emailItem.dragTo(dropZone);

		// Wait for field to be added to canvas
		const canvas = getCanvas(page);
		await expect(
			canvas.getByText("Email", { exact: true }).first(),
		).toBeVisible();

		// Add a text area field
		const textAreaItem = getPaletteItem(page, "Text Area");
		await textAreaItem.dragTo(canvas);

		// Wait for text area field to be added
		await expect(canvas.getByText("Text Area").first()).toBeVisible();

		// Wait for schema state to update (Preview panel shows fields)
		await expect(
			page.getByRole("heading", { name: "Form Preview" }),
		).toBeVisible();
		await page.waitForTimeout(500); // Allow state to settle

		// Save the form
		await page.getByRole("button", { name: "Create" }).click();

		// Should show success toast
		await expect(page.locator("text=/created|saved/i")).toBeVisible({
			timeout: 10000,
		});

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("edit form flow", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// First create a form
		await page.goto("/pages/forms/new", { waitUntil: "networkidle" });
		await expect(page.getByTestId("form-builder-page")).toBeVisible({
			timeout: 30000,
		});

		const formName = `Edit Test Form ${testRunId}`;
		await page.getByPlaceholder("Enter form name").fill(formName);

		// Find palette items
		const emailItem = getPaletteItem(page, "Email", true);
		const dropZone = getCanvasDropZone(page);
		const canvas = getCanvas(page);

		// Add a field by dragging
		await expect(emailItem).toBeVisible({ timeout: 5000 });
		await emailItem.dragTo(dropZone);

		// Wait for field to be added
		await expect(
			canvas.getByText("Email", { exact: true }).first(),
		).toBeVisible();

		// Save the form - after creation we're redirected to edit page
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.locator("text=/created|saved/i")).toBeVisible({
			timeout: 10000,
		});

		// We should now be on the edit page - verify we can modify the form
		await expect(page.getByTestId("form-builder-page")).toBeVisible();
		await expect(page.getByPlaceholder("Enter form name")).toHaveValue(
			formName,
		);

		// Modify the form name
		await page.getByPlaceholder("Enter form name").fill(`${formName} Updated`);

		// Save changes
		await page.getByRole("button", { name: "Save" }).click();
		await expect(page.getByText("Form updated successfully")).toBeVisible({
			timeout: 10000,
		});

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("delete form flow", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// First create a form
		await page.goto("/pages/forms/new", { waitUntil: "networkidle" });
		await expect(page.getByTestId("form-builder-page")).toBeVisible({
			timeout: 30000,
		});

		const formName = `Delete Test Form ${testRunId}`;
		await page.getByPlaceholder("Enter form name").fill(formName);

		// Find palette items
		const emailItem = getPaletteItem(page, "Email", true);
		const dropArea = getCanvasDropZone(page);
		const canvasArea = getCanvas(page);

		// Add a field
		await expect(emailItem).toBeVisible({ timeout: 5000 });
		await emailItem.dragTo(dropArea);

		await expect(
			canvasArea.getByText("Email", { exact: true }).first(),
		).toBeVisible();

		// Save the form
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.locator("text=/created|saved/i")).toBeVisible({
			timeout: 10000,
		});

		// Navigate to forms list
		await page.goto("/pages/forms", { waitUntil: "networkidle" });

		// Find and click delete button on our form using the dropdown menu
		const expectedSlug = `delete-test-form-${testRunId.toLowerCase()}`;
		const row = page.locator(`tr:has-text("${expectedSlug}")`);
		await row.getByRole("button").click(); // Open dropdown menu
		await page.getByRole("menuitem", { name: "Delete" }).click();

		// Confirm deletion in the alert dialog
		await page.getByRole("button", { name: "Delete" }).click();

		// Should show success toast
		await expect(page.locator("text=/deleted/i")).toBeVisible({
			timeout: 10000,
		});

		// Form should no longer be visible
		await expect(row).not.toBeVisible();

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("view submissions page", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// First create a form
		await page.goto("/pages/forms/new", { waitUntil: "networkidle" });
		await expect(page.getByTestId("form-builder-page")).toBeVisible({
			timeout: 30000,
		});

		const formName = `Submissions Test Form ${testRunId}`;
		await page.getByPlaceholder("Enter form name").fill(formName);

		// Find palette items
		const emailItem = getPaletteItem(page, "Email", true);
		const dropArea = getCanvasDropZone(page);
		const canvasArea = getCanvas(page);

		// Add a field
		await expect(emailItem).toBeVisible({ timeout: 5000 });
		await emailItem.dragTo(dropArea);

		await expect(
			canvasArea.getByText("Email", { exact: true }).first(),
		).toBeVisible();

		// Save the form
		await page.getByRole("button", { name: "Create" }).click();
		await expect(page.locator("text=/created|saved/i")).toBeVisible({
			timeout: 10000,
		});

		// Navigate to forms list
		await page.goto("/pages/forms", { waitUntil: "networkidle" });

		// Find and click submissions button on our form using the dropdown menu
		const expectedSlug = `submissions-test-form-${testRunId.toLowerCase()}`;
		const row = page.locator(`tr:has-text("${expectedSlug}")`);
		await row.getByRole("button").click(); // Open dropdown menu
		await page.getByRole("menuitem", { name: "Submissions" }).click();

		// Should be on submissions page
		await expect(page.getByTestId("submissions-page")).toBeVisible();
		await expect(page.locator("h1")).toContainText(formName);

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});
});

test.describe("Form Builder - Form Creation", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/pages/forms/new", { waitUntil: "networkidle" });
		// Wait for lazy-loaded form builder to finish loading
		await expect(page.getByTestId("form-builder-page")).toBeVisible({
			timeout: 30000,
		});
	});

	// Helper to edit a field via dialog
	async function editField(
		page: Page,
		fieldText: string,
		config: Record<string, string>,
	) {
		const canvas = getCanvas(page);
		const fieldRow = canvas
			.locator('[class*="rounded-lg"]')
			.filter({ hasText: fieldText })
			.first();
		await fieldRow.hover();
		await fieldRow.locator("button").first().click();

		await expect(page.getByRole("dialog")).toBeVisible();

		for (const [label, value] of Object.entries(config)) {
			const input = page.getByLabel(label);
			if (label === "Required" || label === "Default Value") {
				await input.click();
			} else {
				await input.fill(value);
			}
		}

		await page.getByRole("button", { name: "Save Changes" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
	}

	test("should drag component from palette to canvas", async ({ page }) => {
		const emailItem = getPaletteItem(page, "Email", true);
		const dropArea = getCanvasDropZone(page);
		const canvas = getCanvas(page);

		await expect(emailItem).toBeVisible({ timeout: 5000 });
		await emailItem.dragTo(dropArea);

		// Verify field was added to canvas
		await expect(
			canvas.getByText("Email", { exact: true }).first(),
		).toBeVisible();
	});

	test("should edit field properties via dialog", async ({ page }) => {
		const emailItem = getPaletteItem(page, "Email", true);
		const dropArea = getCanvasDropZone(page);
		const canvas = getCanvas(page);

		await expect(emailItem).toBeVisible({ timeout: 5000 });
		await emailItem.dragTo(dropArea);

		await expect(
			canvas.getByText("Email", { exact: true }).first(),
		).toBeVisible();

		await editField(page, "Email", {
			"Label *": "Work Email",
			Placeholder: "work@company.com",
		});

		await expect(canvas.getByText("Work Email")).toBeVisible();
	});

	test("should delete a field", async ({ page }) => {
		const emailItem = getPaletteItem(page, "Email", true);
		const dropArea = getCanvasDropZone(page);
		const canvas = getCanvas(page);

		await expect(emailItem).toBeVisible({ timeout: 5000 });
		await emailItem.dragTo(dropArea);

		await expect(
			canvas.getByText("Email", { exact: true }).first(),
		).toBeVisible();

		const fieldRow = canvas
			.locator('[class*="rounded-lg"]')
			.filter({ hasText: "Email" })
			.first();
		await fieldRow.hover();

		// Click the delete button (second button, after edit)
		await fieldRow.locator("button").nth(1).click();

		// Canvas should now show empty state
		await expect(page.getByText("Drop components here")).toBeVisible();
	});

	test("should show form preview in the Preview tab", async ({ page }) => {
		const emailItem = getPaletteItem(page, "Email", true);
		const dropArea = getCanvasDropZone(page);
		const canvas = getCanvas(page);

		await expect(emailItem).toBeVisible({ timeout: 5000 });
		await emailItem.dragTo(dropArea);

		await expect(
			canvas.getByText("Email", { exact: true }).first(),
		).toBeVisible();

		// Preview tab should be visible by default or clickable
		await expect(page.getByRole("tab", { name: "Preview" })).toBeVisible();

		// Preview should show field
		await expect(
			page.getByRole("heading", { name: "No fields to preview" }),
		).not.toBeVisible();
	});

	test("should output valid JSON Schema in JSON Schema tab", async ({
		page,
	}) => {
		const emailItem = getPaletteItem(page, "Email", true);
		const dropArea = getCanvasDropZone(page);
		const canvas = getCanvas(page);

		await expect(emailItem).toBeVisible({ timeout: 5000 });
		await emailItem.dragTo(dropArea);

		await expect(
			canvas.getByText("Email", { exact: true }).first(),
		).toBeVisible();

		await editField(page, "Email", { "Label *": "Contact Email" });

		await page.getByRole("tab", { name: "JSON Schema" }).click();

		const jsonOutput = page.locator("pre").first();
		await expect(jsonOutput).toContainText('"type": "object"');
		await expect(jsonOutput).toContainText('"type": "string"');
		await expect(jsonOutput).toContainText('"format": "email"');
		await expect(jsonOutput).toContainText('"label": "Contact Email"');
	});

	test("should add checkbox field", async ({ page }) => {
		const checkboxItem = getPaletteItem(page, "Checkbox");
		const dropArea = getCanvasDropZone(page);
		const canvas = getCanvas(page);

		await expect(checkboxItem).toBeVisible({ timeout: 5000 });
		await checkboxItem.dragTo(dropArea);

		await expect(canvas.getByText("Checkbox").first()).toBeVisible();

		await editField(page, "Checkbox", { "Label *": "Accept Terms" });

		// Preview should show checkbox
		await expect(canvas.getByText("Accept Terms")).toBeVisible();
	});

	test("should set min/max on number field", async ({ page }) => {
		const numberItem = getPaletteItem(page, "Number", true);
		const dropArea = getCanvasDropZone(page);
		const canvas = getCanvas(page);

		await expect(numberItem).toBeVisible({ timeout: 5000 });
		await numberItem.dragTo(dropArea);

		await expect(canvas.getByText("Number").first()).toBeVisible();

		const fieldRow = canvas
			.locator('[class*="rounded-lg"]')
			.filter({ hasText: "Number" })
			.first();
		await fieldRow.hover();
		await fieldRow.locator("button").first().click();

		await page.getByLabel("Minimum").fill("10");
		await page.getByLabel("Maximum").fill("100");
		await page.getByRole("button", { name: "Save Changes" }).click();

		await page.getByRole("tab", { name: "JSON Schema" }).click();

		const jsonOutput = page.locator("pre").first();
		await expect(jsonOutput).toContainText('"minimum": 10');
		await expect(jsonOutput).toContainText('"maximum": 100');
	});

	test("should add date picker field", async ({ page }) => {
		const datePickerItem = getPaletteItem(page, "Date Picker");
		const dropArea = getCanvasDropZone(page);
		const canvas = getCanvas(page);

		await expect(datePickerItem).toBeVisible({ timeout: 5000 });
		await datePickerItem.dragTo(dropArea);

		await expect(canvas.getByText("Date Picker").first()).toBeVisible();

		await page.getByRole("tab", { name: "JSON Schema" }).click();

		const jsonOutput = page.locator("pre").first();
		await expect(jsonOutput).toContainText('"type": "string"');
		await expect(jsonOutput).toContainText('"format": "date-time"');
	});
});

test.describe("Form Builder - Public Form Submission", () => {
	const testRunId = Date.now().toString(36);

	test("public form page renders and submits", async ({ page, request }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// Create a form via API (status must be "active" not "published")
		const formSlug = `public-test-form-${testRunId}`;
		const schema = JSON.stringify({
			type: "object",
			properties: {
				name: {
					type: "string",
					label: "Your Name",
					inputProps: { placeholder: "Enter your name" },
				},
				email: {
					type: "string",
					format: "email",
					label: "Email Address",
				},
			},
			required: ["name", "email"],
		});

		const response = await request.post("/api/data/forms", {
			headers: { "content-type": "application/json" },
			data: {
				name: `Public Test Form ${testRunId}`,
				slug: formSlug,
				schema: schema,
				status: "active", // Must be "active" to accept submissions
			},
		});

		// Ensure the form was created successfully
		const responseText = await response.text();
		expect(
			response.ok(),
			`Form creation failed with status ${response.status()}: ${responseText}`,
		).toBe(true);

		// Navigate to public form page
		await page.goto(`/form-demo/${formSlug}`, { waitUntil: "networkidle" });

		// Wait for form to finish loading (loading state has "Loading form..." text)
		await expect(page.getByText("Loading form...")).not.toBeVisible({
			timeout: 15000,
		});

		// Should show form fields
		await expect(page.getByLabel("Your Name")).toBeVisible({ timeout: 10000 });
		await expect(page.getByLabel("Email Address")).toBeVisible();

		// Fill and submit the form
		await page.getByLabel("Your Name").fill("John Doe");
		await page.getByLabel("Email Address").fill("john@example.com");
		await page.getByRole("button", { name: "Submit" }).click();

		// Should show success message
		await expect(
			page.getByRole("heading", { name: "Form Submitted" }),
		).toBeVisible({
			timeout: 10000,
		});

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("public form shows validation errors", async ({ page, request }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// Create a form with required fields via API
		const formSlug = `validation-test-form-${testRunId}`;
		const schema = JSON.stringify({
			type: "object",
			properties: {
				name: {
					type: "string",
					label: "Your Name",
					minLength: 2,
				},
				email: {
					type: "string",
					format: "email",
					label: "Email Address",
				},
			},
			required: ["name", "email"],
		});

		await request.post("/api/data/forms", {
			headers: { "content-type": "application/json" },
			data: {
				name: `Validation Test Form ${testRunId}`,
				slug: formSlug,
				schema: schema,
				status: "active", // Must be "active" to accept submissions
			},
		});

		// Navigate to public form page
		await page.goto(`/form-demo/${formSlug}`, { waitUntil: "networkidle" });

		// Wait for form to load
		await expect(page.getByLabel("Your Name")).toBeVisible({ timeout: 10000 });

		// Try to submit without filling required fields
		await page.getByRole("button", { name: "Submit" }).click();

		// Should show validation error (form should stay on page)
		await page.waitForTimeout(500);
		await expect(page).toHaveURL(new RegExp(`/form-demo/${formSlug}`));

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("public form shows error for non-existent form", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			// Filter out expected 404 network errors when form is not found
			if (msg.type() === "error" && !msg.text().includes("404")) {
				errors.push(msg.text());
			}
		});

		// Navigate to non-existent form
		await page.goto("/form-demo/non-existent-form-slug", {
			waitUntil: "networkidle",
		});

		// Should show error message (use heading which is more specific)
		await expect(
			page.getByRole("heading", { name: "Form not found" }),
		).toBeVisible({
			timeout: 10000,
		});

		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);
	});
});
