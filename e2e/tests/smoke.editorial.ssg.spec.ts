import { expect, test, type Page } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

const api = "/api/editorial";
const author = "editorial-author";
const reviewer = "admin-editorial-reviewer";

function watchErrors(page: Page, errors: string[]) {
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
}

test("editorial review keeps private edits separate from the approved public revision", async ({
	browser,
	page,
	context,
	request,
	baseURL,
}) => {
	const suffix = Date.now().toString(36);
	const slug = `editorial-launch-${suffix}`;
	const privateSlug = `private-editorial-${suffix}`;
	const approvedTitle = `Approved release notes ${suffix}`;
	const privateTitle = `Private release plan ${suffix}`;
	const errors: string[] = [];
	const reviewerContext = await browser.newContext({ baseURL });
	const publicContext = await browser.newContext({ baseURL });
	const reviewPage = await reviewerContext.newPage();
	const publicPage = await publicContext.newPage();
	for (const currentPage of [page, reviewPage, publicPage]) {
		watchErrors(currentPage, errors);
	}
	await setMockAuthCookie(context, author);
	await setMockAuthCookie(reviewerContext, reviewer);
	const created = await request.post(`${api}/posts`, {
		headers: mockAuthHeaders(author),
		data: {
			title: `Release notes draft ${suffix}`,
			slug,
			excerpt: "Public release summary.",
			content: "Public release notes ready for editorial review.",
			image: "/favicon.ico",
			published: false,
		},
	});
	expect(created.ok()).toBe(true);
	const post = await created.json();
	try {
		await page.goto(`/editorial/blog/${slug}/edit`);
		await expect(
			page.locator(".milkdown-custom [contenteditable]").first(),
		).toBeVisible();
		const authorReview = page.getByTestId("editorial-review");
		await expect(authorReview.getByRole("status")).toContainText("Draft");
		await expect(page.getByRole("switch")).toHaveCount(0);
		await expect(
			authorReview.getByRole("button", {
				name: "Approve revision",
				exact: true,
			}),
		).toHaveCount(0);
		await authorReview
			.getByRole("button", { name: "Submit for review", exact: true })
			.click();
		await expect(authorReview.getByRole("status")).toContainText("Submitted");
		const beforePublish = await request.get(`${api}/posts?published=true`);
		expect((await beforePublish.json()).items).toEqual([]);

		await reviewPage.goto(`/editorial/blog/${slug}/edit`);
		const review = reviewPage.getByTestId("editorial-review");
		await expect(review.getByRole("status")).toContainText("Submitted");
		await expect(
			reviewPage.getByRole("region", { name: "Saved content" }),
		).toBeVisible();
		await expect(
			reviewPage.getByRole("img", {
				name: "Saved featured image",
				exact: true,
			}),
		).toBeVisible();
		await expect(
			reviewPage.getByRole("button", { name: "Save changes", exact: true }),
		).toHaveCount(0);
		await expect(
			review.getByRole("button", { name: "Submit for review", exact: true }),
		).toHaveCount(0);
		await review
			.getByLabel("Review comment")
			.fill("Clarify the release headline.");
		await review
			.getByRole("button", { name: "Request changes", exact: true })
			.click();
		await expect(review.getByRole("status")).toContainText("Changes requested");

		await page.reload();
		await expect(authorReview.getByRole("status")).toContainText(
			"Changes requested",
		);
		await expect(
			authorReview.getByText("Clarify the release headline.", { exact: true }),
		).toBeVisible();
		await page.getByLabel("Title", { exact: false }).fill(approvedTitle);
		await expect(
			authorReview.getByRole("button", {
				name: "Submit for review",
				exact: true,
			}),
		).toBeDisabled();
		await page
			.getByRole("button", { name: "Save changes", exact: true })
			.click();
		await expect(authorReview.getByRole("status")).toContainText("Draft");
		await authorReview
			.getByRole("button", { name: "Submit for review", exact: true })
			.click();
		await expect(authorReview.getByRole("status")).toContainText("Submitted");

		await reviewPage.reload();
		await expect(
			reviewPage.getByRole("region", { name: "Saved content" }),
		).toContainText(approvedTitle);
		await review
			.getByRole("button", { name: "Approve revision", exact: true })
			.click();
		await expect(review.getByRole("status")).toContainText("Approved");
		await review
			.getByRole("button", { name: "Publish approved revision", exact: true })
			.click();
		await expect(
			review.getByRole("link", { name: "View live post", exact: true }),
		).toBeVisible();

		await page.reload();
		await page.getByLabel("Title", { exact: false }).fill(privateTitle);
		await page.getByLabel("Slug", { exact: false }).fill(privateSlug);
		await page
			.getByLabel("Excerpt", { exact: false })
			.fill("Unapproved confidential launch details.");
		await page
			.getByRole("button", { name: "Save changes", exact: true })
			.click();
		await expect(page).toHaveURL(
			new RegExp(`/editorial/blog/${privateSlug}/edit$`),
		);
		await expect(authorReview.getByRole("status")).toContainText("Draft");
		await expect(
			authorReview.getByRole("link", { name: "View live post", exact: true }),
		).toHaveAttribute("href", `/editorial/blog/${slug}`);
		await expect(
			authorReview.getByRole("button", {
				name: "Publish approved revision",
				exact: true,
			}),
		).toHaveCount(0);

		await publicPage.goto(`/editorial/blog/${slug}`);
		await expect(
			publicPage.getByRole("heading", {
				level: 1,
				name: approvedTitle,
				exact: true,
			}),
		).toBeVisible();
		await expect(publicPage).toHaveTitle(new RegExp(approvedTitle));
		await expect(
			publicPage.locator('meta[property="og:title"]'),
		).toHaveAttribute("content", new RegExp(approvedTitle));
		await expect(
			publicPage.getByText(privateTitle, { exact: true }),
		).toHaveCount(0);
		await expect(
			publicPage.getByText("Unapproved confidential launch details.", {
				exact: true,
			}),
		).toHaveCount(0);

		const live = await request.get(`${api}/posts?slug=${slug}`);
		const publicPost = (await live.json()).items[0];
		expect(publicPost.title).toBe(approvedTitle);
		expect(publicPost.slug).toBe(slug);
		expect(publicPost).not.toHaveProperty("editorial");
		const search = await request.get(
			`${api}/posts?published=true&query=${encodeURIComponent(privateTitle)}`,
		);
		expect((await search.json()).total).toBe(0);
		const hidden = await request.get(`${api}/posts?slug=${privateSlug}`);
		expect((await hidden.json()).items).toEqual([]);
		const sitemap = await request.get("/editorial/sitemap.xml");
		expect(sitemap.ok()).toBe(true);
		const xml = await sitemap.text();
		expect(xml).toContain(`/editorial/blog/${slug}`);
		expect(xml).not.toContain(privateSlug);

		const working = await request.get(
			`${api}/posts/editorial?slug=${privateSlug}`,
			{ headers: mockAuthHeaders(author) },
		);
		const latest = await working.json();
		const forgedApproval = await request.post(
			`${api}/posts/${post.id}/approve`,
			{
				headers: mockAuthHeaders(author),
				data: {
					expectedVersion: latest.revisionVersion,
					expectedEditorialVersion: latest.editorial.version,
				},
			},
		);
		expect(forgedApproval.status()).toBe(403);
		expect(errors, `Browser errors: ${errors.join("\n")}`).toEqual([]);
	} finally {
		await reviewerContext.close();
		await publicContext.close();
		const cleanup = await request.delete(`${api}/posts/${post.id}`, {
			headers: mockAuthHeaders(reviewer),
		});
		expect(cleanup.ok()).toBe(true);
	}
});
