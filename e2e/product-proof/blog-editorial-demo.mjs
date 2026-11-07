import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";

const author = "editorial-demo-author";
const reviewer = "admin-editorial-demo-reviewer";
const slug = "editorial-demo";
const privateSlug = "editorial-demo-private";
const approvedTitle = "November workspace release";
const privateTitle = "December release plan";
const errors = [];

async function request(baseURL, path, method = "GET", data, user = reviewer) {
	const response = await fetch(`${baseURL}/api/editorial${path}`, {
		method,
		headers: {
			...(user ? { cookie: `btst.example_session=mock-session-${user}` } : {}),
			...(data ? { "content-type": "application/json" } : {}),
		},
		...(data ? { body: JSON.stringify(data) } : {}),
		signal: AbortSignal.timeout(10000),
	});
	assert.ok(response.ok, `${method} ${path}: ${response.status}`);
	return response.json();
}

async function asUser(context, baseURL, user) {
	await context.clearCookies();
	if (user) {
		await context.addCookies([
			{
				name: "btst.example_session",
				value: `mock-session-${user}`,
				url: baseURL,
				httpOnly: true,
				sameSite: "Lax",
			},
		]);
	}
}

async function showReview(page, status) {
	const review = page.getByTestId("editorial-review");
	await expect(review.getByRole("status")).toContainText(status);
	await review.scrollIntoViewIfNeeded();
	return review;
}

export const config = {
	baseURL: process.env.PRODUCT_PROOF_BASE_URL ?? "http://localhost:3006",
	outDir: fileURLToPath(
		new URL("../../docs/assets/blog-editorial", import.meta.url),
	),
	videoName: "blog-editorial-review",
	viewport: { width: 1440, height: 1000 },
	captionHold: 2600,
	captionStyle: { accent: "#2563eb" },
	async signIn({ context, baseURL }) {
		errors.length = 0;
		context.on("page", (page) => {
			page.on("pageerror", (error) => errors.push(error.message));
			page.on("console", (message) => {
				if (message.type() === "error") errors.push(message.text());
			});
		});
		const previousIds = new Set();
		for (const previousSlug of [slug, privateSlug]) {
			const response = await fetch(
				`${baseURL}/api/editorial/posts/editorial?slug=${previousSlug}`,
				{
					headers: {
						cookie: `btst.example_session=mock-session-${reviewer}`,
					},
				},
			);
			if (response.status === 404) continue;
			assert.ok(response.ok, `Inspect previous demo: ${response.status}`);
			const previous = await response.json();
			if (previous?.id) previousIds.add(previous.id);
		}
		for (const id of previousIds) {
			await request(baseURL, `/posts/${id}`, "DELETE");
		}
		await asUser(context, baseURL, author);
	},
};

export const beats = [
	{
		name: "Author saves a private draft",
		async run({ page, goto, caption }) {
			await goto("/editorial/blog/new");
			await page
				.getByLabel("Title", { exact: false })
				.fill("November release notes");
			await page.getByLabel("Slug", { exact: false }).fill(slug);
			await page
				.getByLabel("Excerpt", { exact: false })
				.fill("A reviewed announcement for the November workspace release.");
			const editor = page.locator(".milkdown-custom [contenteditable]").first();
			await editor.fill(
				"The November release improves workspace exports. Authors submit a saved revision before a reviewer approves publication.",
			);
			await expect(page.getByRole("switch")).toHaveCount(0);
			await page
				.getByRole("button", { name: "Save draft", exact: true })
				.click();
			await expect(page).toHaveURL(new RegExp(`/editorial/blog/${slug}/edit$`));
			const review = await showReview(page, "Draft");
			await expect(
				review.getByRole("button", { name: "Submit for review", exact: true }),
			).toBeEnabled();
			await caption(
				"The author saves a private draft. Publishing requires review of a saved revision.",
			);
		},
	},
	{
		name: "Author submits the saved revision",
		async run({ page, caption, baseURL }) {
			await page
				.getByRole("button", { name: "Submit for review", exact: true })
				.click();
			const review = await showReview(page, "Submitted");
			await expect(
				review.getByRole("button", { name: "Approve revision", exact: true }),
			).toHaveCount(0);
			const publicPosts = await request(
				baseURL,
				"/posts?published=true",
				"GET",
				undefined,
				null,
			);
			assert.ok(!publicPosts.items.some((post) => post.slug === slug));
			await caption(
				"Submission records the immutable revision. The author cannot approve or publish it.",
			);
		},
	},
	{
		name: "Reviewer requests changes",
		async run({ page, context, goto, caption, baseURL }) {
			await asUser(context, baseURL, reviewer);
			await goto(`/editorial/blog/${slug}/edit`);
			await expect(
				page.getByRole("region", { name: "Saved content" }),
			).toBeVisible();
			await expect(
				page.getByRole("button", { name: "Save changes", exact: true }),
			).toHaveCount(0);
			await page
				.getByLabel("Review comment")
				.fill("Clarify which workspace exports are included.");
			await page
				.getByRole("button", { name: "Request changes", exact: true })
				.click();
			await showReview(page, "Changes requested");
			await caption(
				"The reviewer requests a clearer headline while inspecting the saved content.",
			);
		},
	},
	{
		name: "Author revises and resubmits",
		async run({ page, context, goto, caption, baseURL }) {
			await asUser(context, baseURL, author);
			await goto(`/editorial/blog/${slug}/edit`);
			await page.getByLabel("Title", { exact: false }).fill(approvedTitle);
			await expect(
				page.getByRole("button", { name: "Submit for review", exact: true }),
			).toBeDisabled();
			await page
				.getByRole("button", { name: "Save changes", exact: true })
				.click();
			await showReview(page, "Draft");
			await page
				.getByRole("button", { name: "Submit for review", exact: true })
				.click();
			await showReview(page, "Submitted");
			await caption(
				"The revised headline creates version 2. The author submits that version for review.",
			);
		},
	},
	{
		name: "Reviewer approves the exact revision",
		async run({ page, context, goto, caption, baseURL }) {
			await asUser(context, baseURL, reviewer);
			await goto(`/editorial/blog/${slug}/edit`);
			await expect(
				page.getByRole("region", { name: "Saved content" }),
			).toContainText(approvedTitle);
			await page
				.getByRole("button", { name: "Approve revision", exact: true })
				.click();
			await showReview(page, "Approved");
			await caption(
				"Approval applies to the reviewed revision. It does not publish the post yet.",
			);
		},
	},
	{
		name: "Reviewer publishes the approved revision",
		async run({ page, caption, baseURL }) {
			await page
				.getByRole("button", { name: "Publish approved revision", exact: true })
				.click();
			const review = await showReview(page, "Approved");
			await expect(
				review.getByRole("link", { name: "View live post", exact: true }),
			).toHaveAttribute("href", `/editorial/blog/${slug}`);
			const published = await request(
				baseURL,
				`/posts?slug=${slug}`,
				"GET",
				undefined,
				null,
			);
			assert.equal(published.items[0]?.title, approvedTitle);
			await caption(
				"The reviewer publishes version 2. Its approved title and content are now public.",
			);
		},
	},
	{
		name: "Later edits stay private",
		async run({ page, context, goto, caption, baseURL }) {
			await asUser(context, baseURL, author);
			await goto(`/editorial/blog/${slug}/edit`);
			await page.getByLabel("Title", { exact: false }).fill(privateTitle);
			await page.getByLabel("Slug", { exact: false }).fill(privateSlug);
			await page
				.getByLabel("Excerpt", { exact: false })
				.fill("Unapproved planning details for next month.");
			await page
				.getByRole("button", { name: "Save changes", exact: true })
				.click();
			await expect(page).toHaveURL(
				new RegExp(`/editorial/blog/${privateSlug}/edit$`),
			);
			const review = await showReview(page, "Draft");
			await expect(page.getByLabel("Title", { exact: false })).toHaveValue(
				privateTitle,
			);
			await expect(
				review.getByRole("link", { name: "View live post", exact: true }),
			).toHaveAttribute("href", `/editorial/blog/${slug}`);
			await caption(
				"New title and slug edits return to draft. The approved public version stays live.",
			);
		},
	},
	{
		name: "Public readers retain the approved version",
		async run({ page, context, goto, caption, baseURL }) {
			await asUser(context, baseURL, null);
			await goto(`/editorial/blog/${slug}`);
			await expect(
				page.getByRole("heading", {
					level: 1,
					name: approvedTitle,
					exact: true,
				}),
			).toBeVisible();
			await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
				"content",
				new RegExp(approvedTitle),
			);
			await expect(page.getByText(privateTitle, { exact: true })).toHaveCount(
				0,
			);
			const search = await request(
				baseURL,
				`/posts?published=true&query=${encodeURIComponent(privateTitle)}`,
				"GET",
				undefined,
				null,
			);
			assert.equal(search.total, 0);
			const sitemap = await fetch(`${baseURL}/editorial/sitemap.xml`);
			assert.ok(sitemap.ok);
			const xml = await sitemap.text();
			assert.ok(xml.includes(`/editorial/blog/${slug}`));
			assert.ok(!xml.includes(privateSlug));
			assert.deepEqual(errors, []);
			await caption(
				"Anonymous readers, search, metadata, and the sitemap still use the approved version.",
			);
		},
	},
];
