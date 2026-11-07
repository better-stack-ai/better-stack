import { lazy, type ComponentType } from "react";
import { defineRoute, defineRoutes } from "@btst/yar";
import {
	createApiClient,
	createSanitizedSSRLoaderError,
	defineClientPlugin,
	isConnectionError,
} from "@btst/stack/plugins/client";
import { createCrmQueryKeys, type CrmIdentityPartition } from "../query-keys";
import type { Contact, Company, Deal } from "../types";
import { CRM_PLUGIN_ID } from "./constants";
import type { CrmPluginOverrides } from "./overrides";
const Contacts = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.ContactsPageComponent,
	})),
);
const ContactDetail = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.ContactDetailPageComponent,
	})),
);
const EditContact = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.EditContactPageComponent,
	})),
);
const Pipeline = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.PipelinePageComponent,
	})),
);
const DealDetail = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.DealDetailPageComponent,
	})),
);
const Companies = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.CompaniesPageComponent,
	})),
);
const Pipelines = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.PipelinesPageComponent,
	})),
);

/** Context for request-only CRM loading. */
export interface CrmLoaderContext {
	path: string;
	isSSR: boolean;
}
/** CRM-specific route customization; API and site settings come from createClientStack. */
export interface CrmClientConfig {
	/** Identity used when hydrating protected request data. */
	identityPartition?: CrmIdentityPartition;
	/** Request loader lifecycle callbacks. */
	hooks?: {
		beforeLoad?: (context: CrmLoaderContext) => void | Promise<void>;
		afterLoad?: (context: CrmLoaderContext) => void | Promise<void>;
		onErrorLoad?: (
			error: Error,
			context: CrmLoaderContext,
		) => void | Promise<void>;
	};
	/** Replace individual CRM pages. */
	pageComponents?: {
		contacts?: ComponentType;
		newContact?: ComponentType;
		contactDetail?: ComponentType<{ params: { id: string } }>;
		editContact?: ComponentType<{ params: { id: string } }>;
		pipeline?: ComponentType<{ params: { pipelineId: string } }>;
		dealDetail?: ComponentType<{ params: { id: string } }>;
		companies?: ComponentType;
		pipelines?: ComponentType;
	};
}
type PrefetchEntry = {
	queryKey: readonly unknown[];
	queryFn: () => Promise<unknown>;
};

/** Protected contact, pipeline and activity routes. Always render CRM on request. */
export const crmClientPlugin = (config: CrmClientConfig = {}) =>
	defineClientPlugin<CrmPluginOverrides>()({
		id: CRM_PLUGIN_ID,
		resolve: (runtime) => {
			const queries = createCrmQueryKeys(createApiClient({ ...runtime.api }));
			const preload =
				(
					path: string,
					entries: PrefetchEntry[] = [],
					related?: () => PrefetchEntry[],
					optionalEntries: PrefetchEntry[] = [],
				) =>
				async () => {
					if (typeof window !== "undefined") return;
					const context = { path, isSSR: true };
					const allEntries = [...entries];
					let error: unknown;
					try {
						await config.hooks?.beforeLoad?.(context);
						await Promise.all(
							[...entries, ...optionalEntries].map((entry) =>
								runtime.queryClient.prefetchQuery({ ...entry, retry: false }),
							),
						);
						const dependencies = related?.() ?? [];
						allEntries.push(...dependencies);
						await Promise.all(
							dependencies.map((entry) =>
								runtime.queryClient.prefetchQuery({ ...entry, retry: false }),
							),
						);
						error = allEntries
							.map(
								(entry) =>
									runtime.queryClient.getQueryState(entry.queryKey)?.error,
							)
							.find(Boolean);
						if (!error) await config.hooks?.afterLoad?.(context);
					} catch (caught) {
						error = caught;
						await Promise.all(
							allEntries.map((entry) =>
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
						console.warn("[btst/crm] API unavailable during request prefetch.");
					try {
						await config.hooks?.onErrorLoad?.(
							error instanceof Error ? error : new Error(String(error)),
							context,
						);
					} catch {
						/* Error reporting must not reject a route loader. */
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
							contacts: defineRoute("/crm/contacts", {
								page: Contacts,
								loader: preload("/crm/contacts", [
									queries.crmContacts.list(
										{ limit: 25, offset: 0 },
										config.identityPartition,
									),
								]),
								meta: () => meta("Contacts"),
							}),
							newContact: defineRoute("/crm/contacts/new", {
								page: () => <EditContact />,
								loader: preload("/crm/contacts/new", [
									queries.crmCompanies.list(
										{ limit: 200 },
										config.identityPartition,
									),
								]),
								meta: () => meta("New contact"),
							}),
							contactDetail: defineRoute("/crm/contacts/:id", {
								page: ({ params }) => <ContactDetail id={params.id} />,
								loader: ({ params }) =>
									preload(
										`/crm/contacts/${params.id}`,
										[
											queries.crmContacts.detail(
												params.id,
												config.identityPartition,
											),
											queries.crmActivities.list(
												{ contactId: params.id, limit: 25, offset: 0 },
												config.identityPartition,
											),
											queries.crmDeals.list(
												{ contactId: params.id, limit: 100 },
												config.identityPartition,
											),
										],
										() => {
											const contact = runtime.queryClient.getQueryData<Contact>(
												queries.crmContacts.detail(
													params.id,
													config.identityPartition,
												).queryKey,
											);
											return contact?.companyId
												? [
														queries.crmCompanies.detail(
															contact.companyId,
															config.identityPartition,
														),
													]
												: [];
										},
										[queries.crmOwners.list(config.identityPartition)],
									)(),
								meta: () => meta("Contact"),
							}),
							editContact: defineRoute("/crm/contacts/:id/edit", {
								page: ({ params }) => <EditContact id={params.id} />,
								loader: ({ params }) =>
									preload(
										`/crm/contacts/${params.id}/edit`,
										[
											queries.crmContacts.detail(
												params.id,
												config.identityPartition,
											),
											queries.crmCompanies.list(
												{ limit: 200 },
												config.identityPartition,
											),
										],
										() => {
											const contact = runtime.queryClient.getQueryData<Contact>(
												queries.crmContacts.detail(
													params.id,
													config.identityPartition,
												).queryKey,
											);
											const companies = runtime.queryClient.getQueryData<{
												items: Company[];
											}>(
												queries.crmCompanies.list(
													{ limit: 200 },
													config.identityPartition,
												).queryKey,
											);
											return contact?.companyId &&
												!companies?.items.some(
													(company) => company.id === contact.companyId,
												)
												? [
														queries.crmCompanies.detail(
															contact.companyId,
															config.identityPartition,
														),
													]
												: [];
										},
									)(),
								meta: () => meta("Edit contact"),
							}),
							pipeline: defineRoute("/crm/pipeline/:pipelineId", {
								page: ({ params }) => (
									<Pipeline pipelineId={params.pipelineId} />
								),
								loader: ({ params }) =>
									preload(
										`/crm/pipeline/${params.pipelineId}`,
										[
											queries.crmPipelines.detail(
												params.pipelineId,
												config.identityPartition,
											),
										],
										undefined,
										[queries.crmOwners.list(config.identityPartition)],
									)(),
								meta: () => meta("Deal pipeline"),
							}),
							dealDetail: defineRoute("/crm/deals/:id", {
								page: ({ params }) => <DealDetail id={params.id} />,
								loader: ({ params }) =>
									preload(
										`/crm/deals/${params.id}`,
										[
											queries.crmDeals.detail(
												params.id,
												config.identityPartition,
											),
											queries.crmActivities.list(
												{ dealId: params.id, limit: 25, offset: 0 },
												config.identityPartition,
											),
										],
										() => {
											const deal = runtime.queryClient.getQueryData<Deal>(
												queries.crmDeals.detail(
													params.id,
													config.identityPartition,
												).queryKey,
											);
											if (!deal) return [];
											return [
												queries.crmPipelines.detail(
													deal.pipelineId,
													config.identityPartition,
												),
												...(deal.contactId
													? [
															queries.crmContacts.detail(
																deal.contactId,
																config.identityPartition,
															),
														]
													: []),
												...(deal.companyId
													? [
															queries.crmCompanies.detail(
																deal.companyId,
																config.identityPartition,
															),
														]
													: []),
											];
										},
										[queries.crmOwners.list(config.identityPartition)],
									)(),
								meta: () => meta("Deal"),
							}),
							companies: defineRoute("/crm/companies", {
								page: Companies,
								loader: preload("/crm/companies", [
									queries.crmCompanies.list(
										{ limit: 25, offset: 0 },
										config.identityPartition,
									),
								]),
								meta: () => meta("Companies"),
							}),
							pipelines: defineRoute("/crm/pipelines", {
								page: Pipelines,
								loader: preload("/crm/pipelines", [
									queries.crmPipelines.list(
										{ limit: 200 },
										config.identityPartition,
									),
								]),
								meta: () => meta("Pipelines"),
							}),
						},
						{ pages: config.pageComponents },
					),
				sitemap: async () => [],
			};
		},
	});
