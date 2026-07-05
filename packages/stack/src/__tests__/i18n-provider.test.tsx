// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	StackProvider,
	useTranslate,
	type StackI18nProvider,
} from "../context";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
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

describe("useTranslate", () => {
	it("returns the default string when no i18n provider is configured", async () => {
		let t: ReturnType<typeof useTranslate> | undefined;
		function Probe() {
			t = useTranslate();
			return null;
		}
		await render(
			<StackProvider basePath="/pages">
				<Probe />
			</StackProvider>,
		);

		expect(t!("blog.posts.create", "Create Post")).toBe("Create Post");
	});

	it("interpolates {{param}} placeholders in the default string", async () => {
		let t: ReturnType<typeof useTranslate> | undefined;
		function Probe() {
			t = useTranslate();
			return null;
		}
		await render(
			<StackProvider basePath="/pages">
				<Probe />
			</StackProvider>,
		);

		expect(
			t!("blog.posts.deleted", "Deleted {{title}}", { title: "Hello" }),
		).toBe("Deleted Hello");
	});

	it("delegates to the consumer translate function", async () => {
		const translate = vi.fn(
			(key: string, defaultValue: string, params?: Record<string, unknown>) =>
				`[${key}] ${defaultValue} ${params?.title ?? ""}`.trim(),
		);
		const i18n: StackI18nProvider = { translate };

		let t: ReturnType<typeof useTranslate> | undefined;
		function Probe() {
			t = useTranslate();
			return null;
		}

		await render(
			<StackProvider basePath="/pages" i18n={i18n}>
				<Probe />
			</StackProvider>,
		);

		const result = t!("blog.posts.deleted", "Deleted {{title}}", {
			title: "Draft",
		});

		expect(translate).toHaveBeenCalledWith(
			"blog.posts.deleted",
			"Deleted {{title}}",
			{ title: "Draft" },
		);
		expect(result).toBe("[blog.posts.deleted] Deleted {{title}} Draft");
	});
});
