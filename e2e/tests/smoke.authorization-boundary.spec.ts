import { expect, test } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

test("the layout hydrates identity before browser authorization renders", async ({
	page,
}) => {
	await setMockAuthCookie(page.context(), "olliethedev");
	const serverResponse = await page.request.get(
		"/pages/authorization-boundary",
	);
	expect(serverResponse.ok()).toBe(true);
	const requestOrigin = new URL(serverResponse.url()).origin;
	expect(await serverResponse.text()).toContain(
		`data-testid="stack-runtime-origin">${requestOrigin}`,
	);

	await page.goto("/pages/authorization-boundary");

	await expect(page.getByTestId("stack-runtime-origin")).toHaveText(
		new URL(page.url()).origin,
	);
	await expect(page.getByTestId("hydrated-identity")).toHaveText("olliethedev");
	await expect(page.getByText("Allowed", { exact: true })).toBeVisible();
	await expect(page.getByText("Denied", { exact: true })).not.toBeVisible();
});

test("the primary Blog API enforces the same request session", async ({
	request,
}) => {
	const anonymousDrafts = await request.get("/api/data/posts?published=false");
	expect(anonymousDrafts.status()).toBe(401);

	const nonAdminPublish = await request.post("/api/data/posts", {
		headers: {
			...mockAuthHeaders("olliethedev"),
			"content-type": "application/json",
		},
		data: {
			title: "Denied publish probe",
			slug: `denied-publish-${Date.now()}`,
			content: "Authorization boundary probe",
			excerpt: "Authorization boundary probe",
			published: true,
			tags: [],
		},
	});
	expect(nonAdminPublish.status()).toBe(403);
});
