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
	resolveCampaignRecipientSchema,
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
	getCampaignRecovery,
	getSubscriberByEmail,
	getSubscriberGrowth,
	getSubscriberRecord,
	listCampaigns,
	listSubscribers,
} from "./getters";
import * as mutations from "./mutations";
import { EmailDeliveryError } from "./email-adapter";
import { serializeCampaign, serializeSubscriber } from "./serializers";
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
				{ field: "email", value: latest.email, operator: "eq" },
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
				await hooks.onConfirmationRequired({ email: latest.email, url });
				return;
			}
			const from =
				options.confirmationFrom ??
				fail(500, "A confirmation sender is required");
			const receipt = await mutations.createSendReceipt(
				adapter,
				`confirmation-${crypto.randomUUID()}`,
				subscriber.id,
				latest.email,
			);
			await options.emailAdapter.send({
				to: latest.email,
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

	async function completeCampaign(campaign: CampaignRecord) {
		const recovery = await getCampaignRecovery(adapter, campaign.id);
		const expected = campaign.audience
			? JSON.parse(campaign.audience).length
			: -1;
		const complete =
			recovery.items.length === expected &&
			recovery.items.every(
				(row) =>
					row.status === "delivered" ||
					row.status === "skipped" ||
					row.status === "bounced",
			);
		if (complete) {
			await adapter.incrementOne({
				model: "newsletterCampaign",
				where: [
					{ field: "id", value: campaign.id, operator: "eq" },
					{ field: "status", value: "sending", operator: "eq" },
				],
				increment: {},
				set: { status: "sent", sentAt: new Date(), updatedAt: new Date() },
			});
		}
		return serializeCampaign(await requireCampaign(adapter, campaign.id));
	}

	async function dispatchRecipients(campaign: CampaignRecord) {
		if (campaign.audience == null)
			fail(
				409,
				"The original audience was not persisted; this legacy campaign cannot be resumed safely",
				"RECOVERY_AUDIENCE_UNAVAILABLE",
			);
		const audience = JSON.parse(campaign.audience) as {
			id: string;
			email: string;
		}[];
		const body = await renderEmailBody(campaign);
		// Materialize the entire frozen inventory before any transport I/O. Concurrent resumes converge on its unique keys.
		for (const recipient of audience) {
			await mutations.ensureCampaignSendReceipt(
				adapter,
				campaign.id,
				recipient.id,
				recipient.email,
				({ trackingToken, unsubscribeToken }) => {
					const tracked = trackEmailLinks(body, base, trackingToken);
					return {
						links: JSON.stringify(tracked.links),
						html: `${appendUnsubscribe(tracked.html, tokenUrl(base, "unsubscribe", unsubscribeToken))}<img src="${escapeHtml(tokenUrl(base, "track/open", trackingToken))}" width="1" height="1" alt="" />`,
					};
				},
			);
		}
		const receipts = await getAllRows<SendRecord>(adapter, "newsletterSend", [
			{ field: "campaignId", value: campaign.id, operator: "eq" },
		]);
		for (const receipt of receipts) {
			if (
				(receipt.status !== "pending" && receipt.status !== "failed") ||
				!receipt.html
			)
				continue;
			const attemptId = mutations.newToken();
			const claimed = await adapter.incrementOne<SendRecord>({
				model: "newsletterSend",
				where: [
					{ field: "id", value: receipt.id, operator: "eq" },
					{ field: "status", value: receipt.status, operator: "eq" },
					{
						field: "attemptCount",
						value: receipt.attemptCount ?? 0,
						operator: "eq",
					},
				],
				increment: { attemptCount: 1 },
				set: { status: "dispatching", attemptId, lastError: null },
			});
			if (!claimed) continue;
			const finish = (set: Record<string, unknown>) =>
				adapter.incrementOne({
					model: "newsletterSend",
					where: [
						{ field: "id", value: receipt.id, operator: "eq" },
						{ field: "status", value: "dispatching", operator: "eq" },
						{ field: "attemptId", value: attemptId, operator: "eq" },
					],
					increment: {},
					set,
				});
			// Address changes do not enroll a replacement address into the original audience.
			const subscriber = await getSubscriberRecord(
				adapter,
				receipt.subscriberId,
			);
			if (
				subscriber?.status !== "subscribed" ||
				subscriber.email !== receipt.email ||
				(options.doubleOptIn && !subscriber.confirmedAt)
			) {
				await finish({
					status: "skipped",
					lastError: "Recipient is no longer eligible",
				});
				continue;
			}
			let result: { messageId?: string };
			try {
				result = await options.emailAdapter.send({
					to: receipt.email,
					from: formatSender(campaign.fromName, campaign.fromEmail),
					replyTo: campaign.replyTo ?? undefined,
					subject: campaign.subject,
					html: receipt.html,
					idempotencyKey: receipt.key,
				});
			} catch (error) {
				const rejected = error instanceof EmailDeliveryError;
				await finish({
					status: rejected ? "failed" : "uncertain",
					lastError: rejected
						? "Provider definitively rejected the message"
						: "Provider acceptance is unknown; reconcile or explicitly resolve before retrying",
				});
				continue;
			}
			await finish({
				status: "delivered",
				sentAt: new Date(),
				messageId: result.messageId,
			});
		}
		return completeCampaign(campaign);
	}

	async function deliverCampaign(
		id: string,
		dueBefore?: Date,
		authorizedStatus?: CampaignRecord["status"],
	) {
		const current = await requireCampaign(adapter, id);
		if (authorizedStatus && current.status !== authorizedStatus)
			fail(409, "Campaign changed after authorization");
		if (current.status !== "draft" && current.status !== "scheduled")
			fail(
				409,
				"Campaign has already started sending",
				"CAMPAIGN_ALREADY_STARTED",
			);
		const tags = JSON.parse(current.tags || "[]") as string[];
		const audience = (
			await getAllRows<SubscriberRecord>(adapter, "newsletterSubscriber", [
				{ field: "status", value: "subscribed", operator: "eq" },
			])
		)
			.filter(
				(subscriber) =>
					(!options.doubleOptIn || subscriber.confirmedAt) &&
					(!tags.length ||
						(JSON.parse(subscriber.tags || "[]") as string[]).some((tag) =>
							tags.includes(tag),
						)),
			)
			.map(({ id, email }) => ({ id, email }));
		const campaign =
			(await mutations.claimCampaign(
				adapter,
				id,
				current.status,
				dueBefore,
				JSON.stringify(audience),
				current.updatedAt,
			)) ??
			fail(
				409,
				"Campaign changed or has already started sending",
				"CAMPAIGN_ALREADY_STARTED",
			);
		return dispatchRecipients(campaign);
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
			execute: async ({ input, facts }) => {
				if (input.data.email) {
					const existing = await getSubscriberByEmail(
						adapter,
						input.data.email,
					);
					if (existing && existing.id !== input.id)
						fail(409, "This email is already in the subscriber list");
				}
				const subscriber = await mutations.updateSubscriber(
					adapter,
					input.id,
					{
						...input.data,
						tags: input.data.tags ? [...input.data.tags] : undefined,
					},
					facts.status,
				);
				return serializeSubscriber(
					subscriber ?? fail(404, "Subscriber not found"),
				);
			},
		}),
		deleteSubscriber: defineOperation({
			input: idSchema,
			permission: permissions.subscriber.delete,
			facts: ({ input }) => subscriberFacts(adapter, input.id),
			execute: async ({ input, facts }) => {
				const removed = await adapter.consumeOne<SubscriberRecord>({
					model: "newsletterSubscriber",
					where: [
						{ field: "id", value: input.id, operator: "eq" },
						{ field: "status", value: facts.status, operator: "eq" },
					],
				});
				if (!removed) fail(409, "Subscriber changed after authorization");
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
				let { subscriber, created } = await mutations.findOrCreateSubscriber(
					adapter,
					{
						...input,
						tags: [...input.tags],
						status: options.doubleOptIn ? "unsubscribed" : "subscribed",
					},
				);
				if (!created && subscriber.transactionOnly) {
					const enrolled = await adapter.incrementOne<SubscriberRecord>({
						model: "newsletterSubscriber",
						where: [
							{ field: "id", value: subscriber.id, operator: "eq" },
							{ field: "email", value: input.email, operator: "eq" },
							{ field: "status", value: "unsubscribed", operator: "eq" },
							{ field: "transactionOnly", value: true, operator: "eq" },
						],
						increment: {},
						set: {
							transactionOnly: false,
							status: options.doubleOptIn ? "unsubscribed" : "subscribed",
							confirmedAt: options.doubleOptIn ? null : new Date(),
							name: input.name ?? subscriber.name,
							tags: JSON.stringify([...new Set(input.tags)]),
						},
					});
					if (enrolled) {
						subscriber = enrolled;
						created = true;
					}
				}
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
				if (receipt.email !== subscriber.email)
					fail(404, "Link not found or expired");
				if (
					subscriber.status !== "unsubscribed" ||
					subscriber.confirmationToken ||
					subscriber.transactionOnly
				) {
					await hooks?.onBeforeUnsubscribe?.(serializeSubscriber(subscriber), {
						request,
					});
					const updated = await adapter.incrementOne<SubscriberRecord>({
						model: "newsletterSubscriber",
						where: [
							{ field: "id", value: subscriber.id, operator: "eq" },
							{ field: "email", value: subscriber.email, operator: "eq" },
						],
						increment: {},
						set: {
							status: "unsubscribed",
							transactionOnly: false,
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
			execute: async ({ input, facts }) => {
				const current = await requireCampaign(adapter, input.id);
				if (current.status !== facts.status)
					fail(409, "Campaign changed after authorization");
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
			execute: ({ input, facts }) =>
				deliverCampaign(input.id, undefined, facts.status),
			after: ({ result, request }) =>
				result.status === "sent"
					? hooks?.onAfterSend?.(result, { request })
					: undefined,
		}),
		getCampaignRecovery: defineOperation({
			input: idSchema,
			permission: permissions.campaign.send,
			facts: ({ input }) => campaignFacts(adapter, input.id),
			execute: async ({ input }) => {
				await requireCampaign(adapter, input.id);
				return getCampaignRecovery(adapter, input.id);
			},
		}),
		resumeCampaign: defineOperation({
			input: idSchema,
			permission: permissions.campaign.send,
			facts: ({ input }) => campaignFacts(adapter, input.id),
			execute: async ({ input, facts }) => {
				const campaign = await requireCampaign(adapter, input.id);
				if (campaign.status !== facts.status)
					fail(409, "Campaign changed after authorization");
				if (campaign.status !== "sending" && campaign.status !== "sent")
					fail(409, "Only started campaigns can be resumed");
				return dispatchRecipients(campaign);
			},
			after: ({ result, request }) =>
				result.status === "sent"
					? hooks?.onAfterSend?.(result, { request })
					: undefined,
		}),
		reconcileCampaign: defineOperation({
			input: idSchema,
			permission: permissions.campaign.send,
			facts: ({ input }) => campaignFacts(adapter, input.id),
			execute: async ({ input, facts }) => {
				const campaign = await requireCampaign(adapter, input.id);
				if (campaign.status !== facts.status)
					fail(409, "Campaign changed after authorization");
				const receipts = await getAllRows<SendRecord>(
					adapter,
					"newsletterSend",
					[{ field: "campaignId", value: input.id, operator: "eq" }],
				);
				if (options.emailAdapter.reconcile) {
					for (const receipt of receipts) {
						if (
							receipt.status !== "uncertain" &&
							receipt.status !== "dispatching" &&
							!(
								campaign.audience == null &&
								(receipt.status === "pending" || receipt.status === "failed")
							)
						)
							continue;
						const evidence = await options.emailAdapter.reconcile({
							idempotencyKey: receipt.key,
							messageId: receipt.messageId,
						});
						if (
							evidence.status === "uncertain" ||
							(evidence.status === "failed" && receipt.status !== "uncertain")
						)
							continue;
						await adapter.incrementOne({
							model: "newsletterSend",
							where: [
								{ field: "id", value: receipt.id, operator: "eq" },
								{ field: "status", value: receipt.status, operator: "eq" },
								...(receipt.attemptId
									? [
											{
												field: "attemptId",
												value: receipt.attemptId,
												operator: "eq" as const,
											},
										]
									: []),
							],
							increment: {},
							set: {
								status: evidence.status,
								lastError: null,
								...(evidence.status === "delivered"
									? {
											messageId: evidence.messageId ?? receipt.messageId,
											sentAt: new Date(),
										}
									: {}),
							},
						});
					}
				}
				await completeCampaign(campaign);
				return getCampaignRecovery(adapter, input.id);
			},
		}),
		resolveCampaignRecipient: defineOperation({
			input: idSchema.extend({
				sendId: z.string().min(1).max(200),
				...resolveCampaignRecipientSchema.shape,
			}),
			permission: permissions.campaign.send,
			facts: ({ input }) => campaignFacts(adapter, input.id),
			execute: async ({ input, facts }) => {
				const campaign = await requireCampaign(adapter, input.id);
				if (campaign.status !== facts.status)
					fail(409, "Campaign changed after authorization");
				const receipt =
					(await adapter.findOne<SendRecord>({
						model: "newsletterSend",
						where: [
							{ field: "id", value: input.sendId, operator: "eq" },
							{ field: "campaignId", value: input.id, operator: "eq" },
						],
					})) ?? fail(404, "Recipient not found");
				const legacyUnknown =
					campaign.audience == null &&
					(receipt.status === "pending" || receipt.status === "failed");
				if (
					receipt.status !== "uncertain" &&
					receipt.status !== "dispatching" &&
					!legacyUnknown
				)
					fail(409, "Only uncertain outcomes need explicit resolution");
				// An unreturned call might still be running; a manager cannot turn it into retryable work.
				if (
					input.resolution === "failed" &&
					(receipt.status !== "uncertain" || legacyUnknown)
				)
					fail(
						409,
						"An active or interrupted request cannot safely be retried; confirm acceptance or skip it",
					);
				const updated = await adapter.incrementOne({
					model: "newsletterSend",
					where: [
						{ field: "id", value: receipt.id, operator: "eq" },
						{ field: "status", value: receipt.status, operator: "eq" },
						...(receipt.attemptId
							? [
									{
										field: "attemptId",
										value: receipt.attemptId,
										operator: "eq" as const,
									},
								]
							: []),
					],
					increment: {},
					set: {
						status: input.resolution,
						lastError: "Explicitly resolved by a manager",
						...(input.resolution === "delivered" ? { sentAt: new Date() } : {}),
					},
				});
				if (!updated) fail(409, "Recipient changed while resolving");
				await completeCampaign(campaign);
				return getCampaignRecovery(adapter, input.id);
			},
		}),
		scheduleCampaign: defineOperation({
			input: scheduleInput,
			permission: permissions.campaign.schedule,
			facts: ({ input }) => campaignFacts(adapter, input.id),
			execute: async ({ input, facts }) => {
				const scheduledAt = new Date(input.scheduledAt);
				if (scheduledAt.getTime() <= Date.now())
					fail(400, "Choose a future send time");
				const current = await requireCampaign(adapter, input.id);
				if (current.status !== facts.status)
					fail(409, "Campaign changed after authorization");
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
			execute: async ({ input, facts }) => {
				const campaign = await requireCampaign(adapter, input.id);
				if (campaign.status !== facts.status)
					fail(409, "Campaign changed after authorization");
				// A test address stays outside campaign audiences until an explicit subscription.
				const { subscriber } = await mutations.findOrCreateSubscriber(
					adapter,
					{
						email: input.email,
						status: "unsubscribed",
						tags: [],
					},
					true,
				);
				const receipt = await mutations.createSendReceipt(
					adapter,
					`test-${crypto.randomUUID()}`,
					subscriber.id,
					input.email,
				);
				await options.emailAdapter.send({
					to: input.email,
					subject: `[Test] ${campaign.subject}`,
					from: formatSender(campaign.fromName, campaign.fromEmail),
					replyTo: campaign.replyTo ?? undefined,
					html: appendUnsubscribe(
						await renderEmailBody(campaign),
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
						if (result.status === "sent") {
							await hooks?.onAfterSend?.(result, { request });
							sent++;
						}
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
				const { subscriber } = await mutations.findOrCreateSubscriber(
					adapter,
					{
						email: input.to,
						status: "unsubscribed",
						tags: [],
					},
					true,
				);
				const receipt = await mutations.createSendReceipt(
					adapter,
					`transactional-${crypto.randomUUID()}`,
					subscriber.id,
					input.to,
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
