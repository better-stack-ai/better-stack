import { InboxPage } from "../client/components/pages/inbox-page.internal";
import type { ComponentProps, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { notificationsClientPlugin } from "../client/plugin";
import type { NotificationsPluginOverrides } from "../client/overrides";
import { NotificationList } from "../client/components/notification-list";

vi.mock("../client/hooks", () => ({
	useMarkNotificationAsRead: () => ({ isPending: false }),
	useArchiveNotification: () => ({ isPending: false }),
	useSuspenseNotifications: () => ({
		data: { items: props.items, total: 1, unreadCount: 1 },
		isFetching: false,
		refetch: vi.fn(),
	}),
	useMarkAllNotificationsAsRead: () => ({ isPending: false }),
}));

const props: ComponentProps<typeof NotificationList> = {
	items: [
		{
			id: "notice",
			recipientId: "reader",
			category: "activity",
			title: "Report ready",
			body: "Open the report",
			href: null,
			readAt: null,
			archivedAt: null,
			createdAt: "2026-11-06T00:00:00Z",
		},
	],
	empty: "All caught up",
};
const pages = ["inbox"] as const;
type SlotProps = ComponentProps<
	NonNullable<
		NonNullable<
			NonNullable<
				NotificationsPluginOverrides["pageOverrides"]
			>[(typeof pages)[number]]
		>["NotificationRow"]
	>
>;
const custom = (name: string) => (props: SlotProps) => (
	<output data-slot-override={name}>{props.item.title}</output>
);

function render(
	page: ReactElement,
	overrides: NotificationsPluginOverrides = {},
) {
	const stack = createClientStack({
		api: { baseURL: "https://test.local", basePath: "/api/data" },
		site: { baseURL: "https://test.local", basePath: "/pages" },
		queryClient: new QueryClient(),
		plugins: { notifications: notificationsClientPlugin() },
	});
	return renderToStaticMarkup(
		<StackProvider stack={stack} overrides={{ notifications: overrides }}>
			{page}
		</StackProvider>,
	);
}

describe("notifications page presentation overrides", () => {
	it("selects each explicitly scoped page's component", () => {
		const overrides = {
			pageOverrides: Object.fromEntries(
				pages.map((page) => [page, { NotificationRow: custom(page) }]),
			),
		};
		for (const page of pages) {
			const html = render(
				<NotificationList {...props} page={page} />,
				overrides,
			);
			expect(html).toContain(`data-slot-override="${page}"`);
			for (const other of pages.filter((key) => key !== page))
				expect(html).not.toContain(`data-slot-override="${other}"`);
		}
	});

	it("isolates one page and preserves built-ins for unconfigured scopes", () => {
		const overrides = {
			pageOverrides: { [pages[0]]: { NotificationRow: custom("specific") } },
		};
		expect(
			render(<NotificationList {...props} page={pages[0]} />, overrides),
		).toContain('data-slot-override="specific"');
		for (const page of pages.slice(1)) {
			const html = render(
				<NotificationList {...props} page={page} />,
				overrides,
			);
			expect(html).toContain("nt-row");
			expect(html).not.toContain("data-slot-override");
		}
		const standalone = render(<NotificationList {...props} />, overrides);
		expect(standalone).toContain("nt-row");
		expect(standalone).not.toContain("data-slot-override");
	});

	it("preserves unchanged defaults and empty page configuration", () => {
		for (const page of pages) {
			const html = render(<NotificationList {...props} page={page} />);
			expect(html).toContain("nt-row");
			expect(
				render(<NotificationList {...props} page={page} />, {
					pageOverrides: { [page]: {} },
				}),
			).toBe(html);
		}
	});
});

it("built-in pages supply their own route scope", () => {
	const builtInPages = [<InboxPage />];
	const scopes = pages;
	const overrides = {
		pageOverrides: Object.fromEntries(
			scopes.map((page) => [page, { NotificationRow: custom(page) }]),
		),
	};
	for (const [index, page] of builtInPages.entries()) {
		expect(render(page, overrides)).toContain(
			`data-slot-override="${scopes[index]}"`,
		);
	}
});
