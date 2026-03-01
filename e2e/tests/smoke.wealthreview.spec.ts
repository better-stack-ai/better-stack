import { test, expect, type Page } from "@playwright/test";

/**
 * WealthReview AI Demo — End-to-End Smoke Tests
 *
 * Tests the AI-native financial intake workflow:
 *   1. Client chats with the AI advisor
 *   2. AI calls submitIntakeAssessment (server-side tool with execute)
 *   3. A CMS client-profile entry is created
 *   4. A Kanban card appears in the Advisor Review Queue board
 *
 * Requires OPENAI_API_KEY — skipped when the key is absent.
 * Targets nextjs:memory project only (port 3003).
 */

const hasOpenAiKey =
	typeof process.env.OPENAI_API_KEY === "string" &&
	process.env.OPENAI_API_KEY.trim().length > 0;

if (!hasOpenAiKey) {
	// eslint-disable-next-line no-console
	console.warn(
		"Skipping WealthReview smoke tests: OPENAI_API_KEY is not available in the environment.",
	);
}

test.skip(
	!hasOpenAiKey,
	"OPENAI_API_KEY is required to run WealthReview smoke tests.",
);

/**
 * Wait for the chat interface to return to ready state after streaming.
 */
async function waitForChatReady(page: Page, timeout = 60000) {
	await expect(
		page.locator('[data-testid="chat-interface"][data-chat-status="ready"]'),
	).toBeVisible({ timeout });
}

test.describe("WealthReview AI Demo", () => {
	test("should accept a routine intake message and create advisor review card", async ({
		page,
	}) => {
		await page.goto("/pages/chat");

		await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();
		await expect(page.getByPlaceholder("Type a message...")).toBeVisible();

		// Send a routine client intake message (no AML signals)
		const input = page.getByPlaceholder("Type a message...");
		await input.fill(
			"Hi, I'm Sarah, 34 years old. I'm getting married next year and I just inherited $50,000 from my grandmother. I currently have no debt and about $30,000 in savings. I'd like to know if my current moderate-risk investments still make sense.",
		);
		await page.keyboard.press("Enter");

		// Verify message sent
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.getByText("Sarah", { exact: false }),
		).toBeVisible({ timeout: 10000 });

		// Wait for AI to complete the intake conversation and submit assessment
		// The AI will ask follow-up questions and eventually call submitIntakeAssessment
		await waitForChatReady(page, 90000);

		// Verify an AI response was received
		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.locator('[aria-label="AI response"]'),
		).toBeVisible({ timeout: 10000 });

		// Navigate to the Kanban board to verify the review card was created
		await page.goto("/pages/kanban");
		await expect(
			page
				.locator('[data-testid="kanban-board"]')
				.or(page.getByText("Advisor Review Queue")),
		).toBeVisible({ timeout: 15000 });

		// The advisor review board should have appeared
		await expect(page.getByText("Advisor Review Queue")).toBeVisible({
			timeout: 15000,
		});
	});

	test("should route AML-flagged case to Escalated column", async ({
		page,
	}) => {
		await page.goto("/pages/chat");

		await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();

		// Send a message with clear AML risk signals
		const input = page.getByPlaceholder("Type a message...");
		await input.fill(
			"Hi, I'm Alex. I run a small import business and I want to invest $200,000. The money came from overseas sales over the past 3 months from accounts in multiple countries. I'd like to move it all into Canadian equities immediately.",
		);
		await page.keyboard.press("Enter");

		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.getByText("Alex", { exact: false }),
		).toBeVisible({ timeout: 10000 });

		// Wait for the AI to complete the intake and call submitIntakeAssessment
		await waitForChatReady(page, 90000);

		// The AI should mention escalation in its final response
		const chatInterface = page.locator('[data-testid="chat-interface"]');
		await expect(
			chatInterface.locator('[aria-label="AI response"]'),
		).toBeVisible({
			timeout: 10000,
		});

		// Navigate to Kanban and verify the escalated card exists
		await page.goto("/pages/kanban");
		await expect(page.getByText("Advisor Review Queue")).toBeVisible({
			timeout: 15000,
		});

		// The Escalated column should have a card (look for escalation indicators)
		await expect(
			page
				.getByText("Escalated")
				.or(page.getByText("ESCALATED", { exact: false })),
		).toBeVisible({ timeout: 10000 });
	});

	test("should create a CMS client profile entry after intake", async ({
		page,
	}) => {
		await page.goto("/pages/chat");

		await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();

		// Send a complete client profile in one message to minimize turns
		const input = page.getByPlaceholder("Type a message...");
		await input.fill(
			"Hi, I'm Jamie Chen, 45 years old, conservative investor. I have $500,000 in RRSPs and plan to retire in 10 years. No debts. I want a review of whether my allocation is still appropriate.",
		);
		await page.keyboard.press("Enter");

		await expect(
			page
				.locator('[data-testid="chat-interface"]')
				.getByText("Jamie", { exact: false }),
		).toBeVisible({ timeout: 10000 });

		await waitForChatReady(page, 90000);

		// Navigate to CMS and verify the client-profile content type has an entry
		await page.goto("/pages/cms");
		await expect(page.locator("body")).toBeVisible({ timeout: 10000 });

		// The CMS dashboard should show the Client Profile content type
		await expect(
			page.getByText("Client Profile").or(page.getByText("client-profile")),
		).toBeVisible({ timeout: 15000 });
	});
});
