import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export default async ({ page, consumerDir }) => {
	const plugin = join(consumerDir, "node_modules/@btst/plugin-ecommerce/dist");
	assert.match(
		await readFile(join(plugin, "client/hooks/use-products.mjs"), "utf8"),
		/^["']use client["']/,
	);
	assert.match(
		await readFile(join(plugin, "client/plugin.mjs"), "utf8"),
		/import\(/,
	);
	assert.match(
		await readFile(
			join(plugin, "client/components/product-images-field.mjs"),
			"utf8",
		),
		/import\(['"]@btst\/plugin-media\/client\/components['"]\)/,
	);
	const assets = join(consumerDir, "dist/assets");
	const css = (
		await Promise.all(
			(
				await readdir(assets)
			)
				.filter((file) => file.endsWith(".css"))
				.map((file) => readFile(join(assets, file), "utf8")),
		)
	).join("\n");
	assert.match(
		css,
		/@source/,
		"Ecommerce styles retain Tailwind scanning metadata",
	);
	for (const media of [false, true]) {
		if (media) {
			const url = new URL(page.url());
			url.searchParams.set("media", "1");
			await page.goto(url.href);
		}
		await page.getByLabel("Product image URL", { exact: true }).waitFor();
		assert.equal(
			await page.getByRole("button", { name: "Browse product images" }).count(),
			media ? 1 : 0,
		);
		if (media) {
			await page.getByRole("button", { name: "Browse product images" }).click();
			await page.getByRole("tab", { name: "URL" }).click();
			await page.getByPlaceholder("https://example.com/image.png").waitFor();
			await page.keyboard.press("Escape");
		}
		await page
			.getByLabel("Product image URL", { exact: true })
			.fill("https://rejected.example/cover.jpg");
		await page.getByRole("button", { name: "Add URL" }).click();
		await page.getByPlaceholder("Enter slug...").fill("packed-product");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await page.getByText(/Too big: expected array to have <=0 items/).waitFor();
		const input = page.getByLabel("Product image URL", { exact: true });
		const inputId = await input.getAttribute("id");
		assert.equal(
			await page
				.getByText("Product images", { exact: true })
				.getAttribute("for"),
			inputId,
		);
		assert.equal(await input.getAttribute("aria-invalid"), "true");
		assert.equal(
			await input.getAttribute("aria-describedby"),
			`${inputId}-field-error`,
		);
		assert.equal(
			await page.locator(`[id="${inputId}-field-error"]`).textContent(),
			"Too big: expected array to have <=0 items",
		);
	}
};
