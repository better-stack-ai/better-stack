import { test, expect } from "@playwright/test";

for (const viewport of [
	{ width: 1280, height: 900 },
	{ width: 360, height: 640 },
]) {
	test(`page widget expands without losing drafts or pending responses at ${viewport.width}px`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.goto("/public-chat");
		await page.getByTestId("show-page-widget").click();
		await page.getByRole("button", { name: "Open chat", exact: true }).click();
		const panel = page.getByRole("dialog", { name: "AI Chat" });
		const input = panel.getByPlaceholder("Type a message...");
		const compact = await panel.boundingBox();
		const font = await panel.evaluate((el) => getComputedStyle(el).fontFamily);
		expect(font).toContain("monospace");
		await expect(panel).toHaveCSS("background-color", "rgb(254, 243, 199)");
		expect(compact?.width).toBe(Math.min(440, viewport.width - 32));
		expect(compact?.height).toBe(Math.min(640, viewport.height - 112));
		await input.fill("Keep my draft");
		await panel
			.getByRole("button", { name: "Expand chat", exact: true })
			.click();
		await expect(panel).toHaveCSS("width", `${viewport.width}px`);
		await expect(panel).toHaveCSS("height", `${viewport.height}px`);
		await expect(panel).toHaveCSS("font-family", font);
		await expect(panel).toHaveCSS("background-color", "rgb(254, 243, 199)");
		await expect
			.poll(() => panel.boundingBox())
			.toEqual({ x: 0, y: 0, ...viewport });
		await expect(input).toHaveValue("Keep my draft");
		await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
		// The page behind the modal cannot steal keyboard focus.
		await page
			.getByTestId("next-widget-page")
			.evaluate((button: HTMLElement) => button.focus());
		expect(
			await panel.evaluate((el) => el.contains(document.activeElement)),
		).toBe(true);
		await input.focus();
		await page.keyboard.press("Escape");
		await expect(
			panel.getByRole("button", { name: "Expand chat", exact: true }),
		).toBeVisible();
		await expect.poll(() => panel.boundingBox()).toEqual(compact);
		await expect(input).toHaveValue("Keep my draft");
		await expect(
			panel.getByRole("button", { name: "Expand chat", exact: true }),
		).toBeFocused();
		await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");

		let reply!: () => void;
		const ready = new Promise<void>((resolve) => {
			reply = resolve;
		});
		let requests = 0;
		await page.route("**/api/public-chat/chat", async (route) => {
			requests++;
			await ready;
			await route.fulfill({
				status: 200,
				contentType: "text/event-stream",
				headers: { "x-vercel-ai-ui-message-stream": "v1" },
				body:
					[
						{ type: "start", messageId: "expanded-reply" },
						{ type: "text-start", id: "text" },
						{
							type: "text-delta",
							id: "text",
							delta: "Response survived resizing.",
						},
						{ type: "text-end", id: "text" },
						{
							type: "file",
							mediaType: "image/png",
							url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM3sAAAAASUVORK5CYII=",
						},
						{ type: "finish" },
					]
						.map((event) => `data: ${JSON.stringify(event)}\n\n`)
						.join("") + "data: [DONE]\n\n",
			});
		});
		await input.press("Enter");
		await expect.poll(() => requests).toBe(1);
		await panel
			.getByRole("button", { name: "Expand chat", exact: true })
			.click();
		await panel
			.getByRole("button", { name: "Collapse chat", exact: true })
			.click();
		reply();
		await expect(panel.getByText("Response survived resizing.")).toBeVisible();
		expect(requests).toBe(1);
		await panel
			.getByRole("button", { name: "Expand chat", exact: true })
			.click();
		await panel.getByRole("button", { name: "Image 1", exact: true }).click();
		const preview = page.getByRole("dialog", { name: "Image 1", exact: true });
		await expect(preview).toBeVisible();
		await preview.getByRole("button", { name: "Close", exact: true }).click();
		await expect(preview).toBeHidden();
		await expect(
			panel.getByRole("button", { name: "Collapse chat", exact: true }),
		).toBeVisible();
		await panel
			.getByRole("button", { name: "Close chat", exact: true })
			.click();
		await expect(page.getByTestId("widget-trigger")).toBeFocused();
		await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
		await page.getByTestId("widget-trigger").click();
		await expect.poll(() => panel.boundingBox()).toEqual(compact);
		await expect(panel.getByText("Response survived resizing.")).toBeVisible();
	});
}

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
	expect(requests[0]?.pageContext).toContain("/public-chat/article-1");
	expect(requests[0]?.pageContext).toContain(
		await page.getByTestId("article-content").innerText(),
	);
	await page.getByTestId("widget-trigger").click();
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
	expect(requests[1]?.pageContext).toContain("/public-chat/article-2");
	expect(requests[1]?.pageContext).toContain(
		await page.getByTestId("article-content").innerText(),
	);
	expect(requests[1]?.messages).toHaveLength(1);
});
