import { expect, test } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

test("Feedback links Comments and Kanban, Helpdesk links CRM and drafts replies without sending", async ({
	page,
	context,
	request,
}) => {
	const suffix = Date.now().toString(36);
	const headers = mockAuthHeaders();
	const postResponse = await request.post("/api/data/feedback/posts", {
		headers,
		data: {
			title: `Export invoices ${suffix}`,
			body: "Please add CSV invoice exports.",
		},
	});
	expect(postResponse.ok(), await postResponse.text()).toBeTruthy();
	const post = await postResponse.json();
	const boardResponse = await request.post("/api/data/boards", {
		headers,
		data: { name: `Feedback triage ${suffix}` },
	});
	expect(boardResponse.ok(), await boardResponse.text()).toBeTruthy();
	const board = await boardResponse.json();
	const columnResponse = await request.post("/api/data/columns", {
		headers,
		data: { title: "Planned", boardId: board.id },
	});
	expect(columnResponse.ok(), await columnResponse.text()).toBeTruthy();
	await setMockAuthCookie(context);
	await page.goto(`/pages/feedback/${post.slug}`);
	await page.getByLabel("Kanban board", { exact: true }).selectOption(board.id);
	await page
		.getByRole("button", { name: "Create Kanban task", exact: true })
		.click();
	await expect(page.getByText(/^Linked task:/)).toBeVisible();
	const linked = await (
		await request.get(`/api/data/feedback/posts/${post.slug}`, { headers })
	).json();
	expect(linked.kanbanTaskId).toBeTruthy();
	const updatedBoard = await (
		await request.get(`/api/data/boards/${board.id}`, { headers })
	).json();
	expect(
		updatedBoard.columns.flatMap(
			(column: { tasks: { id: string; title: string }[] }) => column.tasks,
		),
	).toContainEqual(
		expect.objectContaining({ id: linked.kanbanTaskId, title: post.title }),
	);
	await expect(page.getByRole("heading", { name: /Comments/i })).toBeVisible();

	const email = `customer-${suffix}@example.com`;
	const contactResponse = await request.post("/api/data/crm/contacts", {
		headers,
		data: { firstName: "Alex", lastName: "Customer", email, company: "Acme" },
	});
	expect(contactResponse.ok(), await contactResponse.text()).toBeTruthy();
	const contact = await contactResponse.json();
	const victimResponse = await request.post("/api/data/crm/contacts", {
		headers,
		data: { firstName: "Unrelated", email: `victim-${suffix}@example.com` },
	});
	const victim = await victimResponse.json();
	const customerHeaders = mockAuthHeaders(`customer-${suffix}`);
	const ticketResponse = await request.post("/api/data/helpdesk/tickets", {
		headers: customerHeaders,
		data: {
			subject: `Invoice question ${suffix}`,
			body: "Where can I download my invoice?",
			requesterEmail: victim.email,
		},
	});
	expect(ticketResponse.ok(), await ticketResponse.text()).toBeTruthy();
	const ticket = await ticketResponse.json();
	const cannedResponse = await request.post(
		"/api/data/helpdesk/canned-replies",
		{
			headers,
			data: {
				title: `Invoice instructions ${suffix}`,
				body: "Open Billing, then choose Download invoice.",
			},
		},
	);
	expect(cannedResponse.ok(), await cannedResponse.text()).toBeTruthy();
	await page.goto(`/pages/helpdesk/inbox/${ticket.id}`);
	await expect(page.getByRole("region", { name: "CRM contact" })).toContainText(
		"Alex Customer",
	);
	await page.getByLabel("Status", { exact: true }).selectOption("resolved");
	await page.getByRole("button", { name: "Save ticket", exact: true }).click();
	await expect(
		page.getByText("Ticket updated.", { exact: true }),
	).toBeVisible();
	const activitiesResponse = await request.get(
		`/api/data/crm/activities?contactId=${contact.id}`,
		{ headers },
	);
	const activities = await activitiesResponse.json();
	const victimActivities = await (
		await request.get(`/api/data/crm/activities?contactId=${victim.id}`, {
			headers,
		})
	).json();
	expect(victimActivities.items).toEqual([]);
	expect(activities.items).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				body: `Support ticket created: ${ticket.subject} (${ticket.id})`,
			}),
			expect.objectContaining({
				body: `Support ticket resolved: ${ticket.subject} (${ticket.id})`,
			}),
		]),
	);

	const draft =
		"Open Billing, then choose Download invoice. Let us know if you need anything else.";
	let captured: Record<string, unknown> | undefined;
	let mockedRequests = 0;
	await page.route("**/api/data/chat", async (route) => {
		captured ??= route.request().postDataJSON();
		mockedRequests++;
		const input = { ticketId: ticket.id, body: draft };
		const events =
			mockedRequests === 1
				? [
						{ type: "start", messageId: "ticket-draft-demo" },
						{ type: "start-step" },
						{
							type: "tool-input-available",
							toolCallId: "ticket-draft-call",
							toolName: "draftTicketReply",
							input,
						},
						{ type: "finish-step" },
						{ type: "finish" },
					]
				: [
						{ type: "start", messageId: "ticket-draft-confirmation" },
						{ type: "finish" },
					];
		await route.fulfill({
			status: 200,
			headers: {
				"Content-Type": "text/event-stream",
				"x-vercel-ai-ui-message-stream": "v1",
			},
			body:
				events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
				"data: [DONE]\n\n",
		});
	});
	await page
		.getByLabel("Message visibility", { exact: true })
		.selectOption("internal");
	await page.getByTestId("widget-trigger").focus();
	await page.getByTestId("widget-trigger").press("Enter");
	await page
		.getByPlaceholder("Type a message...")
		.last()
		.fill("Draft a reply to this ticket");
	await page.keyboard.press("Enter");
	await expect(page.getByLabel("Reply", { exact: true })).toHaveValue(draft);
	await expect(
		page.getByLabel("Message visibility", { exact: true }),
	).toHaveValue("public");
	expect(captured?.availableTools).toContain("draftTicketReply");
	expect(captured?.pageContext).toContain("Where can I download my invoice?");
	expect(captured?.pageContext).toContain(
		"Open Billing, then choose Download invoice.",
	);
	const detail = await (
		await request.get(`/api/data/helpdesk/inbox/${ticket.id}`, { headers })
	).json();
	expect(detail.messages).toHaveLength(1);
});
