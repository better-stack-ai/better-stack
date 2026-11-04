import { expect, test } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";
import { waitForTanStackHydration } from "./helpers/hydration";

test("CRM manages contacts, linked deals and follow-ups on a Kanban pipeline", async ({
	page,
	context,
	request,
}) => {
	const suffix = Date.now().toString(36);
	const firstName = `CRM ${suffix}`;
	const email = `crm-${suffix}@example.com`;
	const headers = mockAuthHeaders();
	let companyId: string | undefined;
	let contactId: string | undefined;
	let pipelineId: string | undefined;
	let dealId: string | undefined;
	let activityId: string | undefined;

	expect((await request.get("/api/data/crm/contacts")).status()).toBe(401);
	expect((await request.get("/api/data/crm/pipelines")).status()).toBe(401);
	await setMockAuthCookie(context);

	try {
		const companyResponse = await request.post("/api/data/crm/companies", {
			headers,
			data: { name: `CRM company ${suffix}`, domain: "example.com" },
		});
		expect(companyResponse.ok(), await companyResponse.text()).toBe(true);
		companyId = (await companyResponse.json()).id;

		await page.goto("/pages/crm/contacts/new");
		await waitForTanStackHydration(page);
		await page.getByLabel("First name", { exact: true }).fill(firstName);
		await page.getByLabel("Last name", { exact: true }).fill("Contact");
		await page.getByLabel("Email", { exact: true }).fill(email);
		await page.getByLabel("Tags", { exact: true }).fill(`enterprise-${suffix}`);
		await page
			.getByRole("button", { name: "Save contact", exact: true })
			.click();
		await expect(page).toHaveURL(/\/crm\/contacts\/(?!new)[^/?]+$/);
		contactId = new URL(page.url()).pathname.split("/").at(-1);
		await expect(
			page.getByRole("heading", { name: `${firstName} Contact`, exact: true }),
		).toBeVisible();

		const updateContact = await request.put(
			`/api/data/crm/contacts/${contactId}`,
			{
				headers,
				data: { companyId, customFields: { territory: `North ${suffix}` } },
			},
		);
		expect(updateContact.ok(), await updateContact.text()).toBe(true);
		const search = await request.get(
			`/api/data/crm/contacts?search=${encodeURIComponent(`North ${suffix}`)}&tag=enterprise-${suffix}`,
			{ headers },
		);
		expect(search.ok(), await search.text()).toBe(true);
		expect((await search.json()).items).toEqual([
			expect.objectContaining({ id: contactId, email, companyId }),
		]);

		const pipelineResponse = await request.post("/api/data/crm/pipelines", {
			headers,
			data: { name: `Sales ${suffix}`, stages: ["Lead", "Qualified", "Won"] },
		});
		expect(pipelineResponse.ok(), await pipelineResponse.text()).toBe(true);
		const pipeline = await pipelineResponse.json();
		pipelineId = pipeline.id;
		const dealResponse = await request.post("/api/data/crm/deals", {
			headers,
			data: {
				title: `CRM deal ${suffix}`,
				value: 12500,
				currency: "USD",
				pipelineId,
				stage: pipeline.columns[0].id,
				contactId,
				companyId,
			},
		});
		expect(dealResponse.ok(), await dealResponse.text()).toBe(true);
		const deal = await dealResponse.json();
		dealId = deal.id;
		await page.goto(`/pages/crm/pipeline/${pipelineId}`);
		await expect(
			page.getByRole("heading", { name: pipeline.name, exact: true }),
		).toBeVisible();
		await expect(page.getByText(deal.title, { exact: true })).toBeVisible();

		const handle = await page
			.getByRole("button", { name: `Move deal ${deal.title}`, exact: true })
			.boundingBox();
		const target = await page
			.locator('[data-slot="kanban-column"]')
			.filter({
				has: page.getByRole("heading", { name: "Qualified", exact: true }),
			})
			.boundingBox();
		expect(handle).not.toBeNull();
		expect(target).not.toBeNull();
		if (!handle || !target)
			throw new Error("Deal drag handle or stage missing");
		await page.mouse.move(
			handle.x + handle.width / 2,
			handle.y + handle.height / 2,
		);
		await page.mouse.down();
		await page.mouse.move(
			handle.x + handle.width / 2 + 15,
			handle.y + handle.height / 2,
			{ steps: 4 },
		);
		await page.mouse.move(target.x + target.width / 2, target.y + 100, {
			steps: 20,
		});
		await page.mouse.up();
		await expect
			.poll(
				async () =>
					(
						await (
							await request.get(`/api/data/crm/deals/${dealId}`, { headers })
						).json()
					).stage,
			)
			.toBe(pipeline.columns[1].id);
		const board = await request.get(`/api/data/boards/${pipelineId}`, {
			headers,
		});
		expect(board.ok(), await board.text()).toBe(true);
		expect((await board.json()).columns[1].tasks).toContainEqual(
			expect.objectContaining({ id: deal.taskId, title: deal.title }),
		);
		const directMove = await request.put(`/api/data/tasks/${deal.taskId}`, {
			headers,
			data: {
				columnId: pipeline.columns[2].id,
				title: `Updated ${deal.title}`,
			},
		});
		expect(directMove.ok(), await directMove.text()).toBe(true);
		const synced = await request.get(`/api/data/crm/deals/${dealId}`, {
			headers,
		});
		expect(await synced.json()).toMatchObject({
			title: `Updated ${deal.title}`,
			stage: pipeline.columns[2].id,
		});

		const activityResponse = await request.post("/api/data/crm/activities", {
			headers,
			data: {
				type: "call",
				body: `Follow up ${suffix}`,
				contactId,
				dealId,
				dueAt: new Date(Date.now() + 86_400_000).toISOString(),
			},
		});
		expect(activityResponse.ok(), await activityResponse.text()).toBe(true);
		activityId = (await activityResponse.json()).id;
		await page.goto(`/pages/crm/contacts/${contactId}`);
		await expect(
			page.getByText(`Follow up ${suffix}`, { exact: true }),
		).toBeVisible();
		const complete = await request.put(
			`/api/data/crm/activities/${activityId}`,
			{ headers, data: { completedAt: new Date().toISOString() } },
		);
		expect(complete.ok(), await complete.text()).toBe(true);
		await page.goto(`/pages/crm/deals/${dealId}`);
		await expect(
			page.getByRole("heading", { name: `Updated ${deal.title}`, exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(`Follow up ${suffix}`, { exact: true }),
		).toBeVisible();
	} finally {
		if (activityId)
			await request.delete(`/api/data/crm/activities/${activityId}`, {
				headers,
			});
		if (dealId)
			await request.delete(`/api/data/crm/deals/${dealId}`, { headers });
		if (contactId)
			await request.delete(`/api/data/crm/contacts/${contactId}`, { headers });
		if (companyId)
			await request.delete(`/api/data/crm/companies/${companyId}`, { headers });
		if (pipelineId)
			await request.delete(`/api/data/boards/${pipelineId}`, {
				headers,
			});
	}
});
