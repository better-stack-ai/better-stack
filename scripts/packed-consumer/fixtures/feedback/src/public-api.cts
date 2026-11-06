import api = require("@btst/plugin-feedback/api");
import client = require("@btst/plugin-feedback/client");
import hooks = require("@btst/plugin-feedback/client/hooks");
import components = require("@btst/plugin-feedback/client/components");
import queries = require("@btst/plugin-feedback/query-keys");
import permissions = require("@btst/plugin-feedback/permissions");
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
