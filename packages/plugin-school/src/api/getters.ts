import type { DBAdapter } from "@btst/db";
type Adapter = Omit<DBAdapter, "transaction">;
import type { ContentItem, ContentType } from "@btst/plugin-cms/types";
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
import { findAllSchoolRecords } from "./records";
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
	return (
		await findAllSchoolRecords<Section>(adapter, {
			model: "schoolSection",
			where: whereField("courseId", courseId),
		})
	).sort((left, right) => left.order - right.order);
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
	const lessons = await findAllSchoolRecords<StoredLesson>(adapter, {
		model: "schoolLesson",
		where: whereField("courseId", courseId),
	});
	const sections = await listSections(adapter, courseId);
	const sectionRanks = new Map(
		sections.map((section, index) => [section.id, index]),
	);
	lessons.sort(
		(left, right) =>
			(sectionRanks.get(left.sectionId ?? "") ?? sections.length) -
				(sectionRanks.get(right.sectionId ?? "") ?? sections.length) ||
			left.order - right.order,
	);
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
	const records = await findAllSchoolRecords<ContentItem>(adapter, {
		model: "contentItem",
		where: whereField("contentTypeId", type.id),
	});
	const result: Course[] = [];
	for (const record of records) {
		const course = await courseFromRecord(adapter, record);
		if (course) result.push(course);
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
async function courseFromRecord(
	adapter: Adapter,
	record: ContentItem,
): Promise<Course | null> {
	const parsed = courseSchema.safeParse(JSON.parse(record.data));
	if (!parsed.success) return null;
	return {
		...parsed.data,
		id: record.id,
		createdAt: new Date(record.createdAt).toISOString(),
		updatedAt: new Date(record.updatedAt).toISOString(),
		lessonCount: (await listLessons(adapter, record.id)).length,
	};
}
export async function getCourse(
	adapter: Adapter,
	id: string,
): Promise<Course | null> {
	const type = await adapter.findOne<ContentType>({
		model: "contentType",
		where: whereField("slug", "school-course"),
	});
	if (!type) return null;
	const record = await adapter.findOne<ContentItem>({
		model: "contentItem",
		where: whereId(id),
	});
	if (!record || record.contentTypeId !== type.id) return null;
	return courseFromRecord(adapter, record);
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
		await findAllSchoolRecords<Review>(adapter, {
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
	const records = await findAllSchoolRecords<
		Omit<QuizAttempt, "answers"> & { answers: string }
	>(adapter, {
		model: "schoolQuizAttempt",
		where: [
			...whereField("lessonId", lessonId),
			...whereField("userId", userId),
		],
	});
	records.sort(
		(left, right) =>
			new Date(right.attemptedAt).getTime() -
			new Date(left.attemptedAt).getTime(),
	);
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
		await findAllSchoolRecords<Enrollment>(adapter, {
			model: "schoolEnrollment",
			where: whereField(field, id),
		}),
	);
}
