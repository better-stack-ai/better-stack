"use client";
import { lazy } from "react";
import {
	ComposedRoute,
	PermissionRouteAccess,
} from "@btst/stack/client/components";
import { crmPermissions } from "../../permissions";
import { CrmError, CrmLoading, CrmNotFound } from "./shared";
const Contacts = lazy(() =>
	import("./pages/contacts-page.internal").then((m) => ({
		default: m.ContactsPage,
	})),
);
const ContactDetail = lazy(() =>
	import("./pages/contact-detail-page.internal").then((m) => ({
		default: m.ContactDetailPage,
	})),
);
const EditContact = lazy(() =>
	import("./pages/edit-contact-page.internal").then((m) => ({
		default: m.EditContactPage,
	})),
);
const Pipeline = lazy(() =>
	import("./pages/pipeline-page.internal").then((m) => ({
		default: m.PipelinePage,
	})),
);
const DealDetail = lazy(() =>
	import("./pages/deal-detail-page.internal").then((m) => ({
		default: m.DealDetailPage,
	})),
);
const Companies = lazy(() =>
	import("./pages/companies-page.internal").then((m) => ({
		default: m.CompaniesPage,
	})),
);
const Pipelines = lazy(() =>
	import("./pages/pipelines-page.internal").then((m) => ({
		default: m.PipelinesPage,
	})),
);

function ReadablePipeline({ pipelineId }: { pipelineId: string }) {
	return (
		<PermissionRouteAccess
			permission={crmPermissions.deal.read()}
			LoadingComponent={CrmLoading}
		>
			<Pipeline pipelineId={pipelineId} />
		</PermissionRouteAccess>
	);
}
function ReadablePipelines() {
	return (
		<PermissionRouteAccess
			permission={crmPermissions.deal.read()}
			LoadingComponent={CrmLoading}
		>
			<Pipelines />
		</PermissionRouteAccess>
	);
}
function ReadableDeal({ id }: { id: string }) {
	return (
		<PermissionRouteAccess
			permission={crmPermissions.pipeline.read()}
			LoadingComponent={CrmLoading}
		>
			<DealDetail id={id} />
		</PermissionRouteAccess>
	);
}

const boundary = {
	onError: (error: Error) => console.error("[btst/crm]", error),
	ErrorComponent: CrmError,
	LoadingComponent: CrmLoading,
	NotFoundComponent: CrmNotFound,
};
export function ContactsPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/crm/contacts"
			permission={crmPermissions.contact.read()}
			PageComponent={Contacts}
		/>
	);
}
export function CompaniesPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/crm/companies"
			permission={crmPermissions.company.read()}
			PageComponent={Companies}
		/>
	);
}
export function PipelinesPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/crm/pipelines"
			permission={crmPermissions.pipeline.read()}
			PageComponent={ReadablePipelines}
		/>
	);
}
export function ContactDetailPageComponent({ id }: { id: string }) {
	return (
		<ComposedRoute
			{...boundary}
			path={`/crm/contacts/${id}`}
			permission={crmPermissions.contact.read()}
			PageComponent={ContactDetail}
			props={{ id }}
		/>
	);
}
export function EditContactPageComponent({ id }: { id?: string }) {
	return (
		<ComposedRoute
			{...boundary}
			path={id ? `/crm/contacts/${id}/edit` : "/crm/contacts/new"}
			permission={
				id
					? crmPermissions.contact.update({ id })
					: crmPermissions.contact.create()
			}
			PageComponent={EditContact}
			props={{ id }}
		/>
	);
}
export function PipelinePageComponent({ pipelineId }: { pipelineId: string }) {
	return (
		<ComposedRoute
			{...boundary}
			path={`/crm/pipeline/${pipelineId}`}
			permission={crmPermissions.pipeline.read()}
			PageComponent={ReadablePipeline}
			props={{ pipelineId }}
		/>
	);
}
export function DealDetailPageComponent({ id }: { id: string }) {
	return (
		<ComposedRoute
			{...boundary}
			path={`/crm/deals/${id}`}
			permission={crmPermissions.deal.read()}
			PageComponent={ReadableDeal}
			props={{ id }}
		/>
	);
}
