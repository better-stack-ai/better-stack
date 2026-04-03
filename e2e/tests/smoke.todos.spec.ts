import { expect, test } from "@playwright/test";

test("todos list page renders", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	await page.goto("/pages/todos", { waitUntil: "networkidle" });
	await expect(page.locator('[data-test-id="todos-list-page"]')).toBeVisible();
	await expect(page.locator('[data-test-id="todos-list-title"]')).toHaveText(
		/Todos/i,
	);
	await expect(page.locator('[data-test-id="todos-empty"]')).toBeVisible();
	await expect(page.locator('[data-test-id^="todo-item-"]')).toHaveCount(0);
	// no console errors
	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("add todo page renders", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	await page.goto("/pages/todos/add", { waitUntil: "networkidle" });
	await expect(page.locator('[data-test-id="add-todo-page"]')).toBeVisible();
	await expect(page.locator('[data-test-id="add-todo-title"]')).toHaveText(
		/Add Todo/i,
	);
	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
	await page.fill('[data-test-id="add-todo-title-input"]', "Test Todo");
	await page.click('[data-test-id="add-todo-submit"]');
	await page.waitForLoadState("networkidle"); // wait for POST to commit before triggering SSR navigation
	// go back to list page
	await page.goto("/pages/todos", { waitUntil: "networkidle" });
	await expect(page.locator('[data-test-id="todos-list-page"]')).toBeVisible();
	const numTodos = await page.locator('[data-test-id^="todo-item-"]').count();
	expect(numTodos).toBeGreaterThan(0);
});
