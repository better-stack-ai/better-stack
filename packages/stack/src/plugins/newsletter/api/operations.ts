import type { DBAdapter as Adapter } from "@btst/db";
import {
	defineOperation,
	definePassthroughOperation,
	OperationHttpError,
} from "@btst/stack/plugins/api";
import { z } from "zod";
import { newsletterPermissions as permissions } from "../permissions";
import {
	createCampaignSchema,
	createSubscriberSchema,
	idSchema,
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
import type { CampaignRecord, SendRecord, SubscriberRecord } from "../types";
import { exportSubscriberCsv, parseSubscriberCsv } from "./csv";
import {
	appendUnsubscribe,
	escapeHtml,
	formatSender,
	renderEmailBody,
	tokenUrl,
	trackEmailLinks,
} from "./email";
import {
	getAllRows,
	getCampaignRecord,
	getCampaignStats,
	getSubscriberByEmail,
	getSubscriberGrowth,
	getSubscriberRecord,
	listCampaigns,
	listSubscribers,
	serializeCampaign,
	serializeSubscriber,
} from "./getters";
import * as mutations from "./mutations";
import type { NewsletterBackendOptions } from "./plugin";

const empty = z.object({});
const subscriberUpdateInput = idSchema.extend({ data: updateSubscriberSchema });
const campaignUpdateInput = idSchema.extend({ data: updateCampaignSchema });
const scheduleInput = idSchema.extend(scheduleCampaignSchema.shape);
const testInput = idSchema.extend(testCampaignSchema.shape);
const clickInput = tokenSchema.extend({
	link: z.coerce.number().int().min(0).max(10000),
});
const genericSubscriptionResult = {
	success: true as const,
	message:
		"If confirmation is required, check your email to finish subscribing.",
};

function fail(
	status: number,
	message: string,
	code = "NEWSLETTER_ERROR",
): never {
	throw new OperationHttpError(status, message, code);
}
async function requireSubscriber(adapter: Adapter, id: string) {
	return (
		(await getSubscriberRecord(adapter, id)) ??
		fail(404, "Subscriber not found")
	);
}
async function requireCampaign(adapter: Adapter, id: string) {
	return (
		(await getCampaignRecord(adapter, id)) ?? fail(404, "Campaign not found")
	);
}
async function subscriberFacts(adapter: Adapter, id: string) {
	const row = await requireSubscriber(adapter, id);
	return { subscriberId: row.id, status: row.status };
}
async function campaignFacts(adapter: Adapter, id: string) {
	const row = await requireCampaign(adapter, id);
	return { campaignId: row.id, status: row.status };
}
async function findReceipt(
	adapter: Adapter,
	field: "trackingToken" | "unsubscribeToken",
	token: string,
) {
	return (
		(await adapter.findOne<SendRecord>({
			model: "newsletterSend",
			where: [{ field, value: mutations.hashToken(token), operator: "eq" }],
		})) ?? fail(404, "Link not found or expired")
	);
}

/** Validated business inventory shared by HTTP, request operations, and trusted jobs. */
export function createNewsletterOperations(
	adapter: Adapter,
	options: NewsletterBackendOptions,
) {
	const base = options.unsubscribeBaseURL.replace(/\/$/, "");
	const hooks = options.hooks;

	async function sendConfirmation(subscriber: SubscriberRecord) {
		const latest = await requireSubscriber(adapter, subscriber.id);
		if (
			latest.status !== "unsubscribed" ||
			(latest.confirmationSentAt &&
				Date.now() - new Date(latest.confirmationSentAt).getTime() < 60_000)
		)
			return;
		const token = mutations.newToken();
		const digest = mutations.hashToken(token);
		const claimed = await adapter.incrementOne<SubscriberRecord>({
			model: "newsletterSubscriber",
			where: [
				{ field: "id", value: latest.id, operator: "eq" },
				{ field: "status", value: "unsubscribed", operator: "eq" },
				{
					field: "confirmationToken",
					value: latest.confirmationToken ?? null,
					operator: "eq",
				},
			],
			increment: {},
			set: {
				confirmationToken: digest,
				confirmationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
				confirmationSentAt: new Date(),
			},
		});
		if (!claimed) return;
		try {
			const url = tokenUrl(base, "confirm", token);
			if (hooks?.onConfirmationRequired) {
				await hooks.onConfirmationRequired({ email: subscriber.email, url });
				return;
			}
			const from =
				options.confirmationFrom ??
				fail(500, "A confirmation sender is required");
			const receipt = await mutations.createSendReceipt(
				adapter,
				`confirmation-${crypto.randomUUID()}`,
				subscriber.id,
			);
			await options.emailAdapter.send({
				to: subscriber.email,
				subject: "Confirm your subscription",
				from: formatSender(from.name ?? "Newsletter", from.email),
				html: appendUnsubscribe(
					`<p><a href="${escapeHtml(url)}">Confirm your subscription</a></p><p>This link expires in 24 hours.</p>`,
					tokenUrl(base, "unsubscribe", receipt.unsubscribeToken),
				),
				idempotencyKey: receipt.record.key,
			});
		} catch (error) {
			await adapter.incrementOne({
				model: "newsletterSubscriber",
				where: [
					{ field: "id", value: latest.id, operator: "eq" },
					{ field: "confirmationToken", value: digest, operator: "eq" },
				],
				increment: {},
				set: {
					confirmationToken: null,
					confirmationExpiresAt: null,
					confirmationSentAt: null,
				},
			});
			throw error;
		}
	}

	async function deliverCampaign(id: string, dueBefore?: Date) {
		const current = await requireCampaign(adapter, id);
		if (current.status !== "draft" && current.status !== "scheduled")
			fail(
				409,
				"Campaign has already started sending",
				"CAMPAIGN_ALREADY_STARTED",
			);
		const campaign =
			(await mutations.claimCampaign(adapter, id, current.status, dueBefore)) ??
			fail(
				409,
				"Campaign has already started sending",
				"CAMPAIGN_ALREADY_STARTED",
			);
		const tags = JSON.parse(campaign.tags || "[]") as string[];
		const recipients = (
			await getAllRows<SubscriberRecord>(adapter, "newsletterSubscriber", [
				{ field: "status", value: "subscribed", operator: "eq" },
			])
		).filter(
			(subscriber) =>
				!tags.length ||
				(JSON.parse(subscriber.tags || "[]") as string[]).some((tag) =>
					tags.includes(tag),
				),
		);
		const body = renderEmailBody(campaign);
		for (const recipient of recipients) {
			// Recheck consent after audience selection, including while earlier recipients send.
			const subscriber = await getSubscriberRecord(adapter, recipient.id);
			if (subscriber?.status !== "subscribed") continue;
			const receipt = await mutations.createSendReceipt(
				adapter,
				campaign.id,
				subscriber.id,
			);
			const tracked = trackEmailLinks(body, base, receipt.trackingToken);
			await adapter.update({
				model: "newsletterSend",
				where: [{ field: "id", value: receipt.record.id, operator: "eq" }],
				update: { links: JSON.stringify(tracked.links) },
			});
			const html = `${appendUnsubscribe(tracked.html, tokenUrl(base, "unsubscribe", receipt.unsubscribeToken))}<img src="${escapeHtml(tokenUrl(base, "track/open", receipt.trackingToken))}" width="1" height="1" alt="" />`;
			let result: { messageId?: string };
			try {
				result = await options.emailAdapter.send({
					to: subscriber.email,
					from: formatSender(campaign.fromName, campaign.fromEmail),
					replyTo: campaign.replyTo ?? undefined,
					subject: campaign.subject,
					html,
					idempotencyKey: receipt.record.key,
				});
			} catch {
				await adapter.update({
					model: "newsletterSend",
					where: [{ field: "id", value: receipt.record.id, operator: "eq" }],
					update: { status: "failed" },
				});
				continue;
			}
			await adapter.update({
				model: "newsletterSend",
				where: [{ field: "id", value: receipt.record.id, operator: "eq" }],
				update: {
					status: "delivered",
					sentAt: new Date(),
					messageId: result.messageId,
				},
			});
		}
		const sent = await adapter.update<CampaignRecord>({
			model: "newsletterCampaign",
			where: [{ field: "id", value: campaign.id, operator: "eq" }],
			update: { status: "sent", sentAt: new Date(), updatedAt: new Date() },
		});
		return serializeCampaign(
			sent ?? fail(409, "Campaign changed while sending"),
		);
	}

	return {
		listSubscribers: defineOperation({
			input: listSubscribersSchema,
			permission: permissions.subscriber.read,
			facts: () => ({ scope: "collection" as const }),
			execute: ({ input }) => listSubscribers(adapter, input),
		}),
		getSubscriber: defineOperation({
			input: idSchema,
			permission: permissions.subscriber.read,
			facts: ({ input }) => ({
				scope: "record" as const,
				subscriberId: input.id,
			}),
			execute: async ({ input }) =>
				serializeSubscriber(await requireSubscriber(adapter, input.id)),
		}),
		createSubscriber: defineOperation({
			input: createSubscriberSchema,
			permission: permissions.subscriber.create,
			facts: () => undefined,
			execute: async ({ input }) => {
				if (await getSubscriberByEmail(adapter, input.email))
					fail(409, "This email is already in the subscriber list");
				return serializeSubscriber(
					await mutations.createSubscriber(adapter, {
						...input,
						tags: [...input.tags],
					}),
				);
			},
		}),
		updateSubscriber: defineOperation({
			input: subscriberUpdateInput,
			permission: permissions.subscriber.update,
			facts: ({ input }) => subscriberFacts(adapter, input.id),
			execute: async ({ input }) => {
				if (input.data.email) {
					const existing = await getSubscriberByEmail(
						adapter,
						input.data.email,
					);
					if (existing && existing.id !== input.id)
						fail(409, "This email is already in the subscriber list");
				}
				const subscriber = await mutations.updateSubscriber(adapter, input.id, {
					...input.data,
					tags: input.data.tags ? [...input.data.tags] : undefined,
				});
				return serializeSubscriber(
					subscriber ?? fail(404, "Subscriber not found"),
				);
			},
		}),
		deleteSubscriber: defineOperation({
			input: idSchema,
			permission: permissions.subscriber.delete,
			facts: ({ input }) => subscriberFacts(adapter, input.id),
			execute: async ({ input }) => {
				await adapter.delete({
					model: "newsletterSubscriber",
					where: [{ field: "id", value: input.id, operator: "eq" }],
				});
				await adapter.deleteMany({
					model: "newsletterSend",
					where: [{ field: "subscriberId", value: input.id, operator: "eq" }],
				});
				return { success: true as const };
			},
		}),
		importSubscribers: defineOperation({
			input: importSubscribersSchema,
			permission: permissions.subscriber.import,
			facts: () => undefined,
			execute: async ({ input }) => {
				// Validate the complete file before the first write; never partially import malformed CSV.
				let rows: z.output<typeof createSubscriberSchema>[];
				try {
					rows = parseSubscriberCsv(input.csv).map((row) =>
						createSubscriberSchema.parse({
							email: row.email,
							name: row.name || undefined,
							status: row.status || "subscribed",
							tags: row.tags
								? row.tags.startsWith("[")
									? JSON.parse(row.tags)
									: row.tags
											.split(";")
											.map((tag) => tag.trim())
											.filter(Boolean)
								: [],
						}),
					);
				} catch (error) {
					if (error instanceof OperationHttpError) throw error;
					fail(
						400,
						"CSV contains an invalid email, status, or tags",
						"INVALID_CSV",
					);
				}
				let imported = 0;
				for (const row of rows) {
					// Existing opt-outs and audience tags survive an accidental repeated import.
					if (await getSubscriberByEmail(adapter, row.email)) continue;
					await mutations.createSubscriber(adapter, row);
					imported++;
				}
				return { imported };
			},
		}),
		exportSubscribers: defineOperation({
			input: empty,
			permission: permissions.subscriber.export,
			facts: () => undefined,
			execute: async () => ({
				csv: exportSubscriberCsv(
					(
						await getAllRows<SubscriberRecord>(adapter, "newsletterSubscriber")
					).map(serializeSubscriber),
				),
			}),
		}),
		subscribe: defineOperation({
			input: subscribeSchema,
			permission: permissions.subscriber.subscribe,
			access: "public",
			facts: () => undefined,
			before: ({ input, request }) =>
				hooks?.onBeforeSubscribe?.(input.email, { request }),
			execute: async ({ input, request }) => {
				const { subscriber, created } = await mutations.findOrCreateSubscriber(
					adapter,
					{
						...input,
						tags: [...input.tags],
						status: options.doubleOptIn ? "unsubscribed" : "subscribed",
					},
				);
				if (!created) {
					if (
						subscriber.status === "unsubscribed" &&
						(options.doubleOptIn ||
							options.confirmationFrom ||
							hooks?.onConfirmationRequired)
					)
						await sendConfirmation(subscriber);
					return genericSubscriptionResult;
				}
				if (options.doubleOptIn) await sendConfirmation(subscriber);
				else
					await hooks?.onAfterSubscribe?.(serializeSubscriber(subscriber), {
						request,
					});
				return genericSubscriptionResult;
			},
		}),
		confirmSubscription: defineOperation({
			input: tokenSchema,
			permission: permissions.subscriber.confirm,
			access: "public",
			facts: () => undefined,
			execute: async ({ input, request }) => {
				const subscriber = await adapter.incrementOne<SubscriberRecord>({
					model: "newsletterSubscriber",
					where: [
						{
							field: "confirmationToken",
							value: mutations.hashToken(input.token),
							operator: "eq",
						},
						{
							field: "confirmationExpiresAt",
							value: new Date(),
							operator: "gt",
						},
					],
					increment: {},
					set: {
						confirmationToken: null,
						confirmationExpiresAt: null,
						status: "subscribed",
						confirmedAt: new Date(),
					},
				});
				if (!subscriber)
					fail(
						400,
						"Confirmation link is invalid or expired",
						"INVALID_CONFIRMATION",
					);
				await hooks?.onAfterSubscribe?.(serializeSubscriber(subscriber), {
					request,
				});
				return {
					success: true as const,
					message: "Your subscription is confirmed.",
				};
			},
		}),
		unsubscribe: defineOperation({
			input: tokenSchema,
			permission: permissions.subscriber.unsubscribe,
			access: "public",
			facts: () => undefined,
			execute: async ({ input, request }) => {
				const receipt = await findReceipt(
					adapter,
					"unsubscribeToken",
					input.token,
				);
				const subscriber = await requireSubscriber(
					adapter,
					receipt.subscriberId,
				);
				if (
					subscriber.status !== "unsubscribed" ||
					subscriber.confirmationToken
				) {
					await hooks?.onBeforeUnsubscribe?.(serializeSubscriber(subscriber), {
						request,
					});
					const updated = await adapter.update<SubscriberRecord>({
						model: "newsletterSubscriber",
						where: [{ field: "id", value: subscriber.id, operator: "eq" }],
						update: {
							status: "unsubscribed",
							confirmationToken: null,
							confirmationExpiresAt: null,
						},
					});
					if (updated)
						await hooks?.onAfterUnsubscribe?.(serializeSubscriber(updated), {
							request,
						});
				}
				return {
					success: true as const,
					message: "You have been unsubscribed.",
				};
			},
		}),
		listCampaigns: defineOperation({
			input: listCampaignsSchema,
			permission: permissions.campaign.read,
			facts: () => ({ scope: "collection" as const }),
			execute: ({ input }) => listCampaigns(adapter, input),
		}),
		getCampaign: defineOperation({
			input: idSchema,
			permission: permissions.campaign.read,
			facts: ({ input }) => ({
				scope: "record" as const,
				campaignId: input.id,
			}),
			execute: async ({ input }) =>
				serializeCampaign(await requireCampaign(adapter, input.id)),
		}),
		createCampaign: defineOperation({
			input: createCampaignSchema,
			permission: permissions.campaign.create,
			facts: () => undefined,
			execute: async ({ input }) =>
				serializeCampaign(
					await mutations.createCampaign(adapter, {
						...input,
						tags: [...input.tags],
					}),
				),
		}),
		updateCampaign: defineOperation({
			input: campaignUpdateInput,
			permission: permissions.campaign.update,
			facts: ({ input }) => campaignFacts(adapter, input.id),
			execute: async ({ input }) =>
				serializeCampaign(
					await mutations.updateCampaign(adapter, input.id, {
						...input.data,
						tags: input.data.tags ? [...input.data.tags] : undefined,
					}),
				),
		}),
		deleteCampaign: defineOperation({
			input: idSchema,
			permission: permissions.campaign.delete,
			facts: ({ input }) => campaignFacts(adapter, input.id),
			execute: async ({ input }) => {
				const current = await requireCampaign(adapter, input.id);
				if (current.status === "sending" || current.status === "sent")
					fail(409, "Only draft or scheduled campaigns can be deleted");
				const removed = await adapter.consumeOne<CampaignRecord>({
					model: "newsletterCampaign",
					where: [
						{ field: "id", value: input.id, operator: "eq" },
						{ field: "status", value: current.status, operator: "eq" },
					],
				});
				if (!removed) fail(409, "Campaign changed while deleting");
				return { success: true as const };
			},
		}),
		sendCampaign: defineOperation({
			input: idSchema,
			permission: permissions.campaign.send,
			facts: ({ input }) => campaignFacts(adapter, input.id),
			execute: ({ input }) => deliverCampaign(input.id),
			after: ({ result, request }) => hooks?.onAfterSend?.(result, { request }),
		}),
		scheduleCampaign: defineOperation({
			input: scheduleInput,
			permission: permissions.campaign.schedule,
			facts: ({ input }) => campaignFacts(adapter, input.id),
			execute: async ({ input }) => {
				const scheduledAt = new Date(input.scheduledAt);
				if (scheduledAt.getTime() <= Date.now())
					fail(400, "Choose a future send time");
				const current = await requireCampaign(adapter, input.id);
				if (current.status !== "draft" && current.status !== "scheduled")
					fail(409, "Campaign has already started sending");
				const scheduled = await adapter.incrementOne<CampaignRecord>({
					model: "newsletterCampaign",
					where: [
						{ field: "id", value: input.id, operator: "eq" },
						{ field: "status", value: current.status, operator: "eq" },
					],
					increment: {},
					set: { status: "scheduled", scheduledAt, updatedAt: new Date() },
				});
				return serializeCampaign(
					scheduled ?? fail(409, "Campaign changed while scheduling"),
				);
			},
		}),
		sendTestEmail: defineOperation({
			input: testInput,
			permission: permissions.campaign.test,
			facts: ({ input }) => campaignFacts(adapter, input.id),
			execute: async ({ input }) => {
				const campaign = await requireCampaign(adapter, input.id);
				// A test address is recorded as opted out, never enrolled into campaigns.
				const { subscriber } = await mutations.findOrCreateSubscriber(adapter, {
					email: input.email,
					status: "unsubscribed",
					tags: [],
				});
				const receipt = await mutations.createSendReceipt(
					adapter,
					`test-${crypto.randomUUID()}`,
					subscriber.id,
				);
				await options.emailAdapter.send({
					to: input.email,
					subject: `[Test] ${campaign.subject}`,
					from: formatSender(campaign.fromName, campaign.fromEmail),
					replyTo: campaign.replyTo ?? undefined,
					html: appendUnsubscribe(
						renderEmailBody(campaign),
						tokenUrl(base, "unsubscribe", receipt.unsubscribeToken),
					),
					idempotencyKey: receipt.record.key,
				});
				return { success: true as const };
			},
		}),
		getCampaignStats: defineOperation({
			input: idSchema,
			permission: permissions.analytics.read,
			facts: () => undefined,
			execute: async ({ input }) => {
				await requireCampaign(adapter, input.id);
				return getCampaignStats(adapter, input.id);
			},
		}),
		getSubscriberGrowth: defineOperation({
			input: empty,
			permission: permissions.analytics.read,
			facts: () => undefined,
			execute: () => getSubscriberGrowth(adapter),
		}),
		trackOpen: definePassthroughOperation({
			input: tokenSchema,
			permission: permissions.analytics.track,
			access: "public",
			facts: () => undefined,
			execute: async ({ input }) => {
				const receipt = await findReceipt(
					adapter,
					"trackingToken",
					input.token,
				);
				if (!receipt.openedAt)
					await adapter.update({
						model: "newsletterSend",
						where: [{ field: "id", value: receipt.id, operator: "eq" }],
						update: { openedAt: new Date() },
					});
				return new Response(
					Uint8Array.from(
						Buffer.from(
							"R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
							"base64",
						),
					),
					{
						headers: {
							"Content-Type": "image/gif",
							"Cache-Control": "no-store, private",
							"Referrer-Policy": "no-referrer",
						},
					},
				);
			},
		}),
		trackClick: definePassthroughOperation({
			input: clickInput,
			permission: permissions.analytics.track,
			access: "public",
			facts: () => undefined,
			execute: async ({ input }) => {
				const receipt = await findReceipt(
					adapter,
					"trackingToken",
					input.token,
				);
				const destination = (JSON.parse(receipt.links) as string[])[input.link];
				if (!destination) fail(404, "Link not found");
				if (!receipt.clickedAt)
					await adapter.update({
						model: "newsletterSend",
						where: [{ field: "id", value: receipt.id, operator: "eq" }],
						update: {
							clickedAt: new Date(),
							...(!receipt.openedAt ? { openedAt: new Date() } : {}),
						},
					});
				return new Response(null, {
					status: 302,
					headers: {
						Location: destination,
						"Cache-Control": "no-store, private",
						"Referrer-Policy": "no-referrer",
					},
				});
			},
		}),
		sendScheduledCampaigns: defineOperation({
			input: empty,
			permission: permissions.scheduler.run,
			facts: () => undefined,
			execute: async ({ request }) => {
				const due = (
					await getAllRows<CampaignRecord>(adapter, "newsletterCampaign", [
						{ field: "status", value: "scheduled", operator: "eq" },
					])
				).filter(
					(campaign) =>
						campaign.scheduledAt &&
						new Date(campaign.scheduledAt).getTime() <= Date.now(),
				);
				let sent = 0;
				for (const campaign of due) {
					try {
						const result = await deliverCampaign(campaign.id, new Date());
						await hooks?.onAfterSend?.(result, { request });
						sent++;
					} catch (error) {
						if (
							!(
								error instanceof OperationHttpError &&
								error.code === "CAMPAIGN_ALREADY_STARTED"
							)
						)
							throw error;
					}
				}
				return { sent };
			},
		}),
		sendTransactionalEmail: defineOperation({
			input: transactionalEmailSchema,
			permission: permissions.transactional.send,
			facts: () => undefined,
			execute: async ({ input }) => {
				const { subscriber } = await mutations.findOrCreateSubscriber(adapter, {
					email: input.to,
					status: "unsubscribed",
					tags: [],
				});
				const receipt = await mutations.createSendReceipt(
					adapter,
					`transactional-${crypto.randomUUID()}`,
					subscriber.id,
				);
				return options.emailAdapter.send({
					...input,
					html: appendUnsubscribe(
						input.html,
						tokenUrl(base, "unsubscribe", receipt.unsubscribeToken),
					),
					idempotencyKey: receipt.record.key,
				});
			},
		}),
	};
}
