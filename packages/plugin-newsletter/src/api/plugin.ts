import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import { z } from "zod";
import { newsletterSchema } from "../db";
import {
	createCampaignSchema,
	createSubscriberSchema,
	importSubscribersSchema,
	listCampaignsSchema,
	listSubscribersSchema,
	scheduleCampaignSchema,
	subscribeSchema,
	testCampaignSchema,
	tokenSchema,
	transactionalEmailSchema,
	updateCampaignSchema,
	updateSubscriberSchema,
} from "../schemas";
import type { NewsletterPluginHooks } from "../types";
import type { EmailAdapter } from "./email-adapter";
import { createNewsletterOperations } from "./operations";

/** Configuration for the newsletter backend plugin. */
export interface NewsletterBackendOptions {
	/** Email provider or custom SMTP wrapper. */
	emailAdapter: EmailAdapter;
	/** Absolute public API namespace, for example https://example.com/api/data/newsletter. */
	unsubscribeBaseURL: string;
	/** Require the subscriber to confirm ownership before campaign delivery. */
	doubleOptIn?: boolean;
	/** Sender for confirmation messages; required with double opt-in unless a custom hook sends them. */
	confirmationFrom?: { email: string; name?: string };
	/** Post-authorization lifecycle callbacks. Add public subscribe rate limits in onBeforeSubscribe. */
	hooks?: NewsletterPluginHooks;
}

/** Subscriber management, campaigns and public bearer-token email actions. */
export const newsletterBackendPlugin = (options: NewsletterBackendOptions) => {
	const base = new URL(options.unsubscribeBaseURL);
	if (
		!["http:", "https:"].includes(base.protocol) ||
		base.username ||
		base.password ||
		base.search ||
		base.hash
	)
		throw new Error(
			"unsubscribeBaseURL must be an absolute HTTP(S) API namespace without credentials, query, or fragment",
		);
	if (
		options.doubleOptIn &&
		!options.confirmationFrom &&
		!options.hooks?.onConfirmationRequired
	)
		throw new Error(
			"Double opt-in requires confirmationFrom or hooks.onConfirmationRequired",
		);
	if (options.confirmationFrom) {
		z.object({
			email: z.email(),
			name: z
				.string()
				.max(200)
				.refine((name) => !/[\r\n]/.test(name))
				.optional(),
		}).parse(options.confirmationFrom);
	}
	return defineBackendPlugin({
		id: "newsletter",
		dbPlugin: newsletterSchema,
		operations: (adapter) => createNewsletterOperations(adapter, options),
		routes: (_adapter, _context, operations) => ({
			listSubscribers: createEndpoint(
				"/newsletter/subscribers",
				{ method: "GET", query: listSubscribersSchema, requireRequest: true },
				operations.listSubscribers.route((ctx) => ctx.query),
			),
			getSubscriber: createEndpoint(
				"/newsletter/subscribers/:id",
				{ method: "GET", requireRequest: true },
				operations.getSubscriber.route((ctx) => ({ id: ctx.params.id })),
			),
			createSubscriber: createEndpoint(
				"/newsletter/subscribers",
				{ method: "POST", body: createSubscriberSchema, requireRequest: true },
				operations.createSubscriber.route((ctx) => ctx.body),
			),
			updateSubscriber: createEndpoint(
				"/newsletter/subscribers/:id",
				{ method: "PUT", body: updateSubscriberSchema, requireRequest: true },
				operations.updateSubscriber.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			deleteSubscriber: createEndpoint(
				"/newsletter/subscribers/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteSubscriber.route((ctx) => ({ id: ctx.params.id })),
			),
			importSubscribers: createEndpoint(
				"/newsletter/subscribers/import",
				{ method: "POST", body: importSubscribersSchema, requireRequest: true },
				operations.importSubscribers.route((ctx) => ctx.body),
			),
			exportSubscribers: createEndpoint(
				"/newsletter/subscribers/export",
				{ method: "GET", requireRequest: true },
				operations.exportSubscribers.route(() => ({})),
			),
			subscribe: createEndpoint(
				"/newsletter/subscribe",
				{ method: "POST", body: subscribeSchema, requireRequest: true },
				operations.subscribe.route((ctx) => ctx.body),
			),
			confirmSubscription: createEndpoint(
				"/newsletter/confirm",
				{ method: "GET", query: tokenSchema, requireRequest: true },
				operations.confirmSubscription.route((ctx) => ctx.query),
			),
			unsubscribe: createEndpoint(
				"/newsletter/unsubscribe",
				{ method: "GET", query: tokenSchema, requireRequest: true },
				operations.unsubscribe.route((ctx) => ctx.query),
			),
			listCampaigns: createEndpoint(
				"/newsletter/campaigns",
				{ method: "GET", query: listCampaignsSchema, requireRequest: true },
				operations.listCampaigns.route((ctx) => ctx.query),
			),
			getCampaign: createEndpoint(
				"/newsletter/campaigns/:id",
				{ method: "GET", requireRequest: true },
				operations.getCampaign.route((ctx) => ({ id: ctx.params.id })),
			),
			createCampaign: createEndpoint(
				"/newsletter/campaigns",
				{ method: "POST", body: createCampaignSchema, requireRequest: true },
				operations.createCampaign.route((ctx) => ctx.body),
			),
			updateCampaign: createEndpoint(
				"/newsletter/campaigns/:id",
				{ method: "PUT", body: updateCampaignSchema, requireRequest: true },
				operations.updateCampaign.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			deleteCampaign: createEndpoint(
				"/newsletter/campaigns/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteCampaign.route((ctx) => ({ id: ctx.params.id })),
			),
			sendCampaign: createEndpoint(
				"/newsletter/campaigns/:id/send",
				{ method: "POST", requireRequest: true },
				operations.sendCampaign.route((ctx) => ({ id: ctx.params.id })),
			),
			scheduleCampaign: createEndpoint(
				"/newsletter/campaigns/:id/schedule",
				{ method: "POST", body: scheduleCampaignSchema, requireRequest: true },
				operations.scheduleCampaign.route((ctx) => ({
					id: ctx.params.id,
					...ctx.body,
				})),
			),
			sendTestEmail: createEndpoint(
				"/newsletter/campaigns/:id/test",
				{ method: "POST", body: testCampaignSchema, requireRequest: true },
				operations.sendTestEmail.route((ctx) => ({
					id: ctx.params.id,
					...ctx.body,
				})),
			),
			getCampaignStats: createEndpoint(
				"/newsletter/campaigns/:id/stats",
				{ method: "GET", requireRequest: true },
				operations.getCampaignStats.route((ctx) => ({ id: ctx.params.id })),
			),
			getSubscriberGrowth: createEndpoint(
				"/newsletter/growth",
				{ method: "GET", requireRequest: true },
				operations.getSubscriberGrowth.route(() => ({})),
			),
			trackOpen: createEndpoint(
				"/newsletter/track/open",
				{ method: "GET", query: tokenSchema, requireRequest: true },
				operations.trackOpen.route((ctx) => ctx.query),
			),
			trackClick: createEndpoint(
				"/newsletter/track/click",
				{
					method: "GET",
					query: tokenSchema.extend({
						link: z.coerce.number().int().min(0).max(10000),
					}),
					requireRequest: true,
				},
				operations.trackClick.route((ctx) => ctx.query),
			),
			sendTransactionalEmail: createEndpoint(
				"/newsletter/send",
				{
					method: "POST",
					body: transactionalEmailSchema,
					requireRequest: true,
				},
				operations.sendTransactionalEmail.route((ctx) => ctx.body),
			),
		}),
	});
};
export type NewsletterApiRouter = ReturnType<
	ReturnType<typeof newsletterBackendPlugin>["routes"]
>;
