import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const customer = "helpdesk-sla-demo378";
const subject = "Restore invoice access";
let ticket;
const browserErrors = [];

async function request(
	baseURL,
	path,
	method = "GET",
	data,
	user = "admin-e2e",
) {
	const response = await fetch(`${baseURL}/api/data/helpdesk${path}`, {
		method,
		headers: {
			cookie: `btst.example_session=mock-session-${user}`,
			...(data ? { "content-type": "application/json" } : {}),
		},
		...(data ? { body: JSON.stringify(data) } : {}),
		signal: AbortSignal.timeout(10_000),
	});
	assert.ok(response.ok, `${method} ${path}: ${response.status}`);
	return response.json();
}

export const config = {
	baseURL: process.env.PRODUCT_PROOF_BASE_URL ?? "http://localhost:3006",
	outDir: fileURLToPath(
		new URL("../../docs/assets/helpdesk-sla", import.meta.url),
	),
	videoName: "helpdesk-sla",
	viewport: { width: 1440, height: 1000 },
	captionHold: 2800,
	captionStyle: { accent: "#475569" },
	async signIn({ context, baseURL }) {
		context.on("page", (page) => {
			page.on("pageerror", (error) => browserErrors.push(error.message));
			page.on("console", (message) => {
				if (message.type() === "error") browserErrors.push(message.text());
			});
		});
		const created = await request(
			baseURL,
			"/tickets",
			"POST",
			{
				subject,
				body: "I cannot download this month's invoice. Please restore my access.",
				priority: "urgent",
			},
			customer,
		);
		ticket = await request(baseURL, `/inbox/${created.id}`);
		assert.ok(Date.parse(ticket.resolutionDueAt) > Date.parse(ticket.slaDueAt));
		writeFileSync(
			new URL("../../docs/assets/helpdesk-sla/fixture.json", import.meta.url),
			`${JSON.stringify(ticket, null, 2)}\n`,
		);
		await context.addCookies([
			{
				name: "btst.example_session",
				value: "mock-session-admin-e2e",
				url: baseURL,
				httpOnly: true,
				sameSite: "Lax",
			},
		]);
	},
};

export const beats = [
	{
		name: "separate targets",
		async run({ page, goto, caption }) {
			await goto(`/pages/helpdesk/inbox?search=${encodeURIComponent(subject)}`);
			await page.getByText("Resolution pending", { exact: true }).waitFor();
			await page.getByText("Response pending", { exact: true }).waitFor();
			await caption(
				"The weekday business calendar gives response and resolution separate deadlines.",
			);
		},
	},
	{
		name: "internal note",
		async run({ page, caption }) {
			await page.getByRole("link", { name: subject, exact: true }).click();
			await page
				.getByLabel("Message visibility", { exact: true })
				.selectOption("internal");
			await page
				.getByLabel("Reply", { exact: true })
				.fill("Investigating account permissions with billing.");
			await page
				.getByRole("button", { name: "Add internal note", exact: true })
				.click();
			await page
				.getByText("Investigating account permissions with billing.", {
					exact: true,
				})
				.waitFor();
			await page.getByText("Response pending", { exact: true }).waitFor();
			await caption("Internal notes leave the first-response target pending.");
		},
	},
	{
		name: "public response",
		async run({ page, caption }) {
			await page
				.getByLabel("Message visibility", { exact: true })
				.selectOption("public");
			await page
				.getByLabel("Reply", { exact: true })
				.fill(
					"We are restoring your invoice access and will confirm when it is ready.",
				);
			await page
				.getByRole("button", { name: "Send reply", exact: true })
				.click();
			await page.getByText("Response met", { exact: true }).waitFor();
			await page.getByText("Resolution pending", { exact: true }).waitFor();
			await caption(
				"A public reply meets the response target while resolution remains pending.",
			);
		},
	},
	{
		name: "resolved",
		async run({ page, caption }) {
			await page.getByLabel("Status", { exact: true }).selectOption("resolved");
			await page
				.getByRole("button", { name: "Save ticket", exact: true })
				.click();
			await page.getByText("Resolution met", { exact: true }).waitFor();
			await caption(
				"Resolving the ticket records a separate successful resolution target.",
			);
		},
	},
	{
		name: "reopened",
		async run({ page, baseURL, caption }) {
			await request(
				baseURL,
				`/tickets/${ticket.id}/replies`,
				"POST",
				{
					body: "The invoice still fails to download. Could you check again?",
				},
				customer,
			);
			await page.reload();
			await page.getByText("Resolution pending", { exact: true }).waitFor();
			await page.getByText("Response met", { exact: true }).waitFor();
			const reopened = await request(baseURL, `/inbox/${ticket.id}`);
			assert.equal(reopened.resolutionDueAt, ticket.resolutionDueAt);
			await caption(
				"A customer reply reopens resolution against its original deadline.",
			);
		},
	},
	{
		name: "overdue resolution",
		async run({ page, caption }) {
			await page.clock.install({
				time: new Date(Date.parse(ticket.resolutionDueAt) + 60_000),
			});
			await page.reload();
			await page.getByText("Resolution breached", { exact: true }).waitFor();
			await page.getByText("Response met", { exact: true }).waitFor();
			await caption(
				"With the browser clock past the deadline, only resolution is breached.",
			);
			assert.deepEqual(browserErrors, []);
		},
	},
];
