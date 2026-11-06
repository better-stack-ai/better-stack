import {
	createResourceQueryKeys,
	type ResourceClient,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type { StackIdentity } from "@btst/stack/context";
import type {
	ChangelogEntry,
	CreateChangelogEntryInput,
	CreateFeedbackPostInput,
	FeedbackListParams,
	FeedbackPost,
	FeedbackRoadmap,
	FeedbackStatus,
} from "./types";

export type FeedbackIdentityPartition =
	| StackIdentity
	| `pending:${number}`
	| `error:${number}`;

export const feedbackResources = {
	feedbackPosts: {
		queries: {
			list: {
				path: "/feedback/posts",
				query: (
					params: FeedbackListParams = {},
					_identity?: FeedbackIdentityPartition,
				) => ({ ...params }),
				select: (data: unknown): { items: FeedbackPost[]; total: number } =>
					data as { items: FeedbackPost[]; total: number },
			},
			detail: {
				path: "/feedback/posts/:slug",
				params: (slug: string, _identity?: FeedbackIdentityPartition) => ({
					slug,
				}),
				select: (data: unknown): FeedbackPost => data as FeedbackPost,
			},
		},
		mutations: {
			create: {
				path: "@post/feedback/posts",
				method: "POST",
				input: (body: CreateFeedbackPostInput) => ({ body }),
				select: (data: unknown): FeedbackPost => data as FeedbackPost,
				invalidates: ["feedbackPosts", "feedbackRoadmap"],
				refresh: false,
			},
			vote: {
				path: "@post/feedback/posts/:id/vote",
				method: "POST",
				input: ({ id }: { id: string }) => ({ params: { id }, body: {} }),
				select: (data: unknown): { voteCount: number; isVoted: boolean } =>
					data as { voteCount: number; isVoted: boolean },
				invalidates: ["feedbackPosts", "feedbackRoadmap", "feedbackChangelog"],
				refresh: false,
			},
			updateStatus: {
				path: "@put/feedback/posts/:id/status",
				method: "PUT",
				input: ({ id, status }: { id: string; status: FeedbackStatus }) => ({
					params: { id },
					body: { status },
				}),
				select: (data: unknown): FeedbackPost => data as FeedbackPost,
				invalidates: ["feedbackPosts", "feedbackRoadmap", "feedbackChangelog"],
				refresh: false,
			},
		},
	},
	feedbackRoadmap: {
		queries: {
			list: {
				path: "/feedback/roadmap",
				key: (identity?: FeedbackIdentityPartition) => [identity],
				select: (data: unknown): FeedbackRoadmap => data as FeedbackRoadmap,
			},
		},
	},
	feedbackChangelog: {
		queries: {
			list: {
				path: "/feedback/changelog",
				query: (
					params: { limit?: number; offset?: number } = {},
					_identity?: FeedbackIdentityPartition,
				) => ({ ...params }),
				select: (data: unknown): { items: ChangelogEntry[]; total: number } =>
					data as { items: ChangelogEntry[]; total: number },
			},
		},
		mutations: {
			create: {
				path: "@post/feedback/changelog",
				method: "POST",
				input: (body: CreateChangelogEntryInput) => ({ body }),
				select: (data: unknown): ChangelogEntry => data as ChangelogEntry,
				invalidates: ["feedbackChangelog"],
				refresh: false,
			},
		},
	},
} satisfies ResourcesDeclaration;

export function createFeedbackQueryKeys(
	client: ResourceClient,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, feedbackResources, headers);
}
