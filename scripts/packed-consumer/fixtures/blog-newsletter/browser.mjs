import assert from "node:assert/strict";
import { createFixture } from "./backend.mjs";
export default async ({ page }) => {
	page.setDefaultTimeout(15000);
	const { stack, editor, emails } = await createFixture();
	await page.route("**/api/**", async (route) => {
		const request = route.request();
		const response = await stack.handler(
			new Request(request.url(), {
				method: request.method(),
				headers: request.headers(),
				...(request.postData() ? { body: request.postData() } : {}),
			}),
		);
		await route.fulfill({
			status: response.status,
			headers: Object.fromEntries(response.headers),
			body: await response.text(),
		});
	});
	for (const commonjs of [false, true]) {
		const target = new URL(commonjs ? "/commonjs.html" : "/", page.url());
		await page.goto(target.href);
		await page
			.getByRole("link", { name: "Send as newsletter", exact: true })
			.click();
		await page
			.getByText(
				"Started from “Existing Blog edition”. Changes here do not change the blog post.",
				{ exact: true },
			)
			.waitFor();
		assert.equal(
			await page.getByLabel("Subject", { exact: true }).inputValue(),
			"Existing Blog edition",
		);
		assert.equal(
			await page.getByLabel("Email body", { exact: true }).inputValue(),
			"# Existing Blog body",
		);
		await page
			.getByLabel("Email body", { exact: true })
			.fill("# Reviewed for newsletter");
		await page.getByLabel("From name", { exact: true }).fill("Editor");
		await page
			.getByLabel("From email", { exact: true })
			.fill("editor@example.test");
		await page.getByLabel("Audience tags", { exact: true }).fill("readers");
		await page.getByRole("button", { name: "Save draft", exact: true }).click();
		await page
			.getByRole("button", { name: "Send campaign", exact: true })
			.click();
		await page.getByRole("button", { name: "Send now", exact: true }).click();
		await page
			.getByText(
				"This campaign is sent. Its content can no longer be edited.",
				{ exact: true },
			)
			.waitFor();
		assert.equal(emails.length, commonjs ? 2 : 1);
		assert.equal(emails.at(-1).to, "reader@example.test");
		assert.match(emails.at(-1).html, /Reviewed for newsletter/);
		assert.equal(
			(await editor.blog.listPosts({ slug: "existing-post" })).items[0].content,
			"# Existing Blog body",
		);
	}
	const deniedCreate = new URL("/?user=no-create", page.url());
	await page.goto(deniedCreate.href);
	await page
		.getByRole("heading", { name: "Newsletter unavailable", exact: true })
		.waitFor();
	assert.equal(
		await page
			.getByRole("link", { name: "Send as newsletter", exact: true })
			.count(),
		0,
	);
	for (const query of [
		"user=no-blog&fromPostSlug=existing-post&fromPostId=existing-post-id",
		"fromPostSlug=existing-post&fromPostId=wrong-id",
	]) {
		await page.goto(new URL(`/?${query}`, page.url()).href);
		await page
			.getByRole("alert")
			.filter({ hasText: /Check your access|not found/ })
			.waitFor();
		assert.equal(
			await page.getByLabel("Subject", { exact: true }).inputValue(),
			"",
		);
		assert.equal(
			await page.getByLabel("Email body", { exact: true }).inputValue(),
			"",
		);
	}
};
