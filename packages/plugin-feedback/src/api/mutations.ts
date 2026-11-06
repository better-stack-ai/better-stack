import type { DBAdapter as Adapter } from "@btst/db";
import { OperationHttpError } from "@btst/stack/plugins/api";
import type {
	ChangelogEntryRecord,
	CreateChangelogEntryInput,
	CreateFeedbackPostInput,
	FeedbackPostRecord,
	FeedbackStatus,
	FeedbackVote,
} from "../types";
import {
	getFeedbackPostRecord,
	serializeChangelogEntry,
	type FeedbackDataAdapter,
} from "./getters";

/** Create a stored request; callers own input validation, authorization and lifecycle hooks. */
export async function createFeedbackPost(
	adapter: FeedbackDataAdapter,
	input: CreateFeedbackPostInput,
	authorId: string,
) {
	const stem =
		input.title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 120) || "request";
	return adapter.create<FeedbackPostRecord>({
		model: "feedbackPost",
		data: {
			title: input.title,
			body: input.body,
			category: input.category ?? "General",
			authorId,
			kanbanTaskId: null,
			slug: `${stem}-${crypto.randomUUID()}`,
			status: "under_review",
			voteCount: 0,
			lockVersion: crypto.randomUUID(),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}

/**
 * Hold SQL post locks through commit; sequential fallback adapters fail closed.
 * Callers own input validation, authorization and lifecycle hooks.
 */
export async function withFeedbackTransaction<T>(
	adapter: Adapter,
	ids: readonly string[],
	run: (tx: FeedbackDataAdapter) => Promise<T>,
): Promise<T> {
	if (
		adapter.id === "memory" ||
		typeof adapter.options?.adapterConfig.transaction !== "function"
	) {
		throw new OperationHttpError(
			503,
			"Feedback voting and management require an adapter with isolated transaction support",
			"ATOMIC_TRANSACTION_REQUIRED",
		);
	}
	return adapter.transaction(async (tx) => {
		for (const id of [...new Set(ids)].sort()) {
			const row = await tx.update<FeedbackPostRecord>({
				model: "feedbackPost",
				where: [{ field: "id", value: id, operator: "eq" }],
				update: { lockVersion: crypto.randomUUID() },
			});
			if (!row)
				throw new OperationHttpError(
					404,
					"Feedback post not found",
					"FEEDBACK_NOT_FOUND",
				);
		}
		return run(tx);
	});
}

/**
 * Toggle the unique user/post vote and counter in the same isolated transaction.
 * Callers own input validation, authorization and lifecycle hooks.
 */
export async function toggleFeedbackVote(
	adapter: Adapter,
	id: string,
	userId: string,
	expectedStatus: FeedbackStatus,
) {
	return withFeedbackTransaction(adapter, [id], async (tx) => {
		const post = await getFeedbackPostRecord(tx, id);
		if (!post || post.status !== expectedStatus)
			throw new OperationHttpError(
				409,
				"Feedback changed after authorization",
				"FEEDBACK_CHANGED",
			);
		const key = JSON.stringify([id, userId]);
		const vote = await tx.findOne<FeedbackVote>({
			model: "feedbackVote",
			where: [{ field: "key", value: key, operator: "eq" }],
		});
		if (vote)
			await tx.delete({
				model: "feedbackVote",
				where: [{ field: "id", value: vote.id, operator: "eq" }],
			});
		else
			await tx.create<FeedbackVote>({
				model: "feedbackVote",
				data: { key, postId: id, userId, createdAt: new Date() },
			});
		const updated = await tx.incrementOne<FeedbackPostRecord>({
			model: "feedbackPost",
			where: [{ field: "id", value: id, operator: "eq" }],
			increment: { voteCount: vote ? -1 : 1 },
		});
		if (!updated)
			throw new OperationHttpError(
				409,
				"Feedback changed while voting",
				"FEEDBACK_CHANGED",
			);
		return { voteCount: updated.voteCount, isVoted: !vote };
	});
}

/**
 * Serialize status changes with votes and changelog publication on the same post.
 * Callers own input validation, authorization and lifecycle hooks.
 */
export async function updateFeedbackPostStatus(
	adapter: Adapter,
	id: string,
	status: FeedbackStatus,
	expectedStatus: FeedbackStatus,
) {
	return withFeedbackTransaction(adapter, [id], async (tx) => {
		const post = await getFeedbackPostRecord(tx, id);
		if (!post || post.status !== expectedStatus)
			throw new OperationHttpError(
				409,
				"Feedback changed after authorization",
				"FEEDBACK_CHANGED",
			);
		return tx.update<FeedbackPostRecord>({
			model: "feedbackPost",
			where: [{ field: "id", value: id, operator: "eq" }],
			update: { status, updatedAt: new Date() },
		});
	});
}

/**
 * Check shipped links under locks so publication cannot race a status transition.
 * Callers own input validation, authorization and lifecycle hooks.
 */
export async function createFeedbackChangelogEntry(
	adapter: Adapter,
	input: CreateChangelogEntryInput,
) {
	return withFeedbackTransaction(adapter, input.postIds, async (tx) => {
		for (const id of input.postIds) {
			const post = await getFeedbackPostRecord(tx, id);
			if (!post || post.status !== "shipped")
				throw new OperationHttpError(
					400,
					"Changelog entries may only reference shipped feedback posts",
					"FEEDBACK_NOT_SHIPPED",
				);
		}
		const row = await tx.create<ChangelogEntryRecord>({
			model: "changelogEntry",
			data: {
				title: input.title,
				body: input.body,
				postIds: JSON.stringify(input.postIds),
				publishedAt: input.publishedAt
					? new Date(input.publishedAt)
					: new Date(),
				createdAt: new Date(),
			},
		});
		return serializeChangelogEntry(tx, row);
	});
}

/** Persist a task link under the request lock; callers own authorization and task validation. */
export async function linkFeedbackKanbanTask(
	adapter: Adapter,
	id: string,
	kanbanTaskId: string | null,
	expectedStatus: FeedbackStatus,
) {
	return withFeedbackTransaction(adapter, [id], async (tx) => {
		const post = await getFeedbackPostRecord(tx, id);
		if (!post || post.status !== expectedStatus)
			throw new OperationHttpError(
				409,
				"Feedback changed after authorization",
				"FEEDBACK_CHANGED",
			);
		return tx.update<FeedbackPostRecord>({
			model: "feedbackPost",
			where: [{ field: "id", value: id, operator: "eq" }],
			update: { kanbanTaskId, updatedAt: new Date() },
		});
	});
}
