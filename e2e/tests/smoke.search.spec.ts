import { expect, test, type APIRequestContext } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

async function createSearchPost(
	request: APIRequestContext,
	published: boolean,
) {
	const suffix = `${published ? "public" : "draft"}-${Date.now()}`;
	const response = await request.post("/api/data/posts", {
		headers: mockAuthHeaders(),
		data: {
			title: `Unified Search ${suffix}`,
			slug: `unified-search-${suffix}`,
			content: "Search provider visibility regression",
			excerpt: `Unified Search ${suffix} excerpt`,
			published,
			...(published ? { publishedAt: new Date().toISOString() } : {}),
		},
	});
	expect(response.ok()).toBeTruthy();
	return response.json();
}

test("unified discovery preserves URL state, source scoping and public visibility", async ({
	page,
	request,
	browser,
	baseURL,
}) => {
	const published = await createSearchPost(request, true);
	const draft = await createSearchPost(request, false);
	try {
		const response = await request.get("/api/data/search?q=Unified");
		expect(response.ok()).toBeTruthy();
		const result = await response.json();
		expect(result.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ sourceId: "blog", resourceId: published.id }),
				expect.objectContaining({
					sourceId: "application",
					title: "Unified Search Guide",
				}),
			]),
		);
		expect(JSON.stringify(result)).not.toContain(draft.title);
		expect(JSON.stringify(result)).not.toContain(draft.excerpt);

		const document = await request.get("/pages/search?q=Unified");
		expect(document.ok()).toBeTruthy();
		const html = await document.text();
		expect(html).toContain(published.title);
		expect(html).not.toContain(draft.title);

		const serverContext = await browser.newContext({
			javaScriptEnabled: false,
			baseURL,
		});
		try {
			const serverPage = await serverContext.newPage();
			await serverPage.goto("/pages/search?q=Unified");
			await expect(serverPage.getByTestId("search-input")).toHaveValue(
				"Unified",
			);
			const serverResult = serverPage
				.getByTestId("search-result")
				.filter({ hasText: published.title });
			// Streamed Suspense segments need inline JavaScript to become visible.
			await expect(serverResult).toBeAttached();
			await expect(serverResult).toHaveAttribute(
				"href",
				`/pages/blog/${published.slug}`,
			);
			await expect(serverResult).toContainText(published.excerpt);
			await expect(
				serverPage
					.getByTestId("search-result")
					.filter({ hasText: draft.title }),
			).toHaveCount(0);
		} finally {
			await serverContext.close();
		}

		await page.goto("/pages/search?q=Unified");
		await expect(
			page.getByTestId("search-result").filter({ hasText: published.title }),
		).toBeVisible();
		await expect(
			page
				.getByTestId("search-result")
				.filter({ hasText: "Unified Search Guide" }),
		).toBeVisible();
		await page.getByLabel("Source", { exact: true }).selectOption("blog");
		await expect(page).toHaveURL(/sources=blog/);
		await expect(
			page
				.getByTestId("search-result")
				.filter({ hasText: "Unified Search Guide" }),
		).toHaveCount(0);
		await expect(
			page.getByTestId("search-result").filter({ hasText: published.title }),
		).toBeVisible();
		await page.reload();
		await expect(page.getByLabel("Source", { exact: true })).toHaveValue(
			"blog",
		);
		await page
			.getByTestId("search-result")
			.filter({ hasText: published.title })
			.click();
		await expect(page).toHaveURL(new RegExp(`/pages/blog/${published.slug}$`));
	} finally {
		for (const post of [published, draft]) {
			const response = await request.delete(`/api/data/posts/${post.id}`, {
				headers: mockAuthHeaders(),
			});
			expect(response.ok()).toBeTruthy();
		}
	}
});

test("Blog discovery uses the shared dialog with a fixed source and keyboard navigation", async ({
	page,
	context,
	request,
}) => {
	await setMockAuthCookie(context);
	const post = await createSearchPost(request, true);
	try {
		await page.goto("/pages/blog");
		await page.getByTestId("search-button").click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		const input = dialog.getByTestId("search-input");
		await input.fill("Unified");
		await expect(
			dialog.getByTestId("search-result").filter({ hasText: post.title }),
		).toBeVisible();
		await expect(
			dialog
				.getByTestId("search-result")
				.filter({ hasText: "Unified Search Guide" }),
		).toHaveCount(0);
		await expect(dialog.getByLabel("Source", { exact: true })).toHaveCount(0);
		await page.keyboard.press("Escape");
		await expect(dialog).not.toBeVisible();
		await expect(page.getByTestId("search-button")).toBeFocused();
	} finally {
		const response = await request.delete(`/api/data/posts/${post.id}`, {
			headers: mockAuthHeaders(),
		});
		expect(response.ok()).toBeTruthy();
	}
});
