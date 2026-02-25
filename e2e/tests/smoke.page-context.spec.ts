import { test, expect, type Page } from "@playwright/test";

/**
 * Wait for the chat widget to finish streaming and return to "ready" state.
 */
async function waitForChatReady(page: Page, timeout = 30000) {
	await expect(
		page.locator('[data-testid="chat-interface"][data-chat-status="ready"]'),
	).toBeVisible({ timeout });
}

/**
 * Open the floating chat widget and wait for it to be fully rendered.
 * The widget starts closed — we click the trigger button to open it.
 */
async function waitForChatWidget(page: Page) {
	// The outer container is always rendered
	await expect(page.locator('[data-testid="chat-widget"]')).toBeVisible({
		timeout: 10000,
	});
	// Click the trigger button to open the chat panel if it isn't open yet
	const trigger = page.locator('[data-testid="widget-trigger"]');
	await expect(trigger).toBeVisible({ timeout: 10000 });
	await trigger.click();
	// Wait for the chat interface to appear
	await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible({
		timeout: 10000,
	});
}

const hasOpenAiKey =
	typeof process.env.OPENAI_API_KEY === "string" &&
	process.env.OPENAI_API_KEY.trim().length > 0;

// ─────────────────────────────────────────────────────────────────────────────
// Structural tests — always run, no OpenAI key needed
// These verify that context is registered, shown in the UI, and transmitted
// to the server without requiring an actual AI response.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Page AI Context — structural (no OpenAI key needed)", () => {
	test("page context badge appears on blog post page", async ({
		page,
		request,
	}) => {
		// Create a blog post via API so we have a real slug to navigate to
		const res = await request.post("/api/data/posts", {
			data: {
				title: "Context Badge Test Post",
				content: "Content for context badge test.",
				excerpt: "Badge test excerpt",
				slug: `context-badge-test-${Date.now()}`,
				published: true,
				tags: [],
			},
		});
		expect(res.ok()).toBeTruthy();
		const post = await res.json();

		await page.goto(`/pages/blog/${post.slug}`, { waitUntil: "networkidle" });

		// Wait for the floating chat widget to render
		await waitForChatWidget(page);

		// The page context badge should appear in the chat widget header
		// since the blog post page calls useRegisterPageAIContext
		await expect(
			page.locator('[data-testid="page-context-badge"]'),
		).toBeVisible({ timeout: 5000 });

		await expect(
			page.locator('[data-testid="page-context-badge"]'),
		).toContainText("blog-post");
	});

	test("dynamic suggestions appear on blog new post page", async ({ page }) => {
		await page.goto("/pages/blog/new", { waitUntil: "networkidle" });

		await waitForChatWidget(page);

		// The chat widget empty state should show page-specific suggestion chips
		// registered by the new post page
		const chatInterface = page.locator('[data-testid="chat-interface"]');

		// At least one suggestion chip should match the new-post context
		const suggestionChips = chatInterface.getByRole("button", {
			name: /write a post|draft|tags/i,
		});
		await expect(suggestionChips.first()).toBeVisible({ timeout: 5000 });
	});

	test("pageContext and availableTools are sent in the chat API request", async ({
		page,
	}) => {
		await page.goto("/pages/blog/new", { waitUntil: "networkidle" });
		await waitForChatWidget(page);

		// Intercept the chat API call and capture the request body
		let capturedBody: Record<string, any> | null = null;

		await page.route("**/api/data/chat", async (route) => {
			const postData = route.request().postDataJSON() as Record<
				string,
				any
			> | null;
			capturedBody = postData;
			// Abort the request so we don't need a real AI response
			await route.abort();
		});

		// Type and submit any message to trigger the API call
		// Use getByPlaceholder to find the chat input reliably (avoids overflow-hidden scoping issues)
		const input = page.getByPlaceholder("Type a message...").last();
		await input.fill("hello");
		await page.keyboard.press("Enter");

		// Wait a moment for the intercepted request to be processed
		await page.waitForTimeout(1000);

		// Verify the request body contains page context fields
		expect(capturedBody).not.toBeNull();
		expect(typeof capturedBody!.pageContext).toBe("string");
		expect((capturedBody!.pageContext as string).length).toBeGreaterThan(0);
		expect(Array.isArray(capturedBody!.availableTools)).toBe(true);
		expect(capturedBody!.availableTools as string[]).toContain("fillBlogForm");
	});

	test("fillBlogForm tool call populates the form fields", async ({ page }) => {
		await page.goto("/pages/blog/new", { waitUntil: "networkidle" });
		await waitForChatWidget(page);

		// Mock the chat API to return a deterministic fillBlogForm tool call.
		// This tests the client-side tool dispatch mechanism without needing a real AI model.
		let requestCount = 0;
		await page.route("**/api/data/chat", async (route) => {
			requestCount++;

			if (requestCount === 1) {
				// First request: respond with a tool call stream for fillBlogForm
				const toolInput = JSON.stringify({
					title: "TypeScript Benefits for Frontend",
					content:
						"# TypeScript Benefits\n\nTypeScript provides type safety and better tooling.",
					excerpt: "How TypeScript improves frontend development.",
				});
				const stream = [
					`data: {"type":"start","messageId":"mock-msg-1"}\n\n`,
					`data: {"type":"start-step"}\n\n`,
					`data: {"type":"tool-input-start","toolCallId":"mock-call-1","toolName":"fillBlogForm"}\n\n`,
					`data: {"type":"tool-input-delta","toolCallId":"mock-call-1","inputTextDelta":${JSON.stringify(toolInput)}}\n\n`,
					`data: {"type":"tool-input-available","toolCallId":"mock-call-1","toolName":"fillBlogForm","input":${toolInput}}\n\n`,
					`data: {"type":"finish-step"}\n\n`,
					`data: {"type":"finish"}\n\n`,
					`data: [DONE]\n\n`,
				].join("");

				await route.fulfill({
					status: 200,
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						"x-vercel-ai-ui-message-stream": "v1",
					},
					body: stream,
				});
			} else {
				// Subsequent requests (after tool result is sent back): simple text response
				const stream = [
					`data: {"type":"start","messageId":"mock-msg-2"}\n\n`,
					`data: {"type":"start-step"}\n\n`,
					`data: {"type":"text-start","id":"text-1"}\n\n`,
					`data: {"type":"text-delta","id":"text-1","delta":"I have filled in the blog post form."}\n\n`,
					`data: {"type":"text-end","id":"text-1"}\n\n`,
					`data: {"type":"finish-step"}\n\n`,
					`data: {"type":"finish"}\n\n`,
					`data: [DONE]\n\n`,
				].join("");

				await route.fulfill({
					status: 200,
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						"x-vercel-ai-ui-message-stream": "v1",
					},
					body: stream,
				});
			}
		});

		const input = page.getByPlaceholder("Type a message...").last();
		await input.fill("Write a blog post about TypeScript");
		await page.keyboard.press("Enter");

		// Wait for user message to appear in chat
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.getByText(/TypeScript/)
				.first(),
		).toBeVisible({ timeout: 15000 });

		// The fillBlogForm onToolCall handler should populate the title field
		const titleField = page.getByLabel(/title/i).first();
		await expect(titleField).toHaveValue("TypeScript Benefits for Frontend", {
			timeout: 30000,
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AI-driven tests — require OPENAI_API_KEY, skipped without it
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Page AI Context — AI-driven (requires OpenAI key)", () => {
	test.skip(!hasOpenAiKey, "OPENAI_API_KEY is required for AI-driven tests.");

	test("AI answers questions using the blog post page content", async ({
		page,
		request,
	}) => {
		// Create a post with a unique phrase so we can verify the AI read the page context
		const uniquePhrase = `ZephyrCloud2025-${Date.now()}`;
		const res = await request.post("/api/data/posts", {
			data: {
				title: "AI Context Summarization Test",
				content: `This post discusses ${uniquePhrase} as a key concept in cloud computing.`,
				excerpt: "A test post for AI summarization",
				slug: `ai-context-test-${Date.now()}`,
				published: true,
				tags: [],
			},
		});
		expect(res.ok()).toBeTruthy();
		const post = await res.json();

		await page.goto(`/pages/blog/${post.slug}`, { waitUntil: "networkidle" });
		await waitForChatWidget(page);

		const chatInterface = page.locator('[data-testid="chat-interface"]');
		const input = page.getByPlaceholder("Type a message...").last();

		// Ask about the post content
		await input.fill("What unique concept is mentioned in this post?");
		await page.keyboard.press("Enter");

		// Wait for user message
		await expect(
			chatInterface.getByText("What unique concept is mentioned in this post?"),
		).toBeVisible({ timeout: 10000 });

		// Wait for AI response
		await expect(
			chatInterface.locator('[aria-label="AI response"]'),
		).toBeVisible({ timeout: 30000 });

		await waitForChatReady(page, 60000);

		// The AI response should reference the unique phrase from the page context
		await expect(
			chatInterface.locator('[aria-label="AI response"]').first(),
		).toContainText(uniquePhrase, { timeout: 10000 });
	});
});
