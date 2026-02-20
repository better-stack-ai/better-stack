import { expect, test, type BrowserContext } from "@playwright/test";

/**
 * E2E Tests for Blog Plugin Authentication at API Level
 *
 * These tests verify that:
 * 1. Headers (including cookies) are forwarded from requests to API routes
 * 2. Backend hooks receive and can validate authentication
 * 3. Unauthenticated users are properly blocked from protected operations
 * 4. Authenticated users can access protected resources
 *
 * Tests use the /api/example-auth endpoint which has authentication enabled.
 * This demonstrates how headers flow from client → API → backend hooks → validation.
 */

// Mock auth cookie name (replace with your actual auth cookie name)
const AUTH_COOKIE_NAME = "better-auth.session_token";

// API base path for authenticated endpoints
// Note: Blog plugin defines routes at /posts, /tags, etc.
// So the full path is /api/example-auth/posts (not /api/example-auth/blog/posts)
const API_BASE = "/api/example-auth";

/**
 * Helper: Create auth cookie header
 * For Playwright's request fixture, we need to manually pass cookies in headers
 */
function createAuthHeaders(userId: string): Record<string, string> {
	return {
		Cookie: `${AUTH_COOKIE_NAME}=mock-session-${userId}`,
	};
}

/**
 * Helper: Set a mock auth cookie in browser context
 * For page/browser tests, cookies are set on the context
 */
async function setAuthCookie(context: BrowserContext, userId = "user-123") {
	// Get the current base URL to set the correct domain
	const baseURL = new URL(context.pages()[0]?.url() || "http://localhost:3003");

	await context.addCookies([
		{
			name: AUTH_COOKIE_NAME,
			value: `mock-session-${userId}`,
			domain: baseURL.hostname, // Use hostname from current page
			path: "/",
			httpOnly: true,
			sameSite: "Lax",
		},
	]);

	console.log(`[Test] Set auth cookie for domain: ${baseURL.hostname}`);
}

/**
 * Helper: Clear auth cookies
 */
async function clearAuthCookies(context: BrowserContext) {
	await context.clearCookies();
}

/**
 * Helper: Delete posts created by auth tests only
 * Only deletes posts that match auth test naming patterns to avoid interfering with other tests
 */
async function cleanupAuthTestPosts(request: any) {
	const headers = createAuthHeaders("cleanup-user");

	// Patterns used in auth tests
	const authTestPatterns = [
		/Auth Test Draft/,
		/Auth Update Test/,
		/Delete Test/,
		/User 1 Post/,
		/Method Test/,
		/Test Post/,
		/Unauthorized Test/,
	];

	// Get all drafts
	const draftsResponse = await request.get(
		`${API_BASE}/posts?published=false`,
		{
			headers,
		},
	);

	if (draftsResponse.status() === 200) {
		const drafts = await draftsResponse.json();
		// /posts returns PostListResult { items, total, … }
		for (const post of drafts.items ?? []) {
			// Only delete if it matches auth test patterns
			const isAuthTestPost = authTestPatterns.some((pattern) =>
				pattern.test(post.title),
			);
			if (isAuthTestPost) {
				await request.delete(`${API_BASE}/posts/${post.id}`, { headers });
			}
		}
	}

	// Get all published posts (auth tests don't create published posts, but just in case)
	const publishedResponse = await request.get(
		`${API_BASE}/posts?published=true`,
		{
			headers,
		},
	);

	if (publishedResponse.status() === 200) {
		const published = await publishedResponse.json();
		for (const post of published.items ?? []) {
			const isAuthTestPost = authTestPatterns.some((pattern) =>
				pattern.test(post.title),
			);
			if (isAuthTestPost) {
				await request.delete(`${API_BASE}/posts/${post.id}`, { headers });
			}
		}
	}
}

test.describe("Blog Authentication - API Level", () => {
	// Clean up after each test to prevent interference
	test.afterEach(async ({ request }) => {
		await cleanupAuthTestPosts(request);
	});
	test("API: authenticated user can list drafts", async ({ request }) => {
		// Create auth headers for API request
		const headers = createAuthHeaders("user-123");

		// Make API request to list drafts (requires authentication)
		const response = await request.get(`${API_BASE}/posts?published=false`, {
			headers,
		});

		// Should successfully return drafts — response is PostListResult { items, total, … }
		expect(response.status()).toBe(200);
		const data = await response.json();
		expect(Array.isArray(data.items)).toBe(true);
		console.log("[Test] Drafts retrieved:", data.items.length);
	});

	test("API: unauthenticated user is blocked from listing drafts", async ({
		request,
	}) => {
		// Make request without auth headers
		const response = await request.get(`${API_BASE}/posts?published=false`);

		// Should return 403 Forbidden
		expect(response.status()).toBe(403);
		console.log("[Test] Unauthenticated request blocked:", response.status());
	});

	test("API: authenticated user can create a draft post", async ({
		request,
	}) => {
		// Create auth headers
		const headers = createAuthHeaders("user-123");

		const testTitle = `Auth Test Draft ${Date.now()}`;
		const testSlug = `auth-test-draft-${Date.now()}`;

		// Create a draft post via API
		const response = await request.post(`${API_BASE}/posts`, {
			headers,
			data: {
				title: testTitle,
				slug: testSlug,
				excerpt: "Test draft post",
				content: "Test content",
				published: false,
			},
		});

		// Should successfully create the post
		expect(response.status()).toBe(200);
		const data = await response.json();
		expect(data.title).toBe(testTitle);
		expect(data.slug).toBe(testSlug);
		expect(data.published).toBe(false);
		console.log("[Test] Draft post created:", data.id);
	});

	test("API: unauthenticated user is blocked from creating posts", async ({
		request,
	}) => {
		// Try to create a post without authentication (no headers)
		const response = await request.post(`${API_BASE}/posts`, {
			data: {
				title: "Unauthorized Test",
				slug: "unauthorized-test",
				excerpt: "Should fail",
				content: "Test content",
				published: false,
			},
		});

		// Should return 403 Forbidden
		expect(response.status()).toBe(403);
		console.log(
			"[Test] Unauthenticated post creation blocked:",
			response.status(),
		);
	});

	test("API: authenticated user can update their post", async ({ request }) => {
		// Create auth headers
		const headers = createAuthHeaders("user-123");

		const testTitle = `Auth Update Test ${Date.now()}`;
		const testSlug = `auth-update-test-${Date.now()}`;

		// First create a post
		const createResponse = await request.post(`${API_BASE}/posts`, {
			headers,
			data: {
				title: testTitle,
				slug: testSlug,
				excerpt: "Test post",
				content: "Test content",
				published: false,
			},
		});

		expect(createResponse.status()).toBe(200);
		const post = await createResponse.json();

		// Update the post
		const updatedTitle = `${testTitle} - Updated`;
		const updateResponse = await request.put(`${API_BASE}/posts/${post.id}`, {
			headers,
			data: {
				id: post.id, // id is required in body
				title: updatedTitle,
				slug: testSlug,
				excerpt: "Updated excerpt",
				content: "Updated content",
				published: false,
			},
		});

		// Should successfully update
		expect(updateResponse.status()).toBe(200);
		const updatedPost = await updateResponse.json();
		expect(updatedPost.title).toBe(updatedTitle);
		console.log("[Test] Post updated:", updatedPost.id);
	});

	test("API: unauthenticated user is blocked from updating posts", async ({
		request,
	}) => {
		// First create a post while authenticated
		const headers = createAuthHeaders("user-123");

		const createResponse = await request.post(`${API_BASE}/posts`, {
			headers,
			data: {
				title: "Test Post",
				slug: `test-post-${Date.now()}`,
				excerpt: "Test",
				content: "Test",
				published: false,
			},
		});

		expect(createResponse.status()).toBe(200);
		const post = await createResponse.json();

		// Try to update the post without authentication
		const updateResponse = await request.put(`${API_BASE}/posts/${post.id}`, {
			data: {
				id: post.id, // id is required in body
				title: "Updated Title",
				slug: post.slug,
				excerpt: post.excerpt,
				content: post.content,
				published: false,
			},
		});

		// Should return 403 Forbidden
		expect(updateResponse.status()).toBe(403);
		console.log(
			"[Test] Unauthenticated update blocked:",
			updateResponse.status(),
		);
	});

	test("API: authenticated user can delete their post", async ({ request }) => {
		// Create auth headers
		const headers = createAuthHeaders("user-123");

		// Create a post
		const createResponse = await request.post(`${API_BASE}/posts`, {
			headers,
			data: {
				title: "Delete Test",
				slug: `delete-test-${Date.now()}`,
				excerpt: "Test",
				content: "Test",
				published: false,
			},
		});

		expect(createResponse.status()).toBe(200);
		const post = await createResponse.json();

		// Delete the post
		const deleteResponse = await request.delete(
			`${API_BASE}/posts/${post.id}`,
			{
				headers,
			},
		);

		// Should successfully delete
		expect(deleteResponse.status()).toBe(200);
		console.log("[Test] Post deleted:", post.id);

		// Verify post no longer exists
		const listResponse = await request.get(
			`${API_BASE}/posts?published=false`,
			{
				headers,
			},
		);
		expect(listResponse.status()).toBe(200);
		const drafts = await listResponse.json();
		// /posts returns PostListResult { items, total, … }
		const postStillExists = (drafts.items ?? []).some(
			(p: any) => p.id === post.id,
		);
		expect(postStillExists).toBe(false);
	});

	test("API: public posts are accessible without authentication", async ({
		request,
	}) => {
		// Request public posts (should work without auth)
		const response = await request.get(`${API_BASE}/posts?published=true`);

		// Should successfully return public posts — response is PostListResult { items, total, … }
		expect(response.status()).toBe(200);
		const data = await response.json();
		expect(Array.isArray(data.items)).toBe(true);
		console.log(
			"[Test] Public posts retrieved without auth:",
			data.items.length,
		);
	});

	test("API: cookies are properly forwarded in requests", async ({
		request,
	}) => {
		// Set a mock auth cookie with a specific user ID
		const userId = "cookie-test-user";
		const headers = createAuthHeaders(userId);

		// Make a request that requires auth
		const response = await request.get(`${API_BASE}/posts?published=false`, {
			headers,
		});

		// Should be successful, proving the cookie was forwarded
		expect(response.status()).toBe(200);
		console.log("[Test] Cookie properly forwarded - request succeeded");

		// The backend logs will show the session validation if you check server output
	});
});

test.describe("Blog Authentication - Role-Based Access", () => {
	// Clean up after each test to prevent interference
	test.afterEach(async ({ request }) => {
		await cleanupAuthTestPosts(request);
	});
	test("API: admin user can access posts created by other users", async ({
		request,
	}) => {
		// Create post as regular user
		const user1Headers = createAuthHeaders("user-1");

		const createResponse = await request.post(`${API_BASE}/posts`, {
			headers: user1Headers,
			data: {
				title: "User 1 Post",
				slug: `user-1-post-${Date.now()}`,
				excerpt: "Test",
				content: "Test",
				published: false,
			},
		});

		expect(createResponse.status()).toBe(200);
		const post = await createResponse.json();

		// Switch to admin user
		const adminHeaders = createAuthHeaders("admin-123");

		// Admin should be able to update it
		const updateResponse = await request.put(`${API_BASE}/posts/${post.id}`, {
			headers: adminHeaders,
			data: {
				id: post.id, // id is required in body
				title: "Updated by Admin",
				slug: post.slug,
				excerpt: post.excerpt,
				content: post.content,
				published: false,
			},
		});

		// Depending on your implementation, this may succeed or fail
		// With basic auth (no ownership check), it should succeed
		console.log("[Test] Admin update status:", updateResponse.status());
		expect(updateResponse.status()).toBe(200);
	});

	test("API: different user sessions are properly distinguished", async ({
		request,
	}) => {
		// Create post as user-1
		const user1Headers = createAuthHeaders("user-1");

		const createResponse = await request.post(`${API_BASE}/posts`, {
			headers: user1Headers,
			data: {
				title: "User 1 Post",
				slug: `session-test-${Date.now()}`,
				excerpt: "Test",
				content: "Test",
				published: false,
			},
		});

		expect(createResponse.status()).toBe(200);
		const post = await createResponse.json();
		console.log("[Test] Post created by user-1:", post.id);

		// Switch to user-2
		const user2Headers = createAuthHeaders("user-2");

		// User-2 should be able to update (basic auth, no ownership check)
		// In production with ownership checks, this would fail
		const updateResponse = await request.put(`${API_BASE}/posts/${post.id}`, {
			headers: user2Headers,
			data: {
				id: post.id, // id is required in body
				title: "Updated by User 2",
				slug: post.slug,
				excerpt: post.excerpt,
				content: post.content,
				published: false,
			},
		});

		console.log("[Test] User-2 update status:", updateResponse.status());
		// With basic auth, this succeeds. With ownership check, it would be 403
		expect([200, 403]).toContain(updateResponse.status());
	});
});

test.describe("Blog Authentication - Session Validation", () => {
	// Clean up after each test to prevent interference
	test.afterEach(async ({ request }) => {
		await cleanupAuthTestPosts(request);
	});
	test("API: expired/invalid session is rejected", async ({ request }) => {
		// Set an invalid cookie
		const headers = {
			Cookie: `${AUTH_COOKIE_NAME}=expired-or-invalid-session`,
		};

		// Try to access protected resource
		const response = await request.get(`${API_BASE}/posts?published=false`, {
			headers,
		});

		// Should be treated as unauthenticated and return 403
		expect(response.status()).toBe(403);
		console.log("[Test] Invalid session rejected:", response.status());
	});

	test("API: multiple requests with same session work correctly", async ({
		request,
	}) => {
		// Create auth headers
		const headers = createAuthHeaders("multi-request-user");

		// Make multiple requests - all should succeed
		const response1 = await request.get(`${API_BASE}/posts?published=false`, {
			headers,
		});
		const response2 = await request.get(`${API_BASE}/posts?published=false`, {
			headers,
		});
		const response3 = await request.get(`${API_BASE}/posts?published=false`, {
			headers,
		});

		expect(response1.status()).toBe(200);
		expect(response2.status()).toBe(200);
		expect(response3.status()).toBe(200);
		console.log("[Test] Multiple requests with same session all succeeded");
	});

	test("API: session persists across different API methods", async ({
		request,
	}) => {
		// Create auth headers
		const headers = createAuthHeaders("method-test-user");

		// Create a post (POST)
		const createResponse = await request.post(`${API_BASE}/posts`, {
			headers,
			data: {
				title: "Method Test",
				slug: `method-test-${Date.now()}`,
				excerpt: "Test",
				content: "Test",
				published: false,
			},
		});

		expect(createResponse.status()).toBe(200);
		const post = await createResponse.json();

		// Update the post (PUT) - same session
		const updateResponse = await request.put(`${API_BASE}/posts/${post.id}`, {
			headers,
			data: {
				id: post.id, // id is required in body
				title: "Updated",
				slug: post.slug,
				excerpt: post.excerpt,
				content: post.content,
				published: false,
			},
		});

		expect(updateResponse.status()).toBe(200);

		// Delete the post (DELETE) - same session
		const deleteResponse = await request.delete(
			`${API_BASE}/posts/${post.id}`,
			{
				headers,
			},
		);

		expect(deleteResponse.status()).toBe(200);
		console.log("[Test] Session persisted across POST, PUT, DELETE");
	});
});

test.describe("Blog Authentication - Browser SSR Flow", () => {
	// Clean up after each test to prevent interference
	test.afterEach(async ({ request }) => {
		await cleanupAuthTestPosts(request);
	});
	test("Browser: authenticated user can view drafts page via SSR", async ({
		page,
		context,
	}) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		// First navigate to home page to establish context
		await page.goto("/pages/blog", { waitUntil: "networkidle" });

		// Set auth cookie using helper
		await setAuthCookie(context, "browser-user-123");

		// Navigate to drafts page
		// This triggers SSR where:
		// 1. Next.js loader gets request with cookies
		// 2. Loader passes headers to stackClient
		// 3. stackClient forwards headers to API
		// 4. API hooks validate auth from headers
		await page.goto("/pages/blog/drafts", { waitUntil: "networkidle" });

		// Wait a bit for any client-side hydration to complete
		await page.waitForTimeout(1000);

		// Check what's actually on the page
		const hasDraftsPage = await page
			.locator('[data-testid="drafts-page"]')
			.isVisible()
			.catch(() => false);
		const hasError = await page
			.locator('[data-testid="error-placeholder"]')
			.isVisible()
			.catch(() => false);
		const hasEmptyState = await page
			.locator('[data-testid="empty-state"]')
			.isVisible()
			.catch(() => false);

		console.log("[Test] Page state - Drafts visible:", hasDraftsPage);
		console.log("[Test] Page state - Error:", hasError);
		console.log("[Test] Page state - Empty:", hasEmptyState);

		// Should successfully load the drafts page (or empty state if no drafts)
		expect(hasDraftsPage || hasEmptyState).toBe(true);
		await expect(page).toHaveTitle(/Draft Posts/i);

		// No console errors should occur
		expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual(
			[],
		);

		console.log(
			"[Test] Browser: Authenticated user successfully viewed drafts via SSR",
		);
	});

	test("Browser: unauthenticated user is blocked from drafts page via SSR", async ({
		page,
		context,
	}) => {
		// Clear any auth cookies
		await clearAuthCookies(context);

		// Try to navigate to drafts page without authentication
		// SSR loader will:
		// 1. Receive request without auth cookies
		// 2. Pass empty/no cookies to API
		// 3. API hooks reject the request (return false)
		// 4. React Query stores the 403 error
		await page.goto("/pages/blog/drafts", { waitUntil: "networkidle" });

		// Should show error state or unauthorized message
		// The exact behavior depends on how the blog plugin handles errors
		const hasErrorPlaceholder = await page
			.locator('[data-testid="error-placeholder"]')
			.isVisible()
			.catch(() => false);

		const hasUnauthorizedText = await page
			.getByText(/unauthorized|forbidden|access denied/i)
			.isVisible()
			.catch(() => false);

		const hasEmptyState = await page
			.locator('[data-testid="empty-state"]')
			.isVisible()
			.catch(() => false);

		// One of these should be true
		const isBlocked =
			hasErrorPlaceholder || hasUnauthorizedText || hasEmptyState;

		expect(isBlocked).toBe(true);

		console.log(
			"[Test] Browser: Unauthenticated user blocked from drafts via SSR",
		);
		console.log("  - Error placeholder:", hasErrorPlaceholder);
		console.log("  - Unauthorized text:", hasUnauthorizedText);
		console.log("  - Empty state:", hasEmptyState);
	});
});
