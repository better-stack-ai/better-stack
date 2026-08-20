// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Core primitives MUST be imported from the package entry (not relative src
// paths) so they share module identity — and React context — with the
// comments components, which resolve `@btst/stack/*` via package
// self-reference.
import {
	StackProvider,
	type StackAuthProvider,
	type StackI18nProvider,
} from "@btst/stack/context";
import { ModerationPage } from "../client/components/pages/moderation-page.internal";
import { UserCommentsPage } from "../client/components/pages/my-comments-page.internal";
import { CommentForm } from "../client/components/comment-form";
import { CommentThread } from "../client/components/comment-thread";
import type { SerializedComment } from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom lacks these APIs used by Radix
(globalThis as any).ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};
window.scrollTo ??= (() => {}) as typeof window.scrollTo;

const hooks = vi.hoisted(() => ({
	useComments: vi.fn(),
	useSuspenseComments: vi.fn(),
	useSuspenseModerationComments: vi.fn(),
	useInfiniteComments: vi.fn(),
	useCommentCount: vi.fn(),
	usePostComment: vi.fn(),
	useUpdateComment: vi.fn(),
	useApproveComment: vi.fn(),
	useUpdateCommentStatus: vi.fn(),
	useDeleteComment: vi.fn(),
	useToggleLike: vi.fn(),
}));

vi.mock("../client/hooks/use-comments", () => hooks);

const comment: SerializedComment = {
	id: "c1",
	resourceId: "post-1",
	resourceType: "post",
	parentId: null,
	authorId: "author-1",
	resolvedAuthorName: "Alice",
	resolvedAvatarUrl: null,
	body: "Nice post!",
	status: "pending",
	likes: 0,
	isLikedByCurrentUser: false,
	editedAt: null,
	createdAt: new Date("2024-01-01").toISOString(),
	updatedAt: new Date("2024-01-01").toISOString(),
	replyCount: 0,
} as unknown as SerializedComment;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);

	hooks.useSuspenseModerationComments.mockReturnValue({
		comments: [comment],
		total: 1,
		limit: 20,
		offset: 0,
		totalPages: 1,
		refetch: vi.fn(),
	});
	hooks.useSuspenseComments.mockReturnValue({
		comments: [comment],
		total: 1,
		refetch: vi.fn(),
	});
	hooks.useInfiniteComments.mockReturnValue({
		comments: [],
		total: 0,
		isLoading: false,
		loadMore: vi.fn(),
		hasMore: false,
		isLoadingMore: false,
		queryKey: ["comments", "infinite"],
	});
	hooks.usePostComment.mockReturnValue({
		mutateAsync: vi.fn(),
		isPending: false,
	});
	hooks.useUpdateCommentStatus.mockReturnValue({
		mutateAsync: vi.fn().mockResolvedValue(comment),
		isPending: false,
	});
	hooks.useDeleteComment.mockReturnValue({
		mutateAsync: vi.fn().mockResolvedValue({ success: true }),
		isPending: false,
	});
});

afterEach(async () => {
	await act(async () => {
		root.unmount();
	});
	container.remove();
	document.body.innerHTML = "";
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

async function render(ui: React.ReactElement) {
	await act(async () => {
		root.render(ui);
	});
}

function texts(): string {
	return document.body.textContent ?? "";
}

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

const commentsOverrides = {};

function typeInto(element: HTMLElement, value: string) {
	const proto =
		element instanceof HTMLTextAreaElement
			? HTMLTextAreaElement.prototype
			: HTMLInputElement.prototype;
	const setValue = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
	setValue.call(element, value);
	element.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ModerationPage row actions (CanAccess)", () => {
	function renderModerationPage(
		auth?: StackAuthProvider,
		notify?: {
			success: ReturnType<typeof vi.fn>;
			error: ReturnType<typeof vi.fn>;
		},
		router = createMockRouter(),
	) {
		return render(
			<StackProvider
				basePath="/pages"
				router={router}
				notify={notify}
				overrides={{ comments: commentsOverrides }}
				auth={auth}
			>
				<ModerationPage />
			</StackProvider>,
		);
	}

	it("shows view, approve, spam and delete buttons without an auth provider", async () => {
		await renderModerationPage();

		const row = container.querySelector('[data-testid="moderation-row"]')!;
		expect(row.querySelector('[data-testid="view-button"]')).toBeTruthy();
		expect(row.querySelector('[data-testid="approve-button"]')).toBeTruthy();
		expect(row.querySelector('[data-testid="spam-button"]')).toBeTruthy();
		expect(row.querySelector('[data-testid="delete-button"]')).toBeTruthy();
	});

	it("hides approve/spam when can() denies comments:comment/moderate", async () => {
		const can = vi.fn(
			({ resource, action }: { resource: string; action: string }) =>
				!(resource === "comments:comment" && action === "moderate"),
		);
		const auth: StackAuthProvider = {
			getIdentity: () => ({ id: "user-1" }),
			can,
		};

		await renderModerationPage(auth);

		const row = container.querySelector('[data-testid="moderation-row"]')!;
		expect(row.querySelector('[data-testid="view-button"]')).toBeTruthy();
		expect(row.querySelector('[data-testid="approve-button"]')).toBeNull();
		expect(row.querySelector('[data-testid="spam-button"]')).toBeNull();
		// Delete is a separate action and stays visible
		expect(row.querySelector('[data-testid="delete-button"]')).toBeTruthy();
		expect(can).toHaveBeenCalledWith(
			expect.objectContaining({
				resource: "comments:comment",
				action: "moderate",
				params: { id: comment.id },
			}),
		);
	});

	it("hides the delete button when can() denies comments:comment/delete", async () => {
		const can = vi.fn(
			({ resource, action }: { resource: string; action: string }) =>
				!(resource === "comments:comment" && action === "delete"),
		);
		const auth: StackAuthProvider = {
			getIdentity: () => ({ id: "user-1" }),
			can,
		};

		await renderModerationPage(auth);

		const row = container.querySelector('[data-testid="moderation-row"]')!;
		expect(row.querySelector('[data-testid="delete-button"]')).toBeNull();
		expect(row.querySelector('[data-testid="approve-button"]')).toBeTruthy();
	});

	it("notifies success through the notify provider after approving", async () => {
		const notify = { success: vi.fn(), error: vi.fn() };

		await renderModerationPage(undefined, notify);

		const approveButton = container.querySelector<HTMLButtonElement>(
			'[data-testid="approve-button"]',
		)!;
		await act(async () => {
			approveButton.click();
		});

		expect(
			hooks.useUpdateCommentStatus.mock.results[0]!.value.mutateAsync,
		).toHaveBeenCalledWith({ id: comment.id, status: "approved" });
		expect(notify.success).toHaveBeenCalledWith("Comment approved");
		expect(notify.error).not.toHaveBeenCalled();
	});
});

describe("ModerationPage tab/page state (useListState)", () => {
	it("seeds tab and page from the URL", async () => {
		const router = createMockRouter("tab=spam&page=3");

		await render(
			<StackProvider
				basePath="/pages"
				router={router}
				overrides={{ comments: commentsOverrides }}
			>
				<ModerationPage />
			</StackProvider>,
		);

		expect(hooks.useSuspenseModerationComments).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.objectContaining({ status: "spam", page: 3 }),
		);
		// Nothing is written back for a read-only render
		expect(router.setSearchParams).not.toHaveBeenCalled();
	});

	it("falls back to the pending tab and page 1 for mangled URL values", async () => {
		const router = createMockRouter("tab=banana&page=-4");

		await render(
			<StackProvider
				basePath="/pages"
				router={router}
				overrides={{ comments: commentsOverrides }}
			>
				<ModerationPage />
			</StackProvider>,
		);

		expect(hooks.useSuspenseModerationComments).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.objectContaining({ status: "pending", page: 1 }),
		);
	});

	it("writes the tab to the URL and resets the page on tab switch", async () => {
		const router = createMockRouter("tab=spam&page=3");

		await render(
			<StackProvider
				basePath="/pages"
				router={router}
				overrides={{ comments: commentsOverrides }}
			>
				<ModerationPage />
			</StackProvider>,
		);

		const approvedTab = container.querySelector<HTMLButtonElement>(
			'[data-testid="tab-approved"]',
		)!;
		// Radix Tabs triggers activate on mousedown (not click) — dispatch a
		// real MouseEvent so onValueChange fires in jsdom.
		await act(async () => {
			approvedTab.dispatchEvent(
				new MouseEvent("mousedown", { bubbles: true, button: 0 }),
			);
			approvedTab.click();
		});

		expect(router.setSearchParams).toHaveBeenCalled();
		const [written] = router.setSearchParams.mock.calls.at(-1)!;
		expect(written.get("tab")).toBe("approved");
		// page resets to the default (1) and defaults are omitted from the URL
		expect(written.get("page")).toBeNull();
		expect(hooks.useSuspenseModerationComments).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.objectContaining({ status: "approved", page: 1 }),
		);
	});
});

describe("UserCommentsPage (login gate + useNotify + useListState)", () => {
	function renderUserComments(
		auth?: StackAuthProvider,
		notify?: {
			success: ReturnType<typeof vi.fn>;
			error: ReturnType<typeof vi.fn>;
		},
		router = createMockRouter(),
	) {
		return render(
			<StackProvider
				basePath="/pages"
				router={router}
				notify={notify}
				auth={auth}
				api={{ baseURL: "http://test.local", basePath: "/api/data" }}
				overrides={{ comments: commentsOverrides }}
			>
				<UserCommentsPage />
			</StackProvider>,
		);
	}

	it("shows the login prompt when no user is resolved", async () => {
		await renderUserComments();

		expect(
			container.querySelector('[data-testid="my-comments-login-prompt"]'),
		).toBeTruthy();
		expect(texts()).toContain("Please log in to view your comments");
		expect(hooks.useSuspenseComments).not.toHaveBeenCalled();
	});

	it("seeds the page from the URL into the query offset", async () => {
		const router = createMockRouter("page=2");

		await renderUserComments(
			{ getIdentity: () => ({ id: "user-1" }) },
			undefined,
			router,
		);

		expect(hooks.useSuspenseComments).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.objectContaining({ authorId: "user-1", offset: 20 }),
		);
	});

	it("uses the top-level auth identity", async () => {
		await renderUserComments({
			getIdentity: () => ({ id: "provider-user" }),
		});
		await act(async () => {});

		expect(hooks.useSuspenseComments).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.objectContaining({ authorId: "provider-user" }),
		);
		expect(
			container.querySelector('[data-testid="my-comments-login-prompt"]'),
		).toBeNull();
	});

	it("notifies success through the notify provider after deleting", async () => {
		const notify = { success: vi.fn(), error: vi.fn() };

		await renderUserComments({ getIdentity: () => ({ id: "user-1" }) }, notify);

		const deleteButton = container.querySelector<HTMLButtonElement>(
			'[data-testid="my-comment-delete-button"]',
		)!;
		await act(async () => {
			deleteButton.click();
		});

		// Confirm in the AlertDialog (rendered in a portal on document.body).
		const confirmButton = Array.from(
			document.querySelectorAll<HTMLButtonElement>("button"),
		)
			.filter((button) => button.textContent === "Delete")
			.at(-1);
		expect(confirmButton).toBeTruthy();
		await act(async () => {
			confirmButton!.click();
		});

		expect(
			hooks.useDeleteComment.mock.results[0]!.value.mutateAsync,
		).toHaveBeenCalledWith(comment.id);
		expect(notify.success).toHaveBeenCalledWith("Comment deleted");
		expect(notify.error).not.toHaveBeenCalled();
	});
});

describe("CommentThread provider wiring", () => {
	it("uses top-level API and auth", async () => {
		await render(
			<StackProvider
				basePath="/pages"
				api={{ baseURL: "http://provider.local", basePath: "/api/stack" }}
				auth={{
					getIdentity: () => ({ id: "provider-user" }),
					loginPath: "/sign-in",
				}}
			>
				<CommentThread resourceId="post-1" resourceType="blog-post" />
			</StackProvider>,
		);
		await act(async () => {});

		expect(hooks.useInfiniteComments).toHaveBeenLastCalledWith(
			{
				apiBaseURL: "http://provider.local",
				apiBasePath: "/api/stack",
			},
			expect.objectContaining({ currentUserId: "provider-user" }),
		);
		expect(
			container.querySelector('[data-testid="comment-form-wrapper"]'),
		).toBeTruthy();
	});

	it("waits for the provider identity before mounting the thread", async () => {
		let resolveIdentity: (identity: { id: string }) => void = () => {};
		const identity = new Promise<{ id: string }>((resolve) => {
			resolveIdentity = resolve;
		});

		await render(
			<StackProvider
				basePath="/pages"
				api={{ baseURL: "http://provider.local", basePath: "/api/stack" }}
				auth={{ getIdentity: () => identity }}
			>
				<CommentThread resourceId="post-1" resourceType="blog-post" />
			</StackProvider>,
		);

		expect(hooks.useInfiniteComments).not.toHaveBeenCalled();
		expect(container.querySelector('[data-testid="login-link"]')).toBeNull();

		await act(async () => {
			resolveIdentity({ id: "provider-user" });
			await identity;
		});

		expect(hooks.useInfiniteComments).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.objectContaining({ currentUserId: "provider-user" }),
		);
	});

	it("uses the top-level auth login path when unauthenticated", async () => {
		await render(
			<StackProvider
				basePath="/pages"
				api={{ baseURL: "http://provider.local", basePath: "/api/stack" }}
				auth={{ getIdentity: () => null, loginPath: "/sign-in" }}
			>
				<CommentThread resourceId="post-1" resourceType="blog-post" />
			</StackProvider>,
		);
		await act(async () => {});

		expect(
			container
				.querySelector<HTMLAnchorElement>('[data-testid="login-link"]')
				?.getAttribute("href"),
		).toBe("/sign-in");
	});
});

describe("CommentForm inline field errors (StackError)", () => {
	function renderForm(onSubmit: (body: string) => Promise<void>) {
		return render(
			<StackProvider
				basePath="/pages"
				router={createMockRouter()}
				overrides={{ comments: commentsOverrides }}
			>
				<CommentForm authorId="user-1" onSubmit={onSubmit} />
			</StackProvider>,
		);
	}

	async function submitComment(body: string) {
		const textarea = container.querySelector("textarea")!;
		await act(async () => {
			typeInto(textarea, body);
		});
		const form = container.querySelector('[data-testid="comment-form"]')!;
		await act(async () => {
			form.dispatchEvent(new Event("submit", { bubbles: true }));
		});
	}

	it("surfaces the server-side body field error inline", async () => {
		const stackError = Object.assign(new Error("Validation failed"), {
			errors: { body: ["Comment is too short"] },
		});
		await renderForm(vi.fn().mockRejectedValue(stackError));

		await submitComment("hi");

		const error = container.querySelector('[data-testid="comment-form-error"]');
		expect(error?.textContent).toBe("Comment is too short");
	});

	it("falls back to the error message when there is no field error", async () => {
		await renderForm(vi.fn().mockRejectedValue(new Error("Server exploded")));

		await submitComment("hello there");

		const error = container.querySelector('[data-testid="comment-form-error"]');
		expect(error?.textContent).toBe("Server exploded");
	});
});

describe("comments i18n precedence (useTranslate + localization prop)", () => {
	it("renders the English default without providers", async () => {
		await render(
			<StackProvider
				basePath="/pages"
				router={createMockRouter()}
				overrides={{ comments: commentsOverrides }}
			>
				<ModerationPage />
			</StackProvider>,
		);

		expect(texts()).toContain("Comment Moderation");
	});

	it("routes strings through the i18n provider when configured", async () => {
		const i18n: StackI18nProvider = {
			translate: (key, defaultValue) =>
				key === "comments.moderation.title"
					? "Kommentar-Moderation"
					: defaultValue,
		};

		await render(
			<StackProvider
				basePath="/pages"
				router={createMockRouter()}
				overrides={{ comments: commentsOverrides }}
				i18n={i18n}
			>
				<ModerationPage />
			</StackProvider>,
		);

		expect(texts()).toContain("Kommentar-Moderation");
	});

	it("lets the localization override win over the i18n provider", async () => {
		const translate = vi.fn(
			(key: string, _defaultValue: string) => `translated:${key}`,
		);

		await render(
			<StackProvider
				basePath="/pages"
				router={createMockRouter()}
				overrides={{ comments: commentsOverrides }}
				i18n={{ translate }}
			>
				<ModerationPage
					localization={{ COMMENTS_MODERATION_TITLE: "Custom title" }}
				/>
			</StackProvider>,
		);

		expect(texts()).toContain("Custom title");
		expect(texts()).not.toContain("translated:comments.moderation.title");
	});
});
