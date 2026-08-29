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
	const expectedApiOrigin =
		process.env.BTST_EXPECTED_API_ORIGIN ?? requestOrigin;
	expect(await serverResponse.text()).toContain(
		`data-testid="stack-runtime-origin">${expectedApiOrigin}`,
	);

	await page.goto("/pages/authorization-boundary");

	await expect(page.getByTestId("stack-runtime-origin")).toHaveText(
		expectedApiOrigin,
	);
	await expect(page.getByTestId("hydrated-identity")).toHaveText("olliethedev");
	await expect(page.getByText("Allowed", { exact: true })).toBeVisible();
	await expect(page.getByText("Denied", { exact: true })).not.toBeVisible();
});

test("TanStack keeps the trusted API origin during client navigation", async ({
	page,
}, testInfo) => {
	test.skip(!testInfo.project.name.startsWith("tanstack"));
	await page.goto("/pages/authorization-boundary");
	const expectedApiOrigin =
		process.env.BTST_EXPECTED_API_ORIGIN ?? new URL(page.url()).origin;

	await expect(page.getByTestId("stack-runtime-origin")).toHaveText(
		expectedApiOrigin,
	);
	await page.getByRole("link", { name: "Available Routes" }).click();
	await expect(page).toHaveURL(/\/pages\/route-docs$/);
	await page.goBack();
	await expect(page.getByTestId("stack-runtime-origin")).toHaveText(
		expectedApiOrigin,
	);
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

test("credentialed SSR ignores hostile forwarding origins", async ({
	request,
}) => {
	const response = await request.get("/pages/authorization-boundary", {
		headers: {
			...mockAuthHeaders("olliethedev"),
			forwarded: "host=credentials.example.net;proto=https",
			"x-forwarded-host": "credentials.example.net",
			"x-forwarded-port": "443",
			"x-forwarded-proto": "https",
		},
	});

	expect(response.ok()).toBe(true);
	const html = await response.text();
	const expectedApiOrigin =
		process.env.BTST_EXPECTED_API_ORIGIN ?? new URL(response.url()).origin;
	expect(html).toContain(
		`data-testid="stack-runtime-origin">${expectedApiOrigin}`,
	);
	expect(html).not.toContain("credentials.example.net");
});
