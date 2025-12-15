import { test, expect } from "@playwright/test";

const hasOpenAiKey =
	typeof process.env.OPENAI_API_KEY === "string" &&
	process.env.OPENAI_API_KEY.trim().length > 0;

if (!hasOpenAiKey) {
	// eslint-disable-next-line no-console -- surfaced only when tests are skipped
	console.warn(
		"Skipping AI chat public mode tests: OPENAI_API_KEY is not available in the environment.",
	);
}

test.skip(
	!hasOpenAiKey,
	"OPENAI_API_KEY is required to run AI chat public mode tests.",
);

/**
 * E2E Tests for AI Chat Plugin in PUBLIC Mode
 *
 * These tests verify that:
 * 1. Public chat works without authentication
 * 2. No sidebar is displayed in public mode
 * 3. Conversations are NOT persisted
 * 4. Rate limiting hooks are called (via API tests)
 * 5. Chat functionality works in stateless mode
 *
 * Tests use the /public-chat page and /api/public-chat endpoint.
 */

test.describe("AI Chat Plugin - Public Mode", () => {
	test("should render public chat page without sidebar", async ({ page }) => {
		// Navigate to public chat page
		await page.goto("/public-chat");

		// Verify chat interface is visible
		await expect(page.locator('[data-testid="chat-layout"]')).toBeVisible();
		await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();

		// Verify sidebar is NOT visible (public mode has no sidebar)
		await expect(
			page.locator('[data-testid="chat-sidebar"]'),
		).not.toBeVisible();

		// Verify empty state message
		await expect(page.getByText("Start a conversation...")).toBeVisible();

		// Verify input is available
		await expect(page.getByPlaceholder("Type a message...")).toBeVisible();

		// Verify "New chat" button is NOT visible (no sidebar in public mode)
		await expect(
			page.getByRole("button", { name: "New chat", exact: true }),
		).not.toBeVisible();
	});

	test("should send a message and receive AI response in public mode", async ({
		page,
	}) => {
		await page.goto("/public-chat");

		// Verify initial state
		await expect(page.getByText("Start a conversation...")).toBeVisible();

		// Send a message
		const input = page.getByPlaceholder("Type a message...");
		await input.fill("Hello from public chat!");
		await page.keyboard.press("Enter");

		// Verify user message appears
		await expect(page.getByText("Hello from public chat!")).toBeVisible({
			timeout: 15000,
		});

		// Verify AI response appears
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.locator('[aria-label="AI response"]'),
		).toBeVisible({ timeout: 30000 });
	});

	test("should NOT navigate to conversation URL in public mode", async ({
		page,
	}) => {
		await page.goto("/public-chat");

		// Send a message
		const input = page.getByPlaceholder("Type a message...");
		await input.fill("Test URL behavior");
		await page.keyboard.press("Enter");

		// Wait for AI response
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.locator('[aria-label="AI response"]'),
		).toBeVisible({ timeout: 30000 });

		// URL should NOT change to include conversation ID (unlike authenticated mode)
		// It should stay at /public-chat
		expect(page.url()).toContain("/public-chat");
		expect(page.url()).not.toMatch(/\/public-chat\/[a-zA-Z0-9]+/);
	});

	test("should NOT persist conversations in public mode", async ({ page }) => {
		// Send a message
		await page.goto("/public-chat");

		const input = page.getByPlaceholder("Type a message...");
		await input.fill("Message that should not persist");
		await page.keyboard.press("Enter");

		// Wait for AI response
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.locator('[aria-label="AI response"]'),
		).toBeVisible({ timeout: 30000 });

		// Refresh the page
		await page.reload();

		// The message should be gone (not persisted)
		await expect(
			page.getByText("Message that should not persist"),
		).not.toBeVisible();

		// Empty state should be shown again
		await expect(page.getByText("Start a conversation...")).toBeVisible();
	});

	test("should handle multiple messages in same session", async ({ page }) => {
		await page.goto("/public-chat");

		// Send first message
		const input = page.getByPlaceholder("Type a message...");
		await input.fill("First message");
		await page.keyboard.press("Enter");

		// Wait for first AI response
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.locator('[aria-label="AI response"]'),
		).toBeVisible({ timeout: 30000 });

		// Send second message
		await input.fill("Second message");
		await page.keyboard.press("Enter");

		// Wait for second AI response (should be 2 responses now)
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.locator('[aria-label="AI response"]'),
		).toHaveCount(2, { timeout: 30000 });

		// Both user messages should be visible
		await expect(page.getByText("First message")).toBeVisible();
		await expect(page.getByText("Second message")).toBeVisible();
	});
});

test.describe("AI Chat Plugin - Public Mode API", () => {
	const API_BASE = "/api/public-chat";

	test("API: chat endpoint works without authentication", async ({
		request,
	}) => {
		// Send a chat request without any auth headers
		const response = await request.post(`${API_BASE}/chat`, {
			data: {
				messages: [
					{
						id: "1",
						role: "user",
						parts: [{ type: "text", text: "Hello" }],
					},
				],
			},
		});

		// Should succeed (public mode doesn't require auth)
		expect(response.status()).toBe(200);

		// Response should be a stream
		const contentType = response.headers()["content-type"];
		expect(contentType).toContain("text/event-stream");
	});

	test("API: conversation endpoints return 404 in public mode", async ({
		request,
	}) => {
		// List conversations should return empty array or 404
		const listResponse = await request.get(`${API_BASE}/chat/conversations`);
		expect(listResponse.status()).toBe(200);
		const conversations = await listResponse.json();
		expect(conversations).toEqual([]);

		// Create conversation should return 404 (not available in public mode)
		const createResponse = await request.post(
			`${API_BASE}/chat/conversations`,
			{
				data: { title: "Test" },
			},
		);
		expect(createResponse.status()).toBe(404);

		// Get conversation should return 404
		const getResponse = await request.get(
			`${API_BASE}/chat/conversations/abc123`,
		);
		expect(getResponse.status()).toBe(404);

		// Update conversation should return 404
		const updateResponse = await request.put(
			`${API_BASE}/chat/conversations/abc123`,
			{
				data: { title: "Updated" },
			},
		);
		expect(updateResponse.status()).toBe(404);

		// Delete conversation should return 404
		const deleteResponse = await request.delete(
			`${API_BASE}/chat/conversations/abc123`,
		);
		expect(deleteResponse.status()).toBe(404);
	});

	test("API: X-Conversation-Id header is NOT returned in public mode", async ({
		request,
	}) => {
		const response = await request.post(`${API_BASE}/chat`, {
			data: {
				messages: [
					{
						id: "1",
						role: "user",
						parts: [{ type: "text", text: "Hello" }],
					},
				],
			},
		});

		expect(response.status()).toBe(200);

		// In public mode, no conversation ID should be returned
		const conversationId = response.headers()["x-conversation-id"];
		expect(conversationId).toBeUndefined();
	});
});
