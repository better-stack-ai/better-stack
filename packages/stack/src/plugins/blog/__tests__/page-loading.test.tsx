import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { StackProvider } from "@btst/stack/context";
import { createClientStack } from "@btst/stack/client";
import { blogClientPlugin } from "@btst/stack/plugins/blog/client";
import { PostListPage } from "@btst/stack/plugins/blog/client/pages/posts";
import { PostPage } from "@btst/stack/plugins/blog/client/pages/post";
import { TagPage } from "@btst/stack/plugins/blog/client/pages/tag";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { blogPermissions } from "@btst/stack/plugins/blog/permissions";
import { z } from "zod";
import { BLOG_QUERY_KEYS } from "../api/query-key-defs";

const post = {
	id: "prefetched-post",
	slug: "prefetched-post",
	title: "Prefetched article",
	content: "Article available before hydration.",
	excerpt: "Article excerpt",
	published: true,
	tags: [],
	image: null,
	authorId: null,
	createdAt: "2026-09-16T12:00:00.000Z",
	updatedAt: "2026-09-16T12:00:00.000Z",
	publishedAt: "2026-09-16T12:00:00.000Z",
};

const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [blogPermissions] as const,
	rules: ({ blog }) => [
		blog.post.read.when(
			({ facts }) =>
				facts.scope === "published" ||
				(facts.scope === "post" && (!facts.exists || facts.published)),
		),
		blog.tag.read.allow(),
	],
});
const auth = createClientAuth({ authorization, getIdentity: () => null });

describe("blog pages in native framework routes", () => {
	it.each(["list", "post", "tag", "draft list", "draft post", "missing post"])(
		"renders prefetched %s with the existing public-access rules",
		(page) => {
			const fetch = vi
				.spyOn(globalThis, "fetch")
				.mockRejectedValue(new Error("Unexpected fetch"));
			const published = !page.startsWith("draft");
			const queryClient = new QueryClient({
				defaultOptions: { queries: { retry: false, staleTime: Infinity } },
			});
			queryClient.setQueryData(
				BLOG_QUERY_KEYS.postDetail(post.slug),
				page === "missing post" ? null : { ...post, published },
			);
			queryClient.setQueryData(
				BLOG_QUERY_KEYS.postsList({
					published,
					...(page === "tag" ? { tagSlug: "news" } : {}),
				}),
				{
					pages: [[post]],
					pageParams: [0],
				},
			);
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
				const html = renderToString(
					<QueryClientProvider client={queryClient}>
						<StackProvider stack={stack} auth={auth} initialIdentity={null}>
							{page.endsWith("list") ? (
								<PostListPage published={published} />
							) : page === "tag" ? (
								<TagPage tagSlug="news" />
							) : (
								<PostPage slug={post.slug} />
							)}
						</StackProvider>
					</QueryClientProvider>,
				);
				if (published && page !== "missing post")
					expect(html).toContain(post.title);
				else expect(html).not.toContain(post.title);
				if (page === "missing post") expect(html).toContain("does not exist");
				if (published)
					expect(html).not.toMatch(/data-testid="(?:posts|post)-skeleton"/);
				expect(fetch).not.toHaveBeenCalled();
			} finally {
				queryClient.clear();
				fetch.mockRestore();
			}
		},
	);
});
