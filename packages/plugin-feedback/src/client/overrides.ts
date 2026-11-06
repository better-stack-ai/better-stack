import type { ReactNode } from "react";
import type { FeedbackPost } from "../types";

export interface FeedbackPluginOverrides {
	/** Content below a request, such as a comments thread. */
	postBottomSlot?: (post: FeedbackPost) => ReactNode;
}
