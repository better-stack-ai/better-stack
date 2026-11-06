import { TicketPage } from "../client/components/pages/ticket-page.internal";
import { InboxTicketPage } from "../client/components/pages/inbox-ticket-page.internal";
import type { ComponentProps, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { helpdeskClientPlugin } from "../client/plugin";
import type { HelpdeskPluginOverrides } from "../client/overrides";
import { Conversation } from "../client/components/shared";

const ticket = {
	id: "ticket",
	subject: "Customer question",
	status: "closed",
	priority: "low",
	customerId: "reader",
	requesterEmail: null,
	assigneeId: null,
	slaDueAt: "2026-11-06T12:00:00Z",
	firstRespondedAt: null,
	resolvedAt: null,
	createdAt: "2026-11-06T00:00:00Z",
	updatedAt: "2026-11-06T00:00:00Z",
};
vi.mock("../client/hooks", () => ({
	useCustomerTicket: () => ({ data: { ...ticket, messages: props.messages } }),
	useCustomerReply: () => ({ isPending: false }),
	useAgentTicket: () => ({ data: { ...ticket, messages: props.messages } }),
	useAgentReply: () => ({ isPending: false }),
	useCannedReplies: () => ({ data: { items: [], total: 0 } }),
	useUpdateTicket: () => ({ isPending: false }),
}));

const props: ComponentProps<typeof Conversation> = {
	messages: [
		{
			id: "message",
			ticketId: "ticket",
			body: "Customer question",
			authorType: "customer",
			createdAt: "2026-11-06T00:00:00Z",
		},
	],
};
const pages = ["helpdeskTicket", "helpdeskInboxTicket"] as const;
type SlotProps = ComponentProps<
	NonNullable<
		NonNullable<
			NonNullable<
				HelpdeskPluginOverrides["pageOverrides"]
			>[(typeof pages)[number]]
		>["Conversation"]
	>
>;
const custom = (name: string) => (props: SlotProps) => (
	<output data-slot-override={name}>{props.messages[0]?.body}</output>
);

function render(page: ReactElement, overrides: HelpdeskPluginOverrides = {}) {
	const stack = createClientStack({
		api: { baseURL: "https://test.local", basePath: "/api/data" },
		site: { baseURL: "https://test.local", basePath: "/pages" },
		queryClient: new QueryClient(),
		plugins: { helpdesk: helpdeskClientPlugin() },
	});
	return renderToStaticMarkup(
		<StackProvider stack={stack} overrides={{ helpdesk: overrides }}>
			{page}
		</StackProvider>,
	);
}

describe("helpdesk page presentation overrides", () => {
	it("selects each explicitly scoped page's component", () => {
		const overrides = {
			pageOverrides: Object.fromEntries(
				pages.map((page) => [page, { Conversation: custom(page) }]),
			),
		};
		for (const page of pages) {
			const html = render(<Conversation {...props} page={page} />, overrides);
			expect(html).toContain(`data-slot-override="${page}"`);
			for (const other of pages.filter((key) => key !== page))
				expect(html).not.toContain(`data-slot-override="${other}"`);
		}
	});

	it("isolates one page and preserves built-ins for unconfigured scopes", () => {
		const overrides = {
			pageOverrides: { [pages[0]]: { Conversation: custom("specific") } },
		};
		expect(
			render(<Conversation {...props} page={pages[0]} />, overrides),
		).toContain('data-slot-override="specific"');
		for (const page of pages.slice(1)) {
			const html = render(<Conversation {...props} page={page} />, overrides);
			expect(html).toContain("Customer question");
			expect(html).not.toContain("data-slot-override");
		}
		const standalone = render(<Conversation {...props} />, overrides);
		expect(standalone).toContain("Customer question");
		expect(standalone).not.toContain("data-slot-override");
	});

	it("preserves unchanged defaults and empty page configuration", () => {
		for (const page of pages) {
			const html = render(<Conversation {...props} page={page} />);
			expect(html).toContain("Customer question");
			expect(
				render(<Conversation {...props} page={page} />, {
					pageOverrides: { [page]: {} },
				}),
			).toBe(html);
		}
	});
});

it("built-in pages supply their own route scope", () => {
	const builtInPages = [
		<TicketPage id="ticket" />,
		<InboxTicketPage id="ticket" />,
	];
	const scopes = pages;
	const overrides = {
		pageOverrides: Object.fromEntries(
			scopes.map((page) => [page, { Conversation: custom(page) }]),
		),
	};
	for (const [index, page] of builtInPages.entries()) {
		expect(render(page, overrides)).toContain(
			`data-slot-override="${scopes[index]}"`,
		);
	}
});

it("preserves standalone rendering without StackProvider", () => {
	expect(renderToStaticMarkup(<Conversation {...props} />)).toContain(
		"Customer question",
	);
});

it("keeps the agent composer and contact sidebar with a scoped conversation", () => {
	ticket.status = "open";
	try {
		const html = render(<InboxTicketPage id="ticket" />, {
			pageOverrides: { helpdeskInboxTicket: { Conversation: custom("agent") } },
			renderTicketSidebar: ({ ticket }) => (
				<aside data-bridge="crm">{ticket.subject}</aside>
			),
		});
		expect(html).toContain('data-slot-override="agent"');
		expect(html).toContain('data-bridge="crm"');
		expect(html).toContain("Message visibility");
		expect(html).toContain("Public reply");
	} finally {
		ticket.status = "closed";
	}
});
