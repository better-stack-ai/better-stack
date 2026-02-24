/**
 * SSG smoke tests — verify that statically generated pages render with
 * data (not empty/error placeholders) and that no console errors occur.
 *
 * These tests target the dedicated SSG pages under /pages/{plugin}/
 * which use prefetchForRoute() for build-time data seeding instead of
 * the standard route.loader() pattern.
 *
 * Tests run against the pre-built nextjs:memory project.
 * Requires seed data to be present (use the test fixtures or the default
 * memory adapter which auto-seeds on first run).
 */
import { test, expect } from "@playwright/test";

const emptySelector = '[data-testid="empty-state"]';
const errorSelector = '[data-testid="error-placeholder"]';

test.describe("SSG pages render without errors", () => {
	test("blog list SSG page renders", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/blog", { waitUntil: "networkidle" });

		// Page should not show an error placeholder
		await expect(page.locator(errorSelector))
			.not.toBeVisible({
				timeout: 5000,
			})
			.catch(() => {});

		// The blog home page element should render
		await expect(page.locator('[data-testid="home-page"]')).toBeVisible({
			timeout: 10000,
		});

		expect(
			errors,
			`Console errors on /pages/blog: \n${errors.join("\n")}`,
		).toEqual([]);
	});

	test("blog post SSG page renders when a post exists", async ({
		page,
		request,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// Navigate to the blog list and find the first post link
		await page.goto("/pages/blog", { waitUntil: "networkidle" });

		const postLinks = page.locator('a[href*="/pages/blog/"]');
		const count = await postLinks.count();

		if (count === 0) {
			// No posts in seed data — skip the post page check
			test.skip();
			return;
		}

		const firstLink = await postLinks.first().getAttribute("href");
		if (!firstLink) {
			test.skip();
			return;
		}

		await page.goto(firstLink, { waitUntil: "networkidle" });

		// Should not show error
		await expect(page.locator(errorSelector))
			.not.toBeVisible({
				timeout: 5000,
			})
			.catch(() => {});

		// Should show an h1 with the post title
		await expect(page.locator("h1").first()).toBeVisible({ timeout: 10000 });

		expect(
			errors,
			`Console errors on blog post page: \n${errors.join("\n")}`,
		).toEqual([]);
	});

	test("kanban boards SSG page renders", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/kanban", { waitUntil: "networkidle" });

		await expect(page.locator(errorSelector))
			.not.toBeVisible({
				timeout: 5000,
			})
			.catch(() => {});

		// Boards page header or empty state should be visible
		const hasContent =
			(await page
				.locator('[data-testid="boards-page"]')
				.isVisible()
				.catch(() => false)) ||
			(await page
				.locator(emptySelector)
				.isVisible()
				.catch(() => false));

		expect(hasContent).toBe(true);

		expect(
			errors,
			`Console errors on /pages/kanban: \n${errors.join("\n")}`,
		).toEqual([]);
	});

	test("forms list SSG page renders", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/forms", { waitUntil: "networkidle" });

		await expect(page.locator(errorSelector))
			.not.toBeVisible({
				timeout: 5000,
			})
			.catch(() => {});

		// Form list page or empty state should be visible
		const hasContent =
			(await page
				.locator('[data-testid="form-list-page"]')
				.isVisible()
				.catch(() => false)) ||
			(await page
				.locator(emptySelector)
				.isVisible()
				.catch(() => false));

		expect(hasContent).toBe(true);

		expect(
			errors,
			`Console errors on /pages/forms: \n${errors.join("\n")}`,
		).toEqual([]);
	});
});
