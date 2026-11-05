import assert from "node:assert/strict";

export default async function verify({ page }) {
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.route("https://cdn.jsdelivr.net/**", (route) =>
		route.fulfill({
			contentType: "text/javascript",
			body: "window.scalarReferenceLoaded = true;",
		}),
	);
	const baseURL = new URL(page.url());
	for (const format of ["esm", "commonjs"]) {
		await page.goto(new URL(`/reference-${format}.html`, baseURL).href);
		await page.waitForFunction(() => window.scalarReferenceLoaded === true);
		assert.equal(await page.title(), "Packed <Records>");
		const metadata = await page
			.locator("#api-reference")
			.evaluate((element) => ({
				schema: JSON.parse(element.textContent),
				configuration: JSON.parse(element.dataset.configuration),
				nonce: element.nonce,
			}));
		assert.equal(metadata.schema.openapi, "3.1.0");
		assert.equal(
			metadata.schema.paths["/records/{id}"].get["x-btst-permission"],
			"records:read",
		);
		assert.equal(metadata.configuration.theme, "moon");
		assert.equal(metadata.configuration.metaData.title, "Packed <Records>");
		assert.equal(metadata.nonce, 'nonce"value');
	}
	assert.deepEqual(errors, []);
}
