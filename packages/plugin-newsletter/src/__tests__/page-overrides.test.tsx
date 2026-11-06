import { CampaignsPage } from "../client/components/pages/campaigns-page.internal";
import { SubscribersPage } from "../client/components/pages/subscribers-page.internal";
import { EditCampaignPage } from "../client/components/pages/edit-campaign-page.internal";
import { CampaignStatsPage } from "../client/components/pages/campaign-stats-page.internal";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewsletterPluginOverrides } from "../client/overrides";
import { NewsletterPage } from "../client/components/shared";

const state = vi.hoisted(() => ({
	overrides: {} as NewsletterPluginOverrides,
}));
vi.mock("@btst/stack/context", () => ({
	usePluginOverrides: () => state.overrides,
	usePluginSiteNavigation: () => ({
		Link: "a",
		resolve: (...parts: string[]) => ({ href: `/pages/${parts.join("/")}` }),
	}),
	PermissionAccess: ({ children }: { children: ReactNode }) => children,
}));

const props = {
	title: "Campaign heading",
	description: "Campaign description",
	action: <button>Save</button>,
	children: <p>Page content</p>,
};
const pages = [
	"subscribers",
	"campaigns",
	"newCampaign",
	"editCampaign",
	"campaignStats",
] as const;
const render = (page?: (typeof pages)[number]) =>
	renderToStaticMarkup(<NewsletterPage {...props} page={page} />);

beforeEach(() => {
	state.overrides = {};
});

describe("newsletter page-scoped Header", () => {
	it("selects the explicit page and forwards the existing presentation props", () => {
		for (const page of pages) {
			const slot = vi.fn((_: unknown) => (
				<section data-slot-override={page}>Custom presentation</section>
			));
			state.overrides = { pageOverrides: { [page]: { Header: slot } } };
			expect(render(page)).toContain(`data-slot-override="${page}"`);
			const { children, ...presentationProps } = {
				children: undefined,
				...props,
			};
			expect(slot.mock.calls[0]?.[0]).toEqual(presentationProps);
			for (const other of pages.filter((key) => key !== page)) {
				expect(render(other)).not.toContain("data-slot-override");
				expect(render(other)).toContain("Campaign heading");
			}
			expect(render()).not.toContain("data-slot-override");
			expect(render()).toContain("Campaign heading");
		}
	});
	it("preserves built-in presentation when no slot is configured or a page entry is empty", () => {
		for (const page of pages) {
			const unchanged = render(page);
			expect(unchanged).toContain("Campaign heading");
			state.overrides = { pageOverrides: { [page]: {} } };
			expect(render(page)).toBe(unchanged);
		}
	});
});

vi.mock("@btst/stack/page-context", () => ({
	useRegisterPageAIContext: () => {},
}));
vi.mock("@btst/stack/client/components", () => ({
	PermissionRouteAccess: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@workspace/ui/components/markdown-editor", () => ({
	MarkdownEditor: () => <textarea aria-label="Body" />,
}));
vi.mock("../client/hooks", () => ({
	useCampaigns: () => ({ data: { items: [], total: 0 } }),
	useSubscribers: () => ({ data: { items: [], total: 0 } }),
	useSubscriberGrowth: () => ({
		data: { points: [], total: 0, subscribed: 0, unsubscribed: 0, bounced: 0 },
	}),
	useCampaign: () => ({
		data: {
			id: "campaign-1",
			subject: "An update",
			body: "A newsletter",
			fromName: "Alex",
			fromEmail: "alex@example.com",
			status: "draft",
			format: "markdown",
			tags: [],
		},
	}),
	useCampaignStats: () => ({
		data: {
			recipientCount: 0,
			delivered: 0,
			opened: 0,
			clicked: 0,
			bounced: 0,
			failed: 0,
			openRate: 0,
			clickRate: 0,
		},
	}),
	...Object.fromEntries(
		[
			"useCreateSubscriber",
			"useUpdateSubscriber",
			"useDeleteSubscriber",
			"useImportSubscribers",
			"useSubscriberExport",
			"useCreateCampaign",
			"useDeleteCampaign",
			"useScheduleCampaign",
			"useSendCampaign",
			"useTestCampaign",
			"useUpdateCampaign",
		].map((name) => [name, () => ({})]),
	),
}));

it("each built-in newsletter page supplies its own explicit header scope", () => {
	state.overrides = {
		pageOverrides: Object.fromEntries(
			pages.map((page) => [
				page,
				{ Header: () => <header data-built-in={page} /> },
			]),
		),
	};
	for (const [name, element] of [
		["campaigns", <CampaignsPage />],
		["subscribers", <SubscribersPage />],
		["newCampaign", <EditCampaignPage />],
		["editCampaign", <EditCampaignPage id="campaign-1" />],
		["campaignStats", <CampaignStatsPage id="campaign-1" />],
	] as const) {
		const html = renderToStaticMarkup(element);
		expect(html).toContain(`data-built-in="${name}"`);
		for (const other of pages.filter((key) => key !== name))
			expect(html).not.toContain(`data-built-in="${other}"`);
	}
});
