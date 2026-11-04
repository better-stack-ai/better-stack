import { expect, test } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";
import { waitForTanStackHydration } from "./helpers/hydration";

test("CRM manages contacts, linked deals and follow-ups on a Kanban pipeline", async ({
	page,
	context,
	request,
}) => {
	const browserErrors: string[] = [];
	page.on("pageerror", (error) => browserErrors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") browserErrors.push(message.text());
	});
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
		await expect(page.locator("form[data-hydrated]")).toHaveAttribute(
			"data-hydrated",
			"true",
		);
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
		expect(
			browserErrors,
			"CRM pages must hydrate without rendering or authorization errors",
		).toEqual([]);
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

test("CRM edits preserve linked records outside the first relation-options page", async ({
	page,
	context,
	request,
}) => {
	test.setTimeout(120_000);
	const suffix = Date.now().toString(36);
	const headers = mockAuthHeaders();
	const companyIds: string[] = [];
	const contactIds: string[] = [];
	let pipelineId: string | undefined;
	let dealId: string | undefined;
	await setMockAuthCookie(context);

	try {
		for (let offset = 0; offset < 202; offset += 10) {
			const results = await Promise.allSettled(
				Array.from({ length: Math.min(10, 202 - offset) }, async (_, index) => {
					const number = offset + index;
					const companyResponse = await request.post(
						"/api/data/crm/companies",
						{
							headers,
							data: { name: `CRM relation company ${suffix} ${number}` },
						},
					);
					expect(companyResponse.ok(), await companyResponse.text()).toBe(true);
					companyIds.push((await companyResponse.json()).id);
					const contactResponse = await request.post("/api/data/crm/contacts", {
						headers,
						data: { firstName: `CRM relation contact ${suffix} ${number}` },
					});
					expect(contactResponse.ok(), await contactResponse.text()).toBe(true);
					contactIds.push((await contactResponse.json()).id);
				}),
			);
			for (const result of results)
				if (result.status === "rejected") throw result.reason;
		}
		const companyPage = await request.get("/api/data/crm/companies?limit=200", {
			headers,
		});
		const contactPage = await request.get("/api/data/crm/contacts?limit=200", {
			headers,
		});
		expect(companyPage.ok(), await companyPage.text()).toBe(true);
		expect(contactPage.ok(), await contactPage.text()).toBe(true);
		const listedCompanies = new Set(
			(await companyPage.json()).items.map(
				(company: { id: string }) => company.id,
			),
		);
		const listedContacts = new Set(
			(await contactPage.json()).items.map(
				(contact: { id: string }) => contact.id,
			),
		);
		const [companyId, nextCompanyId] = companyIds.filter(
			(id) => !listedCompanies.has(id),
		);
		const [contactId, nextContactId] = contactIds.filter(
			(id) => !listedContacts.has(id),
		);
		expect(companyId).toBeTruthy();
		expect(contactId).toBeTruthy();
		if (!companyId || !contactId || !nextCompanyId || !nextContactId)
			throw new Error("Missing off-page CRM fixtures");
		const nextCompany = await (
			await request.get(`/api/data/crm/companies/${nextCompanyId}`, { headers })
		).json();
		const nextContact = await (
			await request.get(`/api/data/crm/contacts/${nextContactId}`, { headers })
		).json();
		const linkResponse = await request.put(
			`/api/data/crm/contacts/${contactId}`,
			{
				headers,
				data: { companyId },
			},
		);
		expect(linkResponse.ok(), await linkResponse.text()).toBe(true);

		await page.goto(`/pages/crm/contacts/${contactId}/edit`);
		await waitForTanStackHydration(page);
		await expect(page.locator("form[data-hydrated]")).toHaveAttribute(
			"data-hydrated",
			"true",
		);
		await expect(page.getByLabel("Company", { exact: true })).toHaveValue(
			companyId,
		);
		await page.getByLabel("Phone", { exact: true }).fill("+1 555 0100");
		await page
			.getByRole("button", { name: "Save contact", exact: true })
			.click();
		await expect(page).toHaveURL(new RegExp(`/crm/contacts/${contactId}$`));
		const savedContact = await request.get(
			`/api/data/crm/contacts/${contactId}`,
			{
				headers,
			},
		);
		expect(await savedContact.json()).toMatchObject({
			companyId,
			phone: "+1 555 0100",
		});

		await page.goto(`/pages/crm/contacts/${contactId}/edit`);
		await expect(page.locator("form[data-hydrated]")).toHaveAttribute(
			"data-hydrated",
			"true",
		);
		const companySearch = page.waitForResponse((response) => {
			const url = new URL(response.url());
			return (
				url.pathname.endsWith("/crm/companies") &&
				url.searchParams.get("search") === nextCompany.name
			);
		});
		await page
			.getByLabel("Search companies", { exact: true })
			.fill(nextCompany.name);
		expect((await companySearch).ok()).toBe(true);
		await page
			.getByLabel("Company", { exact: true })
			.selectOption(nextCompanyId);
		await page.getByLabel("Search companies", { exact: true }).clear();
		await expect(
			page.getByRole("group", { name: "Company selection", exact: true }),
		).toHaveAttribute("aria-busy", "false");
		await expect(page.getByLabel("Company", { exact: true })).toHaveValue(
			nextCompanyId,
		);
		await page
			.getByRole("button", { name: "Save contact", exact: true })
			.click();
		await expect(page).toHaveURL(new RegExp(`/crm/contacts/${contactId}$`));
		const relinkedContact = await request.get(
			`/api/data/crm/contacts/${contactId}`,
			{ headers },
		);
		expect(await relinkedContact.json()).toMatchObject({
			companyId: nextCompanyId,
			phone: "+1 555 0100",
		});

		const pipelineResponse = await request.post("/api/data/crm/pipelines", {
			headers,
			data: {
				name: `CRM relation pipeline ${suffix}`,
				stages: ["Lead", "Won"],
			},
		});
		expect(pipelineResponse.ok(), await pipelineResponse.text()).toBe(true);
		const pipeline = await pipelineResponse.json();
		pipelineId = pipeline.id;
		const dealResponse = await request.post("/api/data/crm/deals", {
			headers,
			data: {
				title: `CRM relation deal ${suffix}`,
				pipelineId,
				stage: pipeline.columns[0].id,
				contactId,
				companyId,
			},
		});
		expect(dealResponse.ok(), await dealResponse.text()).toBe(true);
		dealId = (await dealResponse.json()).id;
		await page.goto(`/pages/crm/deals/${dealId}`);
		await page.getByRole("button", { name: "Edit deal", exact: true }).click();
		await expect(page.getByLabel("Contact", { exact: true })).toHaveValue(
			contactId,
		);
		await expect(page.getByLabel("Company", { exact: true })).toHaveValue(
			companyId,
		);
		await page.getByLabel("Value", { exact: true }).fill("7500");
		await page.getByRole("button", { name: "Save deal", exact: true }).click();
		await expect(
			page.getByRole("heading", { name: "Edit deal", exact: true }),
		).toHaveCount(0);
		const savedDeal = await request.get(`/api/data/crm/deals/${dealId}`, {
			headers,
		});
		expect(await savedDeal.json()).toMatchObject({
			contactId,
			companyId,
			value: 7500,
		});
		await page.getByRole("button", { name: "Edit deal", exact: true }).click();
		const contactSearch = page.waitForResponse((response) => {
			const url = new URL(response.url());
			return (
				url.pathname.endsWith("/crm/contacts") &&
				url.searchParams.get("search") === nextContact.firstName
			);
		});
		await page
			.getByLabel("Search contacts", { exact: true })
			.fill(nextContact.firstName);
		expect((await contactSearch).ok()).toBe(true);
		await page
			.getByLabel("Contact", { exact: true })
			.selectOption(nextContactId);
		const dealCompanySearch = page.waitForResponse((response) => {
			const url = new URL(response.url());
			return (
				url.pathname.endsWith("/crm/companies") &&
				url.searchParams.get("search") === nextCompany.name
			);
		});
		await page
			.getByLabel("Search companies", { exact: true })
			.fill(nextCompany.name);
		expect((await dealCompanySearch).ok()).toBe(true);
		await page
			.getByLabel("Company", { exact: true })
			.selectOption(nextCompanyId);
		await page.getByLabel("Search contacts", { exact: true }).clear();
		await page.getByLabel("Search companies", { exact: true }).clear();
		await expect(
			page.getByRole("group", { name: "Contact selection", exact: true }),
		).toHaveAttribute("aria-busy", "false");
		await expect(
			page.getByRole("group", { name: "Company selection", exact: true }),
		).toHaveAttribute("aria-busy", "false");
		await expect(page.getByLabel("Contact", { exact: true })).toHaveValue(
			nextContactId,
		);
		await expect(page.getByLabel("Company", { exact: true })).toHaveValue(
			nextCompanyId,
		);
		await page.getByRole("button", { name: "Save deal", exact: true }).click();
		await expect(
			page.getByRole("heading", { name: "Edit deal", exact: true }),
		).toHaveCount(0);
		const relinkedDeal = await request.get(`/api/data/crm/deals/${dealId}`, {
			headers,
		});
		expect(await relinkedDeal.json()).toMatchObject({
			contactId: nextContactId,
			companyId: nextCompanyId,
			value: 7500,
		});
	} finally {
		if (dealId)
			await request.delete(`/api/data/crm/deals/${dealId}`, { headers });
		if (pipelineId)
			await request.delete(`/api/data/boards/${pipelineId}`, { headers });
		for (const [collection, ids] of [
			["contacts", contactIds],
			["companies", companyIds],
		] as const) {
			for (let offset = 0; offset < ids.length; offset += 10) {
				await Promise.allSettled(
					ids
						.slice(offset, offset + 10)
						.map((id) =>
							request.delete(`/api/data/crm/${collection}/${id}`, { headers }),
						),
				);
			}
		}
	}
});
