import {
	createResourceQueryKeys,
	type ResourcesDeclaration,
	type ResourceClient,
} from "@btst/stack/plugins/client";
import { SCHOOL_QUERY_KEYS } from "./api/query-key-defs";
import type { StackIdentity } from "@btst/stack/context";
import type {
	Course,
	CourseDetail,
	Enrollment,
	Lesson,
	QuizAttempt,
	Section,
} from "./types";
import type { z } from "zod";
import type { courseSchema, lessonSchema } from "./schemas";

/** Identity snapshot isolates enrollment, instructor, and lesson caches. */
export type SchoolIdentityPartition =
	| StackIdentity
	| `pending:${number}`
	| `error:${number}`;
/** Public catalog filters. */
export interface CatalogFilters {
	category?: string;
	difficulty?: "beginner" | "intermediate" | "advanced";
	maxDurationMins?: number;
	pricing?: "free" | "paid";
	featured?: boolean;
	query?: string;
}
export type CourseInput = z.input<typeof courseSchema>;
export type LessonInput = z.input<typeof lessonSchema>;

const recordKey = (id: string, identity?: SchoolIdentityPartition) => [
	id,
	{ identity },
];
const recordParams = (id: string, _identity?: SchoolIdentityPartition) => ({
	id,
});
const courseInvalidations = ["schoolCourses", "schoolInstructor", "schoolMe"];
const lessonInvalidations = [
	...courseInvalidations,
	"schoolLessons",
	"schoolStudents",
];

export const schoolResources = {
	schoolCourses: {
		queries: {
			list: {
				path: "/school/courses",
				query: (filters?: CatalogFilters) => ({ ...filters }),
				key: (filters?: CatalogFilters) => [SCHOOL_QUERY_KEYS.list(filters)[2]],
				select: (data: { items: Course[]; total: number }) => data,
			},
			detail: {
				path: "/school/catalog/:slug",
				params: (slug: string) => ({ slug }),
				key: (slug: string) => [SCHOOL_QUERY_KEYS.detail(slug)[2]],
				select: (data: CourseDetail) => data,
			},
			edit: {
				path: "/school/courses/:id",
				params: recordParams,
				key: recordKey,
				select: (data: CourseDetail) => data,
			},
		},
		mutations: {
			create: {
				path: "@post/school/courses",
				method: "POST",
				input: (data: CourseInput) => ({ body: data }),
				select: (data: Course) => data,
				invalidates: courseInvalidations,
				refresh: false,
			},
			update: {
				path: "@patch/school/courses/:id",
				method: "PATCH",
				input: ({ id, data }: { id: string; data: Partial<CourseInput> }) => ({
					params: { id },
					body: data,
				}),
				select: (data: Course) => data,
				invalidates: courseInvalidations,
				refresh: false,
			},
			delete: {
				path: "@delete/school/courses/:id",
				method: "DELETE",
				input: (id: string) => ({ params: { id } }),
				invalidates: courseInvalidations,
				refresh: false,
			},
			enroll: {
				path: "@post/school/courses/:id/enroll",
				method: "POST",
				input: (id: string) => ({ params: { id }, body: {} }),
				select: (data: Enrollment) => data,
				invalidates: ["schoolMe", "schoolLessons", "schoolStudents"],
				refresh: false,
			},
			cancel: {
				path: "@post/school/courses/:id/cancel",
				method: "POST",
				input: (id: string) => ({ params: { id }, body: {} }),
				select: (data: Enrollment) => data,
				invalidates: ["schoolMe", "schoolLessons", "schoolStudents"],
				refresh: false,
			},
			reorder: {
				path: "@post/school/courses/:id/reorder",
				method: "POST",
				input: ({ id, lessonIds }: { id: string; lessonIds: string[] }) => ({
					params: { id },
					body: { lessonIds },
				}),
				invalidates: lessonInvalidations,
				refresh: false,
			},
			review: {
				path: "@post/school/courses/:id/reviews",
				method: "POST",
				input: ({
					id,
					rating,
					body,
				}: {
					id: string;
					rating: number;
					body: string;
				}) => ({ params: { id }, body: { rating, body } }),
				invalidates: ["schoolCourses"],
				refresh: false,
			},
		},
	},
	schoolMe: {
		queries: {
			list: {
				path: "/school/me",
				key: (identity?: SchoolIdentityPartition) => [{ identity }],
				select: (data: {
					items: (Enrollment & {
						course: Course;
						lessons: CourseDetail["lessons"];
					})[];
				}) => data.items,
			},
		},
	},
	schoolInstructor: {
		queries: {
			list: {
				path: "/school/instructor",
				key: (identity?: SchoolIdentityPartition) => [{ identity }],
				select: (data: { items: Course[] }) => data.items,
			},
		},
	},
	schoolStudents: {
		queries: {
			list: {
				path: "/school/courses/:id/students",
				params: recordParams,
				key: recordKey,
				select: (data: {
					items: Enrollment[];
					analytics: {
						totalEnrolled: number;
						totalCompleted: number;
						completionRate: number;
						enrollmentsOverTime: { date: string; count: number }[];
					};
				}) => data,
			},
		},
	},
	schoolLessons: {
		queries: {
			detail: {
				path: "/school/lessons/:id",
				params: recordParams,
				key: recordKey,
				select: (data: {
					lesson: Lesson;
					enrollment: Enrollment | null;
					progress: { completed: boolean; positionSecs: number } | null;
					attempts: QuizAttempt[];
				}) => data,
			},
			edit: {
				path: "/school/lessons/:id/edit",
				params: recordParams,
				key: recordKey,
				select: (data: Lesson) => data,
			},
			attempts: {
				path: "/school/lessons/:id/attempts",
				params: recordParams,
				key: recordKey,
				select: (data: { items: QuizAttempt[] }) => data.items,
			},
		},
		mutations: {
			create: {
				path: "@post/school/courses/:id/lessons",
				method: "POST",
				input: ({ id, data }: { id: string; data: LessonInput }) => ({
					params: { id },
					body: data,
				}),
				select: (data: Lesson) => data,
				invalidates: lessonInvalidations,
				refresh: false,
			},
			update: {
				path: "@patch/school/lessons/:id",
				method: "PATCH",
				input: ({ id, data }: { id: string; data: Partial<LessonInput> }) => ({
					params: { id },
					body: data,
				}),
				select: (data: Lesson) => data,
				invalidates: lessonInvalidations,
				refresh: false,
			},
			delete: {
				path: "@delete/school/lessons/:id",
				method: "DELETE",
				input: (id: string) => ({ params: { id } }),
				invalidates: lessonInvalidations,
				refresh: false,
			},
			progress: {
				path: "@post/school/lessons/:id/progress",
				method: "POST",
				input: ({
					id,
					...data
				}: {
					id: string;
					completed?: boolean;
					positionSecs?: number;
				}) => ({ params: { id }, body: data }),
				select: (data: Enrollment) => data,
				invalidates: ["schoolMe", "schoolLessons", "schoolStudents"],
				refresh: false,
			},
			quiz: {
				path: "@post/school/lessons/:id/quiz",
				method: "POST",
				input: ({
					id,
					answers,
				}: {
					id: string;
					answers: { questionId: string; answer: number }[];
				}) => ({ params: { id }, body: { answers } }),
				select: (data: QuizAttempt) => data,
				invalidates: ["schoolMe", "schoolLessons", "schoolStudents"],
				refresh: false,
			},
		},
	},
	schoolSections: {
		queries: {},
		mutations: {
			create: {
				path: "@post/school/courses/:id/sections",
				method: "POST",
				input: ({
					id,
					title,
					order,
				}: {
					id: string;
					title: string;
					order: number;
				}) => ({ params: { id }, body: { title, order } }),
				select: (data: Section) => data,
				invalidates: courseInvalidations,
				refresh: false,
			},
			update: {
				path: "@patch/school/sections/:id",
				method: "PATCH",
				input: ({
					id,
					title,
					order,
				}: {
					id: string;
					title?: string;
					order?: number;
				}) => ({ params: { id }, body: { title, order } }),
				invalidates: courseInvalidations,
				refresh: false,
			},
			delete: {
				path: "@delete/school/sections/:id",
				method: "DELETE",
				input: (id: string) => ({ params: { id } }),
				invalidates: lessonInvalidations,
				refresh: false,
			},
		},
	},
	schoolCertificates: {
		queries: {
			detail: {
				path: "/school/certificates/:id",
				params: (id: string) => ({ id }),
				key: (id: string) => [id],
				select: (data: {
					certificateId: string;
					courseTitle: string;
					completedAt: string;
				}) => data,
			},
		},
	},
} satisfies ResourcesDeclaration;

export function createSchoolQueryKeys(
	client: ResourceClient,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, schoolResources, headers);
}
