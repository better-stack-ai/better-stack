export const feedbackStatuses = [
	"under_review",
	"planned",
	"in_progress",
	"shipped",
	"closed",
] as const;
export type FeedbackStatus = (typeof feedbackStatuses)[number];

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
export interface FeedbackPostRecord
	extends Omit<FeedbackPost, "isVoted" | "createdAt" | "updatedAt"> {
	lockVersion: string;
	createdAt: Date;
	updatedAt: Date;
}
export interface FeedbackVote {
	id: string;
	key: string;
	postId: string;
	userId: string;
	createdAt: Date;
}
export type ChangelogEntry = {
	id: string;
	title: string;
	body: string;
	publishedAt: string;
	createdAt: string;
	posts: FeedbackPost[];
};
export interface ChangelogEntryRecord
	extends Omit<ChangelogEntry, "posts" | "publishedAt" | "createdAt"> {
	postIds: string;
	publishedAt: Date;
	createdAt: Date;
}
export interface CreateFeedbackPostInput {
	title: string;
	body: string;
	category?: string;
}
export interface CreateChangelogEntryInput {
	title: string;
	body: string;
	postIds: string[];
	publishedAt?: string;
}
export interface FeedbackListParams {
	category?: string;
	status?: FeedbackStatus;
	limit?: number;
	offset?: number;
}
export type FeedbackRoadmap = {
	planned: FeedbackPost[];
	in_progress: FeedbackPost[];
	shipped: FeedbackPost[];
};
