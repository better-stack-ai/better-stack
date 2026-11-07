export {
	crmBackendPlugin,
	type CrmBackendOptions,
	type CrmApiRouter,
} from "./plugin";
export { crmSchema } from "../db";
export { crmPermissions } from "../permissions";
export * from "./getters";
export * from "./mutations";
export * from "./serializers";
export * from "./normalization";
export * from "./merge-getters";
export * from "./merge-mutations";
export type {
	Contact,
	Company,
	Deal,
	Activity,
	Pipeline,
	CrmPluginHooks,
	CrmHookContext,
	CrmMergeRelation,
	MergeEntity,
	MergeInput,
	MergePreview,
	DuplicateSuggestions,
} from "../types";

export {
	createCrmQueryKeys,
	crmResources,
	type CrmListParams,
	type ContactInput,
	type CompanyInput,
	type DealInput,
	type DealUpdateInput,
	type ActivityInput,
	type ActivityUpdateInput,
	type PipelineInput,
} from "../query-keys";
