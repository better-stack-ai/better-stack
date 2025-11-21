import { test, expect } from "@playwright/test";

test.describe("AI Chat Plugin", () => {
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

		// 4. Verify user message appears
		await expect(page.getByText("Hello, world!")).toBeVisible({
			timeout: 5000,
		});

		// 5. Verify AI response appears (using real OpenAI, so response content varies, but should exist)
		// We wait for the AI message container - look for prose class in assistant messages
		await expect(page.locator(".prose").nth(1)).toBeVisible({ timeout: 30000 });
	});
});
