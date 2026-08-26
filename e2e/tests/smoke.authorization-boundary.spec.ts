import { expect, test } from "@playwright/test";

test("shared browser authorization renders through the framework boundary", async ({
	page,
}) => {
	await page.goto("/pages/authorization-boundary");

	await expect(page.getByText("Allowed", { exact: true })).toBeVisible();
	await expect(page.getByText("Denied", { exact: true })).not.toBeVisible();
});
