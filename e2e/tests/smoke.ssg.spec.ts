/**
 * Minimal smoke tests for SSG (Static Site Generation) pages.
 *
 * These tests verify that SSG pages render correctly. The list pages are
 * pre-rendered at build time (empty DB → may show empty state). Detail pages
 * for slugs NOT in generateStaticParams are rendered on-demand by Next.js
 * (dynamicParams defaults to true), which lets us test a freshly created post.
 *
 * Full cache-invalidation (revalidateTag / ISR) is covered by documentation
 * and is exercised in production where the cache can be observed across
 * requests. E2E tests focus on the page rendering contract.
 */
import { expect, test } from "@playwright/test";

const emptySelector = '[data-testid="empty-state"]';

test.describe("SSG Blog Pages", () => {
	test("ssg blog list page renders", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/ssg-blog", { waitUntil: "networkidle" });

		// Should render the blog home page component
		await expect(page.locator('[data-testid="home-page"]')).toBeVisible({
			timeout: 15000,
		});
		await expect(page).toHaveTitle(/Blog/i);

		// Either shows posts or empty state — both are valid for a static snapshot
		const emptyVisible = await page
			.locator(emptySelector)
			.isVisible()
			.catch(() => false);
		if (!emptyVisible) {
			await expect(page.getByTestId("page-header")).toBeVisible();
		}

		expect(errors, `Console errors: \n${errors.join("\n")}`).toEqual([]);
	});

	test("ssg blog post detail page renders for a newly created post", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		const slug = `ssg-smoke-${Date.now().toString(36)}`;
		const title = `SSG Smoke ${slug}`;

		// Create a published post via the regular (SSR) admin pages
		await page.goto("/pages/blog/new", { waitUntil: "networkidle" });
		await expect(page.locator('[data-testid="new-post-page"]')).toBeVisible({
			timeout: 15000,
		});

		// Click then fill — mirrors the pattern used in the working blog smoke tests
		await page.getByLabel("Title").click();
		await page.getByLabel("Title").fill(title);
		await expect(page.getByLabel("Title")).toHaveValue(title);

		await page.getByLabel("Slug").fill(slug);
		await page.getByLabel("Excerpt").fill("SSG smoke test excerpt");

		// ProseMirror/Milkdown requires select-all + pressSequentially; fill() alone
		// doesn't trigger the editor's change events and leaves the field empty.
		await page.waitForSelector(".milkdown-custom", { state: "visible" });
		await page.waitForTimeout(1000);
		const editor = page
			.locator(".milkdown-custom")
			.locator("[contenteditable]")
			.first();
		await editor.click();
		await page.evaluate(() => {
			const editorEl = document.querySelector(
				".milkdown-custom [contenteditable]",
			) as HTMLElement;
			if (editorEl) {
				const selection = window.getSelection();
				const range = document.createRange();
				range.selectNodeContents(editorEl);
				selection?.removeAllRanges();
				selection?.addRange(range);
			}
		});
		await editor.pressSequentially("SSG smoke test content.", { delay: 50 });

		// Publish the post
		const publishedSwitch = page
			.locator('[data-slot="form-item"]')
			.filter({ hasText: "Published" })
			.getByRole("switch");
		await expect(publishedSwitch).toBeVisible();
		await publishedSwitch.click();

		// Close any open dropdowns before submitting
		await page.keyboard.press("Escape");
		await page.getByRole("button", { name: /^Create Post$/i }).click();
		await page.waitForURL("**/pages/blog", { timeout: 10000 });
		await page.waitForLoadState("networkidle");

		// The SSG post detail page for a slug not in generateStaticParams is
		// rendered on-demand by Next.js (dynamicParams: true), so we can visit it
		// immediately and expect fresh content.
		await page.goto(`/pages/ssg-blog/${slug}`, { waitUntil: "networkidle" });
		await expect(page.locator('[data-testid="post-page"]')).toBeVisible({
			timeout: 15000,
		});
		await expect(page).toHaveTitle(new RegExp(title, "i"));

		expect(errors, `Console errors: \n${errors.join("\n")}`).toEqual([]);
	});

	test("ssg blog list shows updated content after revalidation", async ({
		page,
		request,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		const slug = `ssg-reval-${Date.now().toString(36)}`;
		const title = `SSG Reval ${slug}`;

		// Create a post directly via the API (faster than the form UI).
		// The blog API is at /api/data/posts (basePath="/api/data", plugin="blog").
		const createRes = await request.post(
			"http://localhost:3003/api/data/posts",
			{
				data: {
					title,
					slug,
					excerpt: "Revalidation test",
					content: "Content for revalidation test.",
					published: true,
				},
			},
		);
		expect(createRes.ok()).toBeTruthy();

		// The onPostCreated hook calls revalidatePath("/pages/ssg-blog"), which
		// purges the ISR cache immediately. The next request to /pages/ssg-blog
		// triggers a blocking regeneration using the loader (HTTP request).
		await page.goto("/pages/ssg-blog", { waitUntil: "networkidle" });

		await expect(page.locator('[data-testid="home-page"]')).toBeVisible();
		await expect(page.locator(`text=${title}`).first()).toBeVisible({
			timeout: 10000,
		});

		expect(errors, `Console errors: \n${errors.join("\n")}`).toEqual([]);
	});
});
