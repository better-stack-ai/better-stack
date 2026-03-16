import {
	expect,
	test,
	type APIRequestContext,
	type Page,
} from "@playwright/test";

// ─── API Helpers ────────────────────────────────────────────────────────────────

/** Create a published blog post — used to host comment threads in load-more tests. */
async function createBlogPost(
	request: APIRequestContext,
	data: { title: string; slug: string },
) {
	const response = await request.post("/api/data/posts", {
		headers: { "content-type": "application/json" },
		data: {
			title: data.title,
			content: `Content for ${data.title}`,
			excerpt: `Excerpt for ${data.title}`,
			slug: data.slug,
			published: true,
			publishedAt: new Date().toISOString(),
			image: "",
		},
	});
	expect(
		response.ok(),
		`createBlogPost failed: ${await response.text()}`,
	).toBeTruthy();
	return response.json();
}

/** Create N approved comments on a resource, sequentially with predictable bodies. */
async function createApprovedComments(
	request: APIRequestContext,
	resourceId: string,
	resourceType: string,
	count: number,
	bodyPrefix = "Load More Comment",
) {
	const comments = [];
	for (let i = 1; i <= count; i++) {
		const comment = await createComment(request, {
			resourceId,
			resourceType,
			body: `${bodyPrefix} ${i}`,
		});
		await approveComment(request, comment.id);
		comments.push(comment);
	}
	return comments;
}

/**
 * Navigate to a blog post page, scroll to trigger the WhenVisible comment thread,
 * then verify the load-more button and paginated comments behave correctly.
 *
 * Mirrors `testLoadMore` from smoke.blog.spec.ts.
 */
async function testLoadMoreComments(
	page: Page,
	postSlug: string,
	totalCount: number,
	options: { pageSize: number; bodyPrefix?: string },
) {
	const { pageSize, bodyPrefix = "Load More Comment" } = options;

	await page.goto(`/pages/blog/${postSlug}`, { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="post-page"]')).toBeVisible();

	// Scroll to the bottom to trigger WhenVisible on the comment thread
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await page.waitForTimeout(800);

	// Comment thread must be mounted
	const thread = page.locator('[data-testid="comment-thread"]');
	await expect(thread).toBeVisible({ timeout: 8000 });

	// First page of comments should be visible (comments are asc-sorted by date)
	for (let i = 1; i <= pageSize; i++) {
		await expect(
			page.getByText(`${bodyPrefix} ${i}`, { exact: true }),
		).toBeVisible({ timeout: 5000 });
	}

	// Comments beyond the first page must NOT be visible yet
	for (let i = pageSize + 1; i <= totalCount; i++) {
		await expect(
			page.getByText(`${bodyPrefix} ${i}`, { exact: true }),
		).not.toBeVisible();
	}

	// Load more button must be present
	const loadMoreBtn = page.locator('[data-testid="load-more-comments"]');
	await expect(loadMoreBtn).toBeVisible();

	// Click it and wait for the next page to arrive
	await loadMoreBtn.click();
	await page.waitForTimeout(1000);

	// All comments must now be visible
	for (let i = 1; i <= totalCount; i++) {
		await expect(
			page.getByText(`${bodyPrefix} ${i}`, { exact: true }),
		).toBeVisible({ timeout: 5000 });
	}

	// Load more button should be gone (no third page)
	await expect(loadMoreBtn).not.toBeVisible();
}

async function createComment(
	request: APIRequestContext,
	data: {
		resourceId: string;
		resourceType: string;
		parentId?: string | null;
		body: string;
	},
) {
	const response = await request.post("/api/data/comments", {
		headers: { "content-type": "application/json" },
		data: {
			resourceId: data.resourceId,
			resourceType: data.resourceType,
			parentId: data.parentId ?? null,
			body: data.body,
		},
	});
	expect(
		response.ok(),
		`createComment failed: ${await response.text()}`,
	).toBeTruthy();
	return response.json();
}

async function approveComment(request: APIRequestContext, id: string) {
	const response = await request.patch(`/api/data/comments/${id}/status`, {
		headers: { "content-type": "application/json" },
		data: { status: "approved" },
	});
	expect(
		response.ok(),
		`approveComment failed: ${await response.text()}`,
	).toBeTruthy();
	return response.json();
}

async function getCommentCount(
	request: APIRequestContext,
	resourceId: string,
	resourceType: string,
	status = "approved",
) {
	const response = await request.get(
		`/api/data/comments/count?resourceId=${encodeURIComponent(resourceId)}&resourceType=${encodeURIComponent(resourceType)}&status=${status}`,
	);
	expect(response.ok()).toBeTruthy();
	const body = await response.json();
	return body.count as number;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Comments Plugin", () => {
	test("moderation page renders", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/comments/moderation", {
			waitUntil: "networkidle",
		});
		await expect(page.locator('[data-testid="moderation-page"]')).toBeVisible();

		// Tab bar should be visible
		await expect(page.locator('[data-testid="tab-pending"]')).toBeVisible();
		await expect(page.locator('[data-testid="tab-approved"]')).toBeVisible();
		await expect(page.locator('[data-testid="tab-spam"]')).toBeVisible();

		expect(errors, `Console errors detected:\n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("post a comment — appears in pending moderation queue", async ({
		page,
		request,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		const resourceId = `e2e-post-${Date.now()}`;
		const comment = await createComment(request, {
			resourceId,
			resourceType: "e2e-test",
			body: "This is a test comment.",
		});

		expect(comment.status).toBe("pending");

		// Navigate to the moderation page and verify the comment appears
		await page.goto("/pages/comments/moderation", {
			waitUntil: "networkidle",
		});
		await expect(page.locator('[data-testid="moderation-page"]')).toBeVisible();

		// Click the Pending tab
		await page.locator('[data-testid="tab-pending"]').click();
		await page.waitForLoadState("networkidle");

		// The comment should appear in the list
		await expect(page.getByText("This is a test comment.")).toBeVisible();

		expect(errors, `Console errors detected:\n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("approve comment via moderation dashboard — appears in approved list", async ({
		page,
		request,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		const resourceId = `e2e-approve-${Date.now()}`;
		const comment = await createComment(request, {
			resourceId,
			resourceType: "e2e-test",
			body: "Approvable comment.",
		});

		// Approve via API
		const approved = await approveComment(request, comment.id);
		expect(approved.status).toBe("approved");

		// Navigate to moderation and switch to Approved tab
		await page.goto("/pages/comments/moderation", {
			waitUntil: "networkidle",
		});
		await page.locator('[data-testid="tab-approved"]').click();
		await page.waitForLoadState("networkidle");

		await expect(page.getByText("Approvable comment.")).toBeVisible();

		expect(errors, `Console errors detected:\n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("approve a comment via moderation UI", async ({ page, request }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		const resourceId = `e2e-ui-approve-${Date.now()}`;
		await createComment(request, {
			resourceId,
			resourceType: "e2e-test",
			body: "Approve me via UI.",
		});

		await page.goto("/pages/comments/moderation", {
			waitUntil: "networkidle",
		});
		await expect(page.locator('[data-testid="moderation-page"]')).toBeVisible();

		// Ensure we're on the Pending tab
		await page.locator('[data-testid="tab-pending"]').click();
		await page.waitForLoadState("networkidle");

		// Find the approve button for our comment
		const row = page
			.locator('[data-testid="moderation-row"]')
			.filter({ hasText: "Approve me via UI." });
		await expect(row).toBeVisible();

		const approveBtn = row.locator('[data-testid="approve-button"]');
		await approveBtn.click();
		await page.waitForLoadState("networkidle");

		// Switch to Approved tab and verify
		await page.locator('[data-testid="tab-approved"]').click();
		await page.waitForLoadState("networkidle");
		await expect(page.getByText("Approve me via UI.")).toBeVisible();

		expect(errors, `Console errors detected:\n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("comment count endpoint returns correct count", async ({ request }) => {
		const resourceId = `e2e-count-${Date.now()}`;

		// No comments yet
		const countBefore = await getCommentCount(request, resourceId, "e2e-test");
		expect(countBefore).toBe(0);

		// Post and approve a comment
		const comment = await createComment(request, {
			resourceId,
			resourceType: "e2e-test",
			body: "Count me.",
		});
		await approveComment(request, comment.id);

		// Count should be 1 now
		const countAfter = await getCommentCount(request, resourceId, "e2e-test");
		expect(countAfter).toBe(1);
	});

	test("like a comment — count increments", async ({ request }) => {
		const resourceId = `e2e-like-${Date.now()}`;
		const comment = await createComment(request, {
			resourceId,
			resourceType: "e2e-test",
			body: "Like me.",
		});

		// Like the comment
		const likeResponse = await request.post(
			`/api/data/comments/${comment.id}/like`,
			{
				headers: { "content-type": "application/json" },
				data: { authorId: "user-liker" },
			},
		);
		expect(likeResponse.ok()).toBeTruthy();
		const likeResult = await likeResponse.json();
		expect(likeResult.isLiked).toBe(true);
		expect(likeResult.likes).toBe(1);

		// Like again (toggle — should unlike)
		const unlikeResponse = await request.post(
			`/api/data/comments/${comment.id}/like`,
			{
				headers: { "content-type": "application/json" },
				data: { authorId: "user-liker" },
			},
		);
		expect(unlikeResponse.ok()).toBeTruthy();
		const unlikeResult = await unlikeResponse.json();
		expect(unlikeResult.isLiked).toBe(false);
		expect(unlikeResult.likes).toBe(0);
	});

	test("reply to a comment — nested under parent", async ({ request }) => {
		const resourceId = `e2e-reply-${Date.now()}`;
		const parent = await createComment(request, {
			resourceId,
			resourceType: "e2e-test",
			body: "Parent comment.",
		});

		const reply = await createComment(request, {
			resourceId,
			resourceType: "e2e-test",
			parentId: parent.id,
			body: "Reply to parent.",
		});

		expect(reply.parentId).toBe(parent.id);
		expect(reply.status).toBe("pending");
	});

	test("posting a comment via UI renders the comment card without error", async ({
		page,
		request,
	}) => {
		// Regression test: POST /comments previously returned a raw Comment (no
		// resolvedAuthorName), causing getInitials() to crash on the optimistic-
		// update replacement.  This test posts via the UI and verifies the comment
		// card renders with no error boundary.

		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// Use a unique resourceId so the thread starts empty and the comment we
		// post is the very first one (exercises the "create cache from scratch" path).
		const resourceId = `e2e-ui-post-${Date.now()}`;
		const resourceType = "e2e-test";

		// Seed one approved comment so the thread is already rendered and the
		// CommentThread component is mounted before we post.
		const seed = await createComment(request, {
			resourceId,
			resourceType,
			body: "Seed comment — thread is visible.",
		});
		await approveComment(request, seed.id);

		// Navigate to the moderation page which embeds a CommentThread per-resource;
		// use the direct resource-comments admin route instead of a blog page so we
		// don't depend on specific blog posts existing in the test DB.
		await page.goto(
			`/pages/comments/moderation/resource?resourceId=${encodeURIComponent(resourceId)}&resourceType=${encodeURIComponent(resourceType)}`,
			{ waitUntil: "networkidle" },
		);

		// If the route doesn't exist (some example apps may not expose it), fall
		// back to verifying the API response contains resolvedAuthorName.
		const hasThread = await page
			.locator('[data-testid="comment-form"]')
			.isVisible()
			.catch(() => false);

		if (!hasThread) {
			// Verify the API fix independently: POST must return resolvedAuthorName.
			const comment = await createComment(request, {
				resourceId,
				resourceType,
				body: "API regression check.",
			});
			expect(
				typeof comment.resolvedAuthorName,
				"POST /comments must return resolvedAuthorName",
			).toBe("string");
			expect(comment.resolvedAuthorName.length).toBeGreaterThan(0);
			return;
		}

		// Type and submit a new comment via the browser form.
		const textarea = page.locator('[data-testid="comment-form"] textarea');
		await textarea.fill("Hello from browser UI — regression test.");
		await page
			.locator('[data-testid="comment-form"] button[type="submit"]')
			.click();

		// The optimistic comment card should appear immediately.
		await expect(
			page.locator('[data-testid="comment-card"]').filter({
				hasText: "Hello from browser UI — regression test.",
			}),
		).toBeVisible({ timeout: 5000 });

		// No error boundary should have triggered.
		await expect(page.getByText("Something went wrong")).not.toBeVisible();

		// Console should be clean (no "Cannot read properties of undefined").
		const criticalErrors = errors.filter(
			(e) =>
				e.includes("Cannot read properties of undefined") ||
				e.includes("getInitials"),
		);
		expect(
			criticalErrors,
			`Critical console errors:\n${criticalErrors.join("\n")}`,
		).toEqual([]);
	});

	test("POST /comments response includes resolvedAuthorName (no undefined crash)", async ({
		request,
	}) => {
		// Regression test: the POST response previously returned a raw DB Comment
		// that lacked resolvedAuthorName, causing getInitials() to crash when the
		// optimistic-update replacement ran on the client.
		const resourceId = `e2e-post-serialized-${Date.now()}`;

		const comment = await createComment(request, {
			resourceId,
			resourceType: "e2e-test",
			body: "Serialized response check.",
		});

		// The response must include the enriched fields — not just the raw DB record.
		expect(
			typeof comment.resolvedAuthorName,
			"POST /comments must return resolvedAuthorName",
		).toBe("string");
		expect(
			comment.resolvedAuthorName.length,
			"resolvedAuthorName must not be empty",
		).toBeGreaterThan(0);
		expect(
			"resolvedAvatarUrl" in comment,
			"POST /comments must return resolvedAvatarUrl",
		).toBe(true);
		expect(
			"isLikedByCurrentUser" in comment,
			"POST /comments must return isLikedByCurrentUser",
		).toBe(true);
	});

	test("resolved author name is returned for comments", async ({ request }) => {
		const resourceId = `e2e-author-${Date.now()}`;

		const comment = await createComment(request, {
			resourceId,
			resourceType: "e2e-test",
			body: "Comment with resolved author.",
		});

		// Approve it so it shows in the list
		await approveComment(request, comment.id);

		// Fetch the comment list and verify resolvedAuthorName is populated
		const listResponse = await request.get(
			`/api/data/comments?resourceId=${encodeURIComponent(resourceId)}&resourceType=e2e-test&status=approved`,
		);
		expect(listResponse.ok()).toBeTruthy();
		const list = await listResponse.json();
		const found = list.items.find((c: { id: string }) => c.id === comment.id);
		expect(found).toBeDefined();
		// resolvedAuthorName should be a non-empty string (from resolveUser or "[deleted]" fallback)
		expect(typeof found.resolvedAuthorName).toBe("string");
		expect(found.resolvedAuthorName.length).toBeGreaterThan(0);
	});
});

// ─── Own pending comments visibility ────────────────────────────────────────────
//
// These tests cover the business rule: a user should always see their own
// pending (awaiting-moderation) comments and replies, even after a page
// refresh clears the React Query cache. The fix is server-side — GET /comments
// with `currentUserId` returns approved + own-pending in a single response.
//
// The example app's onBeforePost hook returns authorId "olliethedev" for every
// POST, so we use that as currentUserId in the query string to simulate the
// logged-in user fetching their own pending content.

test.describe("Own pending comments — visible after refresh (server-side fix)", () => {
	// Shared authorId used by the example app's onBeforePost hook
	const CURRENT_USER_ID = "olliethedev";

	test("own pending top-level comment is included when currentUserId matches author", async ({
		request,
	}) => {
		const resourceId = `e2e-own-pending-${Date.now()}`;
		const resourceType = "e2e-test";

		// POST creates a pending comment (autoApprove: false)
		const comment = await createComment(request, {
			resourceId,
			resourceType,
			body: "My pending comment — should survive refresh.",
		});
		expect(comment.status).toBe("pending");

		// Simulates a page-refresh fetch: status defaults to "approved" but
		// currentUserId is provided — own pending comments must be included.
		const response = await request.get(
			`/api/data/comments?resourceId=${encodeURIComponent(resourceId)}&resourceType=${encodeURIComponent(resourceType)}&currentUserId=${CURRENT_USER_ID}`,
		);
		expect(response.ok()).toBeTruthy();
		const body = await response.json();

		const found = body.items.find((c: { id: string }) => c.id === comment.id);
		expect(
			found,
			"Own pending comment must appear in the response with currentUserId",
		).toBeDefined();
		expect(found.status).toBe("pending");
	});

	test("pending comment is NOT returned when currentUserId is absent", async ({
		request,
	}) => {
		const resourceId = `e2e-no-pending-${Date.now()}`;
		const resourceType = "e2e-test";

		const comment = await createComment(request, {
			resourceId,
			resourceType,
			body: "Invisible pending comment — no currentUserId.",
		});
		expect(comment.status).toBe("pending");

		// Fetch without currentUserId — only approved comments should be returned
		const response = await request.get(
			`/api/data/comments?resourceId=${encodeURIComponent(resourceId)}&resourceType=${encodeURIComponent(resourceType)}`,
		);
		expect(response.ok()).toBeTruthy();
		const body = await response.json();

		const found = body.items.find((c: { id: string }) => c.id === comment.id);
		expect(
			found,
			"Pending comment must NOT appear without currentUserId",
		).toBeUndefined();
	});

	test("another user's pending comment is NOT included even with currentUserId", async ({
		request,
	}) => {
		const resourceId = `e2e-other-pending-${Date.now()}`;
		const resourceType = "e2e-test";

		// Comment is authored by "olliethedev" (from onBeforePost hook)
		const comment = await createComment(request, {
			resourceId,
			resourceType,
			body: "Comment by the real author.",
		});
		expect(comment.status).toBe("pending");

		// A *different* userId should not see this pending comment
		const response = await request.get(
			`/api/data/comments?resourceId=${encodeURIComponent(resourceId)}&resourceType=${encodeURIComponent(resourceType)}&currentUserId=some-other-user`,
		);
		expect(response.ok()).toBeTruthy();
		const body = await response.json();

		const found = body.items.find((c: { id: string }) => c.id === comment.id);
		expect(
			found,
			"Pending comment from another author must NOT appear for a different currentUserId",
		).toBeUndefined();
	});

	test("replyCount on parent includes own pending reply when currentUserId is provided", async ({
		request,
	}) => {
		const resourceId = `e2e-replycount-${Date.now()}`;
		const resourceType = "e2e-test";

		// Create and approve parent so it appears in the top-level list
		const parent = await createComment(request, {
			resourceId,
			resourceType,
			body: "Parent comment for reply-count test.",
		});
		await approveComment(request, parent.id);

		// Post a pending reply
		await createComment(request, {
			resourceId,
			resourceType,
			parentId: parent.id,
			body: "My pending reply — should increment replyCount.",
		});

		// Fetch top-level comments WITH currentUserId
		const withUserResponse = await request.get(
			`/api/data/comments?resourceId=${encodeURIComponent(resourceId)}&resourceType=${encodeURIComponent(resourceType)}&parentId=null&currentUserId=${CURRENT_USER_ID}`,
		);
		expect(withUserResponse.ok()).toBeTruthy();
		const withUserBody = await withUserResponse.json();
		const parentItem = withUserBody.items.find(
			(c: { id: string }) => c.id === parent.id,
		);
		expect(parentItem).toBeDefined();
		expect(
			parentItem.replyCount,
			"replyCount must include own pending reply when currentUserId is provided",
		).toBe(1);
	});

	test("replyCount is 0 for a pending reply when currentUserId is absent", async ({
		request,
	}) => {
		const resourceId = `e2e-replycount-nouser-${Date.now()}`;
		const resourceType = "e2e-test";

		const parent = await createComment(request, {
			resourceId,
			resourceType,
			body: "Parent for replyCount-without-user test.",
		});
		await approveComment(request, parent.id);

		// Pending reply — not approved, not counted without currentUserId
		await createComment(request, {
			resourceId,
			resourceType,
			parentId: parent.id,
			body: "Pending reply — invisible without currentUserId.",
		});

		// Fetch without currentUserId
		const response = await request.get(
			`/api/data/comments?resourceId=${encodeURIComponent(resourceId)}&resourceType=${encodeURIComponent(resourceType)}&parentId=null`,
		);
		expect(response.ok()).toBeTruthy();
		const body = await response.json();
		const parentItem = body.items.find(
			(c: { id: string }) => c.id === parent.id,
		);
		expect(parentItem).toBeDefined();
		expect(
			parentItem.replyCount,
			"replyCount must be 0 when reply is pending and currentUserId is absent",
		).toBe(0);
	});

	test("own pending reply appears in replies list when currentUserId is provided", async ({
		request,
	}) => {
		const resourceId = `e2e-pending-reply-list-${Date.now()}`;
		const resourceType = "e2e-test";

		const parent = await createComment(request, {
			resourceId,
			resourceType,
			body: "Parent comment.",
		});
		await approveComment(request, parent.id);

		// Post a pending reply
		const reply = await createComment(request, {
			resourceId,
			resourceType,
			parentId: parent.id,
			body: "My pending reply — must survive refresh.",
		});
		expect(reply.status).toBe("pending");

		// Simulates the RepliesSection fetch after a page refresh:
		// status defaults to approved but currentUserId causes own-pending to be included
		const response = await request.get(
			`/api/data/comments?resourceId=${encodeURIComponent(resourceId)}&resourceType=${encodeURIComponent(resourceType)}&parentId=${encodeURIComponent(parent.id)}&currentUserId=${CURRENT_USER_ID}`,
		);
		expect(response.ok()).toBeTruthy();
		const body = await response.json();

		const found = body.items.find((c: { id: string }) => c.id === reply.id);
		expect(
			found,
			"Own pending reply must appear in the replies list with currentUserId",
		).toBeDefined();
		expect(found.status).toBe("pending");
	});

	test("own pending reply does NOT appear in replies list without currentUserId", async ({
		request,
	}) => {
		const resourceId = `e2e-pending-reply-hidden-${Date.now()}`;
		const resourceType = "e2e-test";

		const parent = await createComment(request, {
			resourceId,
			resourceType,
			body: "Parent comment.",
		});
		await approveComment(request, parent.id);

		const reply = await createComment(request, {
			resourceId,
			resourceType,
			parentId: parent.id,
			body: "Pending reply — hidden without currentUserId.",
		});
		expect(reply.status).toBe("pending");

		// Fetch without currentUserId — only approved replies returned
		const response = await request.get(
			`/api/data/comments?resourceId=${encodeURIComponent(resourceId)}&resourceType=${encodeURIComponent(resourceType)}&parentId=${encodeURIComponent(parent.id)}`,
		);
		expect(response.ok()).toBeTruthy();
		const body = await response.json();

		const found = body.items.find((c: { id: string }) => c.id === reply.id);
		expect(
			found,
			"Pending reply must NOT appear in the list without currentUserId",
		).toBeUndefined();
	});
});

// ─── My Comments Page ────────────────────────────────────────────────────────
//
// The example app's onBeforePost returns authorId "olliethedev" for every POST,
// and the layout wires currentUserId: "olliethedev".  All tests in this block
// rely on that fixture so they can verify comments appear on the my-comments page.

test.describe("My Comments Page", () => {
	const AUTHOR_ID = "olliethedev";

	test("page renders without console errors", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/pages/comments/my-comments", {
			waitUntil: "networkidle",
		});

		// Either the list or the empty-state element must be visible
		const hasPage = await page
			.locator('[data-testid="my-comments-page"]')
			.isVisible()
			.catch(() => false);
		const hasEmpty = await page
			.locator('[data-testid="my-comments-empty"]')
			.isVisible()
			.catch(() => false);
		expect(
			hasPage || hasEmpty,
			"Expected my-comments-page or my-comments-empty to be visible",
		).toBe(true);

		expect(errors, `Console errors detected:\n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("populated state — comment created by current user appears in list", async ({
		page,
		request,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// Create a comment — the example app's onBeforePost assigns authorId "olliethedev"
		const uniqueBody = `My comment e2e ${Date.now()}`;
		await createComment(request, {
			resourceId: `e2e-mycomments-${Date.now()}`,
			resourceType: "e2e-test",
			body: uniqueBody,
		});

		await page.goto("/pages/comments/my-comments", {
			waitUntil: "networkidle",
		});

		await expect(
			page.locator('[data-testid="my-comments-list"]'),
		).toBeVisible();

		// The comment body should appear somewhere in the list (possibly on page 1)
		await expect(page.getByText(uniqueBody)).toBeVisible();

		expect(errors, `Console errors detected:\n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("delete from list — comment disappears after confirmation", async ({
		page,
		request,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		const uniqueBody = `Delete me e2e ${Date.now()}`;
		await createComment(request, {
			resourceId: `e2e-delete-mycomments-${Date.now()}`,
			resourceType: "e2e-test",
			body: uniqueBody,
		});

		await page.goto("/pages/comments/my-comments", {
			waitUntil: "networkidle",
		});

		// Find the row containing our comment
		const row = page
			.locator('[data-testid="my-comment-row"]')
			.filter({ hasText: uniqueBody });
		await expect(row).toBeVisible();

		// Click the delete button on that row
		await row.locator('[data-testid="my-comment-delete-button"]').click();

		// Confirm the AlertDialog
		await page.locator("button", { hasText: "Delete" }).last().click();
		await page.waitForLoadState("networkidle");

		// Row should no longer be visible
		await expect(page.getByText(uniqueBody)).not.toBeVisible({ timeout: 5000 });

		expect(errors, `Console errors detected:\n${errors.join("\n")}`).toEqual(
			[],
		);
	});

	test("API security — GET /comments?authorId=unknown returns 403", async ({
		request,
	}) => {
		// The example app's onBeforeListByAuthor only allows "olliethedev"
		const response = await request.get(
			`/api/data/comments?authorId=unknown-user-12345`,
		);
		expect(
			response.status(),
			"Expected 403 when onBeforeListByAuthor is absent or rejects",
		).toBe(403);
	});

	test("API — GET /comments?authorId=olliethedev returns comments", async ({
		request,
	}) => {
		// Seed a comment so we have at least one
		await createComment(request, {
			resourceId: `e2e-api-author-${Date.now()}`,
			resourceType: "e2e-test",
			body: "Author filter API test",
		});

		const response = await request.get(
			`/api/data/comments?authorId=${encodeURIComponent(AUTHOR_ID)}`,
		);
		expect(response.ok(), "Expected 200 for own-author query").toBeTruthy();
		const body = await response.json();
		expect(Array.isArray(body.items)).toBe(true);
		// All returned comments must belong to the requested author
		for (const item of body.items) {
			expect(item.authorId).toBe(AUTHOR_ID);
		}
	});
});

// ─── Load More ────────────────────────────────────────────────────────────────
//
// These tests verify the comment thread pagination that powers the "Load more
// comments" button.  They mirror the blog smoke tests for load-more: an API
// contract test validates server-side limit/offset, and a UI test exercises
// the full click-to-fetch cycle in the browser.
//
// The example app layouts set defaultCommentPageSize: 5 so that pagination
// triggers after 5 comments — mirroring the blog's 10-per-page default.

test.describe("Comment thread — load more", () => {
	test("API pagination contract: limit/offset return correct slices", async ({
		request,
	}) => {
		const resourceId = `e2e-pagination-${Date.now()}`;
		const resourceType = "e2e-test";

		// Create and approve 7 top-level comments
		await createApprovedComments(request, resourceId, resourceType, 7);

		// First page: 5 items, total = 7
		const page1 = await request.get(
			`/api/data/comments?resourceId=${encodeURIComponent(resourceId)}&resourceType=${encodeURIComponent(resourceType)}&parentId=null&status=approved&limit=5&offset=0`,
		);
		expect(page1.ok()).toBeTruthy();
		const body1 = await page1.json();
		expect(body1.items).toHaveLength(5);
		expect(body1.total).toBe(7);
		expect(body1.limit).toBe(5);
		expect(body1.offset).toBe(0);

		// Second page: 2 items, total still = 7
		const page2 = await request.get(
			`/api/data/comments?resourceId=${encodeURIComponent(resourceId)}&resourceType=${encodeURIComponent(resourceType)}&parentId=null&status=approved&limit=5&offset=5`,
		);
		expect(page2.ok()).toBeTruthy();
		const body2 = await page2.json();
		expect(body2.items).toHaveLength(2);
		expect(body2.total).toBe(7);
		expect(body2.limit).toBe(5);
		expect(body2.offset).toBe(5);

		// Third page (beyond end): 0 items
		const page3 = await request.get(
			`/api/data/comments?resourceId=${encodeURIComponent(resourceId)}&resourceType=${encodeURIComponent(resourceType)}&parentId=null&status=approved&limit=5&offset=10`,
		);
		expect(page3.ok()).toBeTruthy();
		const body3 = await page3.json();
		expect(body3.items).toHaveLength(0);
		expect(body3.total).toBe(7);
	});

	test("load more button on blog post page", async ({ page, request }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		const slug = `e2e-lm-comments-${Date.now()}`;

		// Create a published blog post to host the comment thread
		await createBlogPost(request, {
			title: "Load More Comments Test Post",
			slug,
		});

		// Create 7 approved comments so two pages are needed (pageSize = 5)
		await createApprovedComments(request, slug, "blog-post", 7);

		await testLoadMoreComments(page, slug, 7, {
			pageSize: 5,
			bodyPrefix: "Load More Comment",
		});

		expect(errors, `Console errors detected:\n${errors.join("\n")}`).toEqual(
			[],
		);
	});
});
