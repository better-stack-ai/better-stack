/** Lower-level reads bypass operation validation, authorization, and lifecycle hooks; callers own those checks. */
import type { DBAdapter as Adapter } from "@btst/db";
import type { z } from "zod";
import type { listSubscribersSchema, listCampaignsSchema } from "../schemas";
import type {
	CampaignRecord,
	CampaignStats,
	SendRecord,
	SubscriberGrowth,
	SubscriberRecord,
} from "../types";

import { serializeSubscriber, serializeCampaign } from "./serializers";

/** Read every page; adapter defaults must not silently truncate campaign audiences. */
export async function getAllRows<T>(
	adapter: Adapter,
	model: string,
	where?: { field: string; value: string; operator: "eq" }[],
): Promise<T[]> {
	const result: T[] = [];
	for (let offset = 0; ; offset += 200) {
		const page = await adapter.findMany<T>({
			model,
			where,
			limit: 200,
			offset,
			sortBy: { field: "id", direction: "asc" },
		});
		result.push(...page);
		if (page.length < 200) return result;
	}
}
export function getSubscriberRecord(adapter: Adapter, id: string) {
	return adapter.findOne<SubscriberRecord>({
		model: "newsletterSubscriber",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}
export function getSubscriberByEmail(adapter: Adapter, email: string) {
	return adapter.findOne<SubscriberRecord>({
		model: "newsletterSubscriber",
		where: [{ field: "email", value: email, operator: "eq" }],
	});
}
export function getCampaignRecord(adapter: Adapter, id: string) {
	return adapter.findOne<CampaignRecord>({
		model: "newsletterCampaign",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}
/** Read a filtered subscriber page. */
export async function listSubscribers(
	adapter: Adapter,
	query: z.output<typeof listSubscribersSchema>,
) {
	const rows = await getAllRows<SubscriberRecord>(
		adapter,
		"newsletterSubscriber",
		query.status
			? [{ field: "status", value: query.status, operator: "eq" }]
			: undefined,
	);
	const term = query.query?.toLowerCase();
	const matches = rows
		.map(serializeSubscriber)
		.filter(
			(subscriber) =>
				(!query.tag || subscriber.tags.includes(query.tag)) &&
				(!term ||
					`${subscriber.email} ${subscriber.name ?? ""}`
						.toLowerCase()
						.includes(term)),
		);
	matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return {
		items: matches.slice(query.offset, query.offset + query.limit),
		total: matches.length,
	};
}
/** Read a campaign page. */
export async function listCampaigns(
	adapter: Adapter,
	query: z.output<typeof listCampaignsSchema>,
) {
	const [rows, total] = await Promise.all([
		adapter.findMany<CampaignRecord>({
			model: "newsletterCampaign",
			limit: query.limit,
			offset: query.offset,
			sortBy: { field: "createdAt", direction: "desc" },
		}),
		adapter.count({ model: "newsletterCampaign" }),
	]);
	return { items: rows.map(serializeCampaign), total };
}
/** Count unique recipient events; opening repeatedly never inflates rates. */
export async function getCampaignStats(
	adapter: Adapter,
	campaignId: string,
): Promise<CampaignStats> {
	const rows = await getAllRows<SendRecord>(adapter, "newsletterSend", [
		{ field: "campaignId", value: campaignId, operator: "eq" },
	]);
	const delivered = rows.filter((row) => row.status === "delivered").length;
	const opened = rows.filter((row) => row.openedAt || row.clickedAt).length;
	const clicked = rows.filter((row) => row.clickedAt).length;
	return {
		recipientCount: rows.length,
		delivered,
		opened,
		clicked,
		bounced: rows.filter((row) => row.status === "bounced").length,
		failed: rows.filter((row) => row.status === "failed").length,
		openRate: delivered ? opened / delivered : 0,
		clickRate: delivered ? clicked / delivered : 0,
	};
}
/** Daily cumulative subscriber creation, including current status totals. */
export async function getSubscriberGrowth(
	adapter: Adapter,
): Promise<SubscriberGrowth> {
	const rows = await getAllRows<SubscriberRecord>(
		adapter,
		"newsletterSubscriber",
	);
	const dates = new Map<string, number>();
	for (const row of rows) {
		const day = new Date(row.createdAt).toISOString().slice(0, 10);
		dates.set(day, (dates.get(day) ?? 0) + 1);
	}
	let count = 0;
	return {
		total: rows.length,
		subscribed: rows.filter((row) => row.status === "subscribed").length,
		unsubscribed: rows.filter((row) => row.status === "unsubscribed").length,
		bounced: rows.filter((row) => row.status === "bounced").length,
		points: [...dates]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([date, added]) => ({ date, count: (count += added) })),
	};
}
