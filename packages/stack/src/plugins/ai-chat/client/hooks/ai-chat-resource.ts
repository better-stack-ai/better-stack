"use client";

import { createResource } from "@btst/stack/plugins/client/hooks";
import { aiChatResources } from "../../query-keys";

/** Factory-generated hooks shared by the public AI Chat hook wrappers. */
export const aiChat = createResource({
	plugin: "ai-chat",
	resources: aiChatResources,
});
