import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";

const formStatusSchema = z.enum(["active", "inactive", "archived"]);

const resolvedFormFacts = {
	formId: z.string(),
	ownerId: z.string().optional(),
	status: formStatusSchema,
};

/** Browser-safe, schema-backed permissions published by Form Builder. */
export const formBuilderPermissions = definePermissions("forms", {
	form: {
		/** Read the admin collection or one admin record. */
		read: permission(
			z.discriminatedUnion("scope", [
				z.object({ scope: z.literal("collection") }),
				z.object({
					scope: z.literal("record"),
					formId: z.string(),
					exists: z.boolean(),
					ownerId: z.string().optional(),
					status: formStatusSchema.optional(),
				}),
			]),
		),
		/** Render one public form resolved by slug. */
		render: permission(
			z.object({
				slug: z.string(),
				exists: z.boolean(),
				formId: z.string().optional(),
				ownerId: z.string().optional(),
				status: formStatusSchema.optional(),
			}),
		),
		/** Create a form. */
		create: permission(),
		/** Update a server-resolved form. */
		update: permission(
			z.object({
				...resolvedFormFacts,
			}),
		),
		/** Delete a server-resolved form and its submissions. */
		delete: permission(
			z.object({
				...resolvedFormFacts,
			}),
		),
	},
	submission: {
		/** Submit to a public, server-resolved form. */
		create: permission(
			z.object({
				slug: z.string(),
				exists: z.boolean(),
				formId: z.string().optional(),
				ownerId: z.string().optional(),
				status: formStatusSchema.optional(),
			}),
		),
		/** Read a form's collection or one server-resolved submission. */
		read: permission(
			z.discriminatedUnion("scope", [
				z.object({
					scope: z.literal("collection"),
					formId: z.string(),
					formExists: z.boolean(),
					ownerId: z.string().optional(),
				}),
				z.object({
					scope: z.literal("record"),
					formId: z.string(),
					submissionId: z.string(),
					exists: z.boolean(),
					ownerId: z.string().optional(),
					submittedBy: z.string().optional(),
				}),
			]),
		),
		/** Delete a server-resolved submission. */
		delete: permission(
			z.object({
				formId: z.string(),
				submissionId: z.string(),
				exists: z.boolean(),
				ownerId: z.string().optional(),
				submittedBy: z.string().optional(),
			}),
		),
	},
});
