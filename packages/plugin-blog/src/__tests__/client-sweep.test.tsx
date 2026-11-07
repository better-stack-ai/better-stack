// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import { Form, FormField } from "@workspace/ui/components/form";
// Core primitives MUST be imported from the package entry (not relative src
// paths) so they share module identity — and React context — with the blog
// components, which resolve `@btst/stack/*` via package self-reference.
import { StackProvider, type StackI18nProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { ComposedRoute } from "@btst/stack/client/components";
import { FeaturedImageField } from "../client/components/forms/image-field";
import {
	AddPostForm,
	EditPostForm,
} from "../client/components/forms/post-forms";
import { PostsList } from "../client/components/shared/posts-list";
import { DefaultError } from "../client/components/shared/default-error";
import type { SerializedPost } from "../types";
import { blogPermissions } from "../permissions";
import { z } from "zod";
import { createIdentityTestAuth } from "./helpers/auth-test-utils";
import { createTestClientStack } from "./helpers/client-stack-test-utils";
import { blogClientPlugin } from "../client/plugin";

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
	useSuspenseEditorialPost: vi.fn(),
	useSubmitPost: vi.fn(),
	useRequestPostChanges: vi.fn(),
	useApprovePost: vi.fn(),
	usePublishPost: vi.fn(),
	useDeletePost: vi.fn(),
	usePostForm: vi.fn(),
	usePostSearch: vi.fn(),
	useSuspensePosts: vi.fn(),
	useTags: vi.fn(),
	usePostRevisions: vi.fn(),
	useRestorePostRevision: vi.fn(),
}));

vi.mock("../client/hooks/blog-hooks", () => hooks);

// The markdown editor pulls in Milkdown/Crepe — irrelevant here and unusable
// in jsdom, so stub the lazy-loaded module.
vi.mock("../client/components/forms/markdown-editor-with-overrides", () => ({
	MarkdownEditorWithOverrides: () => null,
}));

const post: SerializedPost = {
	id: "p1",
	revisionVersion: 7,
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
	hooks.useSuspenseEditorialPost.mockReturnValue({
		post: {
			...post,
			editorial: { enabled: true, status: "draft", version: 2 },
		},
		refetch: vi.fn().mockResolvedValue({}),
		scopeKey: "account-a",
		isCurrentScope: () => true,
	});
	for (const hook of [
		hooks.useSubmitPost,
		hooks.useRequestPostChanges,
		hooks.useApprovePost,
		hooks.usePublishPost,
	])
		hook.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({}),
			isPending: false,
		});
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
	hooks.useSuspensePosts.mockReturnValue({
		posts: [],
		loadMore: vi.fn(),
		hasMore: false,
		isLoadingMore: false,
	});
	hooks.useTags.mockReturnValue({ tags: [], isLoading: false, error: null });
	hooks.usePostRevisions.mockReturnValue({
		revisions: [],
		isLoading: false,
		error: null,
		hasNextPage: false,
	});
	hooks.useRestorePostRevision.mockReturnValue({
		mutateAsync: vi.fn(),
		isPending: false,
	});
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

function createBlogStack() {
	return createTestClientStack({ blog: blogClientPlugin() });
}

function blogOverrides() {
	return { uploadImage: async () => "" };
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
				stack={createBlogStack()}
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
				stack={createBlogStack()}
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
				stack={createBlogStack()}
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

describe("Blog route authorization errors", () => {
	it("redirects an anonymous user when a protected route query returns 401", async () => {
		const navigate = vi.fn();
		vi.spyOn(console, "error").mockImplementation(() => {});
		const error = Object.assign(new Error("Authentication required"), {
			statusCode: 401,
		});
		const ProtectedQueryPage = () => {
			throw error;
		};

		await render(
			<StackProvider
				stack={createBlogStack()}
				router={{ navigate }}
				overrides={{ blog: blogOverrides() }}
				auth={createIdentityTestAuth(() => null, { loginPath: "/login" })}
				initialIdentity={null}
			>
				<ComposedRoute
					path="/blog/example/edit"
					PageComponent={ProtectedQueryPage}
					ErrorComponent={DefaultError}
					LoadingComponent={() => null}
					onError={() => {}}
				/>
			</StackProvider>,
		);

		expect(navigate).toHaveBeenCalledWith("/login");
		expect(texts()).not.toContain("Something went wrong");
	});

	it("treats a route-data 401 as authoritative over a stale client identity", async () => {
		const navigate = vi.fn();
		vi.spyOn(console, "error").mockImplementation(() => {});
		const ProtectedQueryPage = () => {
			throw Object.assign(new Error("Session expired"), { statusCode: 401 });
		};

		await render(
			<StackProvider
				stack={createBlogStack()}
				router={{ navigate }}
				overrides={{ blog: blogOverrides() }}
				auth={createIdentityTestAuth(
					() => ({ id: "stale-user", role: "user" }),
					{ loginPath: "/login" },
				)}
				initialIdentity={{ id: "stale-user", role: "user" }}
			>
				<ComposedRoute
					path="/blog/example/edit"
					PageComponent={ProtectedQueryPage}
					ErrorComponent={DefaultError}
					LoadingComponent={() => null}
					onError={() => {}}
				/>
			</StackProvider>,
		);

		expect(navigate).toHaveBeenCalledWith("/login");
		expect(texts()).not.toContain("Something went wrong");
	});

	it("redirects an authoritative route-data 401 while client identity is pending", async () => {
		const navigate = vi.fn();
		vi.spyOn(console, "error").mockImplementation(() => {});
		const ProtectedQueryPage = () => {
			throw Object.assign(new Error("Authentication required"), {
				statusCode: 401,
			});
		};

		await render(
			<StackProvider
				stack={createBlogStack()}
				router={{ navigate }}
				overrides={{ blog: blogOverrides() }}
				auth={createIdentityTestAuth(() => new Promise<null>(() => {}), {
					loginPath: "/login",
				})}
			>
				<ComposedRoute
					path="/blog/example/edit"
					PageComponent={ProtectedQueryPage}
					ErrorComponent={DefaultError}
					LoadingComponent={() => null}
					onError={() => {}}
				/>
			</StackProvider>,
		);

		expect(navigate).toHaveBeenCalledWith("/login");
		expect(texts()).not.toContain("Something went wrong");
	});
});

describe("EditPostForm operation descriptor controls", () => {
	it("separates draft creation from create-and-publish presentation", async () => {
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.literal("user") }),
			permissions: [blogPermissions] as const,
			rules: ({ blog }) => [
				blog.post.create.when(({ facts }) => facts.publish === "draft"),
			],
		});
		const auth = createClientAuth({
			authorization,
			getIdentity: () => ({ id: "user-1", role: "user" as const }),
		});

		await render(
			<StackProvider
				stack={createBlogStack()}
				overrides={{ blog: blogOverrides() }}
				auth={auth}
				initialIdentity={{ id: "user-1", role: "user" }}
			>
				<AddPostForm onClose={() => {}} onSuccess={() => {}} />
			</StackProvider>,
		);

		expect(texts()).toContain("Create Post");
		expect(texts()).not.toContain("Published");
	});

	it("shows editor controls without auth and submits its loaded revision version", async () => {
		await render(
			<StackProvider
				stack={createBlogStack()}
				overrides={{ blog: blogOverrides() }}
			>
				<EditPostForm
					postSlug="hello-world"
					onClose={() => {}}
					onSuccess={() => {}}
				/>
			</StackProvider>,
		);

		expect(texts()).toContain("Delete Post");
		expect(texts()).toContain("Revision history");
		const formConfig = hooks.usePostForm.mock.calls[0]![0];
		expect(
			formConfig.toUpdateVars(
				{ title: "Edited title", content: "Edited content" },
				post,
			),
		).toMatchObject({
			id: post.id,
			data: {
				expectedVersion: 7,
				title: "Edited title",
				content: "Edited content",
			},
		});
	});
	it("uses the Blog update and delete descriptors with one-rule client authorization", async () => {
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.literal("user") }),
			permissions: [blogPermissions] as const,
			rules: ({ blog }) => [
				blog.post.update.when(() => false),
				blog.post.delete.when(() => false),
			],
		});
		const auth = createClientAuth({
			authorization,
			getIdentity: () => ({ id: "user-1", role: "user" as const }),
		});

		await render(
			<StackProvider
				stack={createBlogStack()}
				overrides={{ blog: blogOverrides() }}
				auth={auth}
				initialIdentity={{ id: "user-1", role: "user" }}
			>
				<EditPostForm
					postSlug="hello-world"
					onClose={() => {}}
					onSuccess={() => {}}
				/>
			</StackProvider>,
		);

		expect(texts()).toContain("Update Post");
		expect(texts()).not.toContain("Published");
		expect(texts()).not.toContain("Delete Post");
	});
});

describe("Editorial forms", () => {
	it("omits publication fields from draft creation and content saves", async () => {
		await render(
			<StackProvider
				stack={createBlogStack()}
				overrides={{ blog: blogOverrides() }}
			>
				<AddPostForm
					editorialWorkflow
					onClose={() => {}}
					onSuccess={() => {}}
				/>
			</StackProvider>,
		);
		expect(texts()).toContain("Save draft");
		expect(texts()).not.toContain("Toggle to publish immediately");
		const createConfig = hooks.usePostForm.mock.calls.at(-1)![0];
		const created = createConfig.toCreateVars({
			title: "Draft",
			content: "Body",
			excerpt: "Summary",
			published: true,
		});
		expect(created).not.toHaveProperty("published");
		expect(created).not.toHaveProperty("publishedAt");
		await render(
			<StackProvider
				stack={createBlogStack()}
				overrides={{ blog: blogOverrides() }}
			>
				<EditPostForm
					editorialWorkflow
					postSlug={post.slug}
					onClose={() => {}}
					onSuccess={() => {}}
				/>
			</StackProvider>,
		);
		const updateConfig = hooks.usePostForm.mock.calls.at(-1)![0];
		const updated = updateConfig.toUpdateVars(
			{
				title: "Edit",
				content: "Body",
				excerpt: "Summary",
				slug: post.slug,
				published: false,
			},
			post,
		);
		expect(updated.data).toMatchObject({ expectedVersion: 7 });
		expect(updated.data).not.toHaveProperty("published");
		expect(updated.data).not.toHaveProperty("publishedAt");
		expect(updateConfig.defaults(post).published).toBe(false);
	});

	it("allows a reviewer to inspect and approve a saved revision without editing", async () => {
		const working = {
			...post,
			editorial: {
				enabled: true,
				status: "submitted",
				version: 3,
				actorId: "author-a",
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
		};
		hooks.useSuspenseEditorialPost.mockReturnValue({
			post: working,
			refetch: vi.fn(),
			scopeKey: "reviewer",
			isCurrentScope: () => true,
		});
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [blogPermissions] as const,
			rules: ({ blog }) => [
				blog.post.update.when(() => false),
				blog.post.approve.when(
					({ facts }) =>
						facts.revisionVersion === 7 &&
						facts.editorialVersion === 3 &&
						facts.status === "submitted",
				),
			],
		});
		const auth = createClientAuth({
			authorization,
			getIdentity: () => ({ id: "reviewer" }),
		});
		await render(
			<StackProvider
				stack={createBlogStack()}
				overrides={{ blog: blogOverrides() }}
				auth={auth}
				initialIdentity={{ id: "reviewer" }}
			>
				<EditPostForm
					editorialWorkflow
					postSlug={post.slug}
					onClose={() => {}}
					onSuccess={() => {}}
				/>
			</StackProvider>,
		);
		expect(
			container.querySelector('[aria-label="Saved content"]')?.textContent,
		).toContain(post.content);
		expect(container.querySelector('input[name="title"]')).toBeNull();
		expect(texts()).not.toContain("Save changes");
		expect(texts()).not.toContain("Request changes");
		const approve = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "Approve revision",
		);
		expect(approve).toBeTruthy();
		await act(async () => {
			approve?.click();
		});
		expect(hooks.useApprovePost().mutateAsync).toHaveBeenCalledWith({
			id: post.id,
			expectedVersion: 7,
			expectedEditorialVersion: 3,
		});
	});

	it("blocks unsaved review actions and resets private form state for a new scope", async () => {
		let form: any;
		const show = () => (
			<StackProvider
				stack={createBlogStack()}
				overrides={{ blog: blogOverrides() }}
			>
				<EditPostForm
					editorialWorkflow
					postSlug={post.slug}
					onClose={() => {}}
					onSuccess={() => {}}
					onFormReady={(ready) => {
						form = ready;
					}}
				/>
			</StackProvider>
		);
		await render(show());
		await act(async () => {
			form.setValue("title", "Private unsaved change", { shouldDirty: true });
		});
		const submit = () =>
			Array.from(container.querySelectorAll("button")).find(
				(button) => button.textContent === "Submit for review",
			);
		expect(submit()?.disabled).toBe(true);
		expect(texts()).toContain(
			"Save or discard your changes before reviewing this revision.",
		);
		hooks.useSuspenseEditorialPost.mockReturnValue({
			post: {
				...post,
				editorial: { enabled: true, status: "draft", version: 2 },
			},
			refetch: vi.fn(),
			scopeKey: "account-b",
			isCurrentScope: () => true,
		});
		await render(show());
		expect(
			(container.querySelector('input[name="title"]') as HTMLInputElement)
				.value,
		).toBe(post.title);
		expect(submit()?.disabled).toBe(false);
	});

	it("shows refresh guidance on conflict and resets review errors for a new scope", async () => {
		hooks.useApprovePost.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue({ statusCode: 409 }),
			isPending: false,
		});
		const working = {
			...post,
			editorial: { enabled: true, status: "submitted", version: 2 },
		};
		hooks.useSuspenseEditorialPost.mockReturnValue({
			post: working,
			refetch: vi.fn().mockResolvedValue({}),
			scopeKey: "account-a",
			isCurrentScope: () => true,
		});
		const show = () => (
			<StackProvider
				stack={createBlogStack()}
				overrides={{ blog: blogOverrides() }}
			>
				<EditPostForm
					editorialWorkflow
					postSlug={post.slug}
					onClose={() => {}}
					onSuccess={() => {}}
				/>
			</StackProvider>
		);
		await render(show());
		await act(async () => {
			Array.from(container.querySelectorAll("button"))
				.find((button) => button.textContent === "Approve revision")
				?.click();
		});
		expect(texts()).toContain("This post changed while you were working.");
		expect(texts()).toContain("Refresh saved version");
		hooks.useSuspenseEditorialPost.mockReturnValue({
			post: working,
			refetch: vi.fn(),
			scopeKey: "account-b",
			isCurrentScope: () => true,
		});
		await render(show());
		expect(texts()).not.toContain("This post changed while you were working.");
	});
});

describe("optional standalone discovery", () => {
	it("renders Blog without Search or a standalone discovery control", async () => {
		await render(
			<StackProvider
				stack={createBlogStack()}
				overrides={{ blog: blogOverrides() }}
			>
				<PostsList posts={[post]} />
			</StackProvider>,
		);
		expect(texts()).toContain("Hello World");
		expect(container.querySelector('[data-testid="search-button"]')).toBeNull();
		expect(hooks.usePostSearch).not.toHaveBeenCalled();
	});

	it("renders the application-supplied discovery slot", async () => {
		await render(
			<StackProvider
				stack={createBlogStack()}
				overrides={{
					blog: {
						...blogOverrides(),
						search: <button type="button">Search Blog Posts</button>,
					},
				}}
			>
				<PostsList posts={[post]} />
			</StackProvider>,
		);
		expect(texts()).toContain("Search Blog Posts");
		expect(hooks.usePostSearch).not.toHaveBeenCalled();
	});
});

describe("blog i18n precedence (useTranslate + overrides.localization)", () => {
	it("renders the English default without providers", async () => {
		await render(
			<StackProvider
				stack={createBlogStack()}
				overrides={{ blog: blogOverrides() }}
			>
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
			<StackProvider
				stack={createBlogStack()}
				overrides={{ blog: blogOverrides() }}
				i18n={i18n}
			>
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
				stack={createBlogStack()}
				overrides={{
					blog: {
						...blogOverrides(),
						localization: { BLOG_LIST_EMPTY: "Custom empty state" },
					},
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
