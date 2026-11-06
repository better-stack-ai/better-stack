// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EditCampaignPage } from "../client/components/pages/edit-campaign-page.internal";
const state = vi.hoisted(() => ({
	context: null as any,
	status: "draft",
	mutate: vi.fn(),
}));
vi.mock("@btst/stack/page-context", () => ({
	useRegisterPageAIContext: (context: unknown) => {
		state.context = context;
	},
}));
vi.mock("@btst/stack/context", async (original) => ({
	...(await original<any>()),
	usePluginOverrides: () => ({}),
	usePluginSiteNavigation: () => ({
		Link: (props: any) => <a {...props} />,
		resolve: () => ({ href: "/" }),
		navigate: vi.fn(),
	}),
}));
vi.mock("../client/hooks", () => ({
	useCampaign: () => ({
		data: {
			id: "c1",
			subject: "Original",
			body: "Old body",
			fromName: "Keep sender",
			fromEmail: "private@example.test",
			format: "markdown",
			status: state.status,
		},
	}),
	...Object.fromEntries(
		[
			"useCreateCampaign",
			"useDeleteCampaign",
			"useScheduleCampaign",
			"useSendCampaign",
			"useTestCampaign",
			"useUpdateCampaign",
		].map((name) => [
			name,
			() => ({ isPending: false, mutateAsync: state.mutate }),
		]),
	),
}));
vi.mock("@workspace/ui/components/markdown-editor", () => ({
	MarkdownEditor: ({ value }: any) => (
		<textarea aria-label="Body" value={value} readOnly />
	),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement("div");
document.body.append(host);
const root = createRoot(host);
afterEach(async () => {
	await act(async () => root.render(null));
	state.status = "draft";
	vi.clearAllMocks();
});
it("fills only supplied draft fields, preserves sender and never saves/sends", async () => {
	await act(async () => root.render(<EditCampaignPage id="c1" />));
	await act(async () =>
		expect(
			await state.context.clientTools.fillCampaignForm({
				subject: "AI subject",
				previewText: "Inbox preview",
				body: "# Draft",
			}),
		).toMatchObject({ success: true }),
	);
	expect(
		[...host.querySelectorAll("input")].map((element) => element.value),
	).toContain("Keep sender");
	expect(
		[...host.querySelectorAll("input")].map((element) => element.value),
	).toContain("Inbox preview");
	expect(host.querySelector("textarea")?.value).toBe("# Draft");
	expect(state.context.pageDescription).not.toContain("private@example.test");
	expect(state.mutate).not.toHaveBeenCalled();
	await act(async () =>
		expect(
			await state.context.clientTools.fillCampaignForm({
				subject: "bad\nheader",
			}),
		).toMatchObject({ success: false }),
	);
});
it("does not register a draft tool for a sent campaign", async () => {
	state.status = "sent";
	await act(async () => root.render(<EditCampaignPage id="sent" />));
	expect(state.context.clientTools).toBeUndefined();
});
