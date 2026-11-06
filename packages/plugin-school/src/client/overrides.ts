import type { ReactNode } from "react";
import type { Lesson } from "../types";

/** Browser runtime customizations for the School plugin. */
export interface SchoolPluginOverrides {
	/** Label displayed above the catalog. */
	schoolName?: string;
	/** Content rendered below the lesson, resources, and progress controls. */
	lessonBottomSlot?: (lesson: Lesson) => ReactNode;
}
