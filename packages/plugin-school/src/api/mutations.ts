import type { DBAdapter } from "@btst/db";
type Adapter = Omit<DBAdapter, "transaction">;
import type { z } from "zod";
import { zodToFormSchema } from "@workspace/ui/lib/schema-converter";
import type { ContentItem, ContentType } from "@btst/plugin-cms/types";
import { courseSchema, type lessonSchema } from "../schemas";
import { getCourse, parseLesson, whereField, whereId } from "./getters";
import type {
	Enrollment,
	Lesson,
	QuizAttempt,
	Review,
	Section,
} from "../types";
import { serializeSchoolRecord } from "./serializers";

/** Synchronize the known course content type without requiring a prior CMS HTTP request. */
export async function ensureSchoolCourseType(
	adapter: Adapter,
): Promise<ContentType> {
	const existing = await adapter.findOne<ContentType>({
		model: "contentType",
		where: whereField("slug", "school-course"),
	});
	if (existing) return existing;
	try {
		return await adapter.create<ContentType>({
			model: "contentType",
			data: {
				name: "Course",
				slug: "school-course",
				jsonSchema: JSON.stringify(zodToFormSchema(courseSchema)),
				autoFormVersion: 2,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
	} catch (error) {
		const concurrent = await adapter.findOne<ContentType>({
			model: "contentType",
			where: whereField("slug", "school-course"),
		});
		if (concurrent) return concurrent;
		throw error;
	}
}
/** Lower-level write primitives. Callers own input validation, authorization, and lifecycle. */
export async function createCourse(
	adapter: Adapter,
	data: z.output<typeof courseSchema>,
) {
	const type = await ensureSchoolCourseType(adapter);
	const record = await adapter.create<ContentItem>({
		model: "contentItem",
		data: {
			contentTypeId: type.id,
			slug: data.slug,
			data: JSON.stringify(data),
			authorId: data.instructorId,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
	return (await getCourse(adapter, record.id))!;
}
export async function updateCourse(
	adapter: Adapter,
	id: string,
	data: z.output<typeof courseSchema>,
) {
	await adapter.update({
		model: "contentItem",
		where: whereId(id),
		update: {
			slug: data.slug,
			data: JSON.stringify(data),
			updatedAt: new Date(),
		},
	});
	return (await getCourse(adapter, id))!;
}
export async function createSection(
	adapter: Adapter,
	courseId: string,
	data: { title: string; order: number },
): Promise<Section> {
	return adapter.create<Section>({
		model: "schoolSection",
		data: { courseId, ...data },
	});
}
export async function createLesson(
	adapter: Adapter,
	courseId: string,
	data: z.output<typeof lessonSchema>,
): Promise<Lesson> {
	const record = await adapter.create<Parameters<typeof parseLesson>[0]>({
		model: "schoolLesson",
		data: {
			...data,
			courseId,
			sectionId: data.sectionId ?? null,
			resources: JSON.stringify(data.resources),
			quiz: data.quiz ? JSON.stringify(data.quiz) : null,
		},
	});
	return parseLesson(record);
}
export async function updateLesson(
	adapter: Adapter,
	id: string,
	data: z.output<typeof lessonSchema>,
): Promise<Lesson> {
	const record = await adapter.update<Parameters<typeof parseLesson>[0]>({
		model: "schoolLesson",
		where: whereId(id),
		update: {
			...data,
			sectionId: data.sectionId ?? null,
			resources: JSON.stringify(data.resources),
			quiz: data.quiz ? JSON.stringify(data.quiz) : null,
		},
	});
	return parseLesson(record!);
}
export async function createEnrollment(
	adapter: Adapter,
	courseId: string,
	userId: string,
	paymentRef?: string,
): Promise<Enrollment> {
	return serializeSchoolRecord(
		await adapter.create<Enrollment & { enrollmentKey: string }>({
			model: "schoolEnrollment",
			data: {
				courseId,
				userId,
				enrollmentKey: JSON.stringify([courseId, userId]),
				status: "enrolled",
				progressPct: 0,
				paymentRef: paymentRef ?? null,
				enrolledAt: new Date().toISOString(),
			},
		}),
	);
}
export async function createQuizAttempt(
	adapter: Adapter,
	input: {
		lessonId: string;
		userId: string;
		answers: { questionId: string; answer: number }[];
		score: number;
		passed: boolean;
	},
): Promise<QuizAttempt> {
	const record = await adapter.create<
		Omit<QuizAttempt, "answers"> & { answers: string }
	>({
		model: "schoolQuizAttempt",
		data: {
			...input,
			answers: JSON.stringify(input.answers),
			attemptedAt: new Date().toISOString(),
		},
	});
	return serializeSchoolRecord({ ...record, answers: input.answers });
}
export async function createReview(
	adapter: Adapter,
	courseId: string,
	userId: string,
	input: { rating: number; body: string },
): Promise<Review> {
	return serializeSchoolRecord(
		await adapter.create<Review & { reviewKey: string }>({
			model: "schoolReview",
			data: {
				...input,
				courseId,
				userId,
				reviewKey: JSON.stringify([courseId, userId]),
				createdAt: new Date().toISOString(),
			},
		}),
	);
}
