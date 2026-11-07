import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";

let pipeline;
let contact;
let renewal;
let expansion;
let lead;
const browserErrors = [];
const headers = {
	cookie: "btst.example_session=mock-session-admin-e2e",
};
async function api(baseURL, path, method = "GET", data) {
	const response = await fetch(`${baseURL}/api/data${path}`, {
		method,
		headers: {
			...headers,
			...(data ? { "content-type": "application/json" } : {}),
		},
		...(data ? { body: JSON.stringify(data) } : {}),
	});
	assert.ok(response.ok, `${method} ${path}: ${response.status}`);
	return response.json();
}
export const config = {
	baseURL: process.env.PRODUCT_PROOF_BASE_URL ?? "http://localhost:3006",
	outDir: fileURLToPath(
		new URL("../../docs/assets/crm-ownership/demo", import.meta.url),
	),
	videoName: "crm-ownership",
	viewport: { width: 1440, height: 1000 },
	captionHold: 2800,
	captionStyle: { accent: "#2563eb" },
	async signIn({ context, baseURL }) {
		browserErrors.length = 0;
		context.on("page", (page) => {
			page.on("pageerror", (error) => browserErrors.push(error.message));
			page.on("console", (message) => {
				if (message.type() === "error") browserErrors.push(message.text());
			});
		});
		await context.addCookies([
			{
				name: "btst.example_session",
				value: "mock-session-admin-e2e",
				url: baseURL,
				httpOnly: true,
				sameSite: "Lax",
			},
		]);
		const previous = await api(baseURL, "/crm/pipelines");
		for (const item of previous.items) {
			if (item.name !== "Sales ownership") continue;
			const old = await api(baseURL, `/crm/pipelines/${item.id}`);
			for (const deal of old.deals)
				await api(baseURL, `/crm/deals/${deal.id}`, "DELETE");
			await api(baseURL, `/boards/${item.id}`, "DELETE");
		}
		const contacts = await api(baseURL, "/crm/contacts?search=Taylor");
		for (const item of contacts.items) {
			if (item.firstName === "Taylor" && item.lastName === "Chen")
				await api(baseURL, `/crm/contacts/${item.id}`, "DELETE");
		}
		contact = await api(baseURL, "/crm/contacts", "POST", {
			firstName: "Taylor",
			lastName: "Chen",
			email: "taylor@example.com",
			company: "Northwind",
		});
		pipeline = await api(baseURL, "/crm/pipelines", "POST", {
			name: "Sales ownership",
			stages: ["Lead", "Qualified", "Won"],
		});
		const create = (title, value, stage = 0) =>
			api(baseURL, "/crm/deals", "POST", {
				title,
				value,
				currency: "USD",
				pipelineId: pipeline.id,
				stage: pipeline.columns[stage].id,
				contactId: contact.id,
			});
		renewal = await create("Northwind annual renewal", 24000, 1);
		expansion = await create("Northwind team expansion", 12000);
		lead = await create("New regional office", 8000);
		await api(baseURL, `/crm/deals/${expansion.id}/owner`, "POST", {
			ownerId: "admin-sales-teammate",
			expectedOwnerId: null,
		});
	},
};
export const beats = [
	{
		name: "Pipeline includes assigned and unassigned deals",
		async run({ page, goto, caption }) {
			await goto(`/pages/crm/pipeline/${pipeline.id}`);
			await expect(
				page.getByRole("link", { name: renewal.title, exact: true }),
			).toBeVisible();
			await expect(
				page.getByRole("link", { name: expansion.title, exact: true }),
			).toBeVisible();
			await expect(
				page.getByRole("link", { name: lead.title, exact: true }),
			).toBeVisible();
			await caption(
				"Every deal stays in the workspace pipeline, including unassigned leads.",
			);
		},
	},
	{
		name: "Assign a deal from the authorized staff directory",
		async run({ page, goto, caption, baseURL }) {
			await goto(`/pages/crm/deals/${renewal.id}`);
			await page
				.getByRole("combobox", { name: "Deal owner", exact: true })
				.selectOption("admin-e2e");
			await page
				.getByRole("button", { name: "Update owner", exact: true })
				.click();
			await expect
				.poll(
					async () => (await api(baseURL, `/crm/deals/${renewal.id}`)).ownerId,
				)
				.toBe("admin-e2e");
			const board = await api(baseURL, `/boards/${pipeline.id}`);
			assert.equal(
				board.columns
					.flatMap((column) => column.tasks)
					.find((task) => task.id === renewal.taskId)?.assigneeId,
				"admin-e2e",
			);
			await caption(
				"Alex becomes the deal owner. The linked Kanban task uses the same assignment.",
			);
		},
	},
	{
		name: "My deals filters the pipeline and stage counts",
		async run({ page, goto, caption }) {
			await goto(`/pages/crm/pipeline/${pipeline.id}`);
			await page
				.getByRole("combobox", { name: "Filter by owner", exact: true })
				.selectOption({ label: "My deals" });
			await expect(
				page.getByRole("link", { name: renewal.title, exact: true }),
			).toBeVisible();
			await expect(
				page.getByRole("link", { name: expansion.title, exact: true }),
			).toHaveCount(0);
			await expect(
				page.getByRole("link", { name: lead.title, exact: true }),
			).toHaveCount(0);
			await caption(
				"My deals shows Alex's renewal and updates the stage counts to match.",
			);
		},
	},
	{
		name: "Reassign a deal to another staff member",
		async run({ page, goto, caption, baseURL }) {
			await goto(`/pages/crm/deals/${renewal.id}`);
			await page
				.getByRole("combobox", { name: "Deal owner", exact: true })
				.selectOption("admin-sales-teammate");
			await page
				.getByRole("button", { name: "Update owner", exact: true })
				.click();
			await expect
				.poll(
					async () => (await api(baseURL, `/crm/deals/${renewal.id}`)).ownerId,
				)
				.toBe("admin-sales-teammate");
			await caption(
				"The renewal moves to Sam. Reassignment checks the current owner before saving.",
			);
		},
	},
	{
		name: "Contact deal list filters by owner",
		async run({ page, goto, caption }) {
			await goto(`/pages/crm/contacts/${contact.id}`);
			await page
				.getByRole("combobox", { name: "Filter by owner", exact: true })
				.selectOption({ label: "Sam Rivera" });
			await expect(
				page.getByRole("link", { name: renewal.title, exact: true }),
			).toBeVisible();
			await expect(
				page.getByRole("link", { name: expansion.title, exact: true }),
			).toBeVisible();
			await expect(
				page.getByRole("link", { name: lead.title, exact: true }),
			).toHaveCount(0);
			await caption(
				"The contact's deal list can show Sam's two opportunities with a matching total.",
			);
		},
	},
	{
		name: "Clear ownership and return the deal to unassigned",
		async run({ page, goto, caption, baseURL }) {
			await goto(`/pages/crm/deals/${renewal.id}`);
			await page
				.getByRole("combobox", { name: "Deal owner", exact: true })
				.selectOption({ label: "Unassigned" });
			await page
				.getByRole("button", { name: "Update owner", exact: true })
				.click();
			await expect
				.poll(
					async () => (await api(baseURL, `/crm/deals/${renewal.id}`)).ownerId,
				)
				.toBe(null);
			await goto(`/pages/crm/pipeline/${pipeline.id}`);
			await page
				.getByRole("combobox", { name: "Filter by owner", exact: true })
				.selectOption({ label: "Unassigned" });
			await expect(
				page.getByRole("link", { name: renewal.title, exact: true }),
			).toBeVisible();
			await expect(
				page.getByRole("link", { name: lead.title, exact: true }),
			).toBeVisible();
			await expect(
				page.getByRole("link", { name: expansion.title, exact: true }),
			).toHaveCount(0);
			await caption(
				"Clearing the owner returns the renewal to the unassigned queue without changing access.",
			);
			assert.deepEqual(browserErrors, []);
		},
	},
];
