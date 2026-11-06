import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StackProvider } from "@btst/stack/context";
import { HomePage } from "../client/components/pages/home-page.internal";
import { TagPage } from "../client/components/pages/tag-page.internal";
import { PostsList } from "../client/components/shared/posts-list";
import { RecentPostsCarousel } from "../client/components/shared/recent-posts-carousel";
import type { BlogPluginOverrides } from "../client/overrides";
import { blogClientPlugin } from "../client/plugin";
import type { SerializedPost } from "../types";
import { createTestClientStack } from "./helpers/client-stack-test-utils";

const hooks = vi.hoisted(() => ({
	useSuspensePosts: vi.fn(),
	usePostSearch: vi.fn(),
	useTags: vi.fn(),
	useSuspenseTags: vi.fn(),
}));

vi.mock("../client/hooks/blog-hooks", () => hooks);

const post: SerializedPost = {
	id: "page-card-post",
	title: "Page card article",
	content: "Article body",
	excerpt: "Article excerpt",
	slug: "page-card-article",
	published: true,
	image: null,
	tags: [{ id: "news", name: "News", slug: "news" }],
	authorId: null,
	publishedAt: "2026-11-06T12:00:00.000Z",
	createdAt: "2026-11-06T12:00:00.000Z",
	updatedAt: "2026-11-06T12:00:00.000Z",
};

function card(name: string) {
	return ({ post }: { post: SerializedPost }) => (
		<article data-card={name}>{post.title}</article>
	);
}

const pages = {
	posts: <HomePage published />,
	drafts: <HomePage published={false} />,
	tag: <TagPage tagSlug="news" />,
	post: <RecentPostsCarousel posts={[post]} />,
};

function render(
	page: ReactElement,
	overrides: Partial<BlogPluginOverrides> = {},
) {
	hooks.useSuspensePosts.mockReturnValue({
		posts: [post],
		loadMore: () => {},
		hasMore: false,
		isLoadingMore: false,
	});
	hooks.usePostSearch.mockReturnValue({ data: [], isLoading: false });
	hooks.useTags.mockReturnValue({ tags: post.tags });
	hooks.useSuspenseTags.mockReturnValue({ tags: post.tags });
	return renderToStaticMarkup(
		<StackProvider
			stack={createTestClientStack({ blog: blogClientPlugin() })}
			overrides={{ blog: { uploadImage: async () => "", ...overrides } }}
		>
			{page}
		</StackProvider>,
	);
}

describe("Blog page-specific post cards", () => {
	it("selects each built-in page's card ahead of the shared card", () => {
		const pageOverrides = {
			posts: { PostCard: card("posts") },
			drafts: { PostCard: card("drafts") },
			tag: { PostCard: card("tag") },
			post: { PostCard: card("post") },
		};
		for (const [name, page] of Object.entries(pages)) {
			const html = render(page, { PostCard: card("shared"), pageOverrides });
			expect(html).toContain(`<article data-card="${name}">${post.title}`);
			expect(html).not.toContain('data-card="shared"');
			for (const other of Object.keys(pages).filter((key) => key !== name)) {
				expect(html).not.toContain(`data-card="${other}"`);
			}
		}
	});

	it("keeps a published-list override isolated and falls back to the shared card", () => {
		const overrides: Partial<BlogPluginOverrides> = {
			PostCard: card("shared"),
			pageOverrides: {
				posts: { PostCard: card("published") },
				drafts: {},
			},
		};
		for (const [name, page] of Object.entries(pages)) {
			const html = render(page, overrides);
			expect(html).toContain(
				`data-card="${name === "posts" ? "published" : "shared"}"`,
			);
			expect(html).not.toContain('data-slot="card"');
		}
		expect(render(<PostsList posts={[post]} />, overrides)).toContain(
			'data-card="shared"',
		);
	});

	it("retains built-in cards for unconfigured pages, including without any overrides", () => {
		for (const [name, page] of Object.entries(pages)) {
			const html = render(page, {
				pageOverrides: { posts: { PostCard: card("published") } },
			});
			if (name === "posts") {
				expect(html).toContain('data-card="published"');
			} else {
				expect(html).toContain('data-slot="card"');
				expect(html).not.toContain("data-card=");
			}
			const unchanged = render(page);
			expect(unchanged).toContain('data-slot="card"');
			expect(unchanged).toContain(post.title);
			expect(unchanged).not.toContain("data-card=");
		}
	});
});
