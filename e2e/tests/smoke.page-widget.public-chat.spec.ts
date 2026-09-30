import { test, expect } from "@playwright/test";

// Widget lifecycle/layout uses the real built client without requiring a model key.
test("page widget tip, mobile bounds, scoped context, and navigation reset", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 640 });
	await page.goto("/public-chat");
	await page.getByTestId("show-page-widget").click();
	await expect(page.getByRole("status")).toHaveText(
		"Questions about this article? Ask AI.",
	);
	await expect(page.getByRole("status")).toBeHidden({ timeout: 8000 });
	await page.getByRole("button", { name: "Open chat", exact: true }).click();
	await expect(page.getByTestId("page-context-badge")).toHaveText("Article 1");
	const panel = page.getByTestId("widget-trigger").locator("..");
	const bounds = await panel.boundingBox();
	expect(bounds).not.toBeNull();
	expect(bounds!.x).toBeGreaterThanOrEqual(0);
	expect(bounds!.y).toBeGreaterThanOrEqual(0);
	expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
	expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(640);
	const requests: Array<{ pageContext: string; messages: unknown[] }> = [];
	await page.route("**/api/public-chat/chat", async (route) => {
		requests.push(route.request().postDataJSON());
		await route.fulfill({
			status: 200,
			contentType: "text/event-stream",
			headers: { "x-vercel-ai-ui-message-stream": "v1" },
			body:
				[
					{ type: "start", messageId: "reply" },
					{ type: "text-start", id: "text" },
					{ type: "text-delta", id: "text", delta: "Answer for this article." },
					{ type: "text-end", id: "text" },
					{ type: "finish" },
				]
					.map((event) => `data: ${JSON.stringify(event)}\n\n`)
					.join("") + "data: [DONE]\n\n",
		});
	});
	await page
		.getByPlaceholder("Type a message...")
		.fill("Question on first article");
	await page.getByPlaceholder("Type a message...").press("Enter");
	await expect(page.getByText("Answer for this article.")).toBeVisible();
	expect(requests[0]?.pageContext).toBe("/public-chat/article-1");
	await page.getByTestId("next-widget-page").click();
	await expect(page.getByRole("status")).toBeVisible();
	await page.getByRole("button", { name: "Dismiss chat tip" }).click();
	await page.getByRole("button", { name: "Open chat", exact: true }).click();
	await expect(page.getByTestId("page-context-badge")).toHaveText("Article 2");
	await expect(page.getByText("Question on first article")).toHaveCount(0);
	await page
		.getByPlaceholder("Type a message...")
		.fill("Question on second article");
	await page.getByPlaceholder("Type a message...").press("Enter");
	await expect(page.getByText("Answer for this article.")).toBeVisible();
	expect(requests[1]?.pageContext).toBe("/public-chat/article-2");
	expect(requests[1]?.messages).toHaveLength(1);
});
