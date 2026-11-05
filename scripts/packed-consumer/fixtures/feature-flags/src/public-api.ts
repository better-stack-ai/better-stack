import {
	featureFlagsBackendPlugin,
	type FeatureFlagsBackendOptions,
	type FeatureFlag,
} from "@btst/plugin-feature-flags/api";
import { featureFlagsClientPlugin } from "@btst/plugin-feature-flags/client";
import * as hooks from "@btst/plugin-feature-flags/client/hooks";
import * as components from "@btst/plugin-feature-flags/client/components";
import { createFeatureFlagsQueryKeys } from "@btst/plugin-feature-flags/query-keys";
import { featureFlagsPermissions } from "@btst/plugin-feature-flags/permissions";
import { evaluateFlag } from "@btst/plugin-feature-flags/evaluate";
import type {
	FlagContext,
	SegmentRule,
} from "@btst/plugin-feature-flags/types";
const options: FeatureFlagsBackendOptions = {
	cacheTtlMs: 0,
	evaluationLogLimit: 2,
};
const backend = featureFlagsBackendPlugin(options);
const client = featureFlagsClientPlugin();
const id: "featureFlags" = client.id;
// @ts-expect-error Shared API coordinates belong on createClientStack.
featureFlagsClientPlugin({ apiBaseURL: "https://site.test" });
const context: FlagContext = { tags: ["beta"] };
const rule: SegmentRule = {
	field: "tags",
	operator: "contains",
	value: "beta",
};
export {
	backend,
	client,
	id,
	hooks,
	components,
	createFeatureFlagsQueryKeys,
	featureFlagsPermissions,
	evaluateFlag,
	context,
	rule,
};
export type { FeatureFlag };
