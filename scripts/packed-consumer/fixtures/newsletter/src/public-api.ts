import {
	newsletterBackendPlugin,
	newsletterSchema,
	type EmailAdapter,
	type CampaignRecord,
} from "@btst/plugin-newsletter/api";
import {
	newsletterClientPlugin,
	type NewsletterPluginOverrides,
	type CampaignSourceProps,
} from "@btst/plugin-newsletter/client";
import {
	EditCampaignPageComponent,
	SubscribeForm,
} from "@btst/plugin-newsletter/client/components";
import {
	useCampaign,
	useCreateCampaign,
} from "@btst/plugin-newsletter/client/hooks";
import {
	createNewsletterQueryKeys,
	type CampaignInput,
} from "@btst/plugin-newsletter/query-keys";
import { newsletterPermissions } from "@btst/plugin-newsletter/permissions";
import type {
	Subscriber,
	Campaign,
	SendRecord,
} from "@btst/plugin-newsletter/types";
export type PackedNewsletter = {
	backend: typeof newsletterBackendPlugin;
	schema: typeof newsletterSchema;
	email: EmailAdapter;
	record: CampaignRecord;
	client: typeof newsletterClientPlugin;
	overrides: NewsletterPluginOverrides;
	source: CampaignSourceProps;
	editor: typeof EditCampaignPageComponent;
	form: typeof SubscribeForm;
	hook: typeof useCampaign;
	create: typeof useCreateCampaign;
	keys: typeof createNewsletterQueryKeys;
	input: CampaignInput;
	permissions: typeof newsletterPermissions;
	subscriber: Subscriber;
	campaign: Campaign;
	send: SendRecord;
};
