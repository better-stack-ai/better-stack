import { expect, test } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

test("search keeps public and internal conversations separate and persists queue filters", async ({
	page,
	context,
	request,
}) => {
	const browserErrors: string[] = [];
	page.on("pageerror", (error) => browserErrors.push(error.message));
	page.on("console", (message) => {
		if (
			message.type() === "error" &&
			/hydration|hydrating/i.test(message.text())
		)
			browserErrors.push(message.text());
	});
	const suffix = Date.now();
	const customer = `search-customer-${suffix}`;
	const publicTerm = `café & invoice ${suffix}`;
	const privateTerm = `private-ledger-${suffix}`;
	const subject = `Invoice download ${suffix}`;
	const create = await request.post("/api/data/helpdesk/tickets", {
		headers: mockAuthHeaders(customer),
		data: { subject, body: publicTerm, priority: "urgent" },
	});
	expect(create.ok(), await create.text()).toBeTruthy();
	const ticket = await create.json();
	const other = await request.post("/api/data/helpdesk/tickets", {
		headers: mockAuthHeaders(`other-${customer}`),
		data: { subject: `Another customer's invoice ${suffix}`, body: publicTerm },
	});
	expect(other.ok(), await other.text()).toBeTruthy();
	const note = await request.post(
		`/api/data/helpdesk/inbox/${ticket.id}/replies`,
		{
			headers: mockAuthHeaders(),
			data: { body: privateTerm, isInternalNote: true },
		},
	);
	expect(note.ok(), await note.text()).toBeTruthy();
	const update = await request.put(`/api/data/helpdesk/inbox/${ticket.id}`, {
		headers: mockAuthHeaders(),
		data: { status: "pending", assigneeId: "admin-e2e" },
	});
	expect(update.ok(), await update.text()).toBeTruthy();

	await setMockAuthCookie(context, customer);
	await page.goto("/pages/helpdesk");
	await page.getByLabel("Search tickets", { exact: true }).fill(publicTerm);
	await page.getByRole("button", { name: "Search", exact: true }).click();
	await expect(
		page.getByRole("link", { name: subject, exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("link", {
			name: `Another customer's invoice ${suffix}`,
			exact: true,
		}),
	).toHaveCount(0);
	expect(new URL(page.url()).searchParams.get("search")).toBe(publicTerm);
	await page.reload();
	await expect(page.getByLabel("Search tickets", { exact: true })).toHaveValue(
		publicTerm,
	);
	await page.getByLabel("Search tickets", { exact: true }).fill(privateTerm);
	await page.getByRole("button", { name: "Search", exact: true }).click();
	await expect(
		page.getByRole("link", { name: subject, exact: true }),
	).toHaveCount(0);
	await expect(
		page.getByText("No tickets match these filters.", { exact: true }),
	).toBeVisible();

	await setMockAuthCookie(context);
	await page.goto(
		`/pages/helpdesk/inbox?status=pending&priority=urgent&assigneeId=admin-e2e&offset=25`,
	);
	await page.getByLabel("Search tickets", { exact: true }).fill(privateTerm);
	await page.getByRole("button", { name: "Search", exact: true }).click();
	await expect(
		page.getByRole("link", { name: subject, exact: true }),
	).toBeVisible();
	const params = new URL(page.url()).searchParams;
	expect(params.get("search")).toBe(privateTerm);
	expect(params.get("status")).toBe("pending");
	expect(params.get("priority")).toBe("urgent");
	expect(params.get("assigneeId")).toBe("admin-e2e");
	expect(params.get("offset")).toBeNull();
	await page
		.getByLabel("Filter by status", { exact: true })
		.selectOption("resolved");
	await expect(
		page.getByRole("link", { name: subject, exact: true }),
	).toHaveCount(0);
	await expect(
		page.getByText("No tickets match these filters.", { exact: true }),
	).toBeVisible();
	await page.goBack();
	await expect(
		page.getByLabel("Filter by status", { exact: true }),
	).toHaveValue("pending");
	await expect(page.getByLabel("Search tickets", { exact: true })).toHaveValue(
		privateTerm,
	);
	await expect(
		page.getByRole("link", { name: subject, exact: true }),
	).toBeVisible();
	expect(browserErrors).toEqual([]);
});

test("customer portal and agent inbox keep internal notes private", async ({
	page,
	context,
	request,
}) => {
	const customer = `helpdesk-customer-${Date.now()}`;
	const subject = `Cannot access my invoice ${Date.now()}`;
	await setMockAuthCookie(context, customer);
	await page.goto("/pages/helpdesk");
	await expect(
		page.getByRole("heading", { name: "My support tickets" }),
	).toBeVisible();
	await expect(
		page.locator("form[data-hydrated]").filter({
			has: page.getByRole("button", { name: "Open ticket", exact: true }),
		}),
	).toHaveAttribute("data-hydrated", "true");
	await page.getByLabel("Subject", { exact: true }).fill(subject);
	await page
		.getByLabel("Message", { exact: true })
		.fill("Please help me download my invoice.");
	await page.getByRole("button", { name: "Open ticket", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: subject, exact: true }),
	).toBeVisible();
	const ticketId = page.url().split("/").at(-1)!;
	await page
		.getByLabel("Reply", { exact: true })
		.fill("The invoice is from last month.");
	await page.getByRole("button", { name: "Send reply", exact: true }).click();
	await expect(
		page.getByText("The invoice is from last month.", { exact: true }),
	).toBeVisible();

	const forbidden = await request.get(
		`/api/data/helpdesk/tickets/${ticketId}`,
		{
			headers: mockAuthHeaders("another-helpdesk-customer"),
		},
	);
	expect(forbidden.status()).toBe(403);
	const agentOnly = await request.get("/api/data/helpdesk/inbox", {
		headers: mockAuthHeaders(customer),
	});
	expect(agentOnly.status()).toBe(403);

	const canned = await request.post("/api/data/helpdesk/canned-replies", {
		headers: mockAuthHeaders(),
		data: {
			title: `Invoice answer ${Date.now()}`,
			body: "Your invoice is ready to download.",
		},
	});
	expect(canned.ok(), await canned.text()).toBeTruthy();
	const cannedReply = await canned.json();
	await setMockAuthCookie(context);
	await page.goto(`/pages/helpdesk/inbox/${ticketId}`);
	await expect(
		page.getByRole("heading", { name: subject, exact: true }),
	).toBeVisible();
	await expect(
		page.locator("form[data-hydrated]").filter({
			has: page.getByRole("button", { name: "Save ticket", exact: true }),
		}),
	).toHaveAttribute("data-hydrated", "true");
	await page.getByLabel("Status", { exact: true }).selectOption("pending");
	await page.getByLabel("Priority", { exact: true }).selectOption("urgent");
	await page.getByLabel("Assignee ID", { exact: true }).fill("admin-e2e");
	await page.getByRole("button", { name: "Save ticket", exact: true }).click();
	await expect(
		page.getByText("Ticket updated.", { exact: true }),
	).toBeVisible();
	await page
		.getByLabel("Message visibility", { exact: true })
		.selectOption("internal");
	await page
		.getByLabel("Reply", { exact: true })
		.fill("Private billing investigation.");
	await page
		.getByRole("button", { name: "Add internal note", exact: true })
		.click();
	await expect(
		page.getByText("Private billing investigation.", { exact: true }),
	).toBeVisible();
	const internalNoteInbox = await request.get("/api/data/notifications", {
		headers: mockAuthHeaders(customer),
	});
	expect(internalNoteInbox.ok(), await internalNoteInbox.text()).toBe(true);
	expect((await internalNoteInbox.json()).items).toHaveLength(0);
	await page
		.getByLabel("Message visibility", { exact: true })
		.selectOption("public");
	await page
		.getByLabel("Canned reply", { exact: true })
		.selectOption(cannedReply.id);
	await expect(page.getByLabel("Reply", { exact: true })).toHaveValue(
		"Your invoice is ready to download.",
	);
	await page.getByRole("button", { name: "Send reply", exact: true }).click();
	await expect(
		page.getByText("Your invoice is ready to download.", { exact: true }),
	).toBeVisible();
	const publicReplyInbox = await request.get("/api/data/notifications", {
		headers: mockAuthHeaders(customer),
	});
	expect(publicReplyInbox.ok(), await publicReplyInbox.text()).toBe(true);
	const requesterNotifications = (await publicReplyInbox.json()).items;
	expect(requesterNotifications).toHaveLength(1);
	expect(requesterNotifications[0]).toMatchObject({
		recipientId: customer,
		category: "helpdesk",
	});
	expect(JSON.stringify(requesterNotifications)).not.toContain(
		"Private billing investigation.",
	);
	await page.goto("/pages/helpdesk/inbox");
	await expect(
		page.getByRole("heading", { name: "Support inbox" }),
	).toBeVisible();
	await expect(page.getByText(subject, { exact: true })).toBeVisible();

	await setMockAuthCookie(context, customer);
	await page.goto(`/pages/helpdesk/${ticketId}`);
	await expect(
		page.getByText("Your invoice is ready to download.", { exact: true }),
	).toBeVisible();
	await expect(
		page.getByText("Private billing investigation.", { exact: true }),
	).toHaveCount(0);
	const customerResponse = await request.get(
		`/api/data/helpdesk/tickets/${ticketId}`,
		{
			headers: mockAuthHeaders(customer),
		},
	);
	expect(customerResponse.ok()).toBeTruthy();
	const detail = await customerResponse.json();
	expect(JSON.stringify(detail)).not.toContain(
		"Private billing investigation.",
	);
	expect(detail).not.toHaveProperty("assigneeId");
	expect(detail).not.toHaveProperty("slaDueAt");
	for (const message of detail.messages) {
		expect(message).not.toHaveProperty("isInternalNote");
		expect(message).not.toHaveProperty("authorId");
	}
});

test("private attachments support retry and removal without leaking internal-note files", async ({
	page,
	context,
	request,
}) => {
	const customer = `attachment-customer-${Date.now()}`;
	const create = await request.post("/api/data/helpdesk/tickets", {
		headers: mockAuthHeaders(customer),
		data: {
			subject: "Attachment access",
			body: "Please review my screenshot.",
		},
	});
	expect(create.ok(), await create.text()).toBeTruthy();
	const ticket = await create.json();
	const customerAttachments = `/api/data/helpdesk/tickets/${ticket.id}/attachments`;
	await setMockAuthCookie(context, customer);
	await page.goto(`/pages/helpdesk/${ticket.id}`);
	await page
		.getByLabel("Reply", { exact: true })
		.fill("The screenshot is attached.");
	await page.route(
		`**${customerAttachments}`,
		async (route) => {
			await route.fulfill({
				status: 500,
				contentType: "application/json",
				body: JSON.stringify({ message: "Temporary storage failure" }),
			});
		},
		{ times: 1 },
	);
	await page.getByLabel("Attach files", { exact: true }).setInputFiles({
		name: "screenshot.png",
		mimeType: "image/png",
		buffer: Buffer.from("private screenshot"),
	});
	await expect(
		page.getByRole("button", { name: "Retry screenshot.png", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Send reply", exact: true }),
	).toBeDisabled();
	await page
		.getByRole("button", { name: "Retry screenshot.png", exact: true })
		.click();
	await expect(page.getByText("Ready to send", { exact: true })).toBeVisible();
	await page
		.getByRole("button", { name: "Remove screenshot.png", exact: true })
		.click();
	await expect(page.getByText("screenshot.png", { exact: true })).toHaveCount(
		0,
	);

	await page.getByLabel("Attach files", { exact: true }).setInputFiles({
		name: "screenshot.png",
		mimeType: "image/png",
		buffer: Buffer.from("private screenshot"),
	});
	await expect(page.getByText("Ready to send", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Send reply", exact: true }).click();
	const publicFile = page.getByRole("link", {
		name: "Download screenshot.png",
		exact: true,
	});
	await expect(publicFile).toBeVisible();
	const publicHref = await publicFile.getAttribute("href");
	expect(publicHref).toBeTruthy();
	const download = await request.get(publicHref!, {
		headers: mockAuthHeaders(customer),
	});
	expect(download.ok(), await download.text()).toBeTruthy();
	expect(await download.text()).toBe("private screenshot");
	expect(download.headers()["content-disposition"]).toContain("attachment;");
	const crossCustomer = await request.get(publicHref!, {
		headers: mockAuthHeaders(`other-${customer}`),
	});
	expect([403, 404]).toContain(crossCustomer.status());
	const forged = await request.post(
		`/api/data/helpdesk/tickets/${ticket.id}/replies`,
		{
			headers: mockAuthHeaders(customer),
			data: {
				body: "Forged attachment",
				attachmentIds: ["arbitrary-media-asset"],
			},
		},
	);
	expect(forged.ok()).toBe(false);

	await setMockAuthCookie(context);
	await page.goto(`/pages/helpdesk/inbox/${ticket.id}`);
	await page
		.getByLabel("Message visibility", { exact: true })
		.selectOption("internal");
	await page
		.getByLabel("Reply", { exact: true })
		.fill("Private investigation.");
	await page.getByLabel("Attach files", { exact: true }).setInputFiles({
		name: "internal-ledger.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from("private internal ledger"),
	});
	await expect(page.getByText("Ready to send", { exact: true })).toBeVisible();
	await page
		.getByRole("button", { name: "Add internal note", exact: true })
		.click();
	const privateFile = page.getByRole("link", {
		name: "Download internal-ledger.pdf",
		exact: true,
	});
	await expect(privateFile).toBeVisible();
	const privateHref = await privateFile.getAttribute("href");
	const internalDownload = await request.get(privateHref!, {
		headers: mockAuthHeaders(customer),
	});
	expect([403, 404]).toContain(internalDownload.status());
	const detail = await request.get(`/api/data/helpdesk/tickets/${ticket.id}`, {
		headers: mockAuthHeaders(customer),
	});
	const projection = await detail.json();
	expect(projection.messages).toHaveLength(2);
	expect(JSON.stringify(projection)).not.toContain("internal-ledger");
	expect(JSON.stringify(projection)).not.toContain("Private investigation");
	await setMockAuthCookie(context, customer);
	await page.goto(`/pages/helpdesk/${ticket.id}`);
	await expect(publicFile).toBeVisible();
	await expect(
		page.getByRole("link", {
			name: "Download internal-ledger.pdf",
			exact: true,
		}),
	).toHaveCount(0);
});
