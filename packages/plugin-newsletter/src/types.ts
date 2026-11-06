import type { DeepReadonly } from "@btst/stack/plugins/api";

/** A newsletter subscriber. Secret management tokens are never included. */
export type Subscriber = {
	id: string;
	email: string;
	name?: string | null;
	status: "subscribed" | "unsubscribed" | "bounced";
	tags: string[];
	confirmedAt?: string | null;
	createdAt: string;
};

/** A campaign and its sending state. */
export type Campaign = {
	id: string;
	subject: string;
	/** Optional inbox preheader, rendered as escaped hidden text in outgoing email. */
	previewText?: string | null;
	fromName: string;
	fromEmail: string;
	replyTo?: string | null;
	body: string;
	format: "markdown" | "html";
	tags: string[];
	status: "draft" | "scheduled" | "sending" | "sent";
	scheduledAt?: string | null;
	sentAt?: string | null;
	createdAt: string;
	updatedAt: string;
};

/** Unique recipient counts; delivered means accepted by the configured adapter. */
export type CampaignStats = {
	recipientCount: number;
	delivered: number;
	opened: number;
	clicked: number;
	bounced: number;
	failed: number;
	uncertain: number;
	pending: number;
	skipped: number;
	openRate: number;
	clickRate: number;
};

/** Subscriber totals and daily cumulative subscription growth. */
export type SubscriberGrowth = {
	total: number;
	subscribed: number;
	unsubscribed: number;
	bounced: number;
	points: { date: string; count: number }[];
};

/** Lifecycle hooks run after input validation and operation authorization. */
export interface NewsletterPluginHooks {
	onBeforeSubscribe?: (
		email: string,
		context: { request?: Request },
	) => Promise<void> | void;
	onAfterSubscribe?: (
		subscriber: DeepReadonly<Subscriber>,
		context: { request?: Request },
	) => Promise<void> | void;
	onBeforeUnsubscribe?: (
		subscriber: DeepReadonly<Subscriber>,
		context: { request?: Request },
	) => Promise<void> | void;
	onAfterUnsubscribe?: (
		subscriber: DeepReadonly<Subscriber>,
		context: { request?: Request },
	) => Promise<void> | void;
	/** Send a confirmation message yourself instead of the default adapter message. */
	onConfirmationRequired?: (confirmation: {
		email: string;
		url: string;
	}) => Promise<void> | void;
	onAfterSend?: (
		campaign: DeepReadonly<Campaign>,
		context: { request?: Request },
	) => Promise<void> | void;
}

/** Internal database subscriber representation, including hashed bearer tokens. */
export interface SubscriberRecord
	extends Omit<Subscriber, "tags" | "confirmedAt" | "createdAt"> {
	tags: string;
	transactionOnly: boolean;
	confirmedAt?: Date | null;
	createdAt: Date;
	confirmationToken?: string | null;
	confirmationExpiresAt?: Date | null;
	confirmationSentAt?: Date | null;
}

/** Internal database campaign representation. */
export interface CampaignRecord
	extends Omit<
		Campaign,
		"tags" | "scheduledAt" | "sentAt" | "createdAt" | "updatedAt"
	> {
	tags: string;
	audience?: string | null;
	scheduledAt?: Date | null;
	sentAt?: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Internal per-recipient delivery receipt. */
export interface SendRecord {
	id: string;
	key: string;
	campaignId: string;
	subscriberId: string;
	email: string;
	status:
		| "pending"
		| "dispatching"
		| "uncertain"
		| "delivered"
		| "bounced"
		| "failed"
		| "skipped";
	attemptCount?: number;
	attemptId?: string | null;
	lastError?: string | null;
	html?: string | null;
	trackingToken: string;
	unsubscribeToken: string;
	links: string;
	messageId?: string;
	sentAt?: Date | null;
	openedAt?: Date | null;
	clickedAt?: Date | null;
}

/** Management-safe recipient outcome; secret tracking data and provider payloads are excluded. */
export type CampaignRecipient = {
	id: string;
	email: string;
	status: SendRecord["status"];
	attemptCount: number;
	lastError: string | null;
	messageId: string | null;
	/** Whether a settled uncertain request can explicitly be marked failed for retry. */
	canRetry: boolean;
};
/** Durable recovery inventory for the campaign's original audience. */
export type CampaignRecovery = {
	items: CampaignRecipient[];
	counts: Record<SendRecord["status"], number>;
	/** False for legacy campaigns without a frozen original audience. */
	audienceReady: boolean;
};
