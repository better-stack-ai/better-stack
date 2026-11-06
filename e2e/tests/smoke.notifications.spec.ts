import { expect, test } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

test("task assignments reach the assignee inbox and respect delivery preferences", async ({
	page,
	request,
}) => {
	const recipientId = `notifications-assignee-${Date.now()}`;
	const adminHeaders = mockAuthHeaders();
	const boardResponse = await request.post("/api/data/boards", {
		headers: adminHeaders,
		data: { name: "Notification assignment bridge" },
	});
	expect(boardResponse.ok(), await boardResponse.text()).toBe(true);
	const board = await boardResponse.json();
	try {
		const taskResponse = await request.post("/api/data/tasks", {
			headers: adminHeaders,
			data: { title: "Review the launch plan", columnId: board.columns[0].id },
		});
		expect(taskResponse.ok(), await taskResponse.text()).toBe(true);
		const task = await taskResponse.json();
		const assigned = await request.put(`/api/data/tasks/${task.id}`, {
			headers: adminHeaders,
			data: { assigneeId: recipientId },
		});
		expect(assigned.ok(), await assigned.text()).toBe(true);

		const inbox = await request.get("/api/data/notifications", {
			headers: mockAuthHeaders(recipientId),
		});
		expect(inbox.ok(), await inbox.text()).toBe(true);
		const { items } = await inbox.json();
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ recipientId, category: "kanban" });
		expect(`${items[0].title} ${items[0].body}`).toContain(task.title);

		await setMockAuthCookie(page.context(), recipientId);
		await page.goto("/pages/notifications");
		await expect(page.getByText(items[0].title, { exact: true })).toBeVisible();
		await expect(page.getByLabel("1 unread notifications")).toBeVisible();

		const unchangedAssignee = await request.put(`/api/data/tasks/${task.id}`, {
			headers: adminHeaders,
			data: {
				title: "Review the revised launch plan",
				assigneeId: recipientId,
			},
		});
		expect(unchangedAssignee.ok(), await unchangedAssignee.text()).toBe(true);
		await page.goto("/pages/notifications/preferences");
		await page
			.getByLabel("kanban in-app notifications", { exact: true })
			.uncheck();
		await page
			.getByRole("button", { name: "Save preferences", exact: true })
			.click();
		await expect(
			page.getByRole("status").filter({ hasText: "Preferences saved." }),
		).toBeVisible();
		const mutedAssignment = await request.post("/api/data/tasks", {
			headers: adminHeaders,
			data: {
				title: "Muted assignment",
				columnId: board.columns[0].id,
				assigneeId: recipientId,
			},
		});
		expect(mutedAssignment.ok(), await mutedAssignment.text()).toBe(true);
		const filteredInbox = await request.get("/api/data/notifications", {
			headers: mockAuthHeaders(recipientId),
		});
		expect(filteredInbox.ok(), await filteredInbox.text()).toBe(true);
		expect((await filteredInbox.json()).items).toHaveLength(1);
	} finally {
		await request.delete(`/api/data/boards/${board.id}`, {
			headers: adminHeaders,
		});
	}
});

test("recipient reads, archives, and configures notification delivery", async ({
	page,
	request,
}) => {
	const recipientId = `notifications-${Date.now()}`;
	const title = `Project export ${Date.now()}`;
	const sent = await request.post("/api/data/notifications/send", {
		headers: mockAuthHeaders(),
		data: {
			recipientId,
			category: "updates",
			title,
			body: "Your export is ready.",
		},
	});
	expect(sent.ok(), await sent.text()).toBe(true);
	const notification = (await sent.json()).notification;

	await setMockAuthCookie(page.context(), recipientId);
	await page.goto("/pages/notifications");
	await expect(
		page.getByRole("heading", { name: "Notifications", exact: true }),
	).toBeVisible();
	await expect(page.getByText(title, { exact: true })).toBeVisible();
	await expect(page.getByLabel("1 unread notifications")).toBeVisible();
	await page
		.getByRole("button", { name: "Notifications", exact: true })
		.click();
	await expect(
		page.getByRole("dialog", { name: "Recent notifications" }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await page
		.getByRole("button", { name: "Mark all as read", exact: true })
		.click();
	await expect(page.getByLabel("1 unread notifications")).toHaveCount(0);
	await page.getByRole("button", { name: "Archive", exact: true }).click();
	await expect(page.getByText(title, { exact: true })).toHaveCount(0);

	await page.goto("/pages/notifications/preferences");
	await expect(
		page.getByRole("heading", { name: "Notification preferences" }),
	).toBeVisible();
	await page
		.getByLabel("updates in-app notifications", { exact: true })
		.uncheck();
	await page
		.getByRole("button", { name: "Save preferences", exact: true })
		.click();
	await expect
		.poll(async () => {
			const response = await request.get(
				"/api/data/notifications/preferences",
				{ headers: mockAuthHeaders(recipientId) },
			);
			const preferences = await response.json();
			return preferences.find(
				(preference: { category: string }) => preference.category === "updates",
			)?.inApp;
		})
		.toBe(false);
	await page.reload();
	await expect(
		page.getByLabel("updates in-app notifications", { exact: true }),
	).not.toBeChecked();

	const otherRecipient = await request.post(
		`/api/data/notifications/${notification.id}/read`,
		{
			headers: mockAuthHeaders("another-user"),
			data: {},
		},
	);
	expect([403, 404]).toContain(otherRecipient.status());
	const ordinarySend = await request.post("/api/data/notifications/send", {
		headers: mockAuthHeaders(recipientId),
		data: { recipientId, category: "updates", title: "Denied", body: "Denied" },
	});
	expect(ordinarySend.status()).toBe(403);
});
