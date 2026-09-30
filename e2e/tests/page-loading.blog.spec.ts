import { expect, test } from "@playwright/test";
import { mockAuthHeaders } from "./helpers/mock-auth";

// Exercise the existing router API with a provider update during hydration.
// Next uses a resolved anonymous identity fixture to isolate code loading.
for (const [route, failChunk] of [
	["list", false],
	["post", false],
	["post", true],
] as const) {
	test(`prefetched ${route} ${failChunk ? "keeps the blog error UI when its code fails to load" : "stays visible with slow JavaScript and split page bundles"}`, async ({
		page,
		request,
	}, testInfo) => {
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
		let blockedPageChunk = false;
		const errors: string[] = [];
		const scripts: Promise<string>[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		page.on("response", (response) => {
			if (response.request().resourceType() === "script") {
				scripts.push(response.text());
			}
		});
		await page.route("**/*.js", async (request) => {
			await new Promise((resolve) => setTimeout(resolve, 750));
			if (failChunk) {
				const response = await request.fetch();
				if ((await response.text()).includes("Summarize this post")) {
					blockedPageChunk = true;
					await request.abort();
				} else {
					await request.fulfill({ response });
				}
			} else {
				await request.continue();
			}
		});
		await page.addInitScript(() => {
			const state = {
				sawContent: false,
				skeletonAfterContent: false,
				contentHiddenAfterContent: false,
			};
			Object.assign(window, { blogLoadingState: state });
			const visible = (selector: string) =>
				Array.from(document.querySelectorAll(selector)).some(
					(element) => element.getBoundingClientRect().height > 0,
				);
			function sample() {
				const hasContent = visible(
					'[data-testid="home-page"], [data-testid="post-page"]',
				);
				if (state.sawContent && !hasContent)
					state.contentHiddenAfterContent = true;
				if (hasContent) state.sawContent = true;
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
			const basePath = testInfo.project.name.startsWith("nextjs")
				? "/loading-blog"
				: "/pages/blog";
			await page.goto(route === "list" ? basePath : `${basePath}/${slug}`, {
				waitUntil: "networkidle",
			});
			if (failChunk) {
				expect(blockedPageChunk).toBe(true);
				await expect(page.getByTestId("error-placeholder")).toBeVisible();
				await expect(page.getByTestId("post-page")).not.toBeVisible();
				return;
			}
			await expect(
				page.getByRole("heading", {
					name: route === "list" ? "Blog Posts" : title,
					exact: true,
				}),
			).toBeVisible();
			await expect(page.getByTestId("hydration-update")).toHaveAttribute(
				"data-hydrated",
				"true",
			);
			expect(
				await page.evaluate(
					() =>
						(
							window as unknown as {
								blogLoadingState: {
									sawContent: boolean;
									skeletonAfterContent: boolean;
									contentHiddenAfterContent: boolean;
								};
							}
						).blogLoadingState,
				),
			).toEqual({
				sawContent: true,
				skeletonAfterContent: false,
				contentHiddenAfterContent: false,
			});
			expect(errors).toEqual([]);
			const loadedCode = (await Promise.all(scripts)).join("\n");
			// These UI implementations belong to other lazy routes in the same stack.
			for (const marker of [
				"milkdown-custom",
				"cms-list-search",
				"task-detail-bottom-slot",
			]) {
				expect(
					loadedCode.includes(marker),
					`unexpected page code: ${marker}`,
				).toBe(false);
			}
			if (route === "list")
				expect(
					loadedCode.includes("Summarize this post"),
					"list loaded the post implementation",
				).toBe(false);
		} finally {
			const deleted = await request.delete(`/api/data/posts/${post.id}`, {
				headers: mockAuthHeaders(),
			});
			expect(deleted.ok()).toBeTruthy();
		}
	});
}
