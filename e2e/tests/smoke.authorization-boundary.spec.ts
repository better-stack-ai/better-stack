import { expect, test } from "@playwright/test";

test("the layout hydrates identity before browser authorization renders", async ({
	page,
}) => {
	await page.goto("/pages/authorization-boundary");

	await expect(page.getByTestId("hydrated-identity")).toHaveText("olliethedev");
	await expect(page.getByText("Allowed", { exact: true })).toBeVisible();
	await expect(page.getByText("Denied", { exact: true })).not.toBeVisible();
});
