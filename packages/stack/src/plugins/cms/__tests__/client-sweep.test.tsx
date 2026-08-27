// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormField } from "@workspace/ui/components/form";
// Core primitives MUST be imported from the package entry (not relative src
// paths) so they share module identity — and React context — with the cms
// components, which resolve `@btst/stack/*` via package self-reference.
import {
	StackProvider,
	type StackAuthProvider,
	type StackI18nProvider,
} from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { CMSFileUpload } from "../client/components/forms/file-upload";
import { ContentForm } from "../client/components/forms/content-form";
import { ContentListPage } from "../client/components/pages/content-list-page.internal";
import { ContentListPageComponent } from "../client/components/pages/content-list-page";
import { cmsPermissions } from "../permissions";
import type {
	SerializedContentItemWithType,
	SerializedContentType,
} from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom lacks these APIs used by Radix / cmdk
(globalThis as any).ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

const hooks = vi.hoisted(() => ({
	useContentTypes: vi.fn(),
	useSuspenseContentTypes: vi.fn(),
	useContent: vi.fn(),
	useSuspenseContent: vi.fn(),
	useDeleteContent: vi.fn(),
}));

vi.mock("../client/hooks", () => hooks);

const SIMPLE_JSON_SCHEMA = JSON.stringify({
	type: "object",
	properties: {
		title: { type: "string" },
	},
	required: ["title"],
	autoFormVersion: 2,
});

const contentType: SerializedContentType & { itemCount: number } = {
	id: "ct1",
	name: "Post",
	slug: "post",
	description: "",
	jsonSchema: SIMPLE_JSON_SCHEMA,
	autoFormVersion: 2,
	itemCount: 1,
	createdAt: new Date("2024-01-01").toISOString(),
	updatedAt: new Date("2024-01-01").toISOString(),
} as unknown as SerializedContentType & { itemCount: number };

const item: SerializedContentItemWithType = {
	id: "i1",
	slug: "hello-world",
	contentTypeId: "ct1",
	data: JSON.stringify({ title: "Hello" }),
	parsedData: { title: "Hello" },
	contentType: { id: "ct1", name: "Post", slug: "post" },
	createdAt: new Date("2024-01-01").toISOString(),
	updatedAt: new Date("2024-01-01").toISOString(),
	authorId: "user-1",
} as unknown as SerializedContentItemWithType;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);

	hooks.useSuspenseContentTypes.mockReturnValue({
		contentTypes: [contentType],
		refetch: vi.fn(),
	});
	hooks.useSuspenseContent.mockReturnValue({
		items: [item],
		total: 1,
		loadMore: vi.fn(),
		hasMore: false,
		isLoadingMore: false,
		refetch: vi.fn(),
	});
	hooks.useContent.mockReturnValue({
		items: [],
		total: 0,
		isLoading: false,
		error: null,
		loadMore: vi.fn(),
		hasMore: false,
		isLoadingMore: false,
		refetch: vi.fn(),
	});
	hooks.useDeleteContent.mockReturnValue({
		mutateAsync: vi.fn().mockResolvedValue({ success: true }),
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

function texts(): string {
	return container.textContent ?? "";
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

const cmsOverrides = {};

// Renders CMSFileUpload the way ContentForm does: inside a react-hook-form
// FormField so the shadcn form primitives have their context.
function FileUploadHarness({
	uploadImage,
}: {
	uploadImage: (file: File) => Promise<string>;
}) {
	const form = useForm<{ image: string }>({ defaultValues: { image: "" } });
	return (
		<Form {...form}>
			<form>
				<FormField
					control={form.control}
					name="image"
					render={({ field }) => (
						<CMSFileUpload
							field={field as any}
							fieldConfigItem={{} as any}
							label="Image"
							isRequired={false}
							fieldProps={{}}
							zodItem={null as any}
							zodInputProps={{}}
							uploadImage={uploadImage}
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

describe("CMSFileUpload notifications (useNotify)", () => {
	it("notifies a single error when the upload fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const notify = { success: vi.fn(), error: vi.fn() };
		const uploadImage = vi.fn().mockRejectedValue(new Error("boom"));

		await render(
			<StackProvider
				basePath="/pages"
				notify={notify}
				overrides={{ cms: cmsOverrides }}
			>
				<FileUploadHarness uploadImage={uploadImage} />
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
				overrides={{ cms: cmsOverrides }}
			>
				<FileUploadHarness uploadImage={uploadImage} />
			</StackProvider>,
		);

		await selectFile(new File(["x"], "a.txt", { type: "text/plain" }));

		expect(uploadImage).not.toHaveBeenCalled();
		expect(notify.error).toHaveBeenCalledWith("Please select an image file");
	});
});

describe("ContentForm inline errors", () => {
	it("shows a non-field error message above the form", async () => {
		await render(
			<StackProvider basePath="/pages" overrides={{ cms: cmsOverrides }}>
				<ContentForm
					contentType={contentType}
					onSubmit={async () => {}}
					errorMessage="An item with this slug already exists"
				/>
			</StackProvider>,
		);

		expect(texts()).toContain("An item with this slug already exists");
	});

	it("lists server field errors in the banner when no form instance was captured", async () => {
		await render(
			<StackProvider basePath="/pages" overrides={{ cms: cmsOverrides }}>
				<ContentForm
					contentType={contentType}
					onSubmit={async () => {}}
					fieldErrors={{ title: "Title is too short" }}
				/>
			</StackProvider>,
		);

		expect(texts()).toContain("title: Title is too short");
	});
});

describe("ContentListPage row actions (CanAccess)", () => {
	function renderListPage(
		auth?: StackAuthProvider,
		router = createMockRouter(),
	) {
		return render(
			<StackProvider
				basePath="/pages"
				router={router}
				overrides={{ cms: cmsOverrides }}
				auth={auth}
			>
				<ContentListPage typeSlug="post" />
			</StackProvider>,
		);
	}

	it("shows edit and delete buttons without an auth provider", async () => {
		await renderListPage();

		const actionButtons = container.querySelectorAll("table tbody tr button");
		expect(actionButtons).toHaveLength(2);
		expect(texts()).toContain("New Item");
	});

	it("hides the delete button when can() denies cms:content/delete", async () => {
		const can = vi.fn(
			({ resource, action }: { resource: string; action: string }) =>
				!(resource === "cms:content" && action === "delete"),
		);
		const auth: StackAuthProvider = {
			getIdentity: () => ({ id: "user-1" }),
			can,
		};

		await renderListPage(auth);

		const actionButtons = container.querySelectorAll("table tbody tr button");
		expect(actionButtons).toHaveLength(1);
		expect(can).toHaveBeenCalledWith(
			expect.objectContaining({
				resource: "cms:content",
				action: "delete",
				params: { typeSlug: "post", id: item.id },
			}),
		);
	});

	it("hides the New Item button when can() denies cms:content/create", async () => {
		const auth: StackAuthProvider = {
			getIdentity: () => ({ id: "user-1" }),
			can: ({ resource, action }) =>
				!(resource === "cms:content" && action === "create"),
		};

		await renderListPage(auth);

		expect(texts()).not.toContain("New Item");
		// The list itself still renders
		expect(texts()).toContain("hello-world");
	});

	it("uses the CMS catalog for route read and record write controls", async () => {
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.literal("user") }),
			permissions: [cmsPermissions] as const,
			rules: ({ cms }) => [
				cms.record.read.allow(),
				cms.record.create.when(({ facts }) => facts.contentType === "post"),
				cms.record.update.when(
					({ identity, facts }) =>
						facts.contentType === "post" &&
						facts.recordId === item.id &&
						facts.authorId === identity?.id,
				),
				cms.record.delete.when(() => false),
			],
		});
		const identity = { id: "user-1", role: "user" as const };
		const auth = createClientAuth({
			authorization,
			getIdentity: () => identity,
		});

		await render(
			<StackProvider
				basePath="/pages"
				router={createMockRouter()}
				overrides={{ cms: cmsOverrides }}
				auth={auth}
				initialIdentity={identity}
			>
				<ContentListPageComponent typeSlug="post" />
			</StackProvider>,
		);

		expect(texts()).toContain("New Item");
		expect(container.querySelectorAll("table tbody tr button")).toHaveLength(1);
		expect(
			authorization.can(
				cmsPermissions.record.delete({
					contentType: "post",
					recordId: item.id,
					authorId: item.authorId,
				}),
				identity,
			),
		).toBe(false);
	});

	it("notifies success through the notify provider after deleting", async () => {
		const notify = { success: vi.fn(), error: vi.fn() };
		const router = createMockRouter();

		await render(
			<StackProvider
				basePath="/pages"
				router={router}
				notify={notify}
				overrides={{ cms: cmsOverrides }}
			>
				<ContentListPage typeSlug="post" />
			</StackProvider>,
		);

		const actionButtons = container.querySelectorAll<HTMLButtonElement>(
			"table tbody tr button",
		);
		const deleteButton = actionButtons[actionButtons.length - 1]!;
		await act(async () => {
			deleteButton.click();
		});

		expect(
			hooks.useDeleteContent.mock.results[0]!.value.mutateAsync,
		).toHaveBeenCalledWith(item.id);
		expect(notify.success).toHaveBeenCalledWith("Item deleted successfully");
		expect(notify.error).not.toHaveBeenCalled();
	});
});

describe("ContentListPage search (useListState)", () => {
	it("seeds the search from an initial ?q= URL param", async () => {
		const router = createMockRouter("q=hello");

		await render(
			<StackProvider
				basePath="/pages"
				router={router}
				overrides={{ cms: cmsOverrides }}
			>
				<ContentListPage typeSlug="post" />
			</StackProvider>,
		);

		const input = container.querySelector(
			'[data-testid="cms-list-search"]',
		) as HTMLInputElement;
		expect(input.value).toBe("hello");
		expect(hooks.useContent).toHaveBeenLastCalledWith(
			"post",
			expect.objectContaining({ search: "hello", enabled: true }),
		);
		// Nothing is written back for a read-only render
		expect(router.setSearchParams).not.toHaveBeenCalled();
	});

	it("writes typed queries to the URL with replace history after the debounce", async () => {
		const router = createMockRouter();

		await render(
			<StackProvider
				basePath="/pages"
				router={router}
				overrides={{ cms: cmsOverrides }}
			>
				<ContentListPage typeSlug="post" />
			</StackProvider>,
		);

		const input = container.querySelector(
			'[data-testid="cms-list-search"]',
		) as HTMLInputElement;
		expect(input).toBeTruthy();
		const setValue = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)!.set!;
		await act(async () => {
			setValue.call(input, "rust");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});

		// Not written before the debounce elapses
		expect(router.setSearchParams).not.toHaveBeenCalled();

		// Wait out the debounce, then the microtask URL flush
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 400));
		});

		expect(router.setSearchParams).toHaveBeenCalled();
		const [written, opts] = router.setSearchParams.mock.calls.at(-1)!;
		expect(written.get("q")).toBe("rust");
		expect(opts).toEqual({ replace: true });
		expect(hooks.useContent).toHaveBeenLastCalledWith(
			"post",
			expect.objectContaining({ search: "rust", enabled: true }),
		);
	});

	it("re-seeds the input from external URL changes instead of clobbering them", async () => {
		const router = createMockRouter();

		await render(
			<StackProvider
				basePath="/pages"
				router={router}
				overrides={{ cms: cmsOverrides }}
			>
				<ContentListPage typeSlug="post" />
			</StackProvider>,
		);

		const input = container.querySelector(
			'[data-testid="cms-list-search"]',
		) as HTMLInputElement;
		expect(input.value).toBe("");

		// Simulate back/forward: `?q=ext` appears without this component
		// writing it (popstate is how useListState observes such changes)
		await act(async () => {
			router.setSearchParams(new URLSearchParams("q=ext"));
			window.dispatchEvent(new PopStateEvent("popstate"));
		});
		router.setSearchParams.mockClear();

		expect(input.value).toBe("ext");
		expect(hooks.useContent).toHaveBeenLastCalledWith(
			"post",
			expect.objectContaining({ search: "ext", enabled: true }),
		);

		// Wait out the debounce window: the stale (empty) input must not be
		// written back over the externally-set query
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 400));
		});
		expect(router.setSearchParams).not.toHaveBeenCalled();
	});
});

describe("cms i18n precedence (useTranslate + overrides.localization)", () => {
	it("renders the English default without providers", async () => {
		hooks.useSuspenseContent.mockReturnValue({
			items: [],
			total: 0,
			loadMore: vi.fn(),
			hasMore: false,
			isLoadingMore: false,
			refetch: vi.fn(),
		});

		await render(
			<StackProvider
				basePath="/pages"
				router={createMockRouter()}
				overrides={{ cms: cmsOverrides }}
			>
				<ContentListPage typeSlug="post" />
			</StackProvider>,
		);

		expect(texts()).toContain("No items yet");
	});

	it("routes strings through the i18n provider when configured", async () => {
		hooks.useSuspenseContent.mockReturnValue({
			items: [],
			total: 0,
			loadMore: vi.fn(),
			hasMore: false,
			isLoadingMore: false,
			refetch: vi.fn(),
		});
		const i18n: StackI18nProvider = {
			translate: (key, defaultValue) =>
				key === "cms.list.empty" ? "Noch keine Einträge" : defaultValue,
		};

		await render(
			<StackProvider
				basePath="/pages"
				router={createMockRouter()}
				overrides={{ cms: cmsOverrides }}
				i18n={i18n}
			>
				<ContentListPage typeSlug="post" />
			</StackProvider>,
		);

		expect(texts()).toContain("Noch keine Einträge");
	});

	it("lets overrides.localization win over the i18n provider", async () => {
		hooks.useSuspenseContent.mockReturnValue({
			items: [],
			total: 0,
			loadMore: vi.fn(),
			hasMore: false,
			isLoadingMore: false,
			refetch: vi.fn(),
		});
		const translate = vi.fn(
			(key: string, _defaultValue: string) => `translated:${key}`,
		);

		await render(
			<StackProvider
				basePath="/pages"
				router={createMockRouter()}
				overrides={{
					cms: {
						...cmsOverrides,
						localization: { CMS_LIST_EMPTY: "Custom empty state" },
					},
				}}
				i18n={{ translate }}
			>
				<ContentListPage typeSlug="post" />
			</StackProvider>,
		);

		expect(texts()).toContain("Custom empty state");
		// The description (a different key) still goes through translate; the
		// overridden title key must not.
		expect(texts()).not.toMatch(/translated:cms\.list\.empty(?!Description)/);
	});
});
