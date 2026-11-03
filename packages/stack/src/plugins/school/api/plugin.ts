import {
	createEndpoint,
	defineBackendPlugin,
	OperationHttpError,
} from "@btst/stack/plugins/api";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { schoolSchema } from "../db";
import {
	courseSchema,
	courseUpdateSchema,
	courseFiltersSchema,
	lessonSchema,
	lessonUpdateSchema,
	sectionSchema,
	sectionUpdateSchema,
	progressSchema,
	quizSubmissionSchema,
	reviewSchema,
} from "../schemas";
import type { CourseFilters, SchoolBackendOptions } from "../types";
import { getCourseBySlug, getCourseDetail, listCourses } from "./getters";
import { createSchoolOperations } from "./operations";
import { ensureSchoolCourseType } from "./mutations";
import { SCHOOL_QUERY_KEYS } from "./query-key-defs";

/** Public pages that support header-free static generation. */
export type SchoolRouteKey = "catalog" | "course";
interface SchoolPrefetchForRoute {
	(
		key: "catalog",
		queryClient: QueryClient,
		params?: CourseFilters,
	): Promise<void>;
	(
		key: "course",
		queryClient: QueryClient,
		params: { slug: string },
	): Promise<void>;
}
/** CMS-backed online school with authorized instructor and student operations. */
export function schoolBackendPlugin(options: SchoolBackendOptions = {}) {
	z.number()
		.min(0)
		.max(100)
		.parse(options.quizPassMark ?? 70);
	return defineBackendPlugin({
		id: "school",
		dbPlugin: schoolSchema,
		operations: (adapter, context) => {
			if (
				!Object.values(context?.plugins ?? {}).some(
					(plugin) => plugin.id === "cms",
				)
			)
				throw new Error(
					"School requires cmsBackendPlugin with SCHOOL_COURSE_CONTENT_TYPE registered",
				);
			return createSchoolOperations(adapter, options);
		},
		raw: (adapter) => ({
			prefetchForRoute: (async (
				key: SchoolRouteKey,
				queryClient: QueryClient,
				params?: CourseFilters & { slug?: string },
			) => {
				await ensureSchoolCourseType(adapter);
				if (key === "catalog") {
					queryClient.setQueryData(
						SCHOOL_QUERY_KEYS.list(params),
						await listCourses(adapter, params),
					);
					return;
				}
				const course = await getCourseBySlug(adapter, params?.slug ?? "");
				if (!course)
					throw new OperationHttpError(
						404,
						"Course not found",
						"SCHOOL_COURSE_NOT_FOUND",
					);
				queryClient.setQueryData(
					SCHOOL_QUERY_KEYS.detail(course.slug),
					await getCourseDetail(adapter, course),
				);
			}) as SchoolPrefetchForRoute,
		}),
		routes: (_adapter, _context, ops) => ({
			listCourses: createEndpoint(
				"/school/courses",
				{ method: "GET", query: courseFiltersSchema, requireRequest: true },
				ops.listCourses.route((ctx) => ctx.query),
			),
			getCourse: createEndpoint(
				"/school/catalog/:slug",
				{ method: "GET", requireRequest: true },
				ops.getCourse.route((ctx) => ({ slug: ctx.params.slug })),
			),
			getInstructorCourse: createEndpoint(
				"/school/courses/:id",
				{ method: "GET", requireRequest: true },
				ops.getInstructorCourse.route((ctx) => ({ id: ctx.params.id })),
			),
			listInstructorCourses: createEndpoint(
				"/school/instructor",
				{ method: "GET", requireRequest: true },
				ops.listInstructorCourses.route(() => ({})),
			),
			createCourse: createEndpoint(
				"/school/courses",
				{ method: "POST", body: courseSchema, requireRequest: true },
				ops.createCourse.route((ctx) => ctx.body),
			),
			updateCourse: createEndpoint(
				"/school/courses/:id",
				{ method: "PATCH", body: courseUpdateSchema, requireRequest: true },
				ops.updateCourse.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			deleteCourse: createEndpoint(
				"/school/courses/:id",
				{ method: "DELETE", requireRequest: true },
				ops.deleteCourse.route((ctx) => ({ id: ctx.params.id })),
			),
			createSection: createEndpoint(
				"/school/courses/:id/sections",
				{ method: "POST", body: sectionSchema, requireRequest: true },
				ops.createSection.route((ctx) => ({
					courseId: ctx.params.id,
					data: ctx.body,
				})),
			),
			updateSection: createEndpoint(
				"/school/sections/:id",
				{ method: "PATCH", body: sectionUpdateSchema, requireRequest: true },
				ops.updateSection.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			deleteSection: createEndpoint(
				"/school/sections/:id",
				{ method: "DELETE", requireRequest: true },
				ops.deleteSection.route((ctx) => ({ id: ctx.params.id })),
			),
			createLesson: createEndpoint(
				"/school/courses/:id/lessons",
				{ method: "POST", body: lessonSchema, requireRequest: true },
				ops.createLesson.route((ctx) => ({
					courseId: ctx.params.id,
					data: ctx.body,
				})),
			),
			updateLesson: createEndpoint(
				"/school/lessons/:id",
				{ method: "PATCH", body: lessonUpdateSchema, requireRequest: true },
				ops.updateLesson.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			getEditableLesson: createEndpoint(
				"/school/lessons/:id/edit",
				{ method: "GET", requireRequest: true },
				ops.getEditableLesson.route((ctx) => ({ id: ctx.params.id })),
			),
			deleteLesson: createEndpoint(
				"/school/lessons/:id",
				{ method: "DELETE", requireRequest: true },
				ops.deleteLesson.route((ctx) => ({ id: ctx.params.id })),
			),
			reorderLessons: createEndpoint(
				"/school/courses/:id/reorder",
				{
					method: "POST",
					body: z.object({ lessonIds: z.array(z.string()) }),
					requireRequest: true,
				},
				ops.reorderLessons.route((ctx) => ({ id: ctx.params.id, ...ctx.body })),
			),
			enroll: createEndpoint(
				"/school/courses/:id/enroll",
				{ method: "POST", requireRequest: true },
				ops.enroll.route((ctx) => ({ id: ctx.params.id })),
			),
			cancelEnrollment: createEndpoint(
				"/school/courses/:id/cancel",
				{ method: "POST", requireRequest: true },
				ops.cancelEnrollment.route((ctx) => ({ id: ctx.params.id })),
			),
			retryCertificate: createEndpoint(
				"/school/courses/:id/certificate",
				{ method: "POST", requireRequest: true },
				ops.retryCertificate.route((ctx) => ({ id: ctx.params.id })),
			),
			getMyCourses: createEndpoint(
				"/school/me",
				{ method: "GET", requireRequest: true },
				ops.getMyCourses.route(() => ({})),
			),
			getLesson: createEndpoint(
				"/school/lessons/:id",
				{ method: "GET", requireRequest: true },
				ops.getLesson.route((ctx) => ({ id: ctx.params.id })),
			),
			saveProgress: createEndpoint(
				"/school/lessons/:id/progress",
				{ method: "POST", body: progressSchema, requireRequest: true },
				ops.saveProgress.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			submitQuiz: createEndpoint(
				"/school/lessons/:id/quiz",
				{ method: "POST", body: quizSubmissionSchema, requireRequest: true },
				ops.submitQuiz.route((ctx) => ({ id: ctx.params.id, data: ctx.body })),
			),
			listQuizAttempts: createEndpoint(
				"/school/lessons/:id/attempts",
				{ method: "GET", requireRequest: true },
				ops.listQuizAttempts.route((ctx) => ({ id: ctx.params.id })),
			),
			listStudents: createEndpoint(
				"/school/courses/:id/students",
				{ method: "GET", requireRequest: true },
				ops.listStudents.route((ctx) => ({ id: ctx.params.id })),
			),
			verifyCertificate: createEndpoint(
				"/school/certificates/:id",
				{ method: "GET", requireRequest: true },
				ops.verifyCertificate.route((ctx) => ({ id: ctx.params.id })),
			),
			createReview: createEndpoint(
				"/school/courses/:id/reviews",
				{ method: "POST", body: reviewSchema, requireRequest: true },
				ops.createReview.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			listReviews: createEndpoint(
				"/school/courses/:id/reviews",
				{ method: "GET", requireRequest: true },
				ops.listReviews.route((ctx) => ({ id: ctx.params.id })),
			),
		}),
	});
}
export type SchoolApiRouter = ReturnType<
	ReturnType<typeof schoolBackendPlugin>["routes"]
>;
