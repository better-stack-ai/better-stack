import type { ComponentType, ReactNode } from "react";
import type { FeedbackPost } from "../types";

/** Application-owned content injected into Feedback pages through StackProvider. */
export interface FeedbackPluginOverrides {
	/** Card presentation for request listings and roadmap columns. */
	pageOverrides?: Partial<
		Record<
			"feedback" | "feedbackRoadmap",
			{ PostCard?: ComponentType<{ post: FeedbackPost }> }
		>
	>;
	/** Administrator controls for creating or linking a Kanban task. */
	kanbanTaskSlot?: (post: FeedbackPost) => ReactNode;
	/** Content below a request, such as a comments thread. */
	postBottomSlot?: (post: FeedbackPost) => ReactNode;
}
