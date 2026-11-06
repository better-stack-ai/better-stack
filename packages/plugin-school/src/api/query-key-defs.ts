import { courseFiltersSchema } from "../schemas";
import type { CourseFilters } from "../types";
/** Canonical public query keys shared by HTTP loaders and direct SSG. */
export const SCHOOL_QUERY_KEYS = {
	list: (filters: CourseFilters = {}) =>
		["schoolCourses", "list", courseFiltersSchema.parse(filters)] as const,
	detail: (slug: string) => ["schoolCourses", "detail", slug] as const,
};
