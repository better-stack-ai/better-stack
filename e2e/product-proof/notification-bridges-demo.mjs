import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const recipientId = "notifications-bridge-demo361";
let board;
let task;
let ticket;
const consoleErrors = [];

async function request(
	baseURL,
	path,
	method = "GET",
	data,
	user = "admin-e2e",
) {
	const response = await fetch(`${baseURL}/api/data${path}`, {
		method,
		headers: {
			cookie: `btst.example_session=mock-session-${user}`,
			...(data ? { "content-type": "application/json" } : {}),
		},
		...(data ? { body: JSON.stringify(data) } : {}),
		signal: AbortSignal.timeout(10000),
	});
	assert.ok(response.ok, `${method} ${path}: ${response.status}`);
	return response.json();
}

async function inbox(baseURL, expectedCount) {
	const result = await request(
		baseURL,
		"/notifications",
		"GET",
		undefined,
		recipientId,
	);
	assert.equal(result.items.length, expectedCount);
	assert.ok(!JSON.stringify(result).includes("Private billing investigation"));
}

export const config = {
	baseURL: process.env.PRODUCT_PROOF_BASE_URL ?? "http://localhost:3006",
	outDir: fileURLToPath(
		new URL("../../docs/assets/notifications/lifecycle", import.meta.url),
	),
	videoName: "demo",
	viewport: { width: 1440, height: 900 },
	captionHold: 2800,
	captionStyle: { accent: "#2563eb" },
	async signIn({ context, baseURL }) {
		context.on("page", (page) => {
			page.on("console", (message) => {
				if (message.type() === "error") consoleErrors.push(message.text());
			});
			page.on("pageerror", (error) => consoleErrors.push(error.message));
		});
		const previous = await request(
			baseURL,
			"/notifications?limit=100",
			"GET",
			undefined,
			recipientId,
		);
		for (const notification of previous.items)
			await request(
				baseURL,
				`/notifications/${notification.id}/archive`,
				"POST",
				{},
				recipientId,
			);
		await request(
			baseURL,
			"/notifications/preferences",
			"PUT",
			{
				preferences: ["kanban", "helpdesk"].map((category) => ({
					category,
					inApp: true,
					email: false,
				})),
			},
			recipientId,
		);
		const boards = await request(baseURL, "/boards");
		for (const previousBoard of boards.items)
			if (previousBoard.name === "Notification bridge demo")
				await request(baseURL, `/boards/${previousBoard.id}`, "DELETE");
		board = await request(baseURL, "/boards", "POST", {
			name: "Notification bridge demo",
		});
		task = await request(baseURL, "/tasks", "POST", {
			title: "Review the launch plan",
			columnId: board.columns[0].id,
		});
		ticket = await request(
			baseURL,
			"/helpdesk/tickets",
			"POST",
			{
				subject: "Access to the November invoice",
				body: "Please help me download the November invoice.",
			},
			recipientId,
		);
		await context.addCookies([
			{
				name: "btst.example_session",
				value: `mock-session-${recipientId}`,
				url: baseURL,
				httpOnly: true,
				sameSite: "Lax",
			},
		]);
	},
};

export const beats = [
	{
		name: "Empty inbox before assignment",
		async run({ page, goto, caption, baseURL }) {
			await goto("/pages/notifications");
			await page.getByText("You're all caught up.", { exact: true }).waitFor();
			await inbox(baseURL, 0);
			await caption("Before assignment, the recipient has no notifications.");
		},
	},
	{
		name: "Task assignment delivered",
		async run({ page, goto, caption, baseURL }) {
			await request(baseURL, `/tasks/${task.id}`, "PUT", {
				assigneeId: recipientId,
			});
			await goto("/pages/notifications");
			await page.getByText("Task assigned to you", { exact: true }).waitFor();
			await page.getByText(task.title, { exact: true }).waitFor();
			await inbox(baseURL, 1);
			await caption(
				"Assigning a Kanban task delivers a notification to its assignee.",
			);
		},
	},
	{
		name: "Internal note excluded",
		async run({ page, goto, caption, baseURL }) {
			await request(baseURL, `/helpdesk/inbox/${ticket.id}/replies`, "POST", {
				body: "Private billing investigation",
				isInternalNote: true,
			});
			await goto("/pages/notifications");
			await inbox(baseURL, 1);
			assert.equal(
				await page
					.getByText("Private billing investigation", { exact: true })
					.count(),
				0,
			);
			await caption(
				"An internal Helpdesk note leaves the requester inbox unchanged.",
			);
		},
	},
	{
		name: "Public support reply delivered",
		async run({ page, goto, caption, baseURL }) {
			await request(baseURL, `/helpdesk/inbox/${ticket.id}/replies`, "POST", {
				body: "Your invoice is ready to download.",
				isInternalNote: false,
			});
			await goto("/pages/notifications");
			await page
				.getByText("New reply to your support ticket", { exact: true })
				.waitFor();
			await inbox(baseURL, 2);
			await caption(
				"A public support reply notifies the requester without exposing internal notes.",
			);
		},
	},
	{
		name: "Kanban delivery disabled",
		async run({ page, goto, caption }) {
			await goto("/pages/notifications/preferences");
			await page
				.getByLabel("kanban in-app notifications", { exact: true })
				.uncheck();
			await page
				.getByRole("button", { name: "Save preferences", exact: true })
				.click();
			await page
				.getByRole("status")
				.filter({ hasText: "Preferences saved." })
				.waitFor();
			await caption(
				"Kanban delivery can be muted while Helpdesk notifications stay enabled.",
			);
		},
	},
	{
		name: "Muted assignment filtered",
		async run({ page, goto, caption, baseURL }) {
			await request(baseURL, "/tasks", "POST", {
				title: "Muted follow-up assignment",
				columnId: board.columns[0].id,
				assigneeId: recipientId,
			});
			await goto("/pages/notifications");
			await inbox(baseURL, 2);
			assert.equal(
				await page
					.getByText("Muted follow-up assignment", { exact: true })
					.count(),
				0,
			);
			assert.deepEqual(consoleErrors, []);
			await caption(
				"The next assignment succeeds without adding a muted notification.",
			);
		},
	},
];
