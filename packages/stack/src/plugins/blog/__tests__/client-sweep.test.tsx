// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import { Form, FormField } from "@workspace/ui/components/form";
// Core primitives MUST be imported from the package entry (not relative src
// paths) so they share module identity — and React context — with the blog
// components, which resolve `@btst/stack/*` via package self-reference.
import {
	StackProvider,
	type StackAuthProvider,
	type StackI18nProvider,
} from "@btst/stack/context";
import { FeaturedImageField } from "../client/components/forms/image-field";
import { EditPostForm } from "../client/components/forms/post-forms";
import { PostsList } from "../client/components/shared/posts-list";
import { SearchInput } from "../client/components/shared/search-input";
import type { SerializedPost } from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom lacks these APIs used by Radix / cmdk
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
	useTags: vi.fn(),
}));

vi.mock("../client/hooks/blog-hooks", () => hooks);

// The markdown editor pulls in Milkdown/Crepe — irrelevant here and unusable
// in jsdom, so stub the lazy-loaded module.
vi.mock("../client/components/forms/markdown-editor-with-overrides", () => ({
	MarkdownEditorWithOverrides: () => null,
}));

const post: SerializedPost = {
	id: "p1",
	title: "Hello World",
	content: "# Hello",
	excerpt: "An excerpt",
	slug: "hello-world",
	published: true,
	image: "",
	tags: [],
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

	hooks.useSuspensePost.mockReturnValue({ post, refetch: vi.fn() });
	hooks.useDeletePost.mockReturnValue({
		mutateAsync: vi.fn(),
		isPending: false,
	});
	hooks.usePostForm.mockReturnValue({
		submit: vi.fn(),
		isSubmitting: false,
		error: null,
		fieldErrors: {},
		defaultValues: {
			title: post.title,
			content: post.content,
			excerpt: post.excerpt,
			slug: post.slug,
			published: post.published,
			image: "",
			tags: [],
		},
	});
	hooks.usePostSearch.mockReturnValue({ data: [], isLoading: false });
	hooks.useTags.mockReturnValue({ tags: [], isLoading: false, error: null });
});

afterEach(async () => {
	await act(async () => {
		root.unmount();
	});
	container.remove();
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

async function render(ui: React.ReactElement) {
	await act(async () => {
		root.render(ui);
	});
}

function texts(): string {
	return container.textContent ?? "";
}

// Renders FeaturedImageField the way post-forms does: inside a react-hook-form
// FormField so the shadcn form primitives have their context.
function ImageFieldHarness() {
	const form = useForm<{ image: string }>({ defaultValues: { image: "" } });
	return (
		<Form {...form}>
			<form>
				<FormField
					control={form.control}
					name="image"
					render={({ field }) => (
						<FeaturedImageField
							value={field.value}
							onChange={field.onChange}
							setFeaturedImageUploading={() => {}}
						/>
					)}
				/>
			</form>
		</Form>
	);
}

async function selectFile(file: File) {
	const input = container.querySelector(
		'input[type="file"]',
	) as HTMLInputElement;
	expect(input).toBeTruthy();
	Object.defineProperty(input, "files", { value: [file], configurable: true });
	await act(async () => {
		input.dispatchEvent(new Event("change", { bubbles: true }));
	});
}

describe("FeaturedImageField notifications (useNotify)", () => {
	it("notifies success through the configured notify provider on upload", async () => {
		const notify = { success: vi.fn(), error: vi.fn() };
		const uploadImage = vi.fn().mockResolvedValue("https://cdn/img.png");

		await render(
			<StackProvider
				basePath="/pages"
				notify={notify}
				overrides={{ blog: { uploadImage } }}
			>
				<ImageFieldHarness />
			</StackProvider>,
		);

		await selectFile(new File(["x"], "a.png", { type: "image/png" }));

		expect(uploadImage).toHaveBeenCalledOnce();
		expect(notify.success).toHaveBeenCalledWith("Image uploaded successfully");
		expect(notify.error).not.toHaveBeenCalled();
	});

	it("notifies a single error when the upload fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const notify = { success: vi.fn(), error: vi.fn() };
		const uploadImage = vi.fn().mockRejectedValue(new Error("boom"));

		await render(
			<StackProvider
				basePath="/pages"
				notify={notify}
				overrides={{ blog: { uploadImage } }}
			>
				<ImageFieldHarness />
			</StackProvider>,
		);

		await selectFile(new File(["x"], "a.png", { type: "image/png" }));

		expect(notify.error).toHaveBeenCalledTimes(1);
		expect(notify.error).toHaveBeenCalledWith("Failed to upload image");
		expect(notify.success).not.toHaveBeenCalled();
	});

	it("rejects non-image files without uploading", async () => {
		const notify = { success: vi.fn(), error: vi.fn() };
		const uploadImage = vi.fn();

		await render(
			<StackProvider
				basePath="/pages"
				notify={notify}
				overrides={{ blog: { uploadImage } }}
			>
				<ImageFieldHarness />
			</StackProvider>,
		);

		await selectFile(new File(["x"], "a.txt", { type: "text/plain" }));

		expect(uploadImage).not.toHaveBeenCalled();
		expect(notify.error).toHaveBeenCalledWith("Please select an image file");
	});
});

describe("EditPostForm delete control (CanAccess)", () => {
	it("shows the delete button without an auth provider", async () => {
		await render(
			<StackProvider basePath="/pages" overrides={{ blog: {} }}>
				<EditPostForm
					postSlug="hello-world"
					onClose={() => {}}
					onSuccess={() => {}}
				/>
			</StackProvider>,
		);

		expect(texts()).toContain("Delete Post");
	});

	it("hides the delete button when can() denies blog:post/delete", async () => {
		const can = vi.fn(
			({ resource, action }: { resource: string; action: string }) =>
				!(resource === "blog:post" && action === "delete"),
		);
		const auth: StackAuthProvider = {
			getIdentity: () => ({ id: "user-1" }),
			can,
		};

		await render(
			<StackProvider basePath="/pages" overrides={{ blog: {} }} auth={auth}>
				<EditPostForm
					postSlug="hello-world"
					onClose={() => {}}
					onSuccess={() => {}}
				/>
			</StackProvider>,
		);

		// The rest of the form still renders; only the delete control is gone.
		expect(texts()).toContain("Update Post");
		expect(texts()).not.toContain("Delete Post");
		expect(can).toHaveBeenCalledWith(
			expect.objectContaining({
				resource: "blog:post",
				action: "delete",
				params: { id: post.id },
			}),
		);
	});
});

describe("SearchInput list state (useListState)", () => {
	function createMockRouter(initial = "") {
		let params = new URLSearchParams(initial);
		const setSearchParams = vi.fn(
			(next: URLSearchParams, _opts?: { replace?: boolean }) => {
				params = new URLSearchParams(next.toString());
			},
		);
		return {
			navigate: vi.fn(),
			getSearchParams: () => new URLSearchParams(params.toString()),
			setSearchParams,
		};
	}

	it("seeds the search query from an initial ?q= URL param", async () => {
		const router = createMockRouter("q=hello");

		await render(
			<StackProvider basePath="/pages" router={router} overrides={{ blog: {} }}>
				<SearchInput />
			</StackProvider>,
		);

		expect(hooks.usePostSearch).toHaveBeenCalledWith(
			expect.objectContaining({ query: "hello", enabled: true }),
		);
		// Nothing is written back for a read-only render
		expect(router.setSearchParams).not.toHaveBeenCalled();
	});

	it("writes typed queries to the URL with replace history", async () => {
		const router = createMockRouter();

		await render(
			<StackProvider basePath="/pages" router={router} overrides={{ blog: {} }}>
				<SearchInput />
			</StackProvider>,
		);

		// Open the search modal
		const trigger = container.querySelector(
			'[data-testid="search-button"]',
		) as HTMLButtonElement;
		expect(trigger).toBeTruthy();
		await act(async () => {
			trigger.click();
		});

		// Type into the cmdk input (rendered in a portal on document.body)
		const input = document.querySelector(
			'[data-testid="search-input"]',
		) as HTMLInputElement;
		expect(input).toBeTruthy();
		const setValue = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)!.set!;
		await act(async () => {
			setValue.call(input, "typescript");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});

		// Wait out the modal's debounce, then the microtask URL flush
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 650));
		});

		expect(router.setSearchParams).toHaveBeenCalled();
		const [written, opts] = router.setSearchParams.mock.calls.at(-1)!;
		expect(written.get("q")).toBe("typescript");
		expect(opts).toEqual({ replace: true });
		expect(hooks.usePostSearch).toHaveBeenLastCalledWith(
			expect.objectContaining({ query: "typescript" }),
		);
	});
});

describe("blog i18n precedence (useTranslate + overrides.localization)", () => {
	it("renders the English default without providers", async () => {
		await render(
			<StackProvider basePath="/pages" overrides={{ blog: {} }}>
				<PostsList posts={[]} />
			</StackProvider>,
		);

		expect(texts()).toContain("There are no posts here yet.");
	});

	it("routes strings through the i18n provider when configured", async () => {
		const i18n: StackI18nProvider = {
			translate: (key, defaultValue) =>
				key === "blog.list.empty" ? "Noch keine Posts." : defaultValue,
		};

		await render(
			<StackProvider basePath="/pages" overrides={{ blog: {} }} i18n={i18n}>
				<PostsList posts={[]} />
			</StackProvider>,
		);

		expect(texts()).toContain("Noch keine Posts.");
	});

	it("lets overrides.localization win over the i18n provider", async () => {
		const translate = vi.fn(
			(key: string, defaultValue: string) => `translated:${key}`,
		);

		await render(
			<StackProvider
				basePath="/pages"
				overrides={{
					blog: { localization: { BLOG_LIST_EMPTY: "Custom empty state" } },
				}}
				i18n={{ translate }}
			>
				<PostsList posts={[]} />
			</StackProvider>,
		);

		expect(texts()).toContain("Custom empty state");
		expect(texts()).not.toContain("translated:blog.list.empty");
	});
});
