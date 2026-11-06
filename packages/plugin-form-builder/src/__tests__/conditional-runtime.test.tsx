// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AutoForm from "@workspace/ui/components/auto-form";
import { SteppedAutoForm } from "@workspace/ui/components/auto-form/stepped-auto-form";
import { formSchemaToZod } from "@workspace/ui/lib/schema-converter";
import { buildFieldConfigFromJsonSchema } from "@workspace/ui/components/auto-form/helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("conditional form browser runtime", () => {
	let container: HTMLDivElement;
	let root: Root;
	beforeEach(() => {
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				unobserve() {}
				disconnect() {}
			},
		);
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});
	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});

	it("skips hidden steps and submits without their required fields", async () => {
		const schema = {
			type: "object",
			properties: {
				enabled: { type: "boolean", default: false, label: "Include details" },
				details: { type: "string", stepGroup: 1, label: "Details" },
			},
			required: ["enabled", "details"],
			steps: [
				{ id: "intro", title: "Introduction" },
				{
					id: "details",
					title: "Details step",
					showIf: { field: "enabled", operator: "isTruthy" as const },
				},
			],
		};
		const submit = vi.fn();
		await act(async () =>
			root.render(
				<SteppedAutoForm
					formSchema={formSchemaToZod(schema)}
					fieldConfig={buildFieldConfigFromJsonSchema(schema)}
					onSubmit={submit}
				/>,
			),
		);
		expect(container.textContent).not.toContain("Details step");
		expect(container.querySelector('button[type="submit"]')?.textContent).toBe(
			"Submit",
		);
		await act(async () =>
			container
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		expect(submit.mock.calls[0]?.[0]).toEqual({ enabled: false });
	});

	it("uses default source answers when deciding which steps are visible", async () => {
		const schema = {
			type: "object",
			properties: {
				enabled: { type: "boolean", default: true },
				note: { type: "string", stepGroup: 1 },
			},
			steps: [
				{ id: "first", title: "First" },
				{
					id: "second",
					title: "Second",
					showIf: { field: "enabled", operator: "isTruthy" as const },
				},
			],
		};
		await act(async () =>
			root.render(
				<SteppedAutoForm
					formSchema={formSchemaToZod(schema)}
					fieldConfig={buildFieldConfigFromJsonSchema(schema)}
				/>,
			),
		);
		expect(container.textContent).toContain("Second");
		expect(container.querySelector('button[type="submit"]')?.textContent).toBe(
			"Next",
		);
	});

	it("shows and hides conditional fields while retaining required validation for visible fields", async () => {
		const schema = {
			type: "object",
			properties: {
				enabled: { type: "boolean", default: false, label: "Enable details" },
				details: {
					type: "string",
					label: "Details",
					showIf: { field: "enabled", operator: "isTruthy" as const },
				},
			},
			required: ["enabled", "details"],
		};
		const submit = vi.fn();
		await act(async () =>
			root.render(
				<SteppedAutoForm
					formSchema={formSchemaToZod(schema)}
					fieldConfig={buildFieldConfigFromJsonSchema(schema)}
					onSubmit={submit}
				/>,
			),
		);
		expect(container.querySelector('input[name="details"]')).toBeNull();
		await act(async () =>
			(
				container.querySelector('[role="checkbox"]') as HTMLButtonElement
			).click(),
		);
		expect(container.querySelector('input[name="details"]')).not.toBeNull();
		await act(async () =>
			container
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		expect(submit).not.toHaveBeenCalled();
		await act(async () =>
			(
				container.querySelector('[role="checkbox"]') as HTMLButtonElement
			).click(),
		);
		await act(async () =>
			container
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		expect(submit.mock.calls[0]?.[0]).toEqual({ enabled: false });
	});

	it("uploads a File without Media, blocks submission during upload and stores only the callback URL", async () => {
		const schema = {
			type: "object",
			properties: {
				attachment: {
					type: "string",
					minLength: 1,
					fieldType: "file",
					label: "Attachment",
				},
			},
			required: ["attachment"],
		};
		let finishUpload!: (url: string) => void;
		const onUpload = vi.fn(
			() =>
				new Promise<string>((resolve) => {
					finishUpload = resolve;
				}),
		);
		const submit = vi.fn();
		const config = buildFieldConfigFromJsonSchema(schema);
		config.attachment!.onUpload = onUpload;
		await act(async () =>
			root.render(
				<AutoForm
					formSchema={formSchemaToZod(schema)}
					fieldConfig={config}
					onSubmit={submit}
				>
					<button type="submit">Send</button>
				</AutoForm>,
			),
		);
		const file = new File(["actual file contents"], "sample.txt", {
			type: "text/plain",
		});
		const input = container.querySelector('input[type="file"]')!;
		Object.defineProperty(input, "files", {
			value: [file],
			configurable: true,
		});
		await act(async () =>
			input.dispatchEvent(new Event("change", { bubbles: true })),
		);
		expect(onUpload).toHaveBeenCalledWith(file);
		expect(container.querySelector("fieldset")?.disabled).toBe(true);
		await act(async () =>
			container
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		expect(submit).not.toHaveBeenCalled();
		await act(async () => finishUpload("/uploads/sample.txt"));
		await act(async () =>
			container
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		expect(submit.mock.calls[0]?.[0]).toEqual({
			attachment: "/uploads/sample.txt",
		});
	});

	it("surfaces upload failure and permits a successful retry", async () => {
		const schema = {
			type: "object",
			properties: { attachment: { type: "string", fieldType: "file" } },
		};
		const config = buildFieldConfigFromJsonSchema(schema);
		config.attachment!.onUpload = vi
			.fn()
			.mockRejectedValueOnce(new Error("Storage offline"))
			.mockResolvedValueOnce("https://files.example.test/resume.pdf");
		const submit = vi.fn();
		await act(async () =>
			root.render(
				<AutoForm
					formSchema={formSchemaToZod(schema)}
					fieldConfig={config}
					onSubmit={submit}
				>
					<button type="submit">Send</button>
				</AutoForm>,
			),
		);
		const input = container.querySelector('input[type="file"]')!;
		Object.defineProperty(input, "files", {
			value: [new File(["file"], "resume.pdf")],
		});
		await act(async () =>
			input.dispatchEvent(new Event("change", { bubbles: true })),
		);
		expect(container.textContent).toContain("Storage offline");
		await act(async () =>
			container
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		expect(submit).not.toHaveBeenCalled();
		await act(async () =>
			input.dispatchEvent(new Event("change", { bubbles: true })),
		);
		await act(async () =>
			container
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		expect(submit.mock.calls[0]?.[0]).toEqual({
			attachment: "https://files.example.test/resume.pdf",
		});
	});
});
