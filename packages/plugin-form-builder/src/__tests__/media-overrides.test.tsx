// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { FormBuilderPluginOverrides } from "../client/overrides";

const fixture = vi.hoisted(() => ({
	overrides: {} as FormBuilderPluginOverrides,
	submit: vi.fn(),
}));
vi.mock("@btst/stack/context", () => ({
	usePluginOverrides: () => fixture.overrides,
	useTranslate: () => (_key: string, fallback: string) => fallback,
	PermissionAccess: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../client/hooks/form-builder-hooks", () => ({
	useFormBySlug: () => ({
		form: {
			id: "form-1",
			slug: "files",
			status: "active",
			schema: JSON.stringify({
				type: "object",
				properties: {
					attachment: {
						type: "string",
						fieldType: "file",
						minLength: 1,
						label: "Attachment",
					},
				},
				required: ["attachment"],
			}),
		},
		isLoading: false,
	}),
	useSubmitForm: () => ({ mutateAsync: fixture.submit, isPending: false }),
}));
import { FormRenderer } from "../client/components/forms/form-renderer";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("FormRenderer optional media overrides", () => {
	let container: HTMLDivElement;
	let root: Root;
	beforeEach(() => {
		fixture.overrides = {};
		fixture.submit
			.mockReset()
			.mockResolvedValue({ id: "submission-1", form: {} });
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});
	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
	});
	const submit = async () =>
		act(async () => {
			container
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				);
		});
	it.each(["uploadFile", "onUpload"] as const)(
		"uploads without Media through %s",
		async (name) => {
			const upload = vi
				.fn()
				.mockResolvedValue("https://files.example.test/document.pdf");
			fixture.overrides = { [name]: upload };
			await act(async () => root.render(<FormRenderer slug="files" />));
			const file = new File(["document"], "document.pdf", {
				type: "application/pdf",
			});
			const input =
				container.querySelector<HTMLInputElement>('input[type="file"]')!;
			Object.defineProperty(input, "files", { value: [file] });
			await act(async () =>
				input.dispatchEvent(new Event("change", { bubbles: true })),
			);
			await submit();
			expect(upload).toHaveBeenCalledWith(file);
			expect(fixture.submit).toHaveBeenCalledWith({
				data: { attachment: "https://files.example.test/document.pdf" },
			});
		},
	);
	it("preserves the per-renderer upload callback over provider aliases", async () => {
		const provider = vi.fn();
		const upload = vi.fn().mockResolvedValue("/uploads/own.pdf");
		fixture.overrides = {
			uploadFile: provider,
			onUpload: provider,
			imagePicker: () => <button type="button">Provider picker</button>,
			imageInputField: () => <button type="button">Provider input</button>,
		};
		await act(async () =>
			root.render(<FormRenderer slug="files" onUpload={upload} />),
		);
		const input =
			container.querySelector<HTMLInputElement>('input[type="file"]')!;
		expect(input).not.toBeNull();
		Object.defineProperty(input, "files", {
			value: [new File(["document"], "own.pdf")],
		});
		await act(async () =>
			input.dispatchEvent(new Event("change", { bubbles: true })),
		);
		await submit();
		expect(provider).not.toHaveBeenCalled();
		expect(fixture.submit).toHaveBeenCalledWith({
			data: { attachment: "/uploads/own.pdf" },
		});
	});
	it.each(["imagePicker", "imageInputField"] as const)(
		"selects a file URL via %s while enforcing required validation",
		async (name) => {
			fixture.overrides =
				name === "imagePicker"
					? {
							imagePicker: ({ onSelect }) => (
								<button
									type="button"
									onClick={() =>
										onSelect("https://files.example.test/selected.pdf")
									}
								>
									Choose file
								</button>
							),
						}
					: {
							imageInputField: ({ onChange }) => (
								<button
									type="button"
									onClick={() =>
										onChange("https://files.example.test/selected.pdf")
									}
								>
									Choose file
								</button>
							),
						};
			await act(async () => root.render(<FormRenderer slug="files" />));
			expect(container.querySelector('input[type="file"]')).toBeNull();
			await submit();
			expect(fixture.submit).not.toHaveBeenCalled();
			await act(async () =>
				Array.from(container.querySelectorAll("button"))
					.find((button) => button.textContent === "Choose file")!
					.click(),
			);
			await submit();
			expect(fixture.submit).toHaveBeenCalledWith({
				data: { attachment: "https://files.example.test/selected.pdf" },
			});
		},
	);
	it("keeps an explicit custom file component ahead of media overrides", async () => {
		const picker = vi.fn(() => <button type="button">Media picker</button>);
		fixture.overrides = { imagePicker: picker };
		await act(async () =>
			root.render(
				<FormRenderer
					slug="files"
					fieldComponents={{
						file: ({ field }) => (
							<button
								type="button"
								onClick={() => field.onChange("/custom.pdf")}
							>
								Custom file
							</button>
						),
					}}
				/>,
			),
		);
		expect(picker).not.toHaveBeenCalled();
		await act(async () =>
			Array.from(container.querySelectorAll("button"))
				.find((button) => button.textContent === "Custom file")!
				.click(),
		);
		await submit();
		expect(fixture.submit).toHaveBeenCalledWith({
			data: { attachment: "/custom.pdf" },
		});
	});
});
