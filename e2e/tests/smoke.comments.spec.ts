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
