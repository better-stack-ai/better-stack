// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { FormPreview } from "@workspace/ui/components/form-builder/form-preview";
import { formSchemaToZod } from "@workspace/ui/lib/schema-converter";
import { FormBuilderPage } from "../client/components/pages/form-builder-page.internal";
const state = vi.hoisted(() => ({
	context: null as any,
	submit: vi.fn(),
	schema: undefined as any,
}));
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
			schema: JSON.stringify(
				state.schema ?? {
					type: "object",
					properties: {
						manual: { type: "string", label: "Keep me" },
						enabled: { type: "boolean" },
					},
				},
			),
		},
	}),
	useFormBuilderForm: () => ({ submit: state.submit, fieldErrors: {} }),
}));
vi.mock("@workspace/ui/components/form-builder", () => ({
	FormBuilder: ({ value }: any) => (
		<>
			<output data-testid="canvas">{JSON.stringify(value)}</output>
			<FormPreview schema={value} />
		</>
	),
}));
vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement("div");
document.body.append(host);
const root = createRoot(host);
afterEach(async () => {
	await act(async () => root.render(null));
	state.schema = undefined;
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

it.each(["property", "root map"])(
	"rejects orphaned %s assignments and keeps the real preview fillable",
	async (representation) => {
		const original = {
			type: "object",
			properties: {
				enabled: { type: "boolean" },
				manual: {
					type: "string",
					label: "Keep me",
					...(representation === "property" ? { stepGroup: 1 } : {}),
				},
				details: {
					type: "string",
					showIf: { field: "enabled", operator: "isTruthy" },
				},
			},
			required: ["manual"],
			steps: [
				{ id: "first", title: "First" },
				{ id: "second", title: "Second" },
			],
			...(representation === "root map"
				? { stepGroupMap: { enabled: 0, manual: 1, details: 0 } }
				: {}),
		};
		state.schema = original;
		await act(async () => root.render(<FormBuilderPage id="f1" />));
		const before = host.querySelector("output")!.textContent;
		for (const patch of [
			{ properties: { manual: { type: "string", stepGroup: 2 } } },
			{ properties: { manual: { type: "string", stepGroup: 99 } } },
			{ properties: {}, stepGroupMap: { manual: 2 } },
			{ properties: {}, stepGroupMap: { missing: 0 } },
			{ properties: {}, steps: [original.steps[0]] },
		]) {
			await act(async () =>
				expect(
					await state.context.clientTools.updateFormSchema({
						schema: JSON.stringify({ type: "object", ...patch }),
					}),
				).toMatchObject({ success: false }),
			);
			expect(host.querySelector("output")!.textContent).toBe(before);
		}
		expect(host.querySelector('input[name="manual"]')).toBeNull();
		await act(async () =>
			host
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		expect(host.querySelector('input[name="manual"]')).not.toBeNull();
		const patch =
			representation === "property"
				? { properties: { manual: { type: "string", stepGroup: 0 } } }
				: {
						properties: {},
						stepGroupMap: { enabled: 0, manual: 0, details: 0 },
					};
		await act(async () =>
			expect(
				await state.context.clientTools.updateFormSchema({
					schema: JSON.stringify({ type: "object", ...patch }),
				}),
			).toMatchObject({ success: true }),
		);
		expect(host.querySelector('input[name="manual"]')).not.toBeNull();
		const final = JSON.parse(host.querySelector("output")!.textContent!);
		expect(final.required).toEqual(["manual"]);
		expect(final.properties.details.showIf).toEqual(
			original.properties.details.showIf,
		);
		expect(formSchemaToZod(final).safeParse({}).success).toBe(false);
		expect(
			formSchemaToZod(final).safeParse({ manual: "A retained answer" }).success,
		).toBe(true);
		expect(state.submit).not.toHaveBeenCalled();
	},
);
