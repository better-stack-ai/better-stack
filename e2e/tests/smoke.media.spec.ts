import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load the test image from fixtures once
const testImageBuffer = readFileSync(
	resolve(__dirname, "../fixtures/test-image.png"),
);

// Filter function for console errors: ignore network/resource 404s from image
// thumbnail loading (expected with local adapter in Next.js production mode).
// Only capture JS runtime errors.
function isRealConsoleError(text: string): boolean {
	if (text.startsWith("Failed to load resource:")) return false;
	return true;
}

// Helper: open media picker popover in the page
async function openMediaPicker(page: Page) {
	const triggerBtn = page.locator('[data-testid="open-media-picker"]').first();
	await expect(triggerBtn).toBeVisible({ timeout: 10000 });
	await triggerBtn.click();
	// Wait for the popover content to appear (Media Library header)
	await expect(page.getByText("Media Library")).toBeVisible({ timeout: 5000 });
}

// Helper: upload a file inside the open MediaPicker (Upload tab)
async function uploadInMediaPicker(page: Page) {
	// Switch to Upload tab
	await page.getByRole("tab", { name: /upload/i }).click();

	// Find the hidden file input inside the upload tab
	const fileInput = page.locator('[data-testid="media-upload-input"]').first();
	await expect(fileInput).toBeAttached({ timeout: 5000 });
	await fileInput.setInputFiles({
		name: "test-image.png",
		mimeType: "image/png",
		buffer: testImageBuffer,
	});

	// Wait for upload to complete — a thumbnail should appear in the Browse tab
	await page.getByRole("tab", { name: /browse/i }).click();
	// The uploaded asset should appear in the grid
	await expect(
		page.locator('[data-testid="media-asset-item"]').first(),
	).toBeVisible({ timeout: 15000 });
}

// Helper: select first asset and confirm
async function selectFirstAsset(page: Page) {
	const firstAsset = page.locator('[data-testid="media-asset-item"]').first();
	await expect(firstAsset).toBeVisible({ timeout: 10000 });
	await firstAsset.click();
	// Click the Select button in the footer (targeted by testid to avoid ambiguity)
	const selectBtn = page.locator('[data-testid="media-select-button"]');
	await expect(selectBtn).toBeVisible({ timeout: 3000 });
	await selectBtn.click();
	// Popover should close
	await expect(page.getByText("Media Library")).not.toBeVisible({
		timeout: 5000,
	});
}

test.describe("Media Plugin — direct upload via MediaPicker", () => {
	test("MediaPicker trigger is visible on blog new post page", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error" && isRealConsoleError(msg.text()))
				errors.push(msg.text());
		});

		await page.goto("/pages/blog/new", { waitUntil: "networkidle" });
		await expect(page.locator('[data-testid="new-post-page"]')).toBeVisible();

		// The image picker trigger should be visible adjacent to the markdown editor
		const trigger = page
			.locator('[data-testid="image-picker-trigger"]')
			.first();
		await expect(trigger).toBeVisible({ timeout: 10000 });

		expect(errors, `Console errors: \n${errors.join("\n")}`).toEqual([]);
	});

	test("MediaPicker trigger is visible on CMS product form", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error" && isRealConsoleError(msg.text()))
				errors.push(msg.text());
		});

		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		// The image picker trigger should be visible inside the file upload field
		const trigger = page
			.locator('[data-testid="image-picker-trigger"]')
			.first();
		await expect(trigger).toBeVisible({ timeout: 10000 });

		expect(errors, `Console errors: \n${errors.join("\n")}`).toEqual([]);
	});

	test("can upload image via MediaPicker on CMS product form and save it", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error" && isRealConsoleError(msg.text()))
				errors.push(msg.text());
		});

		const testRunId = Date.now().toString(36);
		const productName = `Media Test ${testRunId}`;

		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		// Fill required fields
		await page.locator('input[name="name"]').fill(productName);
		await page
			.locator('textarea[name="description"]')
			.fill("A product with media picker image");
		await page.locator('input[name="price"]').fill("49.99");

		// Category select (required)
		const categorySelect = page.locator('button[role="combobox"]').first();
		await categorySelect.click();
		await page.locator('[role="option"]').first().waitFor({ state: "visible" });
		await page.locator('[role="option"]').first().click();

		// Open the MediaPicker from inside the file upload field
		await openMediaPicker(page);

		// Upload an image via the Upload tab
		await uploadInMediaPicker(page);

		// Select the uploaded asset
		await selectFirstAsset(page);

		// After selection the image preview should appear
		const imagePreview = page.locator('[data-testid="image-preview"]');
		await expect(imagePreview).toBeVisible({ timeout: 10000 });

		// The preview src should be a real URL (from the local storage adapter), not a mock placeholder
		const previewSrc = await imagePreview.getAttribute("src");
		expect(previewSrc).toBeTruthy();
		expect(previewSrc).not.toContain("placehold.co");

		// Submit the form
		await page.locator('button[type="submit"]').click();
		await page.waitForURL(/\/pages\/cms\/product$/, { timeout: 15000 });

		expect(errors, `Console errors: \n${errors.join("\n")}`).toEqual([]);
	});

	test("can upload image via MediaPicker Upload tab on blog new post form", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error" && isRealConsoleError(msg.text()))
				errors.push(msg.text());
		});

		await page.goto("/pages/blog/new", { waitUntil: "networkidle" });
		await expect(page.locator('[data-testid="new-post-page"]')).toBeVisible();

		// Wait for markdown editor to load
		await page.waitForSelector(".milkdown-custom", { state: "visible" });
		await page.waitForTimeout(500);

		// Open the MediaPicker (trigger is adjacent to editor)
		await openMediaPicker(page);

		// Upload a new image
		await uploadInMediaPicker(page);

		// Select it — this inserts the image URL into the editor
		await selectFirstAsset(page);

		// The editor should now contain an image — verify via markdown content
		// (Milkdown renders images as <img> tags inside the contenteditable)
		await page.waitForTimeout(500);
		const editorImages = page.locator(".milkdown-custom [contenteditable] img");
		await expect(editorImages.first()).toBeVisible({ timeout: 10000 });

		// The image src should be a real URL (not a placeholder)
		const imgSrc = await editorImages.first().getAttribute("src");
		expect(imgSrc).toBeTruthy();
		expect(imgSrc).not.toContain("placehold.co");

		expect(errors, `Console errors: \n${errors.join("\n")}`).toEqual([]);
	});

	test("can select previously uploaded image from Browse tab", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error" && isRealConsoleError(msg.text()))
				errors.push(msg.text());
		});

		// Navigate to CMS product form
		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		// First upload an image via the MediaPicker UI so it appears in the Browse tab later
		await openMediaPicker(page);
		await uploadInMediaPicker(page);
		// Close the picker without selecting (click Cancel)
		await page
			.getByRole("button", { name: /cancel/i })
			.last()
			.click();
		await expect(page.getByText("Media Library")).not.toBeVisible({
			timeout: 5000,
		});

		// Fill required fields
		const testRunId = Date.now().toString(36);
		await page.locator('input[name="name"]').fill(`Browse Test ${testRunId}`);
		await page
			.locator('textarea[name="description"]')
			.fill("Testing browse tab");
		await page.locator('input[name="price"]').fill("9.99");

		const categorySelect = page.locator('button[role="combobox"]').first();
		await categorySelect.click();
		await page.locator('[role="option"]').first().waitFor({ state: "visible" });
		await page.locator('[role="option"]').first().click();

		// Reopen MediaPicker — the previously uploaded asset should appear in Browse tab
		await openMediaPicker(page);

		// The previously uploaded asset should be visible in the Browse grid
		const assetItem = page.locator('[data-testid="media-asset-item"]').first();
		await expect(assetItem).toBeVisible({ timeout: 10000 });

		// Select it
		await selectFirstAsset(page);

		// Preview should appear
		const imagePreview = page.locator('[data-testid="image-preview"]');
		await expect(imagePreview).toBeVisible({ timeout: 10000 });

		const previewSrc = await imagePreview.getAttribute("src");
		expect(previewSrc).toBeTruthy();
		expect(previewSrc).not.toContain("placehold.co");

		expect(errors, `Console errors: \n${errors.join("\n")}`).toEqual([]);
	});

	test("can paste a URL via MediaPicker URL tab on CMS form", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error" && isRealConsoleError(msg.text()))
				errors.push(msg.text());
		});

		const testUrl = "https://placehold.co/200/png";

		await page.goto("/pages/cms/product/new", { waitUntil: "networkidle" });

		// Open MediaPicker
		await openMediaPicker(page);

		// Switch to URL tab
		await page.getByRole("tab", { name: /url/i }).click();

		// Fill in the URL input
		const urlInput = page.locator('[data-testid="media-url-input"]');
		await expect(urlInput).toBeVisible({ timeout: 5000 });
		await urlInput.fill(testUrl);

		// Confirm
		await page.getByRole("button", { name: /use url/i }).click();

		// Popover closes and preview is shown
		await expect(page.getByText("Media Library")).not.toBeVisible({
			timeout: 5000,
		});
		const imagePreview = page.locator('[data-testid="image-preview"]');
		await expect(imagePreview).toBeVisible({ timeout: 5000 });
		await expect(imagePreview).toHaveAttribute("src", testUrl);

		expect(errors, `Console errors: \n${errors.join("\n")}`).toEqual([]);
	});
});
