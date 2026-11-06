import { lazy, type ComponentType } from "react";
import { defineRoute, defineRoutes } from "@btst/yar";
import {
	createApiClient,
	createSanitizedSSRLoaderError,
	defineClientPlugin,
	isConnectionError,
} from "@btst/stack/plugins/client";
import {
	createHelpdeskQueryKeys,
	type HelpdeskIdentityPartition,
} from "../query-keys";
import { HELPDESK_PLUGIN_ID } from "./constants";
import type { HelpdeskPluginOverrides } from "./overrides";

const Portal = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.PortalPageComponent,
	})),
);
const Ticket = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.TicketPageComponent,
	})),
);
const Inbox = lazy(() =>
	import("./components/pages").then((m) => ({ default: m.InboxPageComponent })),
);
const InboxTicket = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.InboxTicketPageComponent,
	})),
);

/** Context for request-only ticket prefetching. */
export interface HelpdeskLoaderContext {
	path: string;
	isSSR: boolean;
}
/** Request identity, loader lifecycle and replaceable helpdesk pages. */
export interface HelpdeskClientConfig {
	/** Match the browser identity snapshot when hydrating protected queries. */
	identityPartition?: HelpdeskIdentityPartition;
	/** Request loader lifecycle callbacks. */
	hooks?: {
		beforeLoad?: (context: HelpdeskLoaderContext) => void | Promise<void>;
		afterLoad?: (context: HelpdeskLoaderContext) => void | Promise<void>;
		onErrorLoad?: (
			error: Error,
			context: HelpdeskLoaderContext,
		) => void | Promise<void>;
	};
	/** Replace selected routes, including ejected registry pages. */
	pageComponents?: {
		portal?: ComponentType;
		ticket?: ComponentType<{ params: { id: string } }>;
		inbox?: ComponentType;
		inboxTicket?: ComponentType<{ params: { id: string } }>;
	};
}
type PrefetchEntry = {
	queryKey: readonly unknown[];
	queryFn: () => Promise<unknown>;
};

/** Customer portal and agent inbox. Render protected helpdesk routes on request. */
export const helpdeskClientPlugin = (config: HelpdeskClientConfig = {}) =>
	defineClientPlugin<HelpdeskPluginOverrides>()({
		id: HELPDESK_PLUGIN_ID,
		resolve: (runtime) => {
			const queries = createHelpdeskQueryKeys(
				createApiClient({ ...runtime.api }),
			);
			const preload = (path: string, entries: PrefetchEntry[]) => async () => {
				if (typeof window !== "undefined") return;
				const context = { path, isSSR: true };
				let error: unknown;
				try {
					await config.hooks?.beforeLoad?.(context);
					await Promise.all(
						entries.map((entry) =>
							runtime.queryClient.prefetchQuery({ ...entry, retry: false }),
						),
					);
					error = entries
						.map(
							(entry) =>
								runtime.queryClient.getQueryState(entry.queryKey)?.error,
						)
						.find(Boolean);
					if (!error) await config.hooks?.afterLoad?.(context);
				} catch (caught) {
					error = caught;
					await Promise.all(
						entries.map((entry) =>
							runtime.queryClient.prefetchQuery({
								queryKey: entry.queryKey,
								queryFn: () => {
									throw createSanitizedSSRLoaderError();
								},
								retry: false,
								staleTime: 0,
							}),
						),
					);
				}
				if (!error) return;
				if (isConnectionError(error))
					console.warn(
						"[btst/helpdesk] API unavailable during request prefetch.",
					);
				try {
					await config.hooks?.onErrorLoad?.(
						error instanceof Error ? error : new Error(String(error)),
						context,
					);
				} catch {
					// Reporting must not reject a route loader.
				}
			};
			const meta = (title: string) => [
				{ title },
				{ name: "robots", content: "noindex, nofollow" },
			];
			return {
				routes: () =>
					defineRoutes(
						{
							portal: defineRoute("/helpdesk", {
								page: Portal,
								loader: preload("/helpdesk", [
									queries.helpdeskCustomerTickets.list(
										{ limit: 25, offset: 0 },
										config.identityPartition,
									),
								]),
								meta: () => meta("My support tickets"),
							}),
							inbox: defineRoute("/helpdesk/inbox", {
								page: Inbox,
								loader: preload("/helpdesk/inbox", [
									queries.helpdeskAgentTickets.list(
										{ limit: 25, offset: 0 },
										config.identityPartition,
									),
								]),
								meta: () => meta("Support inbox"),
							}),
							inboxTicket: defineRoute("/helpdesk/inbox/:id", {
								page: ({ params }) => <InboxTicket id={params.id} />,
								loader: ({ params }) =>
									preload(`/helpdesk/inbox/${params.id}`, [
										queries.helpdeskAgentTickets.detail(
											params.id,
											config.identityPartition,
										),
										queries.helpdeskCannedReplies.list(
											{ limit: 25, offset: 0 },
											config.identityPartition,
										),
									])(),
								meta: () => meta("Support ticket"),
							}),
							ticket: defineRoute("/helpdesk/:id", {
								page: ({ params }) => <Ticket id={params.id} />,
								loader: ({ params }) =>
									preload(`/helpdesk/${params.id}`, [
										queries.helpdeskCustomerTickets.detail(
											params.id,
											config.identityPartition,
										),
									])(),
								meta: () => meta("My support ticket"),
							}),
						},
						{ pages: config.pageComponents },
					),
				sitemap: async () => [],
			};
		},
	});
