// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { blogClientPlugin } from "@btst/stack/plugins/blog/client";
import { newsletterClientPlugin } from "@btst/stack/plugins/newsletter/client";
import { EditCampaignPageComponent } from "@btst/stack/plugins/newsletter/client/components";
import {
	BlogCampaignSource,
	NewsletterAction,
} from "@btst/stack/plugins/newsletter/client/blog-integration";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const post = {
	id: "post-1",
	slug: "release-notes",
	title: "Release notes",
	content: "# New features",
	tags: [],
};
let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: Infinity } },
	});
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ items: [post] })),
	);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	queryClient.clear();
	window.history.replaceState(null, "", "/");
	vi.unstubAllGlobals();
});

async function render(
	children: React.ReactNode,
	combined = false,
	integrated = false,
) {
	const stack = createClientStack({
		api: { baseURL: "http://localhost", basePath: "/api/data" },
		site: { baseURL: "http://localhost", basePath: "/pages" },
		queryClient,
		plugins: {
			newsletter: newsletterClientPlugin(),
			...(combined ? { blog: blogClientPlugin() } : {}),
		},
	});
	await act(async () => {
		root.render(
			<QueryClientProvider client={queryClient}>
				<StackProvider
					stack={stack}
					overrides={
						integrated
							? {
									newsletter: { CampaignSource: BlogCampaignSource },
								}
							: undefined
					}
				>
					{children}
				</StackProvider>
			</QueryClientProvider>,
		);
	});
}

describe("optional Blog–Newsletter composition", () => {
	it("edits and previews a standalone Newsletter campaign without reading Blog", async () => {
		await render(<EditCampaignPageComponent />);
		await vi.waitFor(async () => {
			await act(async () => {});
			expect(container.querySelector("textarea")).not.toBeNull();
		});
		const textarea = container.querySelector("textarea")!;
		await act(async () => {
			Object.getOwnPropertyDescriptor(
				HTMLTextAreaElement.prototype,
				"value",
			)!.set!.call(textarea, "# A standalone newsletter");
			textarea.dispatchEvent(new Event("input", { bubbles: true }));
		});
		const preview = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "Preview",
		)!;
		await act(async () => preview.click());
		expect(
			container.querySelector('div[aria-label="Email preview"] h1')
				?.textContent,
		).toBe("A standalone newsletter");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("does not read a Blog source unless an integration is supplied", async () => {
		window.history.replaceState(
			null,
			"",
			"/?fromPostId=post-1&fromPostSlug=release-notes",
		);
		await render(<EditCampaignPageComponent />, true);
		await vi.waitFor(async () => {
			await act(async () => {});
			expect(container.querySelector("textarea")).not.toBeNull();
		});
		expect(fetch).not.toHaveBeenCalled();
		expect(container.querySelector("textarea")?.value).toBe("");
	});

	it("links to the campaign and loads the selected post through the Blog API", async () => {
		const onLoad = vi.fn();
		await render(
			<>
				<NewsletterAction slug={post.slug} />
				<BlogCampaignSource slug={post.slug} postId={post.id} onLoad={onLoad} />
			</>,
			true,
		);
		await act(async () => {
			await vi.waitFor(() =>
				expect(onLoad).toHaveBeenCalledExactlyOnceWith(
					post.title,
					post.content,
				),
			);
		});
		const link = container.querySelector("a")!;
		const url = new URL(link.href);
		expect(url.pathname).toBe("/pages/newsletter/campaigns/new");
		expect(url.searchParams.get("fromPostId")).toBe(post.id);
		expect(url.searchParams.get("fromPostSlug")).toBe(post.slug);
		expect(container.textContent).toContain("Started from “Release notes”");
	});

	it("fills the campaign editor when the explicit source integration is configured", async () => {
		window.history.replaceState(
			null,
			"",
			"/?fromPostId=post-1&fromPostSlug=release-notes",
		);
		await render(<EditCampaignPageComponent />, true, true);
		await vi.waitFor(async () => {
			await act(async () => {});
			expect(container.querySelector("textarea")?.value).toBe(post.content);
		});
		expect(
			(container.querySelector('input[maxlength="500"]') as HTMLInputElement)
				.value,
		).toBe(post.title);
	});

	it("rejects a mismatched post ID instead of filling the campaign", async () => {
		const onLoad = vi.fn();
		await render(
			<BlogCampaignSource
				slug={post.slug}
				postId="another-post"
				onLoad={onLoad}
			/>,
			true,
		);
		await act(async () => {
			await vi.waitFor(() =>
				expect(
					container.querySelector('[role="alert"]')?.textContent,
				).toContain("not found"),
			);
		});
		expect(onLoad).not.toHaveBeenCalled();
	});

	it("reports a denied Blog read without filling the campaign", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json({ message: "Forbidden" }, { status: 403 }),
			),
		);
		const onLoad = vi.fn();
		await render(
			<BlogCampaignSource slug={post.slug} postId={post.id} onLoad={onLoad} />,
			true,
		);
		await act(async () => {
			await vi.waitFor(() =>
				expect(
					container.querySelector('[role="alert"]')?.textContent,
				).toContain("Check your access"),
			);
		});
		expect(onLoad).not.toHaveBeenCalled();
	});
});
