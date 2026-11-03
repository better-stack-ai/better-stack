import { expect, test } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

test("feature flags protect management and update live evaluations through the dashboard", async ({
	page,
	request,
}) => {
	const key = `checkout-${Date.now()}`;
	const name = "Checkout rollout";
	const base = "/api/data/feature-flags";
	const headers = mockAuthHeaders();
	const anonymousList = await request.get(`${base}/flags`);
	expect([401, 403]).toContain(anonymousList.status());
	const deniedCreate = await request.post(`${base}/flags`, {
		data: { key, name },
	});
	expect([401, 403]).toContain(deniedCreate.status());
	const missing = await request.get(`${base}/evaluate/${key}`);
	expect(await missing.json()).toBe(false);

	await setMockAuthCookie(page.context());
	await page.goto("/pages/feature-flags");
	await expect(
		page.getByRole("heading", { name: "Feature flags", exact: true }),
	).toBeVisible();
	await page.getByRole("link", { name: "New flag", exact: true }).click();
	await page.getByLabel("Name", { exact: true }).fill(name);
	await page.getByLabel("Key", { exact: true }).fill(key);
	await page
		.getByLabel("Description", { exact: true })
		.fill("Gradual checkout release");
	await page.getByLabel("Flag type", { exact: true }).selectOption("rollout");
	await page
		.getByRole("spinbutton", { name: "Rollout percentage", exact: true })
		.fill("100");
	await page.getByLabel("Tags", { exact: true }).fill("checkout, beta");
	await page.getByRole("button", { name: "Create flag", exact: true }).click();
	const row = page
		.getByRole("list", { name: "Feature flags", exact: true })
		.locator(":scope > li")
		.filter({ hasText: key });
	await expect(row).toBeVisible();
	const toggle = row.getByRole("switch", { name: `Enable ${name}` });
	await expect(toggle).not.toBeChecked();
	await toggle.click();
	await expect(toggle).toBeChecked();
	const enabled = await request.get(`${base}/evaluate/${key}`);
	expect(enabled.ok(), await enabled.text()).toBe(true);
	expect(await enabled.json()).toBe(true);

	await row.getByRole("link", { name: "Evaluation log", exact: true }).click();
	await page.getByLabel("User ID", { exact: true }).fill("beta-user");
	await page
		.getByRole("button", { name: "Evaluate flag", exact: true })
		.click();
	await expect(page.getByRole("status")).toContainText("true");
	const logs = await request.get(`${base}/flags/${key}/log`, { headers });
	expect(logs.ok(), await logs.text()).toBe(true);
	expect(await logs.json()).toContainEqual(
		expect.objectContaining({
			flagKey: key,
			result: true,
			context: expect.objectContaining({ userId: "beta-user" }),
		}),
	);
	const deniedLog = await request.get(`${base}/flags/${key}/log`);
	expect([401, 403]).toContain(deniedLog.status());

	const targeted = await request.patch(`${base}/flags/${key}`, {
		headers,
		data: {
			type: "segment",
			segments: [{ field: "tags", operator: "contains", value: "beta" }],
		},
	});
	expect(targeted.ok(), await targeted.text()).toBe(true);
	const matchingContext = Buffer.from(
		JSON.stringify({ tags: ["beta"] }),
	).toString("base64");
	const matching = await request.get(`${base}/evaluate/${key}`, {
		params: { context: matchingContext },
	});
	expect(await matching.json()).toBe(true);
	const outside = await request.get(`${base}/evaluate/${key}`);
	expect(await outside.json()).toBe(false);
	const all = await request.get(`${base}/evaluate`, {
		params: { context: matchingContext },
	});
	expect((await all.json())[key]).toBe(true);

	const archived = await request.post(`${base}/flags/${key}/archive`, {
		headers,
	});
	expect(archived.ok(), await archived.text()).toBe(true);
	const archivedValue = await request.get(`${base}/evaluate/${key}`);
	expect(await archivedValue.json()).toBe(false);
	const active = await request.get(`${base}/flags`, { headers });
	expect(
		(await active.json()).some((flag: { key: string }) => flag.key === key),
	).toBe(false);
	const invalidContext = await request.get(`${base}/evaluate/${key}`, {
		params: { context: "invalid" },
	});
	expect(invalidContext.status()).toBe(400);
});
