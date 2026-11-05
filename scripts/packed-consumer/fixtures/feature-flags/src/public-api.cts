import api = require("@btst/plugin-feature-flags/api");
import client = require("@btst/plugin-feature-flags/client");
import hooks = require("@btst/plugin-feature-flags/client/hooks");
import components = require("@btst/plugin-feature-flags/client/components");
import query = require("@btst/plugin-feature-flags/query-keys");
import permissions = require("@btst/plugin-feature-flags/permissions");
import evaluator = require("@btst/plugin-feature-flags/evaluate");
import type { FlagContext } from "@btst/plugin-feature-flags/types";
const backend = api.featureFlagsBackendPlugin();
const frontend = client.featureFlagsClientPlugin();
const id: "featureFlags" = frontend.id;
export {
	backend,
	frontend,
	id,
	hooks,
	components,
	query,
	permissions,
	evaluator,
};
export type { FlagContext };
