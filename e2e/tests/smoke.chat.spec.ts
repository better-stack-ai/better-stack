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
		// We wait for the assistant message container. The plugin uses an aria-label for a11y.
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.locator('[aria-label="AI response"]'),
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
			page
				.locator('[data-testid="chat-interface"]')
				.locator('[aria-label="AI response"]'),
		).toBeVisible({ timeout: 30000 });

		// The conversation should appear in the sidebar after the assistant finishes responding
		// (no refresh needed).
		await expect(
			page.getByRole("button", { name: /Test message for sidebar/i }),
		).toBeVisible({ timeout: 15000 });
	});

	test("should navigate to existing conversation", async ({ page }) => {
		// First create a conversation
		await page.goto("/pages/chat");

		const input = page.getByPlaceholder("Type a message...");
		await input.fill("Navigation test message");
		await page.keyboard.press("Enter");

		// Wait for response
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.locator('[aria-label="AI response"]'),
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
			page
				.locator('[data-testid="chat-interface"]')
				.locator('[aria-label="AI response"]'),
		).toBeVisible({ timeout: 30000 });

		// Wait for navigation to new conversation URL
		await page.waitForURL(/\/pages\/chat\/[a-zA-Z0-9]+/, { timeout: 10000 });

		// Send second message
		await input.fill("Second message in same conversation");
		await page.keyboard.press("Enter");

		// Wait for second AI response (should be 2 prose elements now)
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.locator('[aria-label="AI response"]'),
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
		await expect(
			page.getByRole("button", { name: "New chat", exact: true }),
		).toBeVisible({ timeout: 5000 });
	});

	test("should navigate back to /chat when clicking New chat from a conversation", async ({
		page,
	}) => {
		// Ensure desktop layout so sidebar is visible
		await page.setViewportSize({ width: 1280, height: 800 });

		// Create a conversation
		await page.goto("/pages/chat");
		const input = page.getByPlaceholder("Type a message...");
		await input.fill("New chat navigation test");
		await page.keyboard.press("Enter");

		// Wait for AI response + navigation to conversation URL
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.locator('[aria-label="AI response"]'),
		).toBeVisible({ timeout: 30000 });
		await page.waitForURL(/\/pages\/chat\/[a-zA-Z0-9]+/, { timeout: 10000 });

		// Click "New chat" and verify we navigate back to /pages/chat
		await page.getByRole("button", { name: "New chat", exact: true }).click();
		await page.waitForURL("/pages/chat", { timeout: 10000 });

		// Chat interface should be reset to empty state
		await expect(page.getByText("Start a conversation...")).toBeVisible({
			timeout: 10000,
		});
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.getByText("New chat navigation test"),
		).toHaveCount(0);
	});

	test("should reset draft input when clicking New chat on /chat", async ({
		page,
	}) => {
		// Ensure desktop layout so sidebar is visible
		await page.setViewportSize({ width: 1280, height: 800 });

		await page.goto("/pages/chat");

		// Type a draft message but do not send it
		const input = page.getByPlaceholder("Type a message...");
		await input.fill("Draft message that should be cleared");

		// Click "New chat" to reset the chat interface in-place
		await page.getByRole("button", { name: "New chat", exact: true }).click();

		// Draft should be cleared after remount/reset
		await expect(page.getByPlaceholder("Type a message...")).toHaveValue("");
		await expect(page.getByText("Start a conversation...")).toBeVisible();
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
		await expect(
			page.getByRole("button", { name: "New chat", exact: true }),
		).toBeVisible({ timeout: 5000 });
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

test.describe("AI Chat Plugin - File Uploads", () => {
	test("should show file upload button in authenticated mode", async ({
		page,
	}) => {
		await page.goto("/pages/chat");

		// Verify the file upload button is visible (paperclip icon)
		await expect(
			page.getByRole("button", { name: "Attach file" }),
		).toBeVisible();
	});

	test("should upload and attach an image file", async ({ page }) => {
		await page.goto("/pages/chat");

		// Wait for chat interface to be fully rendered
		await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();

		// Create a mock image file - wait for input to be attached first
		const fileInput = page.locator('input[type="file"]');
		await expect(fileInput).toBeAttached({ timeout: 5000 });

		// Upload a test image file
		await fileInput.setInputFiles({
			name: "test-image.png",
			mimeType: "image/png",
			buffer: Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
				"base64",
			),
		});

		// Wait for the upload to complete and preview to appear
		// Image files show an img preview
		await expect(page.locator('img[alt="test-image.png"]')).toBeVisible({
			timeout: 10000,
		});

		// Verify remove button is visible on hover
		const preview = page.locator(".group").filter({ has: page.locator("img") });
		await preview.hover();
		await expect(preview.locator("button:has(svg)")).toBeVisible();
	});

	test("should upload and attach a text file", async ({ page }) => {
		await page.goto("/pages/chat");

		// Wait for chat interface to be fully rendered
		await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();

		// Create a mock text file - wait for input to be attached first
		const fileInput = page.locator('input[type="file"]');
		await expect(fileInput).toBeAttached({ timeout: 5000 });

		// Upload a test text file
		await fileInput.setInputFiles({
			name: "example.txt",
			mimeType: "text/plain",
			buffer: Buffer.from("Hello, this is a test file content."),
		});

		// Wait for the upload to complete and preview to appear
		// Non-image files show a file icon with filename
		await expect(page.getByText("example.txt")).toBeVisible({
			timeout: 10000,
		});
	});

	test("should remove attached file when clicking remove button", async ({
		page,
	}) => {
		await page.goto("/pages/chat");

		// Wait for chat interface to be fully rendered
		await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();

		// Upload a test file - wait for input to be attached first
		const fileInput = page.locator('input[type="file"]');
		await expect(fileInput).toBeAttached({ timeout: 5000 });
		await fileInput.setInputFiles({
			name: "to-remove.txt",
			mimeType: "text/plain",
			buffer: Buffer.from("This file will be removed."),
		});

		// Wait for preview to appear
		await expect(page.getByText("to-remove.txt")).toBeVisible({
			timeout: 10000,
		});

		// Hover over the preview and click remove button
		const preview = page
			.locator(".group")
			.filter({ has: page.getByText("to-remove.txt") });
		await preview.hover();
		await preview.locator("button").click();

		// Verify file is removed
		await expect(page.getByText("to-remove.txt")).not.toBeVisible();
	});

	test("should send message with attached file", async ({ page }) => {
		await page.goto("/pages/chat");

		// Wait for chat interface to be fully rendered
		await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();

		// Upload a test file - wait for input to be attached first
		const fileInput = page.locator('input[type="file"]');
		await expect(fileInput).toBeAttached({ timeout: 5000 });
		await fileInput.setInputFiles({
			name: "attachment.txt",
			mimeType: "text/plain",
			buffer: Buffer.from("File content for testing."),
		});

		// Wait for preview
		await expect(page.getByText("attachment.txt")).toBeVisible({
			timeout: 10000,
		});

		// Type a message and send
		const input = page.getByPlaceholder("Type a message...");
		await input.fill("Here is a file for you");
		await page.keyboard.press("Enter");

		// Verify user message appears
		await expect(page.getByText("Here is a file for you")).toBeVisible({
			timeout: 15000,
		});

		// Verify AI response appears
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.locator('[aria-label="AI response"]'),
		).toBeVisible({ timeout: 30000 });

		// After sending, the attachment preview should be cleared from input area
		// (the attachments are now part of the sent message)
	});

	test("should clear attachments after sending", async ({ page }) => {
		await page.goto("/pages/chat");

		// Upload a test file
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles({
			name: "clear-test.txt",
			mimeType: "text/plain",
			buffer: Buffer.from("File to test clearing after send."),
		});

		// Wait for preview
		await expect(page.getByText("clear-test.txt")).toBeVisible({
			timeout: 10000,
		});

		// Type a message and send
		const input = page.getByPlaceholder("Type a message...");
		await input.fill("Please analyze this file");
		await page.keyboard.press("Enter");

		// Wait for the user message to appear (confirming send worked)
		await expect(page.getByText("Please analyze this file")).toBeVisible({
			timeout: 15000,
		});

		// Verify the attachment preview is cleared from input area after sending
		// The file preview in the input area should be gone
		const inputAreaFilePreview = page
			.locator("form")
			.getByText("clear-test.txt");
		await expect(inputAreaFilePreview).not.toBeVisible({ timeout: 5000 });
	});

	test("should allow multiple file uploads", async ({ page }) => {
		await page.goto("/pages/chat");

		const fileInput = page.locator('input[type="file"]');

		// Upload first file
		await fileInput.setInputFiles({
			name: "file1.txt",
			mimeType: "text/plain",
			buffer: Buffer.from("First file content."),
		});

		await expect(page.getByText("file1.txt")).toBeVisible({ timeout: 10000 });

		// Upload second file
		await fileInput.setInputFiles({
			name: "file2.txt",
			mimeType: "text/plain",
			buffer: Buffer.from("Second file content."),
		});

		await expect(page.getByText("file2.txt")).toBeVisible({ timeout: 10000 });

		// Both files should be visible
		await expect(page.getByText("file1.txt")).toBeVisible();
		await expect(page.getByText("file2.txt")).toBeVisible();
	});

	test("should retry AI response and maintain correct message order", async ({
		page,
	}) => {
		await page.goto("/pages/chat");

		const chatInterface = page.locator('[data-testid="chat-interface"]');

		// Send a message
		const input = page.getByPlaceholder("Type a message...");
		await input.fill("Say exactly: FIRST RESPONSE");
		await page.keyboard.press("Enter");

		// Wait for user message and AI response within chat interface
		await expect(
			chatInterface.getByText("Say exactly: FIRST RESPONSE"),
		).toBeVisible({
			timeout: 15000,
		});
		await expect(
			chatInterface.locator('[aria-label="AI response"]'),
		).toBeVisible({ timeout: 30000 });

		// Wait for the response to complete (status should be ready)
		await page.waitForTimeout(2000);

		// Hover over the AI message to reveal retry button
		const aiMessage = chatInterface
			.locator('[aria-label="AI response"]')
			.first();
		await aiMessage.hover();

		// Click the retry button
		const retryButton = chatInterface.getByTitle("Retry").first();
		await expect(retryButton).toBeVisible({ timeout: 5000 });
		await retryButton.click();

		// Wait for the new response to complete
		await page.waitForTimeout(3000);

		// Verify there's still only one user message and one AI response
		const userMessages = chatInterface.locator('[aria-label="Your message"]');
		const aiMessages = chatInterface.locator('[aria-label="AI response"]');

		await expect(userMessages).toHaveCount(1);
		await expect(aiMessages).toHaveCount(1);

		// Wait for URL to update with conversation ID
		await page.waitForURL(/\/pages\/chat\/[a-zA-Z0-9-]+/, { timeout: 10000 });
		const conversationUrl = page.url();

		// Reload the page and verify message order is preserved
		await page.goto(conversationUrl);

		// Wait for messages to load
		await expect(
			chatInterface.getByText("Say exactly: FIRST RESPONSE"),
		).toBeVisible({
			timeout: 15000,
		});

		// Verify still only one of each message type after reload
		await expect(
			chatInterface.locator('[aria-label="Your message"]'),
		).toHaveCount(1);
		await expect(
			chatInterface.locator('[aria-label="AI response"]'),
		).toHaveCount(1);
	});

	test("should edit user message and persist correctly", async ({ page }) => {
		await page.goto("/pages/chat");

		const chatInterface = page.locator('[data-testid="chat-interface"]');

		// Send first message
		const input = page.getByPlaceholder("Type a message...");
		await input.fill("Original message content");
		await page.keyboard.press("Enter");

		// Wait for user message and AI response within chat interface
		await expect(
			chatInterface.getByText("Original message content"),
		).toBeVisible({
			timeout: 15000,
		});
		await expect(
			chatInterface.locator('[aria-label="AI response"]'),
		).toBeVisible({ timeout: 30000 });

		// Wait for the response to complete
		await page.waitForTimeout(2000);

		// Wait for URL to update with conversation ID
		await page.waitForURL(/\/pages\/chat\/[a-zA-Z0-9-]+/, { timeout: 10000 });
		const conversationUrl = page.url();

		// Hover over the user message to reveal edit button
		const userMessage = chatInterface
			.locator('[aria-label="Your message"]')
			.first();
		await userMessage.hover();

		// Click the edit button
		const editButton = chatInterface.getByTitle("Edit message").first();
		await expect(editButton).toBeVisible({ timeout: 5000 });
		await editButton.click();

		// Find the edit textarea and modify the message
		const editTextarea = chatInterface.locator("textarea").first();
		await expect(editTextarea).toBeVisible({ timeout: 5000 });
		await editTextarea.clear();
		await editTextarea.fill("Edited message content");

		// Click the save/send button
		const saveButton = chatInterface.getByTitle("Save").first();
		await saveButton.click();

		// Wait for the edited message to appear
		await expect(
			chatInterface.getByText("Edited message content").first(),
		).toBeVisible({
			timeout: 15000,
		});

		// Wait for new AI response to complete
		await page.waitForTimeout(5000);

		// Reload the page to verify persistence
		await page.goto(conversationUrl);

		// Wait for messages to load
		await expect(chatInterface.getByText("Edited message content")).toBeVisible(
			{
				timeout: 15000,
			},
		);

		// Verify original message is gone after reload (database was synced correctly)
		await expect(
			chatInterface.getByText("Original message content"),
		).not.toBeVisible();

		// Verify only one user message after reload
		await expect(
			chatInterface.locator('[aria-label="Your message"]'),
		).toHaveCount(1);

		// Verify one AI response after reload
		await expect(
			chatInterface.locator('[aria-label="AI response"]'),
		).toHaveCount(1);
	});

	test("should handle edit in middle of conversation and persist correctly", async ({
		page,
	}) => {
		await page.goto("/pages/chat");

		const chatInterface = page.locator('[data-testid="chat-interface"]');
		const input = page.getByPlaceholder("Type a message...");

		// Send first message
		await input.fill("First question");
		await page.keyboard.press("Enter");
		await expect(chatInterface.getByText("First question")).toBeVisible({
			timeout: 15000,
		});
		await expect(
			chatInterface.locator('[aria-label="AI response"]'),
		).toBeVisible({ timeout: 30000 });
		await page.waitForTimeout(2000);

		// Send second message
		await input.fill("Second question");
		await page.keyboard.press("Enter");
		await expect(chatInterface.getByText("Second question")).toBeVisible({
			timeout: 15000,
		});

		// Wait for second AI response
		await page.waitForTimeout(3000);

		// Wait for URL to update with conversation ID
		await page.waitForURL(/\/pages\/chat\/[a-zA-Z0-9-]+/, { timeout: 10000 });
		const conversationUrl = page.url();

		// Verify we have 2 user messages and 2 AI responses before edit
		await expect(
			chatInterface.locator('[aria-label="Your message"]'),
		).toHaveCount(2);
		await expect(
			chatInterface.locator('[aria-label="AI response"]'),
		).toHaveCount(2);

		// Hover over the FIRST user message to edit it
		const firstUserMessage = chatInterface
			.locator('[aria-label="Your message"]')
			.first();
		await firstUserMessage.hover();

		// Click the edit button (first one visible)
		const editButton = chatInterface.getByTitle("Edit message").first();
		await expect(editButton).toBeVisible({ timeout: 5000 });
		await editButton.click();

		// Edit the first message
		const editTextarea = chatInterface.locator("textarea").first();
		await expect(editTextarea).toBeVisible({ timeout: 5000 });
		await editTextarea.clear();
		await editTextarea.fill("Edited first question");

		// Save the edit
		const saveButton = chatInterface.getByTitle("Save").first();
		await saveButton.click();

		// Wait for the edited message to appear
		await expect(
			chatInterface.getByText("Edited first question").first(),
		).toBeVisible({
			timeout: 15000,
		});

		// Wait for new AI response to complete
		await page.waitForTimeout(5000);

		// Reload and verify persistence - the edit should have truncated the conversation
		await page.goto(conversationUrl);

		// Verify only the edited message and its response exist after reload
		// Use locator scoped to user messages to avoid matching AI response text
		await expect(
			chatInterface
				.locator('[aria-label="Your message"]')
				.getByText("Edited first question"),
		).toBeVisible({
			timeout: 15000,
		});

		// Second question should be gone after reload (it was after the edit point)
		await expect(chatInterface.getByText("Second question")).not.toBeVisible();

		// First question (unedited) should be gone after reload
		await expect(
			chatInterface.getByText("First question", { exact: true }),
		).not.toBeVisible();

		// Verify only one of each after reload
		await expect(
			chatInterface.locator('[aria-label="Your message"]'),
		).toHaveCount(1);
		await expect(
			chatInterface.locator('[aria-label="AI response"]'),
		).toHaveCount(1);
	});
});
