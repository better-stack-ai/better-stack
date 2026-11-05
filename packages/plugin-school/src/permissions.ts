import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";
const courseFacts = z.object({
	courseId: z.string(),
	instructorId: z.string(),
	status: z.enum(["draft", "published", "archived"]),
});
/** School permission descriptors. Identity is resolved by the stack, never by request body. */
export const schoolPermissions = definePermissions("school", {
	course: {
		read: permission(
			z.object({
				scope: z.enum(["catalog", "course", "instructor"]),
				courseId: z.string().optional(),
				instructorId: z.string().optional(),
				status: z.string().optional(),
			}),
		),
		create: permission(z.object({ instructorId: z.string() })),
		manage: permission(courseFacts),
	},
	enrollment: {
		read: permission(
			z.object({
				courseId: z.string().optional(),
				instructorId: z.string().optional(),
				userId: z.string().optional(),
				scope: z.enum(["own", "students"]),
			}),
		),
		enroll: permission(courseFacts),
	},
	lesson: {
		read: permission(
			courseFacts.extend({ lessonId: z.string(), isFreePreview: z.boolean() }),
		),
		complete: permission(courseFacts.extend({ lessonId: z.string() })),
	},
	quiz: { submit: permission(courseFacts.extend({ lessonId: z.string() })) },
	certificate: { read: permission(z.object({ certificateId: z.string() })) },
});
