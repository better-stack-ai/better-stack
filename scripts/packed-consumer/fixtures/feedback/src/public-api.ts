import * as api from "@btst/plugin-feedback/api";
import * as client from "@btst/plugin-feedback/client";
import * as hooks from "@btst/plugin-feedback/client/hooks";
import * as components from "@btst/plugin-feedback/client/components";
import * as queries from "@btst/plugin-feedback/query-keys";
import * as permissions from "@btst/plugin-feedback/permissions";
import type {
	FeedbackPost,
	FeedbackVote,
	ChangelogEntry,
	FeedbackStatus,
} from "@btst/plugin-feedback/types";
const backend = api.feedbackBackendPlugin();
const frontend = client.feedbackClientPlugin();
const id: "feedback" = frontend.id;
export { backend, frontend, id, hooks, components, queries, permissions };
export type { FeedbackPost, FeedbackVote, ChangelogEntry, FeedbackStatus };
