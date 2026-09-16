import { expect, test } from "@playwright/test";
import { mockAuthHeaders } from "./helpers/mock-auth";

// Fresh anonymous contexts exercise cold hydration of the generated native routes.
for (const route of ["list", "post"] as const) {
	test(`prefetched ${route} stays visible with slow JavaScript and split page bundles`, async ({
		page,
		request,
	}) => {
		const slug = `page-loading-${route}-${Date.now()}`;
		const title = `Prefetched ${slug}`;
		const created = await request.post("/api/data/posts", {
			headers: mockAuthHeaders(),
			data: {
				title,
				slug,
				excerpt: "Page loading regression",
				content: "Prefetched article body.",
				published: true,
			},
		});
		expect(created.ok(), await created.text()).toBeTruthy();
		const post = await created.json();
		const errors: string[] = [];
		const scripts: Promise<string>[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		page.on("response", (response) => {
			if (response.request().resourceType() === "script") {
				scripts.push(response.text());
			}
		});
		await page.route("**/_next/**/*.js", async (request) => {
			await new Promise((resolve) => setTimeout(resolve, 750));
			await request.continue();
		});
		await page.addInitScript(() => {
			const state = { sawContent: false, skeletonAfterContent: false };
			Object.assign(window, { blogLoadingState: state });
			const visible = (selector: string) =>
				Array.from(document.querySelectorAll(selector)).some(
					(element) => element.getBoundingClientRect().height > 0,
				);
			function sample() {
				if (visible('[data-testid="home-page"], [data-testid="post-page"]')) {
					state.sawContent = true;
				}
				if (
					state.sawContent &&
					visible(
						'[data-testid="posts-skeleton"], [data-testid="post-skeleton"]',
					)
				) {
					state.skeletonAfterContent = true;
				}
				requestAnimationFrame(sample);
			}
			requestAnimationFrame(sample);
		});
		try {
			await page.goto(
				route === "list" ? "/pages/ssg-blog" : `/pages/ssg-blog/${slug}`,
				{
					waitUntil: "networkidle",
				},
			);
			await expect(
				page.getByRole("heading", {
					name: route === "list" ? "Blog Posts" : title,
					exact: true,
				}),
			).toBeVisible();
			expect(
				await page.evaluate(
					() =>
						(
							window as unknown as {
								blogLoadingState: {
									sawContent: boolean;
									skeletonAfterContent: boolean;
								};
							}
						).blogLoadingState,
				),
			).toEqual({ sawContent: true, skeletonAfterContent: false });
			expect(errors).toEqual([]);
			const loadedCode = (await Promise.all(scripts)).join("\n");
			// These UI implementations belong to other lazy routes in the same stack.
			for (const marker of [
				"milkdown-custom",
				"cms-list-search",
				"task-detail-bottom-slot",
			]) {
				expect(loadedCode).not.toContain(marker);
			}
		} finally {
			const deleted = await request.delete(`/api/data/posts/${post.id}`, {
				headers: mockAuthHeaders(),
			});
			expect(deleted.ok()).toBeTruthy();
		}
	});
}
