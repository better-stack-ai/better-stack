import type { ReactNode } from "react";
import type { FeedbackPost } from "../types";

/** Application-owned content injected into Feedback pages through StackProvider. */
export interface FeedbackPluginOverrides {
	/** Content below a request, such as a comments thread. */
	postBottomSlot?: (post: FeedbackPost) => ReactNode;
}
