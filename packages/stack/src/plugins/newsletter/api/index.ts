export {
	newsletterBackendPlugin,
	type NewsletterBackendOptions,
	type NewsletterBackendConfig,
	type NewsletterApiRouter,
} from "./plugin";
export { newsletterSchema } from "../db";
export { newsletterPermissions } from "../permissions";
export {
	resendAdapter,
	mailgunAdapter,
	type EmailAdapter,
	type EmailOptions,
} from "./email-adapter";
export * from "./getters";
export * from "./mutations";
export type {
	Subscriber,
	Campaign,
	CampaignStats,
	SubscriberGrowth,
	NewsletterPluginHooks,
} from "../types";
