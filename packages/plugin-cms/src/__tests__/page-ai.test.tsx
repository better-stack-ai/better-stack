// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ContentForm } from "../client/components/forms/content-form";
const state = vi.hoisted(() => ({ context: null as any }));
vi.mock("@btst/stack/page-context", () => ({
	useRegisterPageAIContext: (context: unknown) => {
		state.context = context;
	},
}));
vi.mock("@btst/stack/context", async (original) => ({
	...(await original<any>()),
	usePluginOverrides: () => ({}),
	useTranslate: () => (_: string, fallback: string) => fallback,
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement("div");
document.body.append(host);
const root = createRoot(host);
afterEach(async () => {
	await act(async () => root.render(null));
});
it("validates against the active type, preserves unsupplied values and fills scheduling without saving", async () => {
	const submit = vi.fn();
	const type = {
		id: "ct1",
		slug: "article",
		name: "Article",
		jsonSchema: JSON.stringify({
			type: "object",
			properties: {
				title: { type: "string" },
				score: { type: "number", minimum: 0 },
			},
			required: ["title"],
		}),
	} as any;
	await act(async () =>
		root.render(
			<ContentForm
				contentType={type}
				initialSlug="article"
				initialData={{ title: "Keep title" }}
				onSubmit={submit}
			/>,
		),
	);
	await act(async () =>
		expect(
			await state.context.clientTools.fillCmsEntryForm({
				data: { score: "wrong" },
			}),
		).toMatchObject({ success: false }),
	);
	await act(async () =>
		expect(
			await state.context.clientTools.fillCmsEntryForm({
				data: { outside: "no" },
			}),
		).toMatchObject({ success: false }),
	);
	await act(async () =>
		expect(
			await state.context.clientTools.fillCmsEntryForm({
				data: { score: 7 },
				publishAt: "2026-12-01T12:30:47.123Z",
			}),
		).toMatchObject({ success: true }),
	);
	expect(
		[...host.querySelectorAll("input")].map((element) => element.value),
	).toContain("Keep title");
	expect(
		[...host.querySelectorAll("input")].map((element) => element.value),
	).toContain("7");
	expect(
		host.querySelector<HTMLInputElement>('[type="datetime-local"]')?.value,
	).toBeTruthy();
	expect(submit).not.toHaveBeenCalled();
	await act(async () => {
		host
			.querySelector("form")!
			.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
	});
	expect(submit).toHaveBeenCalledWith(
		expect.objectContaining({
			publishAt: "2026-12-01T12:30:47.123Z",
			data: expect.objectContaining({ title: "Keep title", score: 7 }),
		}),
	);
});
