import type { DBAdapter } from "@btst/db";
type Adapter = Omit<DBAdapter, "transaction">;
import type { ContentItem, ContentType } from "../../cms/types";
import { courseSchema } from "../schemas";
import type {
	Course,
	CourseDetail,
	CourseFilters,
	Enrollment,
	Lesson,
	LessonProgress,
	LessonSummary,
	QuizAttempt,
	Review,
	Section,
} from "../types";
import { serializeSchoolRecord } from "./serializers";

export const whereId = (id: string) => [
	{ field: "id", value: id, operator: "eq" as const },
];
export const whereField = (field: string, value: string) => [
	{ field, value, operator: "eq" as const },
];
/** Lower-level model reads bypass authorization. Call operations for request work. */
export async function listSections(
	adapter: Adapter,
	courseId: string,
): Promise<Section[]> {
	return adapter.findMany<Section>({
		model: "schoolSection",
		where: whereField("courseId", courseId),
		sortBy: { field: "order", direction: "asc" },
	});
}
type StoredLesson = Omit<Lesson, "resources" | "quiz"> & {
	resources: string;
	quiz?: string | null;
};
export function parseLesson(lesson: StoredLesson): Lesson {
	return {
		...lesson,
		resources: JSON.parse(lesson.resources),
		quiz: lesson.quiz ? JSON.parse(lesson.quiz) : null,
	};
}
export async function listLessons(
	adapter: Adapter,
	courseId: string,
): Promise<Lesson[]> {
	const lessons = await adapter.findMany<StoredLesson>({
		model: "schoolLesson",
		where: whereField("courseId", courseId),
		sortBy: { field: "order", direction: "asc" },
	});
	return lessons.map(parseLesson);
}
export async function getLesson(
	adapter: Adapter,
	id: string,
): Promise<Lesson | null> {
	const lesson = await adapter.findOne<StoredLesson>({
		model: "schoolLesson",
		where: whereId(id),
	});
	return lesson ? parseLesson(lesson) : null;
}
export function lessonSummary(lesson: Lesson): LessonSummary {
	const {
		id,
		courseId,
		title,
		sectionId,
		type,
		durationMins,
		order,
		isFreePreview,
	} = lesson;
	return {
		id,
		courseId,
		title,
		sectionId,
		type,
		durationMins,
		order,
		isFreePreview,
	};
}
/** Return safe student content without the quiz answer key. */
export function publicLesson(lesson: Lesson): Lesson {
	return {
		...lesson,
		quiz: lesson.quiz
			? {
					...lesson.quiz,
					questions: lesson.quiz.questions.map((q) => {
						const { correctAnswer: _answer, ...publicQuestion } = q as {
							id: string;
							question: string;
							options: string[];
							correctAnswer?: number;
						};
						return publicQuestion;
					}),
				}
			: null,
	};
}
export async function getStoredCourses(adapter: Adapter): Promise<Course[]> {
	const type = await adapter.findOne<ContentType>({
		model: "contentType",
		where: whereField("slug", "school-course"),
	});
	if (!type) return [];
	const records = await adapter.findMany<ContentItem>({
		model: "contentItem",
		where: whereField("contentTypeId", type.id),
	});
	const result: Course[] = [];
	for (const record of records) {
		const parsed = courseSchema.safeParse(JSON.parse(record.data));
		if (!parsed.success) continue;
		const lessons = await listLessons(adapter, record.id);
		result.push({
			...parsed.data,
			id: record.id,
			createdAt: new Date(record.createdAt).toISOString(),
			updatedAt: new Date(record.updatedAt).toISOString(),
			lessonCount: lessons.length,
		});
	}
	return result;
}
export async function listCourses(
	adapter: Adapter,
	filters: CourseFilters = {},
): Promise<{ items: Course[]; total: number }> {
	const items = (await getStoredCourses(adapter)).filter(
		(course) =>
			course.status === "published" &&
			(!filters.category || course.category === filters.category) &&
			(!filters.difficulty || course.difficulty === filters.difficulty) &&
			(filters.maxDurationMins === undefined ||
				course.durationMins <= Number(filters.maxDurationMins)) &&
			(!filters.pricing ||
				(filters.pricing === "free" ? course.price === 0 : course.price > 0)) &&
			(filters.featured === undefined ||
				course.featured ===
					(filters.featured === true || filters.featured === "true")) &&
			(!filters.query ||
				`${course.title} ${course.description} ${course.tags.join(" ")}`
					.toLowerCase()
					.includes(filters.query.toLowerCase())),
	);
	return { items, total: items.length };
}
export async function getCourse(
	adapter: Adapter,
	id: string,
): Promise<Course | null> {
	return (
		(await getStoredCourses(adapter)).find((course) => course.id === id) ?? null
	);
}
export async function getCourseBySlug(
	adapter: Adapter,
	slug: string,
): Promise<Course | null> {
	return (
		(await getStoredCourses(adapter)).find(
			(course) => course.slug === slug && course.status === "published",
		) ?? null
	);
}
export async function listReviews(
	adapter: Adapter,
	courseId: string,
): Promise<Review[]> {
	return serializeSchoolRecord(
		await adapter.findMany<Review>({
			model: "schoolReview",
			where: whereField("courseId", courseId),
		}),
	);
}
export async function getCourseDetail(
	adapter: Adapter,
	course: Course,
): Promise<CourseDetail> {
	return {
		...course,
		sections: await listSections(adapter, course.id),
		lessons: (await listLessons(adapter, course.id)).map(lessonSummary),
		reviews: await listReviews(adapter, course.id),
		enrollment: null,
	};
}
export async function getEnrollment(
	adapter: Adapter,
	courseId: string,
	userId: string,
): Promise<Enrollment | null> {
	return serializeSchoolRecord(
		await adapter.findOne<Enrollment>({
			model: "schoolEnrollment",
			where: [
				...whereField("courseId", courseId),
				...whereField("userId", userId),
			],
		}),
	);
}
export async function getProgress(
	adapter: Adapter,
	enrollmentId: string,
	lessonId: string,
): Promise<LessonProgress | null> {
	return serializeSchoolRecord(
		await adapter.findOne<LessonProgress>({
			model: "schoolLessonProgress",
			where: [
				...whereField("enrollmentId", enrollmentId),
				...whereField("lessonId", lessonId),
			],
		}),
	);
}
export async function getQuizAttempts(
	adapter: Adapter,
	lessonId: string,
	userId: string,
): Promise<QuizAttempt[]> {
	const records = await adapter.findMany<
		Omit<QuizAttempt, "answers"> & { answers: string }
	>({
		model: "schoolQuizAttempt",
		where: [
			...whereField("lessonId", lessonId),
			...whereField("userId", userId),
		],
		sortBy: { field: "attemptedAt", direction: "desc" },
	});
	return serializeSchoolRecord(
		records.map((record) => ({
			...record,
			answers: JSON.parse(record.answers),
		})),
	);
}
export async function getEnrollments(
	adapter: Adapter,
	field: "userId" | "courseId",
	id: string,
): Promise<Enrollment[]> {
	return serializeSchoolRecord(
		await adapter.findMany<Enrollment>({
			model: "schoolEnrollment",
			where: whereField(field, id),
		}),
	);
}
