export {
	schoolBackendPlugin,
	type SchoolApiRouter,
	type SchoolRouteKey,
} from "./plugin";
export * from "./getters";
export {
	createCourse,
	updateCourse,
	createSection,
	createLesson,
	updateLesson,
	createEnrollment,
	createQuizAttempt,
	createReview,
} from "./mutations";
export { SCHOOL_QUERY_KEYS } from "./query-key-defs";
export { serializeSchoolRecord } from "./serializers";
export {
	SCHOOL_COURSE_CONTENT_TYPE,
	courseSchema,
	lessonSchema,
	quizSchema,
} from "../schemas";
export type * from "../types";
