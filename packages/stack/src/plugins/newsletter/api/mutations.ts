import { createHash, randomBytes } from "node:crypto";
import type { DBAdapter as Adapter } from "@btst/db";
import { OperationHttpError } from "@btst/stack/plugins/api";
import type { z } from "zod";
import type {
	createSubscriberSchema,
	createCampaignSchema,
	updateCampaignSchema,
	updateSubscriberSchema,
} from "../schemas";
import type { CampaignRecord, SendRecord, SubscriberRecord } from "../types";
import { getSubscriberByEmail } from "./getters";

/** Hash a bearer token before persisting it. Callers own validation and authorization. */
export function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}
export function newToken(): string {
	return randomBytes(32).toString("hex");
}

const emailQueues = new WeakMap<Adapter, Map<string, Promise<unknown>>>();

async function withSubscriberEmail<T>(
	adapter: Adapter,
	email: string,
	run: () => Promise<T>,
): Promise<T> {
	let queues = emailQueues.get(adapter);
	if (!queues) {
		queues = new Map();
		emailQueues.set(adapter, queues);
	}
	const previous = queues.get(email) ?? Promise.resolve();
	const operation = previous.catch(() => {}).then(run);
	queues.set(email, operation);
	try {
		return await operation;
	} finally {
		if (queues.get(email) === operation) queues.delete(email);
	}
}

async function insertSubscriber(
	adapter: Adapter,
	input: z.output<typeof createSubscriberSchema>,
) {
	return adapter.create<SubscriberRecord>({
		model: "newsletterSubscriber",
		data: {
			...input,
			tags: JSON.stringify([...new Set(input.tags)]),
			confirmedAt: input.status === "subscribed" ? new Date() : null,
			confirmationToken: null,
			confirmationExpiresAt: null,
			confirmationSentAt: null,
			createdAt: new Date(),
		},
	});
}

/** Lower-level write: callers own validation, authorization and lifecycle hooks. */
export function createSubscriber(
	adapter: Adapter,
	input: z.output<typeof createSubscriberSchema>,
) {
	return withSubscriberEmail(adapter, input.email, async () => {
		if (await getSubscriberByEmail(adapter, input.email))
			throw new OperationHttpError(
				409,
				"This email is already in the subscriber list",
				"SUBSCRIBER_EXISTS",
			);
		try {
			return await insertSubscriber(adapter, input);
		} catch (error) {
			if (await getSubscriberByEmail(adapter, input.email))
				throw new OperationHttpError(
					409,
					"This email is already in the subscriber list",
					"SUBSCRIBER_EXISTS",
				);
			throw error;
		}
	});
}

/** Preserve existing consent and audience tags when concurrent public or transactional requests share an address. */
export function findOrCreateSubscriber(
	adapter: Adapter,
	input: z.output<typeof createSubscriberSchema>,
) {
	return withSubscriberEmail(adapter, input.email, async () => {
		const existing = await getSubscriberByEmail(adapter, input.email);
		if (existing) return { subscriber: existing, created: false };
		try {
			return {
				subscriber: await insertSubscriber(adapter, input),
				created: true,
			};
		} catch (error) {
			const winner = await getSubscriberByEmail(adapter, input.email);
			if (winner) return { subscriber: winner, created: false };
			throw error;
		}
	});
}
/** Lower-level write: callers own validation, authorization and lifecycle hooks. */
export function updateSubscriber(
	adapter: Adapter,
	id: string,
	input: z.output<typeof updateSubscriberSchema>,
) {
	return adapter.update<SubscriberRecord>({
		model: "newsletterSubscriber",
		where: [{ field: "id", value: id, operator: "eq" }],
		update: {
			...input,
			...(input.tags ? { tags: JSON.stringify([...new Set(input.tags)]) } : {}),
			...(input.status
				? {
						confirmationToken: null,
						confirmationExpiresAt: null,
						confirmedAt: input.status === "subscribed" ? new Date() : null,
					}
				: {}),
		},
	});
}
/** Lower-level write: callers own validation, authorization and lifecycle hooks. */
export function createCampaign(
	adapter: Adapter,
	input: z.output<typeof createCampaignSchema>,
) {
	return adapter.create<CampaignRecord>({
		model: "newsletterCampaign",
		data: {
			...input,
			tags: JSON.stringify([...new Set(input.tags)]),
			status: "draft",
			scheduledAt: null,
			sentAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}
/** Atomically guard draft edits against a concurrent send or schedule. Callers own authorization. */
export async function updateCampaign(
	adapter: Adapter,
	id: string,
	input: z.output<typeof updateCampaignSchema>,
) {
	const result = await adapter.incrementOne<CampaignRecord>({
		model: "newsletterCampaign",
		where: [
			{ field: "id", value: id, operator: "eq" },
			{ field: "status", value: "draft", operator: "eq" },
		],
		increment: {},
		set: {
			...input,
			...(input.tags ? { tags: JSON.stringify([...new Set(input.tags)]) } : {}),
			updatedAt: new Date(),
		},
	});
	if (!result)
		throw new OperationHttpError(
			409,
			"Only draft campaigns can be edited",
			"CAMPAIGN_NOT_DRAFT",
		);
	return result;
}
/** Claim a campaign once across concurrent workers; never automatically retry an uncertain delivery. */
export function claimCampaign(
	adapter: Adapter,
	id: string,
	status: "draft" | "scheduled",
	dueBefore?: Date,
) {
	return adapter.incrementOne<CampaignRecord>({
		model: "newsletterCampaign",
		where: [
			{ field: "id", value: id, operator: "eq" },
			{ field: "status", value: status, operator: "eq" },
			...(dueBefore
				? [{ field: "scheduledAt", value: dueBefore, operator: "lte" as const }]
				: []),
		],
		increment: {},
		set: { status: "sending", updatedAt: new Date() },
	});
}
/** Persist one recipient attempt before transport I/O. Callers own authorization and lifecycle. */
export async function createSendReceipt(
	adapter: Adapter,
	campaignId: string,
	subscriberId: string,
) {
	const trackingToken = newToken(),
		unsubscribeToken = newToken();
	const record = await adapter.create<SendRecord>({
		model: "newsletterSend",
		data: {
			key: `${campaignId}:${subscriberId}`,
			campaignId,
			subscriberId,
			status: "pending",
			trackingToken: hashToken(trackingToken),
			unsubscribeToken: hashToken(unsubscribeToken),
			links: "[]",
			sentAt: null,
			openedAt: null,
			clickedAt: null,
		},
	});
	return { record, trackingToken, unsubscribeToken };
}
