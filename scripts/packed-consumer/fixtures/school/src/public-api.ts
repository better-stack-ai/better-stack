import {
	schoolBackendPlugin,
	SCHOOL_COURSE_CONTENT_TYPE,
	type SchoolApiRouter,
} from "@btst/plugin-school/api";
import { schoolClientPlugin } from "@btst/plugin-school/client";
import { useLesson, useCourses } from "@btst/plugin-school/client/hooks";
import {
	CourseListPageComponent,
	LessonPlayerPageComponent,
} from "@btst/plugin-school/client/components";
import { schoolPermissions } from "@btst/plugin-school/permissions";
import {
	createSchoolQueryKeys,
	formatSchoolPrice,
} from "@btst/plugin-school/query-keys";
import type {
	Course,
	Lesson,
	SchoolBackendOptions,
} from "@btst/plugin-school/types";
export {
	schoolBackendPlugin,
	SCHOOL_COURSE_CONTENT_TYPE,
	schoolClientPlugin,
	useLesson,
	useCourses,
	CourseListPageComponent,
	LessonPlayerPageComponent,
	schoolPermissions,
	createSchoolQueryKeys,
	formatSchoolPrice,
};
export type { SchoolApiRouter, Course, Lesson, SchoolBackendOptions };
