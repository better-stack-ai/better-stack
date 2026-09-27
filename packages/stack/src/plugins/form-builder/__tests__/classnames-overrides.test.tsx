// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
// Core primitives MUST be imported from the package entry (not relative src
// paths) so they share module identity — and React context — with the
// form-builder components, which resolve `@btst/stack/*` via package
// self-reference.
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { FormRenderer } from "../client/components/forms/form-renderer";
import { FormListPage } from "../client/components/pages/form-list-page.internal";
import { SubmissionsPage } from "../client/components/pages/submissions-page.internal";
import { formBuilderClientPlugin } from "../client/plugin";
import { formBuilderPermissions } from "../permissions";
import type { SerializedForm } from "../types";
import { createTestClientStack } from "../../../__tests__/client-stack-test-utils";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom lacks these APIs used by Radix
(globalThis as any).ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

const listHooks = vi.hoisted(() => ({
	useForms: vi.fn(),
	useSuspenseForms: vi.fn(),
	useDeleteForm: vi.fn(),
	useSuspenseFormById: vi.fn(),
	useSuspenseFormForUpdate: vi.fn(),
	useSuspenseSubmissions: vi.fn(),
	useSubmission: vi.fn(),
	useDeleteSubmission: vi.fn(),
	useFormBuilderForm: vi.fn(),
}));
const rendererHooks = vi.hoisted(() => ({
	useFormBySlug: vi.fn(),
	useSubmitForm: vi.fn(),
}));

vi.mock("../client/hooks", () => listHooks);
vi.mock("../client/hooks/form-builder-hooks", () => rendererHooks);

// The auto-form internals are unrelated to class wiring — stub them.
vi.mock("@workspace/ui/components/auto-form/stepped-auto-form", () => ({
	SteppedAutoForm: () => <div data-testid="stepped-auto-form" />,
}));

const CLASS_NAMES = {
	container: "bg-red-100",
	table: "bg-yellow-50",
	tableRow: "text-green-600",
	pagination: "border-4 border-orange-500",
	form: "bg-blue-100",
} as const;

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

const authorization = defineAuthorization({
	identity: z.object({ id: z.string(), role: z.string() }),
	permissions: [formBuilderPermissions] as const,
	rules: ({ forms }) => [
		forms.form.render.allow(),
		forms.submission.create.allow(),
		forms.submission.read.allow(),
	],
});
const auth = createClientAuth({ authorization, getIdentity: () => null });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);

	listHooks.useSuspenseForms.mockReturnValue({
		forms: [form],
		total: 1,
		loadMore: vi.fn(),
		hasMore: false,
		isLoadingMore: false,
		refetch: vi.fn(),
	});
	listHooks.useForms.mockReturnValue({
		forms: [],
		total: 0,
		isLoading: false,
		error: null,
		loadMore: vi.fn(),
		hasMore: false,
		isLoadingMore: false,
		refetch: vi.fn(),
	});
	listHooks.useDeleteForm.mockReturnValue({
		mutateAsync: vi.fn(),
		isPending: false,
	});
	rendererHooks.useFormBySlug.mockReturnValue({
		form,
		isLoading: false,
		error: null,
	});
	rendererHooks.useSubmitForm.mockReturnValue({
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
});

function createMockRouter() {
	let params = new URLSearchParams();
	return {
		navigate: vi.fn(),
		getSearchParams: () => new URLSearchParams(params.toString()),
		setSearchParams: vi.fn((next: URLSearchParams) => {
			params = new URLSearchParams(next.toString());
		}),
	};
}

async function render(ui: React.ReactElement, withOverrides = true) {
	await act(async () => {
		root.render(
			<StackProvider
				stack={createTestClientStack({
					formBuilder: formBuilderClientPlugin(),
				})}
				router={createMockRouter()}
				auth={auth}
				initialIdentity={null}
				overrides={
					withOverrides ? { formBuilder: { classNames: CLASS_NAMES } } : {}
				}
			>
				{ui}
			</StackProvider>,
		);
	});
}

function query(selector: string): HTMLElement {
	const el = container.querySelector<HTMLElement>(selector);
	expect(el, `expected to find ${selector}`).toBeTruthy();
	return el!;
}

describe("form-builder classNames overrides (issue #36)", () => {
	it("applies container, table, tableRow and pagination on the forms list", async () => {
		await render(<FormListPage />);

		const page = query('[data-testid="form-list-page"]');
		expect(page.className).toContain(CLASS_NAMES.container);
		// The override must merge with the layout's own classes, not replace them.
		expect(page.className).toContain("mx-auto");

		const table = query('[data-testid="form-builder-list-table"]');
		expect(table.className).toContain(CLASS_NAMES.table);
		expect(table.className).toContain("rounded-lg");

		const row = table.querySelector<HTMLElement>("tbody tr")!;
		expect(row, "expected a body row").toBeTruthy();
		expect(row.className).toContain(CLASS_NAMES.tableRow);
		expect(row.textContent).toContain(form.name);

		const pagination = query('[data-testid="form-builder-pagination"]');
		expect(pagination.className).toContain("border-4");
		expect(pagination.className).toContain("border-orange-500");
		expect(pagination.className).toContain("justify-between");
	});

	it("applies table, tableRow and pagination on the submissions page", async () => {
		listHooks.useSuspenseSubmissions.mockReturnValue({
			form,
			submissions: [
				{
					id: "sub-11111111",
					formId: form.id,
					submittedAt: new Date("2024-01-02").toISOString(),
				},
			],
			total: 1,
			loadMore: vi.fn(),
			hasMore: false,
			isLoadingMore: false,
			refetch: vi.fn(),
		});
		listHooks.useSubmission.mockReturnValue({
			submission: null,
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		});
		listHooks.useDeleteSubmission.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		});

		await render(<SubmissionsPage formId={form.id} />);

		const table = query('[data-testid="form-builder-submissions-table"]');
		expect(table.className).toContain(CLASS_NAMES.table);
		expect(table.className).toContain("rounded-lg");

		const row = table.querySelector<HTMLElement>("tbody tr")!;
		expect(row, "expected a body row").toBeTruthy();
		expect(row.className).toContain(CLASS_NAMES.tableRow);

		const pagination = query('[data-testid="form-builder-pagination"]');
		expect(pagination.className).toContain("border-orange-500");
		expect(pagination.className).toContain("justify-between");
	});

	it("applies classNames.form to the rendered public form", async () => {
		await render(<FormRenderer slug={form.slug} />);

		const root = query('[data-testid="form-renderer"]');
		expect(root.className).toContain(CLASS_NAMES.form);
		// The real auto-form is stubbed, but it must still be mounted inside the slot.
		expect(
			root.querySelector('[data-testid="stepped-auto-form"]'),
		).toBeTruthy();
	});

	it("leaves base classes untouched when no classNames override is supplied", async () => {
		await render(<FormListPage />, false);

		const table = query('[data-testid="form-builder-list-table"]');
		expect(table.className).toContain("rounded-lg");
		expect(table.className).not.toContain(CLASS_NAMES.table);
	});
});
