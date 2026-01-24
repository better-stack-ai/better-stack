import { expect, test, type APIRequestContext } from "@playwright/test";

const emptySelector = '[data-testid="empty-state"]';
const errorSelector = '[data-testid="error-placeholder"]';

test("boards list page renders", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	await page.goto("/pages/kanban", { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="boards-list-page"]')).toBeVisible();
	await expect(page).toHaveTitle(/Kanban/i);

	// Either boards list renders or empty state shows when no boards
	const emptyVisible = await page
		.locator(emptySelector)
		.isVisible()
		.catch(() => false);
	if (!emptyVisible) {
		await expect(page.getByTestId("page-header")).toBeVisible();
	}
	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("create board and navigate to board page", async ({ page, request }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	// Create a board via API
	const board = await createBoard(request, {
		name: "Test Kanban Board",
		description: "A test board for E2E testing",
	});

	// Navigate to the board page
	await page.goto(`/pages/kanban/${board.id}`, { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="board-page"]')).toBeVisible();
	await expect(page).toHaveTitle(/Test Kanban Board/i);

	// Verify the board header is visible
	await expect(page.getByTestId("page-header")).toBeVisible();
	await expect(page.getByTestId("page-header")).toHaveText("Test Kanban Board");

	// Verify default columns are created
	await expect(page.getByText("To Do")).toBeVisible();
	await expect(page.getByText("In Progress")).toBeVisible();
	await expect(page.getByText("Done")).toBeVisible();

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("create task in column", async ({ page, request }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	// Create a board first
	const board = await createBoard(request, {
		name: "Task Test Board",
		description: "Board for testing tasks",
	});

	// Navigate to the board page
	await page.goto(`/pages/kanban/${board.id}`, { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="board-page"]')).toBeVisible();

	// Find the "To Do" column and click "Add Task" button within it
	// The "Add Task" button should be in the column dropdown menu or as a direct action
	const toDoColumn = page.locator('[data-slot="kanban-column"]').first();
	await expect(toDoColumn).toBeVisible();

	// Click the column options and select "Add Task"
	const columnMenuButton = toDoColumn
		.locator("button")
		.filter({ has: page.locator("svg") })
		.first();
	await columnMenuButton.click();

	// Look for Add Task in menu or click directly if there's an add button
	const addTaskButton = page.getByRole("menuitem", { name: /add task/i });
	const addTaskVisible = await addTaskButton.isVisible().catch(() => false);

	if (addTaskVisible) {
		await addTaskButton.click();
	} else {
		// Close the menu and look for an alternative add task button
		await page.keyboard.press("Escape");
		const directAddButton = toDoColumn.getByRole("button", {
			name: /add task/i,
		});
		await directAddButton.click();
	}

	// Wait for the task form dialog to appear
	const dialog = page.locator('div[role="dialog"][data-slot="dialog-content"]');
	await expect(dialog).toBeVisible({ timeout: 5000 });

	// Fill out the task form
	await page.getByLabel("Title").fill("Test Task 1");

	// Set priority to HIGH - click on the first select trigger (Priority comes before Column)
	const priorityTrigger = dialog
		.locator('[data-slot="select-trigger"]')
		.first();
	await priorityTrigger.click();
	await page.getByRole("option", { name: /high/i }).click();

	// Submit the form (skip description as TipTap editor is complex to interact with)
	await page.getByRole("button", { name: /create task/i }).click();

	// Wait for the dialog to close
	await expect(dialog).not.toBeVisible({ timeout: 5000 });

	// Verify the task appears in the column
	await expect(page.getByText("Test Task 1")).toBeVisible({ timeout: 5000 });

	// Verify the priority badge is visible
	await expect(page.getByText("High")).toBeVisible();

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("edit task", async ({ page, request }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	// Create a board with a task
	const board = await createBoard(request, {
		name: "Edit Task Test Board",
		description: "Board for testing task editing",
	});

	// Get the first column ID
	const columnId = board.columns[0].id;

	// Create a task
	await createTask(request, {
		title: "Task to Edit",
		description: "Original description",
		priority: "MEDIUM",
		columnId: columnId,
	});

	// Navigate to the board page
	await page.goto(`/pages/kanban/${board.id}`, { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="board-page"]')).toBeVisible();

	// Click on the task card to open the edit modal
	await page.getByText("Task to Edit").click();

	// Wait for the edit dialog to appear
	const dialog = page.locator('div[role="dialog"][data-slot="dialog-content"]');
	await expect(dialog).toBeVisible({ timeout: 5000 });

	// Update the title
	await page.getByLabel("Title").fill("Updated Task Title");

	// Change priority to URGENT - click on the first select trigger (Priority)
	const priorityTrigger = dialog
		.locator('[data-slot="select-trigger"]')
		.first();
	await priorityTrigger.click();
	await page.getByRole("option", { name: /urgent/i }).click();

	// Submit the form
	await page.getByRole("button", { name: /update task/i }).click();

	// Wait for the dialog to close
	await expect(dialog).not.toBeVisible({ timeout: 5000 });

	// Verify the updated task appears
	await expect(page.getByText("Updated Task Title")).toBeVisible({
		timeout: 5000,
	});
	await expect(page.getByText("Urgent")).toBeVisible();

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("delete task", async ({ page, request }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	// Create a board with a task
	const board = await createBoard(request, {
		name: "Delete Task Test Board",
		description: "Board for testing task deletion",
	});

	const columnId = board.columns[0].id;

	await createTask(request, {
		title: "Task to Delete",
		description: "This task will be deleted",
		priority: "LOW",
		columnId: columnId,
	});

	// Navigate to the board page
	await page.goto(`/pages/kanban/${board.id}`, { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="board-page"]')).toBeVisible();

	// Verify the task exists
	await expect(page.getByText("Task to Delete")).toBeVisible();

	// Click on the task to open edit modal
	await page.getByText("Task to Delete").click();

	// Wait for the edit dialog to appear
	const dialog = page.locator('div[role="dialog"][data-slot="dialog-content"]');
	await expect(dialog).toBeVisible({ timeout: 5000 });

	// Click the delete button
	await page.getByRole("button", { name: /delete/i }).click();

	// Wait for the dialog to close
	await expect(dialog).not.toBeVisible({ timeout: 5000 });

	// Verify the task is no longer visible
	await expect(page.getByText("Task to Delete")).not.toBeVisible({
		timeout: 5000,
	});

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("add column to board", async ({ page, request }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	// Create a board
	const board = await createBoard(request, {
		name: "Add Column Test Board",
		description: "Board for testing column addition",
	});

	// Navigate to the board page
	await page.goto(`/pages/kanban/${board.id}`, { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="board-page"]')).toBeVisible();

	// IMPORTANT: Verify default columns are rendered before adding a new one
	// This catches bugs where columns data isn't properly mapped from API response
	await expect(page.getByText("To Do")).toBeVisible({ timeout: 5000 });
	await expect(page.getByText("In Progress")).toBeVisible({ timeout: 5000 });
	await expect(page.getByText("Done")).toBeVisible({ timeout: 5000 });

	// Click the Actions dropdown
	await page.getByRole("button", { name: /actions/i }).click();

	// Click "Add Column" menu item
	await page.getByRole("menuitem", { name: /add column/i }).click();

	// Wait for the column form dialog to appear
	const dialog = page.locator('div[role="dialog"][data-slot="dialog-content"]');
	await expect(dialog).toBeVisible({ timeout: 5000 });

	// Fill out the column form
	await page.getByLabel("Title").fill("Review");

	// Submit the form
	await page.getByRole("button", { name: /create column/i }).click();

	// Wait for the dialog to close
	await expect(dialog).not.toBeVisible({ timeout: 5000 });

	// Verify the new column appears alongside existing columns
	await expect(page.getByText("Review")).toBeVisible({ timeout: 5000 });
	// Verify existing columns are still visible after adding
	await expect(page.getByText("To Do")).toBeVisible();
	await expect(page.getByText("In Progress")).toBeVisible();
	await expect(page.getByText("Done")).toBeVisible();

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("delete board", async ({ page, request }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	// Create a board to delete
	const board = await createBoard(request, {
		name: "Board to Delete",
		description: "This board will be deleted",
	});

	// Navigate to the board page
	await page.goto(`/pages/kanban/${board.id}`, { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="board-page"]')).toBeVisible();

	// Click the Actions dropdown
	await page.getByRole("button", { name: /actions/i }).click();

	// Click "Delete Board" menu item
	await page.getByRole("menuitem", { name: /delete board/i }).click();

	// Wait for the confirmation dialog
	const alertDialog = page.locator(
		'div[role="alertdialog"][data-slot="alert-dialog-content"]',
	);
	await expect(alertDialog).toBeVisible({ timeout: 5000 });

	// Confirm deletion - click the Delete button in the alert dialog
	// Wait for any animations to complete
	await page.waitForTimeout(500);

	// Click the Delete button directly using a more specific selector
	const deleteButton = page.locator('button:text-is("Delete")').last();
	await expect(deleteButton).toBeVisible();
	await expect(deleteButton).toBeEnabled();

	// Click and wait for the response
	await Promise.all([
		page.waitForResponse(
			(res) =>
				res.url().includes("/api/data/boards/") &&
				res.request().method() === "DELETE",
		),
		deleteButton.click(),
	]);

	// Wait for React to process the mutation and trigger navigation
	await page.waitForTimeout(1000);

	// Wait for URL to change to /pages/kanban (the boards list)
	await page.waitForURL("**/pages/kanban", { timeout: 15000 });

	// Wait for boards list page to be visible
	await expect(page.locator('[data-testid="boards-list-page"]')).toBeVisible({
		timeout: 10000,
	});

	// Filter out 404 errors that are expected after deletion (stale resource requests)
	const criticalErrors = errors.filter(
		(e) => !e.includes("404") && !e.includes("Failed to load resource"),
	);
	expect(
		criticalErrors,
		`Console errors detected: \n${criticalErrors.join("\n")}`,
	).toEqual([]);
});

test("new board page renders", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	await page.goto("/pages/kanban/new", { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="new-board-page"]')).toBeVisible();
	await expect(page).toHaveTitle(/Create New Board/i);
	await expect(page.getByTestId("page-header")).toBeVisible();

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("create board from new board page", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	// Navigate to new board page
	await page.goto("/pages/kanban/new", { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="new-board-page"]')).toBeVisible();

	// Fill out the form
	await page.getByLabel("Name").fill("Created via UI");
	await page.getByLabel("Description").fill("Board created via the UI form");

	// Submit the form
	await page.getByRole("button", { name: /create board/i }).click();

	// Wait for navigation to the new board page
	await page.waitForURL("**/pages/kanban/**", { timeout: 10000 });
	await expect(page.locator('[data-testid="board-page"]')).toBeVisible();

	// Verify the board name
	await expect(page.getByTestId("page-header")).toHaveText("Created via UI");

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

test("board page with tasks shows priority badges", async ({
	page,
	request,
}) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	// Create a board
	const board = await createBoard(request, {
		name: "Priority Badge Test Board",
		description: "Testing priority badge display",
	});

	const columnId = board.columns[0].id;

	// Create tasks with different priorities
	await createTask(request, {
		title: "Low Priority Task",
		priority: "LOW",
		columnId: columnId,
	});

	await createTask(request, {
		title: "Medium Priority Task",
		priority: "MEDIUM",
		columnId: columnId,
	});

	await createTask(request, {
		title: "High Priority Task",
		priority: "HIGH",
		columnId: columnId,
	});

	await createTask(request, {
		title: "Urgent Priority Task",
		priority: "URGENT",
		columnId: columnId,
	});

	// Navigate to the board page
	await page.goto(`/pages/kanban/${board.id}`, { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="board-page"]')).toBeVisible();

	// Verify all tasks are visible
	await expect(page.getByText("Low Priority Task")).toBeVisible();
	await expect(page.getByText("Medium Priority Task")).toBeVisible();
	await expect(page.getByText("High Priority Task")).toBeVisible();
	await expect(page.getByText("Urgent Priority Task")).toBeVisible();

	// Verify priority badges are displayed (use exact match to avoid matching task titles)
	await expect(page.getByText("Low", { exact: true })).toBeVisible();
	await expect(page.getByText("Medium", { exact: true })).toBeVisible();
	await expect(page.getByText("High", { exact: true })).toBeVisible();
	await expect(page.getByText("Urgent", { exact: true })).toBeVisible();

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

// ============ Assignee Tests ============

test("task with assignee displays avatar", async ({ page, request }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	// Create a board with a task that has an assignee
	const board = await createBoard(request, {
		name: "Avatar Display Test Board",
		description: "Testing assignee avatar display",
	});

	const columnId = board.columns[0].id;

	// Create a task with Alice Johnson assigned (user-1)
	await createTask(request, {
		title: "Task with Avatar",
		priority: "MEDIUM",
		columnId: columnId,
		assigneeId: "user-1",
	});

	// Navigate to the board page
	await page.goto(`/pages/kanban/${board.id}`, { waitUntil: "networkidle" });
	await expect(page.locator('[data-testid="board-page"]')).toBeVisible();

	// Verify the task is visible
	await expect(page.getByText("Task with Avatar")).toBeVisible();

	// Verify the assignee name is shown
	await expect(page.getByText("Alice Johnson")).toBeVisible();

	// Verify an avatar image is displayed (from dicebear)
	const avatar = page.locator('img[src*="dicebear"]');
	await expect(avatar).toBeVisible();

	expect(errors, `Console errors detected: \n${errors.join("\n")}`).toEqual([]);
});

// Helper function to create a board
async function createBoard(
	request: APIRequestContext,
	data: {
		name: string;
		description?: string;
	},
) {
	const response = await request.post("/api/data/boards", {
		headers: {
			"content-type": "application/json",
		},
		data: {
			name: data.name,
			description: data.description,
		},
	});
	expect(response.ok()).toBeTruthy();
	const board = await response.json();
	expect(board.name).toBe(data.name);
	return board;
}

// Helper function to create a task
async function createTask(
	request: APIRequestContext,
	data: {
		title: string;
		description?: string;
		priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
		columnId: string;
		assigneeId?: string;
	},
) {
	const response = await request.post("/api/data/tasks", {
		headers: {
			"content-type": "application/json",
		},
		data: {
			title: data.title,
			description: data.description,
			priority: data.priority || "MEDIUM",
			columnId: data.columnId,
			assigneeId: data.assigneeId,
		},
	});
	expect(response.ok()).toBeTruthy();
	const task = await response.json();
	expect(task.title).toBe(data.title);
	return task;
}
