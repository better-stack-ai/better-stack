// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StackProvider, useNotify, type StackNotifyProvider } from "../context";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastInfo = vi.fn();
const toastWarning = vi.fn();

vi.mock("sonner", () => ({
	toast: {
		success: (...args: unknown[]) => toastSuccess(...args),
		error: (...args: unknown[]) => toastError(...args),
		info: (...args: unknown[]) => toastInfo(...args),
		warning: (...args: unknown[]) => toastWarning(...args),
	},
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	toastSuccess.mockClear();
	toastError.mockClear();
	toastInfo.mockClear();
	toastWarning.mockClear();
});

afterEach(async () => {
	await act(async () => {
		root.unmount();
	});
	container.remove();
	vi.restoreAllMocks();
});

async function render(ui: React.ReactElement) {
	await act(async () => {
		root.render(ui);
	});
}

describe("useNotify", () => {
	it("uses sonner by default when no notify prop is configured", async () => {
		let notify: StackNotifyProvider | undefined;
		function Probe() {
			notify = useNotify();
			return null;
		}
		await render(
			<StackProvider basePath="/pages">
				<Probe />
			</StackProvider>,
		);

		notify!.success!("Saved");
		notify!.error!("Failed", { description: "Try again" });

		expect(toastSuccess).toHaveBeenCalledWith("Saved", undefined);
		expect(toastError).toHaveBeenCalledWith("Failed", {
			description: "Try again",
		});
	});

	it("routes notifications through a custom provider", async () => {
		const customSuccess = vi.fn();
		const customError = vi.fn();
		let notify: StackNotifyProvider | undefined;

		function Probe() {
			notify = useNotify();
			return null;
		}

		await render(
			<StackProvider
				basePath="/pages"
				notify={{ success: customSuccess, error: customError }}
			>
				<Probe />
			</StackProvider>,
		);

		notify!.success!("Custom saved");
		notify!.error!("Custom failed");
		notify!.info!("Still sonner");

		expect(customSuccess).toHaveBeenCalledWith("Custom saved");
		expect(customError).toHaveBeenCalledWith("Custom failed");
		expect(toastInfo).toHaveBeenCalledWith("Still sonner", undefined);
		expect(toastSuccess).not.toHaveBeenCalled();
	});
});
