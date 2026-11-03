import { z } from "zod";
import type { ContentTypeConfig } from "@btst/stack/plugins/cms/api";

const safeUrl = z
	.string()
	.url()
	.refine((value) => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS URL");
const optionalUrl = z.union([safeUrl, z.literal("")]).optional();
/** Course content stored by the CMS plugin. Prices are integer minor currency units. */
export const courseSchema = z.object({
	title: z.string().trim().min(1).max(200),
	slug: z
		.string()
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
		.max(200)
		.refine(
			(slug) => slug !== "me" && slug !== "instructor",
			"This course address is reserved",
		),
	description: z.string().max(100000).default(""),
	coverImage: optionalUrl,
	instructorId: z.string().min(1).max(200),
	instructorName: z.string().max(200).default(""),
	instructorBio: z.string().max(10000).default(""),
	category: z.string().max(100).default(""),
	tags: z.array(z.string().max(100)).max(30).default([]),
	difficulty: z
		.enum(["beginner", "intermediate", "advanced"])
		.default("beginner"),
	durationMins: z.number().int().nonnegative().default(0),
	price: z.number().int().nonnegative().default(0),
	currency: z
		.string()
		.regex(/^[A-Z]{3}$/)
		.default("USD"),
	status: z.enum(["draft", "published", "archived"]).default("draft"),
	featured: z.boolean().default(false),
});
/** Partial edits preserve omitted values instead of applying creation defaults. */
export const courseUpdateSchema = courseSchema.partial().extend({
	description: courseSchema.shape.description.removeDefault().optional(),
	instructorName: courseSchema.shape.instructorName.removeDefault().optional(),
	instructorBio: courseSchema.shape.instructorBio.removeDefault().optional(),
	category: courseSchema.shape.category.removeDefault().optional(),
	tags: courseSchema.shape.tags.removeDefault().optional(),
	difficulty: courseSchema.shape.difficulty.removeDefault().optional(),
	durationMins: courseSchema.shape.durationMins.removeDefault().optional(),
	price: courseSchema.shape.price.removeDefault().optional(),
	currency: courseSchema.shape.currency.removeDefault().optional(),
	status: courseSchema.shape.status.removeDefault().optional(),
	featured: courseSchema.shape.featured.removeDefault().optional(),
});
/** Register alongside the School backend in cmsBackendPlugin({ contentTypes }). */
export const SCHOOL_COURSE_CONTENT_TYPE: ContentTypeConfig = {
	name: "Course",
	slug: "school-course",
	schema: courseSchema,
};
/** Public course list filtering. Draft/publication controls are deliberately absent. */
export const courseFiltersSchema = z.object({
	category: z.string().max(100).optional(),
	difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
	maxDurationMins: z.coerce.number().int().nonnegative().optional(),
	pricing: z.enum(["free", "paid"]).optional(),
	featured: z
		.enum(["true", "false"])
		.transform((v) => v === "true")
		.or(z.boolean())
		.optional(),
	query: z.string().max(200).optional(),
});
/** Multiple choice quiz definition. Correct answer indexes are only returned to instructors. */
export const quizSchema = z
	.object({
		questions: z
			.array(
				z.object({
					id: z.string().min(1).max(100),
					question: z.string().min(1).max(2000),
					options: z.array(z.string().min(1).max(1000)).min(2).max(10),
					correctAnswer: z.number().int().nonnegative(),
				}),
			)
			.min(1)
			.max(100),
		passMark: z.number().min(0).max(100).optional(),
		maxAttempts: z.number().int().min(1).max(100).optional(),
	})
	.superRefine((quiz, ctx) => {
		const ids = new Set<string>();
		for (const [index, q] of quiz.questions.entries()) {
			if (q.correctAnswer >= q.options.length)
				ctx.addIssue({
					code: "custom",
					path: ["questions", index, "correctAnswer"],
					message: "Correct answer must match an option",
				});
			if (ids.has(q.id))
				ctx.addIssue({
					code: "custom",
					path: ["questions", index, "id"],
					message: "Question IDs must be unique",
				});
			ids.add(q.id);
		}
	});
/** Lesson content, resource links, and optional server-scored quiz. */
export const lessonSchema = z
	.object({
		title: z.string().trim().min(1).max(200),
		sectionId: z.string().min(1).nullable().optional(),
		type: z.enum(["video", "text", "quiz"]),
		content: z.string().max(100000).default(""),
		videoUrl: optionalUrl,
		durationMins: z.number().int().nonnegative().default(0),
		order: z.number().int().nonnegative().default(0),
		isFreePreview: z.boolean().default(false),
		resources: z
			.array(z.object({ label: z.string().min(1).max(200), url: safeUrl }))
			.max(30)
			.default([]),
		quiz: quizSchema.nullable().optional(),
	})
	.superRefine((lesson, ctx) => {
		if (lesson.type === "quiz" && !lesson.quiz)
			ctx.addIssue({
				code: "custom",
				path: ["quiz"],
				message: "Quiz lessons require questions",
			});
		if (lesson.type === "video" && !lesson.videoUrl)
			ctx.addIssue({
				code: "custom",
				path: ["videoUrl"],
				message: "Video lessons require a video URL",
			});
	});
/** Lesson patches preserve omitted metadata and are validated after merging stored content. */
export const lessonUpdateSchema = z.object({
	title: lessonSchema.shape.title.optional(),
	sectionId: lessonSchema.shape.sectionId,
	type: lessonSchema.shape.type.optional(),
	content: lessonSchema.shape.content.removeDefault().optional(),
	videoUrl: lessonSchema.shape.videoUrl,
	durationMins: lessonSchema.shape.durationMins.removeDefault().optional(),
	order: lessonSchema.shape.order.removeDefault().optional(),
	isFreePreview: lessonSchema.shape.isFreePreview.removeDefault().optional(),
	resources: lessonSchema.shape.resources.removeDefault().optional(),
	quiz: lessonSchema.shape.quiz,
});
export const sectionSchema = z.object({
	title: z.string().trim().min(1).max(200),
	order: z.number().int().nonnegative().default(0),
});
/** Partial section edits do not reset omitted chapter ordering. */
export const sectionUpdateSchema = sectionSchema.partial().extend({
	order: sectionSchema.shape.order.removeDefault().optional(),
});
export const progressSchema = z.object({
	completed: z.boolean().optional(),
	positionSecs: z.number().finite().nonnegative().max(31536000).optional(),
});
export const quizSubmissionSchema = z.object({
	answers: z
		.array(
			z.object({
				questionId: z.string().min(1),
				answer: z.number().int().nonnegative(),
			}),
		)
		.min(1)
		.max(100),
});
export const reviewSchema = z.object({
	rating: z.number().int().min(1).max(5),
	body: z.string().trim().min(1).max(5000),
});
