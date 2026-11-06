"use client";

import { useIdentity, useIdentitySourceGeneration } from "@btst/stack/context";
import { createResource } from "@btst/stack/plugins/client/hooks";
import { feedbackResources } from "../../query-keys";
import type { FeedbackListParams } from "../../types";
import { FEEDBACK_PLUGIN_ID } from "../constants";

const feedback = createResource({
	plugin: FEEDBACK_PLUGIN_ID,
	resources: feedbackResources,
});

function useFeedbackIdentity() {
	const { identity, isPending, error } = useIdentity();
	const generation = useIdentitySourceGeneration();
	if (isPending) return `pending:${generation}` as const;
	if (error) return `error:${generation}` as const;
	return identity ?? undefined;
}

export const useFeedbackPosts = (params: FeedbackListParams = {}) =>
	feedback.feedbackPosts.list.useSuspense([params, useFeedbackIdentity()]);
export const useFeedbackPost = (slug: string) =>
	feedback.feedbackPosts.detail.useSuspense([slug, useFeedbackIdentity()]);
export const useFeedbackRoadmap = () =>
	feedback.feedbackRoadmap.list.useSuspense([useFeedbackIdentity()]);
export const useFeedbackChangelog = (
	params: { limit?: number; offset?: number } = {},
) =>
	feedback.feedbackChangelog.list.useSuspense([params, useFeedbackIdentity()]);
export const useCreateFeedbackPost = () => feedback.feedbackPosts.create.use();
export const useToggleFeedbackVote = () => feedback.feedbackPosts.vote.use();
export const useUpdateFeedbackStatus = () =>
	feedback.feedbackPosts.updateStatus.use();
export const useCreateChangelogEntry = () =>
	feedback.feedbackChangelog.create.use();

export const useLinkFeedbackKanbanTask = () =>
	feedback.feedbackPosts.linkKanbanTask.use();
