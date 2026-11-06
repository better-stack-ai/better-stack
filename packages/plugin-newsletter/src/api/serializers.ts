import type {
	Subscriber,
	SubscriberRecord,
	Campaign,
	CampaignRecord,
} from "../types";

/** Serialize a subscriber without exposing bearer-token digests. */
export function serializeSubscriber(record: SubscriberRecord): Subscriber {
	return {
		id: record.id,
		email: record.email,
		name: record.name,
		status: record.status,
		tags: JSON.parse(record.tags || "[]"),
		confirmedAt: record.confirmedAt
			? new Date(record.confirmedAt).toISOString()
			: null,
		createdAt: new Date(record.createdAt).toISOString(),
	};
}
/** Serialize dates and tags for transport. */
export function serializeCampaign(record: CampaignRecord): Campaign {
	return {
		id: record.id,
		subject: record.subject,
		fromName: record.fromName,
		fromEmail: record.fromEmail,
		replyTo: record.replyTo,
		body: record.body,
		format: record.format,
		tags: JSON.parse(record.tags || "[]"),
		status: record.status,
		scheduledAt: record.scheduledAt
			? new Date(record.scheduledAt).toISOString()
			: null,
		sentAt: record.sentAt ? new Date(record.sentAt).toISOString() : null,
		createdAt: new Date(record.createdAt).toISOString(),
		updatedAt: new Date(record.updatedAt).toISOString(),
	};
}
