export {
	newsletterBackendPlugin,
	type NewsletterBackendOptions,
	type NewsletterApiRouter,
} from "./plugin";
export { newsletterSchema } from "../db";
export { newsletterPermissions } from "../permissions";
export {
	EmailDeliveryError,
	type EmailReconciliation,
	resendAdapter,
	mailgunAdapter,
	type EmailAdapter,
	type EmailOptions,
} from "./email-adapter";
export * from "./getters";
export * from "./serializers";
export * from "./mutations";
export type {
	Subscriber,
	Campaign,
	CampaignStats,
	CampaignRecipient,
	CampaignRecovery,
	SubscriberGrowth,
	NewsletterPluginHooks,
	CampaignRecord,
	SubscriberRecord,
	SendRecord,
} from "../types";
