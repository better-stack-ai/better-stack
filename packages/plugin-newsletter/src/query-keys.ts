import {
	createResourceQueryKeys,
	type ResourceClient,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type { StackIdentity } from "@btst/stack/context";
import type {
	Campaign,
	CampaignStats,
	Subscriber,
	SubscriberGrowth,
} from "./types";

/** Cache partition for protected newsletter data, including unresolved identities. */
export type NewsletterIdentityPartition =
	| StackIdentity
	| `pending:${number}`
	| `error:${number}`;

/** Sender, content and audience for a campaign draft. */
export interface CampaignInput {
	subject: string;
	fromName: string;
	fromEmail: string;
	replyTo?: string;
	body: string;
	format?: "markdown" | "html";
	tags?: string[];
}

/** Campaign patch; null explicitly clears the reply-to header. */
export type CampaignUpdateInput = Omit<Partial<CampaignInput>, "replyTo"> & {
	replyTo?: string | null;
};

/** Subscriber details accepted by the administration endpoints. */
export interface SubscriberInput {
	email: string;
	name?: string;
	tags?: string[];
	status?: "subscribed" | "unsubscribed" | "bounced";
}

/** Subscriber search and page parameters. */
export interface SubscriberListParams {
	query?: string;
	status?: string;
	tag?: string;
	limit?: number;
	offset?: number;
}

export const newsletterResources = {
	newsletterSubscribers: {
		queries: {
			list: {
				path: "/newsletter/subscribers",
				query: (
					params: SubscriberListParams = {},
					_identity?: NewsletterIdentityPartition,
				) => ({ ...params }),
				select: (data: unknown): { items: Subscriber[]; total: number } =>
					data as { items: Subscriber[]; total: number },
			},
			export: {
				path: "/newsletter/subscribers/export",
				key: (identity?: NewsletterIdentityPartition) => [identity],
				select: (data: unknown): { csv: string } => data as { csv: string },
			},
		},
		mutations: {
			create: {
				path: "@post/newsletter/subscribers",
				method: "POST",
				input: (body: SubscriberInput) => ({ body }),
				select: (data: unknown): Subscriber => data as Subscriber,
				invalidates: ["newsletterSubscribers", "newsletterGrowth"],
				refresh: false,
			},
			update: {
				path: "@put/newsletter/subscribers/:id",
				method: "PUT",
				input: ({
					id,
					data,
				}: {
					id: string;
					data: Partial<SubscriberInput>;
				}) => ({ params: { id }, body: data }),
				invalidates: ["newsletterSubscribers", "newsletterGrowth"],
				refresh: false,
			},
			delete: {
				path: "@delete/newsletter/subscribers/:id",
				method: "DELETE",
				input: (id: string) => ({ params: { id } }),
				invalidates: ["newsletterSubscribers", "newsletterGrowth"],
				refresh: false,
			},
			import: {
				path: "@post/newsletter/subscribers/import",
				method: "POST",
				input: (csv: string) => ({ body: { csv } }),
				select: (data: unknown): { imported: number } =>
					data as { imported: number },
				invalidates: ["newsletterSubscribers", "newsletterGrowth"],
				refresh: false,
			},
		},
	},
	newsletterCampaigns: {
		queries: {
			list: {
				path: "/newsletter/campaigns",
				query: (
					params: { limit?: number; offset?: number } = {},
					_identity?: NewsletterIdentityPartition,
				) => ({ ...params }),
				select: (data: unknown): { items: Campaign[]; total: number } =>
					data as { items: Campaign[]; total: number },
			},
			detail: {
				path: "/newsletter/campaigns/:id",
				params: (id: string, _identity?: NewsletterIdentityPartition) => ({
					id,
				}),
				select: (data: unknown): Campaign => data as Campaign,
			},
			stats: {
				path: "/newsletter/campaigns/:id/stats",
				params: (id: string, _identity?: NewsletterIdentityPartition) => ({
					id,
				}),
				select: (data: unknown): CampaignStats => data as CampaignStats,
			},
		},
		mutations: {
			create: {
				path: "@post/newsletter/campaigns",
				method: "POST",
				input: (body: CampaignInput) => ({ body }),
				select: (data: unknown): Campaign => data as Campaign,
				invalidates: ["newsletterCampaigns"],
				refresh: false,
			},
			update: {
				path: "@put/newsletter/campaigns/:id",
				method: "PUT",
				input: ({ id, data }: { id: string; data: CampaignUpdateInput }) => ({
					params: { id },
					body: data,
				}),
				select: (data: unknown): Campaign => data as Campaign,
				invalidates: ["newsletterCampaigns"],
				refresh: false,
			},
			delete: {
				path: "@delete/newsletter/campaigns/:id",
				method: "DELETE",
				input: (id: string) => ({ params: { id } }),
				invalidates: ["newsletterCampaigns"],
				refresh: false,
			},
			send: {
				path: "@post/newsletter/campaigns/:id/send",
				method: "POST",
				input: (id: string) => ({ params: { id }, body: {} }),
				select: (data: unknown): Campaign => data as Campaign,
				invalidates: ["newsletterCampaigns"],
				refresh: false,
			},
			test: {
				path: "@post/newsletter/campaigns/:id/test",
				method: "POST",
				input: ({ id, email }: { id: string; email: string }) => ({
					params: { id },
					body: { email },
				}),
				refresh: false,
			},
			schedule: {
				path: "@post/newsletter/campaigns/:id/schedule",
				method: "POST",
				input: ({ id, scheduledAt }: { id: string; scheduledAt: string }) => ({
					params: { id },
					body: { scheduledAt },
				}),
				invalidates: ["newsletterCampaigns"],
				refresh: false,
			},
		},
	},
	newsletterGrowth: {
		queries: {
			list: {
				path: "/newsletter/growth",
				key: (identity?: NewsletterIdentityPartition) => [identity],
				select: (data: unknown): SubscriberGrowth => data as SubscriberGrowth,
			},
		},
	},
} satisfies ResourcesDeclaration;

/** Build server-safe query keys matching the newsletter's generated client hooks. */
export function createNewsletterQueryKeys(
	client: ResourceClient,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, newsletterResources, headers);
}
