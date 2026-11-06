// @vitest-environment jsdom
import { act, useState } from "react";
import { DndContext } from "@dnd-kit/core";
import { defaultComponents } from "@workspace/ui/components/form-builder/components/index";
import { Canvas } from "@workspace/ui/components/form-builder/canvas";
import {
	fieldsToJSONSchema,
	jsonSchemaToFieldsAndSteps,
} from "@workspace/ui/components/form-builder/schema-utils";
import type { JSONSchema } from "@workspace/ui/components/form-builder/types";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { FormPreview } from "@workspace/ui/components/form-builder/form-preview";
import { formSchemaToZod } from "@workspace/ui/lib/schema-converter";
import { nestedSchema, nestedPatch, nestedAddPatch } from "./ai-schema-fixture";
import { FormBuilderPage } from "../client/components/pages/form-builder-page.internal";
const state = vi.hoisted(() => ({
	context: null as any,
	submit: vi.fn(),
	schema: undefined as any,
	previewValues: undefined as Record<string, unknown> | undefined,
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
function DraftViews({ value }: { value: JSONSchema }) {
	const [step, setStep] = useState(0);
	const { fields, steps } = jsonSchemaToFieldsAndSteps(
		value,
		defaultComponents,
	);
	return (
		<>
			<output data-testid="canvas">{JSON.stringify(value)}</output>
			<DndContext>
				<Canvas
					fields={fields}
					components={defaultComponents}
					steps={steps}
					activeStepIndex={step}
					onActiveStepChange={setStep}
					onEditField={() => {}}
					onDeleteField={() => {}}
					onAddStep={() => {}}
					onDeleteStep={() => {}}
					onRenameStep={() => {}}
					isDraggingFromPalette={false}
				/>
			</DndContext>
			<FormPreview
				schema={fieldsToJSONSchema(fields, defaultComponents, steps)}
				defaultValues={state.previewValues}
			/>
		</>
	);
}
vi.mock("@workspace/ui/components/form-builder", () => ({
	FormBuilder: DraftViews,
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
	state.previewValues = undefined;
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
	expect(schema.steps).toBeUndefined();
	expect(schema.properties.manual.stepGroup).toBeUndefined();
	expect(host.querySelector('input[name="manual"]')).not.toBeNull();
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

it.each(["root map", "property"])(
	"keeps canvas and preview assignments consistent when patching a %s draft",
	async (representation) => {
		state.schema = {
			type: "object",
			properties: {
				a: { type: "string", label: "First field" },
				b: {
					type: "string",
					label: "Retained required",
					...(representation === "property" ? { stepGroup: 1 } : {}),
				},
			},
			required: ["b"],
			steps: [
				{ id: "first", title: "First" },
				{ id: "second", title: "Second" },
			],
			...(representation === "root map"
				? { stepGroupMap: { a: 0, b: 1 } }
				: {}),
		};
		await act(async () => root.render(<FormBuilderPage id="f1" />));
		const patch =
			representation === "root map"
				? {
						properties: { c: { type: "string", label: "New default field" } },
						stepGroupMap: { a: 0 },
					}
				: { properties: {}, stepGroupMap: { b: 0 } };
		await act(async () =>
			expect(
				await state.context.clientTools.updateFormSchema({
					schema: JSON.stringify({ type: "object", ...patch }),
				}),
			).toMatchObject({ success: true }),
		);
		const canvas = () =>
			host.querySelector('[data-testid="form-builder-canvas"]')!;
		if (representation === "root map") {
			expect(canvas().textContent).not.toContain("Retained required");
			expect(canvas().textContent).toContain("New default field");
			expect(host.querySelector('input[name="c"]')).not.toBeNull();
			await act(async () =>
				host
					.querySelector("form")!
					.dispatchEvent(
						new Event("submit", { bubbles: true, cancelable: true }),
					),
			);
			const second = [...host.querySelectorAll("button")].find(
				(button) => button.textContent?.trim() === "Second",
			)!;
			await act(async () => second.click());
		}
		expect(canvas().textContent).toContain("Retained required");
		expect(host.querySelector('input[name="b"]')).not.toBeNull();
		const before = host.querySelector("output")!.textContent;
		for (const patch of [
			{
				properties: { b: { type: "string", stepGroup: 1 } },
				stepGroupMap: { b: 0 },
			},
			{ properties: {}, stepGroupMap: { b: 99 } },
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
		const final = JSON.parse(host.querySelector("output")!.textContent!);
		expect(formSchemaToZod(final).safeParse({}).success).toBe(false);
		expect(
			formSchemaToZod(final).safeParse({ b: "A required answer" }).success,
		).toBe(true);
		expect(final.properties.a.label).toBe("First field");
		expect(state.submit).not.toHaveBeenCalled();
	},
);

it("keeps nested siblings visible and saves their complete schema only after explicit Save", async () => {
	state.submit.mockClear();
	state.schema = structuredClone(nestedSchema);
	state.previewValues = {
		address: { country: "CA", city: "Toronto" },
		members: [{ name: "Ada", active: true }],
	};
	await act(async () => root.render(<FormBuilderPage id="f1" />));
	await act(async () =>
		expect(
			await state.context.clientTools.updateFormSchema({
				schema: JSON.stringify(nestedAddPatch),
			}),
		).toMatchObject({ success: true }),
	);
	const added = JSON.parse(host.querySelector("output")!.textContent!);
	expect(added.properties.address.properties.city).toEqual(
		nestedSchema.properties.address.properties.city,
	);
	expect(added.properties.members.items.properties.name).toEqual(
		nestedSchema.properties.members.items.properties.name,
	);
	await act(async () =>
		expect(
			await state.context.clientTools.updateFormSchema({
				schema: JSON.stringify(nestedPatch),
			}),
		).toMatchObject({ success: true }),
	);
	for (const label of ["Address", "Members"]) {
		const trigger = [...host.querySelectorAll("button")].find(
			(button) => button.textContent?.trim() === label,
		)!;
		await act(async () => trigger.click());
	}
	for (const name of [
		"address.city",
		"address.postcode",
		"members.0.name",
		"members.0.phone",
		"members.0.active",
	])
		expect(host.querySelector(`[name="${name}"]`), name).not.toBeNull();
	const draft = JSON.parse(host.querySelector("output")!.textContent!);
	expect(draft.properties.address.required).toEqual(["city"]);
	expect(draft.properties.members.items.required).toEqual(["name"]);
	expect(state.submit).not.toHaveBeenCalled();
	const save = [...host.querySelectorAll("button")].find(
		(button) => button.textContent?.trim() === "Save",
	)!;
	await act(async () => save.click());
	expect(JSON.parse(state.submit.mock.calls[0]![0].schema)).toEqual(draft);
	expect(state.schema).toEqual(nestedSchema);
	state.submit.mockClear();
});
