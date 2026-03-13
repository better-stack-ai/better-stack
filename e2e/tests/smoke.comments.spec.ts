import { expect, test, type APIRequestContext } from "@playwright/test";

// ─── API Helpers ────────────────────────────────────────────────────────────────

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

	test("unauthenticated placeholder shown when blog post has no currentUserId", async ({
		page,
		request,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// Create and approve a blog post comment so the thread renders
		const resourceId = `e2e-auth-${Date.now()}`;
		const comment = await createComment(request, {
			resourceId,
			resourceType: "blog-post",
			body: "Public comment on blog post.",
		});
		await approveComment(request, comment.id);

		// Create a blog post (rely on the existing blog post list)
		// Just navigate to the blog list and check if a post has the login prompt
		// (The layout wires CommentThread without currentUserId)
		// Navigate to a blog post — the slot should show the login prompt
		await page.goto("/pages/blog", { waitUntil: "networkidle" });
		const postLink = page
			.locator("a")
			.filter({ hasText: /read more|view post/i })
			.first();
		const hasPost = await postLink.isVisible().catch(() => false);
		if (!hasPost) {
			test.skip(); // No blog posts in the test db
			return;
		}
		await postLink.click();
		await page.waitForLoadState("networkidle");

		// Scroll down to trigger WhenVisible
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		await page.waitForTimeout(800);

		// Login prompt should be visible (no currentUserId in the test layout)
		const loginPrompt = page.locator('[data-testid="login-prompt"]');
		await expect(loginPrompt).toBeVisible({ timeout: 5000 });

		expect(errors, `Console errors detected:\n${errors.join("\n")}`).toEqual(
			[],
		);
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

	test("pending-badge is shown for own pending comment in the UI", async ({
		page,
		request,
	}) => {
		// Seeds an approved comment so the thread renders, then posts via the UI
		// and verifies the "Pending approval" badge appears on the new comment card.
		const resourceId = `e2e-badge-${Date.now()}`;
		const resourceType = "e2e-test";

		const seed = await createComment(request, {
			resourceId,
			resourceType,
			body: "Seed — ensures thread is mounted.",
		});
		await approveComment(request, seed.id);

		await page.goto(
			`/pages/comments/moderation/resource?resourceId=${encodeURIComponent(resourceId)}&resourceType=${encodeURIComponent(resourceType)}`,
			{ waitUntil: "networkidle" },
		);

		const hasThread = await page
			.locator('[data-testid="comment-form"]')
			.isVisible()
			.catch(() => false);

		if (!hasThread) {
			// Resource-comments route not available in this example app — skip UI portion
			test.skip();
			return;
		}

		const textarea = page.locator('[data-testid="comment-form"] textarea');
		await textarea.fill("My new pending comment.");
		await page
			.locator('[data-testid="comment-form"] button[type="submit"]')
			.click();

		// The pending badge must appear on the newly posted comment card
		const newCard = page
			.locator('[data-testid="comment-card"]')
			.filter({ hasText: "My new pending comment." });
		await expect(newCard).toBeVisible({ timeout: 5000 });
		await expect(
			newCard.locator('[data-testid="pending-badge"]'),
		).toBeVisible();
	});
});
