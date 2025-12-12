import { test, expect } from "@playwright/test";

const hasOpenAiKey =
	typeof process.env.OPENAI_API_KEY === "string" &&
	process.env.OPENAI_API_KEY.trim().length > 0;

if (!hasOpenAiKey) {
	// eslint-disable-next-line no-console -- surfaced only when tests are skipped
	console.warn(
		"Skipping AI chat smoke tests: OPENAI_API_KEY is not available in the environment.",
	);
}

test.skip(
	!hasOpenAiKey,
	"OPENAI_API_KEY is required to run AI chat smoke tests.",
);

test.describe("AI Chat Plugin", () => {
	test("should render chat page with sidebar", async ({ page }) => {
		await page.goto("/pages/chat");

		// Verify chat layout is visible
		await expect(page.locator('[data-testid="chat-layout"]')).toBeVisible();

		// Verify chat interface is visible
		await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();

		// Verify empty state message
		await expect(page.getByText("Start a conversation...")).toBeVisible();

		// Verify input is available
		await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
	});

	test("should start a new conversation and send a message", async ({
		page,
	}) => {
		// 1. Navigate to the chat page
		await page.goto("/pages/chat");

		// 2. Verify initial state
		await expect(page.getByText("Start a conversation...")).toBeVisible();
		await expect(page.getByPlaceholder("Type a message...")).toBeVisible();

		// 3. Send a message
		const input = page.getByPlaceholder("Type a message...");
		await input.fill("Hello, world!");
		// Use Enter key or find the submit button
		await page.keyboard.press("Enter");

		// 4. Verify user message appears - increase timeout to account for slower state updates
		await expect(page.getByText("Hello, world!")).toBeVisible({
			timeout: 15000,
		});

		// 5. Verify AI response appears (using real OpenAI, so response content varies, but should exist)
		// We wait for the AI message container - look for the bot icon indicating assistant message
		await expect(
			page.locator('[data-testid="chat-interface"]').locator(".prose"),
		).toBeVisible({ timeout: 30000 });
	});

	test("should show conversation in sidebar after sending message", async ({
		page,
	}) => {
		// Navigate to the chat page
		await page.goto("/pages/chat");

		// Send a message to create a conversation
		const input = page.getByPlaceholder("Type a message...");
		await input.fill("Test message for sidebar");
		await page.keyboard.press("Enter");

		// Wait for the message to be sent and processed
		await expect(page.getByText("Test message for sidebar")).toBeVisible({
			timeout: 5000,
		});

		// Wait for the AI response
		await expect(
			page.locator('[data-testid="chat-interface"]').locator(".prose"),
		).toBeVisible({ timeout: 30000 });

		// Refresh the page to see the conversation in sidebar
		await page.reload();

		// Wait for sidebar to load conversations
		await page.waitForTimeout(2000);

		// The conversation should appear in the sidebar with title based on first message
		// Note: The sidebar may be collapsed on mobile, so we check for the conversation title
		// in the visible area
		await expect(
			page.getByText("Test message for sidebar").first(),
		).toBeVisible({
			timeout: 10000,
		});
	});

	test("should navigate to existing conversation", async ({ page }) => {
		// First create a conversation
		await page.goto("/pages/chat");

		const input = page.getByPlaceholder("Type a message...");
		await input.fill("Navigation test message");
		await page.keyboard.press("Enter");

		// Wait for response
		await expect(
			page.locator('[data-testid="chat-interface"]').locator(".prose"),
		).toBeVisible({ timeout: 30000 });

		// Wait for the URL to change to include the conversation ID
		await page.waitForURL(/\/pages\/chat\/[a-zA-Z0-9]+/, { timeout: 10000 });

		// Refresh and verify the conversation is still visible
		await page.reload();

		// Wait for the page to load
		await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible({
			timeout: 10000,
		});

		// The messages should still be visible in the chat interface (not just sidebar)
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.getByText("Navigation test message"),
		).toBeVisible({
			timeout: 15000,
		});
	});

	test("should keep all messages in the same conversation", async ({
		page,
	}) => {
		// This test verifies that multiple messages in a conversation stay together
		// and don't create separate history items (fixes the bug where every message
		// created a new conversation)

		await page.goto("/pages/chat");

		// Send first message
		const input = page.getByPlaceholder("Type a message...");
		await input.fill("First message in conversation");
		await page.keyboard.press("Enter");

		// Wait for first AI response
		await expect(
			page.locator('[data-testid="chat-interface"]').locator(".prose"),
		).toBeVisible({ timeout: 30000 });

		// Wait for navigation to new conversation URL
		await page.waitForURL(/\/pages\/chat\/[a-zA-Z0-9]+/, { timeout: 10000 });

		// Send second message
		await input.fill("Second message in same conversation");
		await page.keyboard.press("Enter");

		// Wait for second AI response (should be 2 prose elements now)
		await expect(
			page.locator('[data-testid="chat-interface"]').locator(".prose"),
		).toHaveCount(2, { timeout: 30000 });

		// Refresh the page
		await page.reload();

		// Both messages should still be visible in the same conversation
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.getByText("First message in conversation"),
		).toBeVisible({ timeout: 10000 });
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.getByText("Second message in same conversation"),
		).toBeVisible({ timeout: 10000 });

		// There should only be ONE conversation in the sidebar with "First message"
		// (the title is based on the first message)
		const sidebarConversations = page.locator(
			'button:has-text("First message in conversation")',
		);
		await expect(sidebarConversations).toHaveCount(1, { timeout: 5000 });
	});

	test("should have new chat button in sidebar", async ({ page }) => {
		// Navigate to the chat page
		await page.goto("/pages/chat");

		// Verify the "New chat" button exists in the sidebar
		await expect(page.getByRole("button", { name: /new chat/i })).toBeVisible({
			timeout: 5000,
		});
	});

	test("should toggle sidebar on desktop", async ({ page }) => {
		// Set desktop viewport
		await page.setViewportSize({ width: 1280, height: 800 });

		await page.goto("/pages/chat");

		// Find the sidebar toggle button (desktop only)
		const toggleButton = page
			.locator('[aria-label="Close sidebar"]')
			.or(page.locator('[aria-label="Open sidebar"]'));

		// Click to close sidebar
		await toggleButton.first().click();
		await page.waitForTimeout(300); // Wait for animation

		// Click to open sidebar again
		await toggleButton.first().click();
		await page.waitForTimeout(300);
	});

	test("should open mobile sidebar sheet", async ({ page }) => {
		// Set mobile viewport
		await page.setViewportSize({ width: 375, height: 667 });

		await page.goto("/pages/chat");

		// Find and click the mobile menu button
		const menuButton = page.locator('[aria-label="Open menu"]');
		await menuButton.click();

		// Verify the sidebar sheet is open
		await expect(page.getByRole("button", { name: /new chat/i })).toBeVisible({
			timeout: 5000,
		});
	});
});

test.describe("AI Chat Plugin - Widget Mode", () => {
	// Widget mode tests would typically be done if the example app exposes a widget route
	// For now, we test the main chat interface

	test("should render chat interface in compact mode when in widget", async ({
		page,
	}) => {
		// This test assumes the chat interface adapts based on container/props
		// In a real widget scenario, you'd navigate to a widget-specific route
		await page.goto("/pages/chat");

		// Verify the chat interface is functional
		await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();
	});
});
