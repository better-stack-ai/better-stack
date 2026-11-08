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
		await page.getByTestId("search-input").fill("uNiFiEd SeArCh");
		const highlightedResult = page
			.getByTestId("search-result")
			.filter({ hasText: published.title });
		await expect(highlightedResult.locator("mark")).toHaveText([
			"Unified Search",
			"Unified Search",
		]);
		await page.reload();
		await expect(highlightedResult.locator("mark")).toHaveText([
			"Unified Search",
			"Unified Search",
		]);
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

const searchRows = [1, 2].map((id) => ({
	key: `blog:${id}`,
	sourceId: "blog",
	resourceId: String(id),
	sourceLabel: "Blog",
	title: `Result ${id} ${"longword".repeat(18)} Peptide.+(x)`,
	snippet: "Literal <b>Peptide.+(x)</b>; peptide.+(X) again.",
	href: `/pages/search?q=selected-${id}`,
}));
const searchResponse = (items = searchRows, page = 1) => ({
	items,
	sources: [{ id: "blog", label: "Blog" }],
	page,
	limit: 20,
	hasMore: page === 1 && items.length > 0,
	nextPage: page === 1 && items.length > 0 ? 2 : null,
	truncated: false,
});

for (const viewport of [
	{ width: 1280, height: 900 },
	{ width: 320, height: 568 },
]) {
	test(`embedded dialog keeps accessible states, customization and local filters at ${viewport.width}px`, async ({
		page,
		context,
		request,
	}, testInfo) => {
		await page.setViewportSize(viewport);
		await page.emulateMedia({ reducedMotion: "reduce" });
		await setMockAuthCookie(context);
		const post = await createSearchPost(request, true);
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		let release!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		let fail = true;
		const queries: URL[] = [];
		await page.route("**/api/data/search?**", async (route) => {
			const url = new URL(route.request().url());
			queries.push(url);
			const q = url.searchParams.get("q");
			if (q === "Delayed") await pending;
			if (q === "Error" && fail)
				return route.fulfill({ status: 503, json: { message: "Unavailable" } });
			if (q === "Malformed" && fail)
				return route.fulfill({ json: { items: [], sources: null } });
			await route.fulfill({
				json: searchResponse(
					!q || q === "Empty" ? [] : searchRows,
					Number(url.searchParams.get("page") ?? 1),
				),
			});
		});
		try {
			await page.goto("/pages/blog?q=host&sources=application&page=2&keep=one");
			const hostURL = page.url();
			const trigger = page.getByTestId("search-button");
			await trigger.click();
			const dialog = page.getByRole("dialog");
			const input = dialog.getByTestId("search-input");
			const listbox = dialog.getByRole("listbox");
			await expect(input).toBeFocused();
			await expect(input).toHaveValue("");
			const delayed = page.waitForRequest(
				(request) => new URL(request.url()).searchParams.get("q") === "Delayed",
			);
			await input.fill("Delayed");
			await delayed;
			await expect(dialog.getByRole("status")).toContainText("Searching…");
			const announcement = await dialog.getByRole("status").elementHandle();
			await expect(dialog.getByTestId("custom-search-loading")).toBeVisible();
			await expect(listbox).toHaveAttribute("aria-busy", "true");
			await expect(
				listbox.locator('[role="status"], [role="alert"], button'),
			).toHaveCount(0);
			release();
			await expect(dialog.getByRole("option")).toHaveCount(2);
			await expect(dialog.getByTestId("custom-search-row")).toHaveCount(2);
			await expect(dialog.getByRole("status")).toContainText(
				"2 results on this page.",
			);
			await expect(dialog.getByLabel("Source", { exact: true })).toHaveCount(0);
			await dialog.getByRole("button", { name: "Next page" }).click();
			await expect(dialog.getByText("Page 2", { exact: true })).toBeVisible();
			await expect(
				dialog.getByRole("button", { name: "Next page" }),
			).toBeDisabled();
			expect(page.url()).toBe(hostURL);
			expect(
				queries.every((url) => url.searchParams.get("sources") === "blog"),
			).toBe(true);
			const bounds = await dialog.boundingBox();
			expect(bounds!.y).toBeGreaterThanOrEqual(0);
			expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
			expect(
				await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
			).toBe(true);
			await testInfo.attach(`dialog-${viewport.width}`, {
				body: await dialog.screenshot(),
				contentType: "image/png",
			});
			await input.fill("  pEpTiDe.+(X)  ");
			await expect(
				dialog.getByTestId("custom-search-row").first().locator("mark"),
			).toHaveText(["Peptide.+(x)", "Peptide.+(x)", "peptide.+(X)"]);
			await expect(
				dialog.getByTestId("custom-search-row").first(),
			).toContainText("Literal <b>Peptide.+(x)</b>");
			await expect(
				dialog.getByTestId("custom-search-row").locator("b"),
			).toHaveCount(0);
			await testInfo.attach(`highlight-${viewport.width}`, {
				body: await dialog.screenshot(),
				contentType: "image/png",
			});
			await input.fill("unmatched phrase");
			await expect(dialog.getByRole("option")).toHaveCount(2);
			await expect(
				dialog.getByTestId("custom-search-row").locator("mark"),
			).toHaveCount(0);
			await input.fill("Empty");
			await expect(dialog.getByRole("status")).toHaveText("No results found.");
			expect(
				await announcement!.evaluate(
					(node) =>
						node.isConnected && node.textContent === "No results found.",
				),
			).toBe(true);
			await expect(listbox.getByRole("option")).toHaveCount(0);
			await expect(
				listbox.locator('[role="status"], [role="alert"], button'),
			).toHaveCount(0);
			for (const query of ["Error", "Malformed"]) {
				fail = true;
				await input.fill(query);
				await expect(dialog.getByRole("alert")).toContainText(
					"Search could not be completed.",
				);
				await expect(listbox.locator('[role="alert"], button')).toHaveCount(0);
				const retry = dialog.getByRole("button", { name: "Retry search" });
				await retry.focus();
				fail = false;
				await page.keyboard.press("Enter");
				await expect(input).toBeFocused();
				await expect(dialog.getByRole("option")).toHaveCount(2);
				await page.keyboard.press("ArrowDown");
				await expect(listbox.getByRole("option").nth(1)).toHaveAttribute(
					"aria-selected",
					"true",
				);
			}
			await page.keyboard.press("Escape");
			await expect(dialog).not.toBeVisible();
			await expect(trigger).toBeFocused();
			await trigger.click();
			await input.focus();
			await page.keyboard.press("ArrowDown");
			await expect(listbox.getByRole("option").nth(1)).toHaveAttribute(
				"aria-selected",
				"true",
			);
			await page.keyboard.press("Enter");
			await expect(page).toHaveURL(/\/pages\/search\?q=selected-2$/);
			await expect(dialog).not.toBeVisible();
			expect(errors).toEqual([]);
		} finally {
			release();
			const response = await request.delete(`/api/data/posts/${post.id}`, {
				headers: mockAuthHeaders(),
			});
			expect(response.ok()).toBeTruthy();
		}
	});
}

test("results page recovers from a malformed successful response", async ({
	page,
	context,
	request,
	baseURL,
}) => {
	const post = await createSearchPost(request, true);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await context.addCookies([
		{ name: "btst-search-malformed", value: "1", url: baseURL! },
	]);
	try {
		await page.goto("/pages/search?q=Unified");
		await expect(
			page.getByRole("button", { name: "Retry search" }),
		).toBeVisible();
		await context.clearCookies({ name: "btst-search-malformed" });
		await page.getByRole("button", { name: "Retry search" }).click();
		await expect(page.getByTestId("search-result")).toHaveCount(2);
		await page.goto("/pages/search?q=Unified&page=2");
		await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
		await expect(page.getByTestId("search-input")).toHaveValue("Unified");
		await page.getByRole("button", { name: "Previous page" }).click();
		await expect(page).not.toHaveURL(/page=2/);
		await expect(page.getByTestId("search-result")).toHaveCount(2);
		expect(errors).toEqual([]);
	} finally {
		await context.clearCookies({ name: "btst-search-malformed" });
		const response = await request.delete(`/api/data/posts/${post.id}`, {
			headers: mockAuthHeaders(),
		});
		expect(response.ok()).toBeTruthy();
	}
});
