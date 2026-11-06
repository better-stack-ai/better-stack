"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { helpdeskPermissions } from "../../permissions";
import { HelpdeskError, HelpdeskLoading, HelpdeskNotFound } from "./shared";

const Portal = lazy(() =>
	import("./pages/portal-page.internal").then((m) => ({
		default: m.PortalPage,
	})),
);
const Ticket = lazy(() =>
	import("./pages/ticket-page.internal").then((m) => ({
		default: m.TicketPage,
	})),
);
const Inbox = lazy(() =>
	import("./pages/inbox-page.internal").then((m) => ({ default: m.InboxPage })),
);
const InboxTicket = lazy(() =>
	import("./pages/inbox-ticket-page.internal").then((m) => ({
		default: m.InboxTicketPage,
	})),
);
const boundary = {
	ErrorComponent: HelpdeskError,
	LoadingComponent: HelpdeskLoading,
	NotFoundComponent: HelpdeskNotFound,
	onError: (error: Error) => console.error("[btst/helpdesk]", error),
};

/** Customer portal with a ticket creation form and protected ticket list. */
export function PortalPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/helpdesk"
			permission={helpdeskPermissions.customerTicket.list()}
			PageComponent={Portal}
		/>
	);
}
/** Customer-visible conversation. */
export function TicketPageComponent({ id }: { id: string }) {
	return (
		<ComposedRoute
			{...boundary}
			path={`/helpdesk/${id}`}
			PageComponent={Ticket}
			props={{ id }}
		/>
	);
}
/** Agent queue with status, priority and assignee filters. */
export function InboxPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/helpdesk/inbox"
			permission={helpdeskPermissions.ticket.list()}
			PageComponent={Inbox}
		/>
	);
}
/** Agent conversation, internal notes and ticket controls. */
export function InboxTicketPageComponent({ id }: { id: string }) {
	return (
		<ComposedRoute
			{...boundary}
			path={`/helpdesk/inbox/${id}`}
			PageComponent={InboxTicket}
			props={{ id }}
		/>
	);
}
