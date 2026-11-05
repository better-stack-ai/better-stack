import { crmBackendPlugin, type CrmApiRouter } from "@btst/plugin-crm/api";
import { crmClientPlugin } from "@btst/plugin-crm/client";
import { useSearchContacts } from "@btst/plugin-crm/client/hooks";
import { PipelinePageComponent } from "@btst/plugin-crm/client/components";
import { crmPermissions } from "@btst/plugin-crm/permissions";
import { createCrmQueryKeys } from "@btst/plugin-crm/query-keys";
import type { Contact, Deal, Pipeline } from "@btst/plugin-crm/types";
import {
	useResourceContext,
	type ResourceContext,
} from "@btst/stack/plugins/client/hooks";
export {
	crmBackendPlugin,
	crmClientPlugin,
	useSearchContacts,
	PipelinePageComponent,
	crmPermissions,
	createCrmQueryKeys,
	useResourceContext,
};
export type { CrmApiRouter, Contact, Deal, Pipeline, ResourceContext };
