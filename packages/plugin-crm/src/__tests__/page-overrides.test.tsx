import { ContactDetailPage } from "../client/components/pages/contact-detail-page.internal";
import { DealDetailPage } from "../client/components/pages/deal-detail-page.internal";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CrmPluginOverrides } from "../client/overrides";
import { ActivitySummary } from "../client/components/activity-timeline";

const state = vi.hoisted(() => ({ overrides: {} as CrmPluginOverrides }));
vi.mock("@btst/stack/context", () => ({
	usePluginOverrides: () => state.overrides,
	usePluginSiteNavigation: () => ({
		Link: "a",
		resolve: (...parts: string[]) => ({ href: `/pages/${parts.join("/")}` }),
	}),
	PermissionAccess: ({ children }: { children: ReactNode }) => children,
}));
const activity = {
	id: "activity-1",
	type: "note" as const,
	body: "A follow-up note",
	createdAt: "2026-11-06T12:00:00Z",
};
vi.mock("../client/hooks", () => ({
	useContact: () => ({
		data: { id: "contact-1", firstName: "Alex", tags: [], customFields: {} },
	}),
	useDeals: () => ({ data: { items: [], total: 0 } }),
	useDealOwners: () => ({ data: { items: [], currentUserId: null } }),
	useAssignDealOwner: () => ({}),
	useDeleteContact: () => ({}),
	useDeleteDeal: () => ({}),
	useMoveDeal: () => ({}),
	useDeal: () => ({
		data: {
			id: "deal-1",
			taskId: "task-1",
			ownerId: null,
			title: "Contract",
			value: 1000,
			currency: "USD",
			pipelineId: "pipeline-1",
			status: "open",
			stage: "stage-1",
		},
	}),
	usePipeline: () => ({
		data: {
			id: "pipeline-1",
			name: "Sales",
			columns: [{ id: "stage-1", title: "Lead" }],
		},
	}),
	useActivities: () => ({ data: { items: [activity], total: 1 } }),
	useCreateActivity: () => ({}),
	useUpdateActivity: () => ({}),
	useDeleteActivity: () => ({}),
}));
const props = { activity };
const pages = ["contactDetail", "dealDetail"] as const;
const render = (page?: (typeof pages)[number]) =>
	renderToStaticMarkup(<ActivitySummary {...props} page={page} />);

beforeEach(() => {
	state.overrides = {};
});

describe("crm page-scoped ActivitySummary", () => {
	it("selects the explicit page and forwards the existing presentation props", () => {
		for (const page of pages) {
			const slot = vi.fn((_: unknown) => (
				<section data-slot-override={page}>Custom presentation</section>
			));
			state.overrides = {
				pageOverrides: { [page]: { ActivitySummary: slot } },
			};
			expect(render(page)).toContain(`data-slot-override="${page}"`);
			const presentationProps = props;
			expect(slot.mock.calls[0]?.[0]).toEqual(presentationProps);
			for (const other of pages.filter((key) => key !== page)) {
				expect(render(other)).not.toContain("data-slot-override");
				expect(render(other)).toContain("A follow-up note");
			}
			expect(render()).not.toContain("data-slot-override");
			expect(render()).toContain("A follow-up note");
		}
	});
	it("preserves built-in presentation when no slot is configured or a page entry is empty", () => {
		for (const page of pages) {
			const unchanged = render(page);
			expect(unchanged).toContain("A follow-up note");
			state.overrides = { pageOverrides: { [page]: {} } };
			expect(render(page)).toBe(unchanged);
		}
	});
});

vi.mock("@btst/stack/page-context", () => ({
	useRegisterPageAIContext: () => {},
}));
it("built-in contact and deal timelines supply separate summary scopes", () => {
	state.overrides = {
		pageOverrides: {
			contactDetail: { ActivitySummary: () => <div data-built-in="contact" /> },
			dealDetail: { ActivitySummary: () => <div data-built-in="deal" /> },
		},
	};
	const contact = renderToStaticMarkup(<ContactDetailPage id="contact-1" />);
	expect(contact).toContain('data-built-in="contact"');
	expect(contact).not.toContain('data-built-in="deal"');
	const deal = renderToStaticMarkup(<DealDetailPage id="deal-1" />);
	expect(deal).toContain('data-built-in="deal"');
	expect(deal).not.toContain('data-built-in="contact"');
	expect(contact).toContain("Log activity");
	expect(deal).toContain("Delete activity");
});
