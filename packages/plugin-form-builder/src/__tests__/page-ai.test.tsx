// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { FormBuilderPage } from "../client/components/pages/form-builder-page.internal";
const state = vi.hoisted(() => ({ context: null as any, submit: vi.fn() }));
vi.mock("@btst/stack/page-context", () => ({
	useRegisterPageAIContext: (context: unknown) => {
		state.context = context;
	},
}));
vi.mock("@btst/stack/context", async (original) => ({
	...(await original<any>()),
	useNotify: () => ({ error: vi.fn() }),
	useTranslate: () => (_: string, fallback: string) => fallback,
	usePluginOverrides: () => ({}),
	usePluginSiteNavigation: () => ({
		Link: (props: any) => <a {...props} />,
		resolve: () => ({ href: "/" }),
		navigate: vi.fn(),
	}),
}));
vi.mock("../client/hooks", () => ({
	useSuspenseFormForUpdate: () => ({
		form: {
			id: "f1",
			name: "My form",
			slug: "my-form",
			status: "active",
			schema: JSON.stringify({
				type: "object",
				properties: {
					manual: { type: "string", label: "Keep me" },
					enabled: { type: "boolean" },
				},
			}),
		},
	}),
	useFormBuilderForm: () => ({ submit: state.submit, fieldErrors: {} }),
}));
vi.mock("@workspace/ui/components/form-builder", () => ({
	FormBuilder: ({ value }: any) => (
		<output data-testid="canvas">{JSON.stringify(value)}</output>
	),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement("div");
document.body.append(host);
const root = createRoot(host);
afterEach(async () => {
	await act(async () => root.render(null));
});
it("updates the mounted visual canvas, preserves unrelated draft fields and does not save", async () => {
	await act(async () => root.render(<FormBuilderPage id="f1" />));
	await act(async () =>
		expect(
			await state.context.clientTools.updateFormSchema({
				schema: JSON.stringify({
					type: "object",
					properties: {
						detail: {
							type: "string",
							label: "AI field",
							showIf: { field: "enabled", operator: "isTruthy" },
						},
					},
				}),
			}),
		).toMatchObject({ success: true }),
	);
	const schema = JSON.parse(host.querySelector("output")!.textContent!);
	expect(schema.properties.manual.label).toBe("Keep me");
	expect(schema.properties.detail.showIf.operator).toBe("isTruthy");
	expect(state.submit).not.toHaveBeenCalled();
	await act(async () =>
		expect(
			await state.context.clientTools.updateFormSchema({ schema: "bad" }),
		).toMatchObject({ success: false }),
	);
	expect(host.querySelector("output")!.textContent).toContain("Keep me");
});
