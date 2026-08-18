// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Core primitives MUST be imported from the package entry (not relative src
// paths) so they share module identity — and React context — with the
// form-builder components, which resolve `@btst/stack/*` via package
// self-reference.
import {
	StackProvider,
	type StackAuthProvider,
	type StackI18nProvider,
} from "@btst/stack/context";
import { FormListPage } from "../client/components/pages/form-list-page.internal";
import { SubmissionsPage } from "../client/components/pages/submissions-page.internal";
import { FormBuilderPage } from "../client/components/pages/form-builder-page.internal";
import type {
	SerializedForm,
	SerializedFormSubmissionWithData,
} from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom lacks these APIs used by Radix
(globalThis as any).ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

const hooks = vi.hoisted(() => ({
	useForms: vi.fn(),
	useSuspenseForms: vi.fn(),
	useDeleteForm: vi.fn(),
	useSuspenseFormById: vi.fn(),
	useSuspenseSubmissions: vi.fn(),
	useDeleteSubmission: vi.fn(),
	useFormBuilderForm: vi.fn(),
}));

vi.mock("../client/hooks", () => hooks);

// The form-builder canvas is drag-and-drop heavy and irrelevant to these
// tests — stub it out.
vi.mock("@workspace/ui/components/form-builder", () => ({
	FormBuilder: () => <div data-testid="form-builder-canvas" />,
}));

const form: SerializedForm = {
	id: "f1",
	name: "Contact Form",
	slug: "contact-form",
	description: null,
	schema: JSON.stringify({ type: "object", properties: {} }),
	successMessage: null,
	redirectUrl: null,
	status: "active",
	createdBy: null,
	createdAt: new Date("2024-01-01").toISOString(),
	updatedAt: new Date("2024-01-01").toISOString(),
} as unknown as SerializedForm;

const submission: SerializedFormSubmissionWithData = {
	id: "sub-11111111",
	formId: "f1",
	data: JSON.stringify({ name: "Alice" }),
	parsedData: { name: "Alice" },
	submittedAt: new Date("2024-01-02").toISOString(),
	ipAddress: null,
	userAgent: null,
} as unknown as SerializedFormSubmissionWithData;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);

	hooks.useSuspenseForms.mockReturnValue({
		forms: [form],
		total: 1,
		loadMore: vi.fn(),
		hasMore: false,
		isLoadingMore: false,
		refetch: vi.fn(),
	});
	hooks.useForms.mockReturnValue({
		forms: [],
		total: 0,
		isLoading: false,
		error: null,
		loadMore: vi.fn(),
		hasMore: false,
		isLoadingMore: false,
		refetch: vi.fn(),
	});
	hooks.useDeleteForm.mockReturnValue({
		mutateAsync: vi.fn().mockResolvedValue({ success: true }),
		isPending: false,
	});
	hooks.useSuspenseFormById.mockReturnValue({
		form,
		refetch: vi.fn(),
	});
	hooks.useSuspenseSubmissions.mockReturnValue({
		submissions: [submission],
		total: 1,
		loadMore: vi.fn(),
		hasMore: false,
		isLoadingMore: false,
		refetch: vi.fn(),
	});
	hooks.useDeleteSubmission.mockReturnValue({
		mutateAsync: vi.fn().mockResolvedValue({ success: true }),
		isPending: false,
	});
	hooks.useFormBuilderForm.mockReturnValue({
		action: "create",
		record: null,
		isLoadingRecord: false,
		recordError: null,
		defaultValues: undefined,
		submit: vi.fn().mockResolvedValue(form),
		isSubmitting: false,
		error: null,
		fieldErrors: {},
		clearErrors: vi.fn(),
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

const formBuilderOverrides = {
	navigate: vi.fn(),
	apiBaseURL: "http://test.local",
	apiBasePath: "/api/data",
};

function typeInto(input: HTMLInputElement, value: string) {
	const setValue = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)!.set!;
	setValue.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("FormListPage New Form button (CanAccess)", () => {
	function renderListPage(
		auth?: StackAuthProvider,
		router = createMockRouter(),
	) {
		return render(
			<StackProvider
				basePath="/pages"
				router={router}
				overrides={{ "form-builder": formBuilderOverrides }}
				auth={auth}
			>
				<FormListPage />
			</StackProvider>,
		);
	}

	it("shows the New Form button without an auth provider", async () => {
		await renderListPage();

		expect(texts()).toContain("New Form");
		expect(texts()).toContain("Contact Form");
	});

	it("hides the New Form button when can() denies form-builder:form/create", async () => {
		const can = vi.fn(
			({ resource, action }: { resource: string; action: string }) =>
				!(resource === "form-builder:form" && action === "create"),
		);
		const auth: StackAuthProvider = {
			getIdentity: () => ({ id: "user-1" }),
			can,
		};

		await renderListPage(auth);

		expect(texts()).not.toContain("New Form");
		// The list itself still renders
		expect(texts()).toContain("Contact Form");
	});
});

describe("FormListPage search (useListState)", () => {
	it("seeds the search from an initial ?q= URL param", async () => {
		const router = createMockRouter("q=hello");

		await render(
			<StackProvider
				basePath="/pages"
				router={router}
				overrides={{ "form-builder": formBuilderOverrides }}
			>
				<FormListPage />
			</StackProvider>,
		);

		const input = container.querySelector(
			'[data-testid="form-builder-list-search"]',
		) as HTMLInputElement;
		expect(input.value).toBe("hello");
		expect(hooks.useForms).toHaveBeenLastCalledWith(
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
				overrides={{ "form-builder": formBuilderOverrides }}
			>
				<FormListPage />
			</StackProvider>,
		);

		const input = container.querySelector(
			'[data-testid="form-builder-list-search"]',
		) as HTMLInputElement;
		expect(input).toBeTruthy();
		await act(async () => {
			typeInto(input, "survey");
		});

		// Not written before the debounce elapses
		expect(router.setSearchParams).not.toHaveBeenCalled();

		// Wait out the debounce, then the microtask URL flush
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 400));
		});

		expect(router.setSearchParams).toHaveBeenCalled();
		const [written, opts] = router.setSearchParams.mock.calls.at(-1)!;
		expect(written.get("q")).toBe("survey");
		expect(opts).toEqual({ replace: true });
		expect(hooks.useForms).toHaveBeenLastCalledWith(
			expect.objectContaining({ search: "survey", enabled: true }),
		);
	});

	it("re-seeds the input from external URL changes instead of clobbering them", async () => {
		const router = createMockRouter();

		await render(
			<StackProvider
				basePath="/pages"
				router={router}
				overrides={{ "form-builder": formBuilderOverrides }}
			>
				<FormListPage />
			</StackProvider>,
		);

		const input = container.querySelector(
			'[data-testid="form-builder-list-search"]',
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
		expect(hooks.useForms).toHaveBeenLastCalledWith(
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

describe("SubmissionsPage row actions (CanAccess + useNotify)", () => {
	function renderSubmissionsPage(
		auth?: StackAuthProvider,
		notify?: {
			success: ReturnType<typeof vi.fn>;
			error: ReturnType<typeof vi.fn>;
		},
	) {
		return render(
			<StackProvider
				basePath="/pages"
				router={createMockRouter()}
				notify={notify}
				overrides={{ "form-builder": formBuilderOverrides }}
				auth={auth}
			>
				<SubmissionsPage formId="f1" />
			</StackProvider>,
		);
	}

	it("shows view and delete buttons without an auth provider", async () => {
		await renderSubmissionsPage();

		const actionButtons = container.querySelectorAll("table tbody tr button");
		expect(actionButtons).toHaveLength(2);
	});

	it("hides the delete button when can() denies form-builder:submission/delete", async () => {
		const can = vi.fn(
			({ resource, action }: { resource: string; action: string }) =>
				!(resource === "form-builder:submission" && action === "delete"),
		);
		const auth: StackAuthProvider = {
			getIdentity: () => ({ id: "user-1" }),
			can,
		};

		await renderSubmissionsPage(auth);

		const actionButtons = container.querySelectorAll("table tbody tr button");
		expect(actionButtons).toHaveLength(1);
		expect(can).toHaveBeenCalledWith(
			expect.objectContaining({
				resource: "form-builder:submission",
				action: "delete",
				params: { formId: "f1", id: submission.id },
			}),
		);
	});

	it("notifies success through the notify provider after deleting", async () => {
		const notify = { success: vi.fn(), error: vi.fn() };

		await renderSubmissionsPage(undefined, notify);

		const actionButtons = container.querySelectorAll<HTMLButtonElement>(
			"table tbody tr button",
		);
		const deleteButton = actionButtons[actionButtons.length - 1]!;
		await act(async () => {
			deleteButton.click();
		});

		// Confirm in the AlertDialog (rendered in a portal on document.body).
		// The row's sr-only label is also "Delete", so take the last match —
		// the portal is appended after the page container.
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
			hooks.useDeleteSubmission.mock.results[0]!.value.mutateAsync,
		).toHaveBeenCalledWith(submission.id);
		expect(notify.success).toHaveBeenCalledWith(
			"Submission deleted successfully",
		);
		expect(notify.error).not.toHaveBeenCalled();
	});
});

describe("FormBuilderPage editor (resource useForm)", () => {
	function renderEditorPage(notify?: {
		success: ReturnType<typeof vi.fn>;
		error: ReturnType<typeof vi.fn>;
	}) {
		return render(
			<StackProvider
				basePath="/pages"
				router={createMockRouter()}
				notify={notify}
				overrides={{ "form-builder": formBuilderOverrides }}
			>
				<FormBuilderPage />
			</StackProvider>,
		);
	}

	it("notifies a validation error when saving without a name", async () => {
		const notify = { success: vi.fn(), error: vi.fn() };

		await renderEditorPage(notify);

		const saveButton = Array.from(
			container.querySelectorAll<HTMLButtonElement>("button"),
		).find((button) => button.textContent?.includes("Create"));
		expect(saveButton).toBeTruthy();
		await act(async () => {
			saveButton!.click();
		});

		expect(notify.error).toHaveBeenCalledWith("Name is required");
		const resourceForm = hooks.useFormBuilderForm.mock.results.at(-1)!.value;
		expect(resourceForm.submit).not.toHaveBeenCalled();
	});

	it("notifies when the schema has no fields yet", async () => {
		const notify = { success: vi.fn(), error: vi.fn() };

		await renderEditorPage(notify);

		const nameInput = container.querySelector(
			"input#form-name",
		) as HTMLInputElement;
		await act(async () => {
			typeInto(nameInput, "My Form");
		});

		const saveButton = Array.from(
			container.querySelectorAll<HTMLButtonElement>("button"),
		).find((button) => button.textContent?.includes("Create"));
		await act(async () => {
			saveButton!.click();
		});

		expect(notify.error).toHaveBeenCalledWith(
			"Please add at least one field to the form",
		);
	});

	it("renders server field errors inline under the inputs", async () => {
		hooks.useFormBuilderForm.mockReturnValue({
			action: "create",
			record: null,
			isLoadingRecord: false,
			recordError: null,
			defaultValues: undefined,
			submit: vi.fn(),
			isSubmitting: false,
			error: new Error("Validation failed"),
			fieldErrors: { slug: "Slug is invalid" },
			clearErrors: vi.fn(),
		});

		await renderEditorPage();

		expect(texts()).toContain("Slug is invalid");
	});
});

describe("form-builder i18n precedence (useTranslate + overrides.localization)", () => {
	beforeEach(() => {
		hooks.useSuspenseForms.mockReturnValue({
			forms: [],
			total: 0,
			loadMore: vi.fn(),
			hasMore: false,
			isLoadingMore: false,
			refetch: vi.fn(),
		});
	});

	it("renders the English default without providers", async () => {
		await render(
			<StackProvider
				basePath="/pages"
				router={createMockRouter()}
				overrides={{ "form-builder": formBuilderOverrides }}
			>
				<FormListPage />
			</StackProvider>,
		);

		expect(texts()).toContain("No forms yet");
	});

	it("routes strings through the i18n provider when configured", async () => {
		const i18n: StackI18nProvider = {
			translate: (key, defaultValue) =>
				key === "formBuilder.list.empty"
					? "Noch keine Formulare"
					: defaultValue,
		};

		await render(
			<StackProvider
				basePath="/pages"
				router={createMockRouter()}
				overrides={{ "form-builder": formBuilderOverrides }}
				i18n={i18n}
			>
				<FormListPage />
			</StackProvider>,
		);

		expect(texts()).toContain("Noch keine Formulare");
	});

	it("lets overrides.localization win over the i18n provider", async () => {
		const translate = vi.fn(
			(key: string, _defaultValue: string) => `translated:${key}`,
		);

		await render(
			<StackProvider
				basePath="/pages"
				router={createMockRouter()}
				overrides={{
					"form-builder": {
						...formBuilderOverrides,
						localization: { FORM_BUILDER_LIST_EMPTY: "Custom empty state" },
					},
				}}
				i18n={{ translate }}
			>
				<FormListPage />
			</StackProvider>,
		);

		expect(texts()).toContain("Custom empty state");
		expect(texts()).not.toMatch(
			/translated:formBuilder\.list\.empty(?!Description)/,
		);
	});
});
