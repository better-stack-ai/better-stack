import { expect, test } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

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
