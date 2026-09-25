// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Core primitives MUST be imported from the package entry (not relative src
// paths) so they share module identity — and React context — with the blog
// components, which resolve `@btst/stack/*` via package self-reference.
import { StackProvider } from "@btst/stack/context";
import { PageWrapper } from "../client/components/shared/page-wrapper";
import { PostsList } from "../client/components/shared/posts-list";
import type { SerializedPost } from "../types";
import { createTestClientStack } from "../../../__tests__/client-stack-test-utils";
import { blogClientPlugin } from "../client/plugin";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom lacks these APIs used by Radix / cmdk inside SearchInput
(globalThis as any).ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

const hooks = vi.hoisted(() => ({
	useSuspensePost: vi.fn(),
	useDeletePost: vi.fn(),
	usePostForm: vi.fn(),
	usePostSearch: vi.fn(),
	useSuspensePosts: vi.fn(),
	useTags: vi.fn(),
}));

vi.mock("../client/hooks/blog-hooks", () => hooks);

const CLASS_NAMES = {
	container: "bg-red-100",
	postCard: "bg-blue-100",
	postTitle: "text-purple-700",
	postMeta: "text-green-600",
	tagsList: "bg-yellow-50",
	pagination: "border-4 border-orange-500",
} as const;

const post: SerializedPost = {
	id: "p1",
	title: "Hello World",
	content: "# Hello",
	excerpt: "An excerpt",
	slug: "hello-world",
	published: true,
	image: "",
	tags: [{ id: "t1", name: "Release", slug: "release" }],
	authorId: null,
	publishedAt: new Date("2024-01-01").toISOString(),
	createdAt: new Date("2024-01-01").toISOString(),
	updatedAt: new Date("2024-01-01").toISOString(),
} as unknown as SerializedPost;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);

	hooks.usePostSearch.mockReturnValue({ data: [], isLoading: false });
});

afterEach(async () => {
	await act(async () => {
		root.unmount();
	});
	container.remove();
	vi.clearAllMocks();
});

async function render(ui: React.ReactElement) {
	await act(async () => {
		root.render(ui);
	});
}

function withBlogOverrides(children: React.ReactNode) {
	return (
		<StackProvider
			stack={createTestClientStack({ blog: blogClientPlugin() })}
			overrides={{
				blog: {
					uploadImage: async () => "",
					classNames: CLASS_NAMES,
				},
			}}
		>
			{children}
		</StackProvider>
	);
}

function query(selector: string): HTMLElement {
	const el = container.querySelector<HTMLElement>(selector);
	expect(el, `expected to find ${selector}`).toBeTruthy();
	return el!;
}

describe("blog classNames overrides (issue #36)", () => {
	it("applies classNames.container to the page container", async () => {
		await render(
			withBlogOverrides(
				<PageWrapper testId="blog-container">
					<span>content</span>
				</PageWrapper>,
			),
		);

		const el = query('[data-testid="blog-container"]');
		expect(el.className).toContain(CLASS_NAMES.container);
		// The override must merge with the layout's own classes, not replace them.
		expect(el.className).toContain("container");
		expect(el.className).toContain("mx-auto");
	});

	it("applies classNames.postCard, postTitle, postMeta and tagsList inside a post card", async () => {
		await render(withBlogOverrides(<PostsList posts={[post]} />));

		// postCard — anchored on the Card primitive's structural slot.
		const card = query('[data-slot="card"]');
		expect(card.className).toContain(CLASS_NAMES.postCard);
		expect(card.className).toContain("group");

		// postTitle — anchored on the CardTitle primitive's structural slot.
		const title = query('[data-slot="card-title"]');
		expect(title.className).toContain(CLASS_NAMES.postTitle);
		expect(title.className).toContain("line-clamp-3");
		expect(title.textContent).toBe(post.title);

		// postMeta — the wrapper holding the published date.
		const meta = query("time").parentElement!;
		expect(meta.className).toContain(CLASS_NAMES.postMeta);
		// `cn` runs tailwind-merge, so the conflicting `text-muted-foreground`
		// is intentionally replaced by the override; non-conflicting base
		// classes must survive.
		expect(meta.className).toContain("items-center");
		expect(meta.className).not.toContain("text-muted-foreground");

		// tagsList — the wrapper immediately following the metadata block.
		const tags = meta.nextElementSibling as HTMLElement;
		expect(tags.className).toContain(CLASS_NAMES.tagsList);
		expect(tags.className).toContain("flex-wrap");
		expect(tags.textContent).toContain("Release");
	});

	it("applies classNames.pagination to the load-more wrapper", async () => {
		await render(
			withBlogOverrides(
				<PostsList posts={[post]} onLoadMore={() => {}} hasMore />,
			),
		);

		const button = [...container.querySelectorAll("button")].find((b) =>
			b.textContent?.includes("Load more posts"),
		);
		expect(button, "expected a load-more button").toBeTruthy();

		const pagination = button!.parentElement!;
		expect(pagination.className).toContain("border-4");
		expect(pagination.className).toContain("border-orange-500");
		expect(pagination.className).toContain("justify-center");
	});

	it("leaves base classes untouched when no classNames override is supplied", async () => {
		await render(
			<StackProvider
				stack={createTestClientStack({ blog: blogClientPlugin() })}
				overrides={{ blog: { uploadImage: async () => "" } }}
			>
				<PostsList posts={[post]} onLoadMore={() => {}} hasMore />
			</StackProvider>,
		);

		const card = query('[data-slot="card"]');
		expect(card.className).toContain("group");
		expect(card.className).not.toContain(CLASS_NAMES.postCard);
	});
});
