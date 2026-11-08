import { expect, test, type Page } from "@playwright/test";

export async function waitForTanStackHydration(page: Page) {
	const project = test.info().project.name;
	// Both SSR fixtures expose the same client hydration marker.
	if (project === "tanstack:codegen" || project === "react-router:codegen") {
		await expect(page.getByTestId("hydration-update")).toHaveAttribute(
			"data-hydrated",
			"true",
		);
	}
}
