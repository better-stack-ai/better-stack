import { expect, test, type Page } from "@playwright/test";

export async function waitForTanStackHydration(page: Page) {
	if (test.info().project.name === "tanstack:codegen") {
		await expect(page.getByTestId("hydration-update")).toHaveAttribute(
			"data-hydrated",
			"true",
		);
	}
}
