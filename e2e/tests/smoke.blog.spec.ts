import {
	expect,
	test,
	type Page,
	type APIRequestContext,
} from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

const emptySelector = '[data-testid="empty-state"]';
const errorSelector = '[data-testid="error-placeholder"]';

test.beforeEach(async ({ context }) => {
	await setMockAuthCookie(context);
});

test("posts page renders", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	await page.goto("/pages/blog", { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="home-page"]')).toBeVisible();
	await expect(page).toHaveTitle(/Blog/i);
	// Either posts list renders or empty state shows when no posts
	const emptyVisible = await page
		.locator(emptySelector)
		.isVisible()
		.catch(() => false);
	if (!emptyVisible) {
		await expect(page.getByTestId("page-header")).toBeVisible();
	}
	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("create post for detail page test", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	// Navigate to the new post page
	await page.goto("/pages/blog/new", { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="new-post-page"]')).toBeVisible();

	// Fill out the form
	// Title field
	await page.getByLabel("Title").fill("Hello World");

	// Slug field
	await page.getByLabel("Slug").fill("hello-world");

	// Excerpt field
	await page.getByLabel("Excerpt").fill("Hello World description");

	// Wait for markdown editor to load and fill content
	// The editor is lazy-loaded, so we wait for the container
	await page.waitForSelector(".milkdown-custom", { state: "visible" });
	// Wait a bit more for the editor to be fully initialized
	await page.waitForTimeout(1000);
	// Find the contenteditable element inside the editor
	const editor = page
		.locator(".milkdown-custom")
		.locator("[contenteditable]")
		.first();
	await editor.click();
	// For ProseMirror editors, select all (works on both Mac and Windows)
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
	await editor.pressSequentially("Hello World content", { delay: 50 });

	// Toggle the Published switch
	// Find the switch button within the form-item that contains "Published" label
	const publishedSwitch = page
		.locator('[data-slot="form-item"]')
		.filter({ hasText: "Published" })
		.getByRole("switch");
	await expect(publishedSwitch).toBeVisible();
	await publishedSwitch.click();

	// Submit the form
	await page.getByRole("button", { name: /^Create Post$/i }).click();

	// Wait for navigation to /pages/blog
	await page.waitForURL("**/pages/blog", { timeout: 10000 });
	await page.waitForLoadState("networkidle");

	// Verify we're on the blog home page
	await expect(page.locator('[data-testid="home-page"]')).toBeVisible();

	// Verify the new post card with title "Hello World" is visible
	await expect(
		page
			.locator('[data-slot="card-title"]')
			.filter({ hasText: /^Hello World$/ }),
	).toBeVisible({
		timeout: 10000,
	});

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("load more button on home page", async ({ page, request }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	// Create 12 unique published posts via API calls
	await createPosts(request, 12, { published: true });

	// Test load more functionality
	await testLoadMore(page, 12, {
		pagePath: "/pages/blog",
		pageTestId: "home-page",
		visibleStart: 12,
		visibleEnd: 3,
		notVisibleStart: 2,
		notVisibleEnd: 1,
	});
});

test("load more button on drafts page", async ({ page, request }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	// Create 12 unique draft posts via API calls
	await createPosts(request, 12, {
		published: false,
		titlePrefix: "Draft Test Post",
	});

	// Test load more functionality
	await testLoadMore(page, 12, {
		pagePath: "/pages/blog/drafts",
		pageTestId: "drafts-home-page",
		visibleStart: 12,
		visibleEnd: 3,
		notVisibleStart: 2,
		notVisibleEnd: 1,
		titlePrefix: "Draft Test Post",
	});
});

test("post detail page renders", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	await page.goto("/pages/blog/hello-world", { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="post-page"]')).toBeVisible();
	await expect(page).toHaveTitle(/Hello World/i);
	// Shows post content or empty placeholder when slug not found
	const notFound = await page
		.locator(emptySelector)
		.isVisible()
		.catch(() => false);
	if (!notFound) {
		await expect(page.getByTestId("page-title")).toBeVisible();
	}
	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("sitemap.xml includes blog pages", async ({ request }) => {
	const response = await request.get("/sitemap.xml");
	expect(response.ok()).toBeTruthy();
	const contentType = response.headers()["content-type"];
	expect(contentType).toContain("xml");

	const xmlText = await response.text();
	expect(xmlText).toContain("/pages/blog");
	expect(xmlText).toContain("/pages/blog/hello-world");
});

test("edit post page renders", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	await page.goto("/pages/blog/hello-world/edit", { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="edit-post-page"]')).toBeVisible();
	await expect(page).toHaveTitle(/Edit: Hello World/i);
	// Edit form should render or empty state if post is missing
	const maybeEmpty = await page
		.locator(emptySelector)
		.isVisible()
		.catch(() => false);
	if (!maybeEmpty) {
		await expect(page.getByTestId("page-header")).toBeVisible();
	}
	// expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([])
});

test("new post page renders", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	await page.goto("/pages/blog/new", { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="new-post-page"]')).toBeVisible();
	await expect(page).toHaveTitle(/Create New Post/i);
	// New page should not be an error; header should be present
	await expect(page.getByTestId("page-header")).toBeVisible();
	// expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([])
});

test("drafts page renders", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	await page.goto("/pages/blog/drafts", { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="drafts-home-page"]')).toBeVisible();
	await expect(page).toHaveTitle(/Draft Posts/i);
	// Either drafts render or empty state appears when none exist
	const maybeEmpty = await page
		.locator(emptySelector)
		.isVisible()
		.catch(() => false);
	if (!maybeEmpty) {
		await expect(page.getByTestId("page-header")).toBeVisible();
	}
	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("unknown page state renders", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	await page.goto("/pages/blog/unknown", { waitUntil: "networkidle" });
	await expect(page.locator(emptySelector)).toBeVisible();
	await expect(page).toHaveTitle(/(Unknown route|Post: unknown)/i);
	// Unknown slug should render empty-state or error placeholder; wait for either to appear
	await expect(
		page.locator(`${emptySelector}, ${errorSelector}`),
	).toBeVisible();
	// expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([])
});

test("unknown edit page state renders", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	await page.goto("/pages/blog/unknown/edit", { waitUntil: "networkidle" });
	await expect(page.locator(emptySelector)).toBeVisible();
	await expect(page).toHaveTitle(/(Unknown route|Editing: unknown)/i);
	// Unknown edit page should render empty-state or error placeholder; wait for either to appear
	await expect(
		page.locator(`${emptySelector}, ${errorSelector}`),
	).toBeVisible();
	// expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([])
});

test("post navigation buttons", async ({ page, request }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	// This test assumes posts from "load more button on home page" test exist
	// Navigate to the latest post (test-post-12 from the other test)
	// Posts are LIFO (newest first), so the latest post will be "test-post-12"
	await page.goto("/pages/blog/test-post-12", { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="post-page"]')).toBeVisible();

	// Wait for navigation component to load (it uses intersection observer)
	// Scroll down to trigger the intersection observer
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await page.waitForTimeout(500); // Allow time for intersection observer to trigger

	// Initially, the latest post should only have a "Previous" button
	const previousLink = page.locator('[data-testid="previous-post-link"]');
	const nextLink = page.locator('[data-testid="next-post-link"]');

	// Verify only one button is visible (previous)
	await expect(previousLink).toBeVisible({ timeout: 5000 });
	await expect(nextLink).not.toBeVisible();

	// Click the previous button to navigate to the previous post
	await previousLink.click();
	await page.waitForLoadState("networkidle");

	// Verify we're on a new post page
	await expect(page.locator('[data-testid="post-page"]')).toBeVisible();

	// Scroll down again to trigger intersection observer for the new page
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await page.waitForTimeout(500);

	// Now both buttons should be visible (we're in the middle of the posts)
	const previousLinkAfterNav = page.locator(
		'[data-testid="previous-post-link"]',
	);
	const nextLinkAfterNav = page.locator('[data-testid="next-post-link"]');

	await expect(previousLinkAfterNav).toBeVisible({ timeout: 5000 });
	await expect(nextLinkAfterNav).toBeVisible({ timeout: 5000 });

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("recent posts carousel", async ({ page, request }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	// This test assumes posts from "load more button on home page" test exist
	// Navigate to a post page (test-post-12 from the other test)
	await page.goto("/pages/blog/test-post-12", { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="post-page"]')).toBeVisible();

	// Scroll down to trigger the intersection observer for the carousel
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await page.waitForTimeout(500); // Allow time for intersection observer to trigger

	// Verify the recent posts carousel is visible
	const carousel = page.locator('[data-testid="recent-posts-carousel"]');
	await expect(carousel).toBeVisible({ timeout: 5000 });

	// Verify carousel contains posts
	// Check for carousel items (should have at least one post card)
	const carouselItems = carousel.locator('[data-slot="carousel-item"]');
	await expect(carouselItems.first()).toBeVisible();

	// Count the number of visible posts (should be up to 5)
	const itemCount = await carouselItems.count();
	expect(itemCount).toBeGreaterThan(0);
	expect(itemCount).toBeLessThanOrEqual(5);

	// Verify carousel navigation buttons are visible
	const prevButton = carousel.locator('[data-slot="carousel-previous"]');
	const nextButton = carousel.locator('[data-slot="carousel-next"]');

	// Check if navigation buttons are in the DOM
	await expect(prevButton).toBeAttached();
	await expect(nextButton).toBeAttached();

	// The next button should be enabled (assuming there are multiple posts)
	// The previous button might be disabled initially
	if (itemCount > 1) {
		// Try to click the next button to navigate
		await nextButton.click();
		await page.waitForTimeout(300); // Allow time for carousel animation

		// After clicking next, previous button should be enabled
		await expect(prevButton).toBeEnabled();
	}

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("search functionality", async ({ page, request }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	// Create some posts with distinct titles for search testing
	await createPost(request, {
		title: "Search Test Post Alpha",
		content: "Content for alpha post",
		excerpt: "Excerpt for alpha post",
		slug: "search-test-post-alpha",
		published: true,
		publishedAt: new Date().toISOString(),
		image: "",
	});

	await createPost(request, {
		title: "Search Test Post Beta",
		content: "Content for beta post",
		excerpt: "Excerpt for beta post",
		slug: "search-test-post-beta",
		published: true,
		publishedAt: new Date().toISOString(),
		image: "",
	});

	await createPost(request, {
		title: "Search Test Post Gamma",
		content: "Content for gamma post",
		excerpt: "Excerpt for gamma post",
		slug: "search-test-post-gamma",
		published: true,
		publishedAt: new Date().toISOString(),
		image: "",
	});

	// Navigate to blog page
	await page.goto("/pages/blog", { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="home-page"]')).toBeVisible();

	// Click the search button
	const searchButton = page.locator('[data-testid="search-button"]');
	await expect(searchButton).toBeVisible();
	await searchButton.click();

	// Verify the search modal becomes visible
	// The modal is rendered as a dialog with role="dialog" and data-slot="dialog-content"
	// Wait for the search input to appear (which confirms the modal is open)
	const searchInput = page.locator('[data-testid="search-input"]');
	await expect(searchInput).toBeVisible({ timeout: 5000 });

	// Also verify the dialog element itself is visible
	const searchModal = page.locator(
		'div[role="dialog"][data-slot="dialog-content"]',
	);
	await expect(searchModal).toBeVisible();

	// Type a case-sensitive title of a real item into the search input
	// Using "Search Test Post" to match multiple posts
	await searchInput.fill("Search Test Post");

	// Wait 3 seconds for search results to load
	await page.waitForTimeout(3000);

	// Verify a bunch of search results are visible
	const searchResults = page.locator('[data-testid="search-result"]');
	const resultCount = await searchResults.count();
	expect(resultCount).toBeGreaterThan(0);
	await expect(searchResults.first()).toBeVisible();

	// Clear the input
	await searchInput.clear();

	// Type a non-existing title
	await searchInput.fill("NonExistentPostTitleXYZ123");

	// Wait 3 seconds for search results to update
	await page.waitForTimeout(3000);

	// Verify no search results are visible
	await expect(searchResults).toHaveCount(0, { timeout: 5000 });

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("tag page renders", async ({ page, request }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	const tagSlug = "react";
	const postWithTag = await createPost(request, {
		title: "Tag Test Post",
		content: "Content for tag test post",
		excerpt: "Excerpt for tag test post",
		slug: "tag-test-post",
		published: true,
		publishedAt: new Date().toISOString(),
		image: "",
	});

	await request.put(`/api/data/posts/${postWithTag.id}`, {
		headers: {
			...mockAuthHeaders(),
			"content-type": "application/json",
		},
		data: {
			...postWithTag,
			tags: [{ name: "React" }],
		},
	});

	await page.goto(`/pages/blog/tag/${tagSlug}`, {
		waitUntil: "networkidle",
	});
	await expect(page.locator('[data-testid="tag-page"]')).toBeVisible();
	await expect(page).toHaveTitle(/React Posts/i);

	const maybeEmpty = await page
		.locator(emptySelector)
		.isVisible()
		.catch(() => false);
	if (!maybeEmpty) {
		await expect(page.getByTestId("page-header")).toBeVisible();
		await expect(
			page
				.locator('[data-slot="card-title"]')
				.filter({ hasText: /^Tag Test Post$/ }),
		).toBeVisible();
	}

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("tag badges appear on post detail page", async ({ page, request }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	const tagSlug = "javascript";
	const postWithTag = await createPost(request, {
		title: "Post Detail With Tags",
		content: "Content for post detail with tags",
		excerpt: "Excerpt for post detail with tags",
		slug: "post-detail-with-tags",
		published: true,
		publishedAt: new Date().toISOString(),
		image: "",
	});

	await request.put(`/api/data/posts/${postWithTag.id}`, {
		headers: {
			...mockAuthHeaders(),
			"content-type": "application/json",
		},
		data: {
			...postWithTag,
			tags: [{ name: "JavaScript" }],
		},
	});

	await page.goto("/pages/blog/post-detail-with-tags", {
		waitUntil: "networkidle",
	});
	await expect(page.locator('[data-testid="post-page"]')).toBeVisible();

	const tagBadge = page.getByText("JavaScript", { exact: true });
	await expect(tagBadge).toBeVisible({ timeout: 5000 });

	await tagBadge.click();
	await page.waitForURL(`**/pages/blog/tag/${tagSlug}`, { timeout: 10000 });
	await expect(page.locator('[data-testid="tag-page"]')).toBeVisible();

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("unknown tag page state renders", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	await page.goto("/pages/blog/tag/unknown", { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="tag-page"]')).toBeVisible();
	await expect(page).toHaveTitle(/unknown Posts|Unknown route/i);

	const maybeEmpty = await page
		.locator(emptySelector)
		.isVisible()
		.catch(() => false);
	if (!maybeEmpty) {
		await expect(page.getByTestId("page-header")).toBeVisible();
	}

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("delete post from edit page", async ({ page, request }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	// Create a post to delete
	const postToDelete = await createPost(request, {
		title: "Post To Delete",
		content: "This post will be deleted",
		excerpt: "Excerpt for post to delete",
		slug: "post-to-delete-test",
		published: true,
		publishedAt: new Date().toISOString(),
		image: "",
	});

	// Navigate to the edit page
	await page.goto(`/pages/blog/${postToDelete.slug}/edit`, {
		waitUntil: "networkidle",
	});
	await expect(page.locator('[data-testid="edit-post-page"]')).toBeVisible();

	// Click the delete button
	const deleteButton = page.getByRole("button", {
		name: /delete post/i,
	});
	await expect(deleteButton).toBeVisible();
	await deleteButton.click();

	// Wait for the alert dialog to appear
	const alertDialog = page.locator(
		'div[role="alertdialog"][data-slot="alert-dialog-content"]',
	);
	await expect(alertDialog).toBeVisible({ timeout: 5000 });

	// Verify the dialog content
	await expect(
		page.getByText("Are you sure you want to delete this post?"),
	).toBeVisible();

	// Click the confirm delete button in the dialog
	const confirmButton = page
		.locator('div[role="alertdialog"][data-slot="alert-dialog-content"]')
		.getByRole("button", { name: /^delete$/i });
	await expect(confirmButton).toBeVisible();
	await confirmButton.click();

	// Wait for navigation to /pages/blog
	await page.waitForURL("**/pages/blog", { timeout: 10000 });
	await page.waitForLoadState("networkidle");

	// Verify we're on the blog home page
	await expect(page.locator('[data-testid="home-page"]')).toBeVisible();

	// Verify the deleted post no longer appears
	await expect(
		page
			.locator('[data-slot="card-title"]')
			.filter({ hasText: /^Post To Delete$/ }),
	).not.toBeVisible();

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

// Helper function to create a single post with custom data

async function createPost(
	request: APIRequestContext,
	data: {
		title: string;
		content: string;
		excerpt: string;
		slug: string;
		published: boolean;
		publishedAt?: string;
		image?: string;
	},
) {
	const response = await request.post("/api/data/posts", {
		headers: {
			...mockAuthHeaders(),
			"content-type": "application/json",
		},
		data: {
			title: data.title,
			content: data.content,
			excerpt: data.excerpt,
			slug: data.slug,
			published: data.published,
			publishedAt:
				data.publishedAt ??
				(data.published ? new Date().toISOString() : undefined),
			image: data.image ?? "",
		},
	});
	expect(response.ok()).toBeTruthy();
	const post = await response.json();
	expect(post.slug).toBe(data.slug);
	expect(post.title).toBe(data.title);
	//fake wait for 1 second
	await new Promise((resolve) => setTimeout(resolve, 1000));
	return post;
}

// Helper function to create multiple posts
async function createPosts(
	request: APIRequestContext,
	count: number,
	options: { published?: boolean; titlePrefix?: string } = {},
) {
	const { published = true, titlePrefix = "Test Post" } = options;
	const posts = [];
	for (let i = 1; i <= count; i++) {
		const post = await createPost(request, {
			title: `${titlePrefix} ${i}`,
			content: `This is the content for ${titlePrefix.toLowerCase()} ${i}`,
			excerpt: `Description for ${titlePrefix.toLowerCase()} ${i}`,
			slug: `${titlePrefix.toLowerCase().replace(/\s+/g, "-")}-${i}`,
			published: published,
			publishedAt: published ? new Date().toISOString() : undefined,
			image: "",
		});
		posts.push(post);
	}
	return posts;
}

// Helper function to test load more functionality
async function testLoadMore(
	page: Page,
	count: number,
	options: {
		pagePath: string;
		pageTestId: string;
		visibleStart: number;
		visibleEnd: number;
		notVisibleStart?: number;
		notVisibleEnd?: number;
		titlePrefix?: string;
	},
) {
	const {
		pagePath,
		pageTestId,
		visibleStart,
		visibleEnd,
		notVisibleStart,
		notVisibleEnd,
		titlePrefix = "Test Post",
	} = options;

	// Navigate to page
	await page.goto(pagePath, { waitUntil: "networkidle" });
	await expect(page.locator(`[data-testid="${pageTestId}"]`)).toBeVisible();

	// Verify initial posts are loaded (should be 10 per page by default)
	// Posts are displayed LIFO (newest first), so we should see posts in reverse order
	// Use exact matching to avoid matching "Test Post 1" with "Test Post 10", "Test Post 11", etc.
	for (let i = visibleStart; i >= visibleEnd; i--) {
		await expect(
			page
				.locator('[data-slot="card-title"]')
				.filter({ hasText: new RegExp(`^${titlePrefix} ${i}$`) }),
		).toBeVisible();
	}

	// Verify posts that should not be visible yet (they'll be on the second page)
	if (notVisibleStart !== undefined && notVisibleEnd !== undefined) {
		for (let i = notVisibleStart; i >= notVisibleEnd; i--) {
			await expect(
				page
					.locator('[data-slot="card-title"]')
					.filter({ hasText: new RegExp(`^${titlePrefix} ${i}$`) }),
			).not.toBeVisible();
		}
	}

	// Verify "Load more posts" button is visible
	const loadMoreButton = page.getByRole("button", { name: /load more posts/i });
	await expect(loadMoreButton).toBeVisible();

	// Click the load more button
	await loadMoreButton.click();

	// Verify all posts are now visible (still in LIFO order)
	for (let i = count; i >= 1; i--) {
		await expect(
			page
				.locator('[data-slot="card-title"]')
				.filter({ hasText: new RegExp(`^${titlePrefix} ${i}$`) }),
		).toBeVisible();
	}

	// Verify the load more button is no longer visible (since all posts are loaded)
	await expect(loadMoreButton).not.toBeVisible();
}
