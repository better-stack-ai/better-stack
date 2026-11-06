export const feedbackStatuses = [
	"under_review",
	"planned",
	"in_progress",
	"shipped",
	"closed",
] as const;
/** A feature request’s review or delivery status. */
export type FeedbackStatus = (typeof feedbackStatuses)[number];

/** Public feature request with ISO timestamps and the current user’s vote state. */
export type FeedbackPost = {
	id: string;
	slug: string;
	title: string;
	body: string;
	category: string;
	status: FeedbackStatus;
	authorId: string;
	voteCount: number;
	isVoted: boolean;
	createdAt: string;
	updatedAt: string;
};
/** Stored feature request, including the transaction lock marker. */
export interface FeedbackPostRecord
	extends Omit<FeedbackPost, "isVoted" | "createdAt" | "updatedAt"> {
	lockVersion: string;
	createdAt: Date;
	updatedAt: Date;
}
/** Stored vote; the unique key encodes its post and user IDs. */
export interface FeedbackVote {
	id: string;
	key: string;
	postId: string;
	userId: string;
	createdAt: Date;
}
/** Published release note with its linked feature requests. */
export type ChangelogEntry = {
	id: string;
	title: string;
	body: string;
	publishedAt: string;
	createdAt: string;
	posts: FeedbackPost[];
};
/** Stored release note with serialized request IDs and native dates. */
export interface ChangelogEntryRecord
	extends Omit<ChangelogEntry, "posts" | "publishedAt" | "createdAt"> {
	postIds: string;
	publishedAt: Date;
	createdAt: Date;
}
/** Content accepted when submitting a feature request. */
export interface CreateFeedbackPostInput {
	title: string;
	body: string;
	category?: string;
}
/** Release note content and IDs of shipped requests to link. */
export interface CreateChangelogEntryInput {
	title: string;
	body: string;
	postIds: string[];
	publishedAt?: string;
}
/** Category, status and pagination filters for the voting board. */
export interface FeedbackListParams {
	category?: string;
	status?: FeedbackStatus;
	limit?: number;
	offset?: number;
}
/** Requests grouped into the public delivery columns. */
export type FeedbackRoadmap = {
	planned: FeedbackPost[];
	in_progress: FeedbackPost[];
	shipped: FeedbackPost[];
};
