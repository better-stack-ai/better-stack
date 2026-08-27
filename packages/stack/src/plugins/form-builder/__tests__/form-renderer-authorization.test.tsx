// @vitest-environment jsdom
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { FormRenderer } from "../client/components/forms/form-renderer";
import { formBuilderPermissions } from "../permissions";

(
	globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const hooks = vi.hoisted(() => ({
	useFormBySlug: vi.fn(),
	useSubmitForm: vi.fn(),
}));

vi.mock("../client/hooks/form-builder-hooks", () => hooks);

vi.mock("@workspace/ui/components/auto-form/stepped-auto-form", () => ({
	SteppedAutoForm: ({
		onSubmit,
	}: {
		onSubmit: (data: Record<string, unknown>) => Promise<void>;
	}) => (
		<button type="button" onClick={() => onSubmit({ name: "Ada" })}>
			Submit public form
		</button>
	),
}));

const authorization = defineAuthorization({
	identity: z.object({ id: z.string(), role: z.string() }),
	permissions: [formBuilderPermissions] as const,
	rules: ({ forms }) => [
		forms.form.render.allow(),
		forms.submission.create.allow(),
	],
});

const auth = createClientAuth({
	authorization,
	getIdentity: () => null,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.clearAllMocks();
});

describe("FormRenderer authorization", () => {
	it("renders and submits on the cold browser path for a hydrated anonymous identity", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({
			id: "submission-1",
			formId: "form-1",
			data: JSON.stringify({ name: "Ada" }),
			submittedAt: "2026-01-02T00:00:00.000Z",
			form: { successMessage: "Received", redirectUrl: undefined },
		});
		hooks.useFormBySlug.mockReturnValue({
			form: {
				id: "form-1",
				name: "Contact",
				slug: "contact",
				schema: JSON.stringify({
					type: "object",
					properties: { name: { type: "string" } },
				}),
				status: "active",
				createdBy: "owner-1",
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
			isLoading: false,
			error: null,
		});
		hooks.useSubmitForm.mockReturnValue({ mutateAsync, isPending: false });

		await act(async () => {
			root.render(
				<StackProvider
					basePath="/pages"
					overrides={{ "form-builder": {} }}
					auth={auth}
					initialIdentity={null}
				>
					<FormRenderer slug="contact" />
				</StackProvider>,
			);
		});

		const submit = container.querySelector("button");
		expect(submit?.textContent).toBe("Submit public form");
		await act(async () => submit?.click());

		expect(mutateAsync).toHaveBeenCalledWith({ data: { name: "Ada" } });
		expect(container.textContent).toContain("Received");
	});

	it("does not treat a missing public rule as permission", async () => {
		const missingRuleAuthorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.string() }),
			permissions: [formBuilderPermissions] as const,
			rules: () => [],
		});
		const missingRuleAuth = createClientAuth({
			authorization: missingRuleAuthorization,
			getIdentity: () => null,
		});
		hooks.useFormBySlug.mockReturnValue({
			form: {
				id: "form-1",
				name: "Contact",
				slug: "contact",
				schema: JSON.stringify({ type: "object", properties: {} }),
				status: "active",
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
			isLoading: false,
			error: null,
		});
		hooks.useSubmitForm.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		});

		await act(async () => {
			root.render(
				<StackProvider
					basePath="/pages"
					overrides={{ "form-builder": {} }}
					auth={missingRuleAuth}
					initialIdentity={null}
				>
					<FormRenderer slug="contact" />
				</StackProvider>,
			);
		});

		expect(container.querySelector('[data-testid="form-renderer"]')).toBeNull();
	});
});
