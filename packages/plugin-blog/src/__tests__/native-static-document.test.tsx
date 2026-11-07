import type { ReactNode } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { Writable } from "node:stream";
import { JSDOM } from "jsdom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StackProvider } from "@btst/stack/context";
import { createClientStack } from "@btst/stack/client";
import { ComposedRoute } from "@btst/stack/client/components";
import { PostListPage } from "@btst/plugin-blog/client/pages/posts";
import { PostPage } from "@btst/plugin-blog/client/pages/post";
import { TagPage } from "@btst/plugin-blog/client/pages/tag";
import { blogClientPlugin } from "../client/plugin";
import { BLOG_QUERY_KEYS } from "../api/query-key-defs";
import { expect, it } from "vitest";

// React outlines completed document boundaries larger than its 12.8 KB stream budget.
const text = "Prefetched content available without JavaScript. ".repeat(500);
const post = {
	id: "large-post",
	slug: "large-post",
	title: "A statically rendered article",
	content: text,
	excerpt: text,
	published: true,
	tags: [],
	image: null,
	authorId: null,
	createdAt: "2026-09-16T12:00:00.000Z",
	updatedAt: "2026-09-16T12:00:00.000Z",
	publishedAt: "2026-09-16T12:00:00.000Z",
};

async function renderDocument(children: ReactNode) {
	let html = "";
	await new Promise<void>((resolve, reject) => {
		const destination = new Writable({
			write(chunk, _encoding, callback) {
				html += chunk.toString();
				callback();
			},
		});
		destination.on("finish", resolve);
		destination.on("error", reject);
		const stream = renderToPipeableStream(
			<html>
				<body>{children}</body>
			</html>,
			{
				onAllReady() {
					stream.pipe(destination);
				},
				onError: reject,
			},
		);
	});
	return new JSDOM(html, { url: "http://test.local" }).window.document;
}

it("preserves default streaming boundaries for ordinary composed routes", async () => {
	const document = await renderDocument(
		<ComposedRoute
			path="/large"
			PageComponent={() => <main>{text}</main>}
			LoadingComponent={() => <p>Loading page</p>}
			onError={() => {}}
		/>,
	);
	const content = document.querySelector("main");
	expect(content).not.toBeNull();
	expect(content?.closest("[hidden]")).not.toBeNull();
	expect(document.body.textContent).toContain("Loading page");
});

it.each([
	["list", <PostListPage />, "home-page"],
	["article", <PostPage slug={post.slug} />, "post-page"],
	["tag", <TagPage tagSlug="news" />, "tag-page"],
] as const)(
	"renders a large native %s visibly in a complete static document",
	async (_name, page, testId) => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, staleTime: Infinity } },
		});
		queryClient.setQueryData(BLOG_QUERY_KEYS.postDetail(post.slug), post);
		for (const tagSlug of [undefined, "news"]) {
			queryClient.setQueryData(
				BLOG_QUERY_KEYS.postsList({ published: true, tagSlug }),
				{
					pages: [[post]],
					pageParams: [0],
				},
			);
		}
		queryClient.setQueryData(BLOG_QUERY_KEYS.tagsList(), [
			{ id: "news", slug: "news", name: "News" },
		]);
		const stack = createClientStack({
			api: { baseURL: "http://test.local", basePath: "/api/data" },
			site: { baseURL: "http://test.local", basePath: "/pages" },
			queryClient,
			plugins: { blog: blogClientPlugin() },
		});
		try {
			const document = await renderDocument(
				<QueryClientProvider client={queryClient}>
					<StackProvider stack={stack}>{page}</StackProvider>
				</QueryClientProvider>,
			);
			const content = document.querySelector(`[data-testid="${testId}"]`);
			expect(content).not.toBeNull();
			expect(content?.textContent).toContain(post.title);
			expect(content?.closest("[hidden]")).toBeNull();
		} finally {
			queryClient.clear();
		}
	},
);
