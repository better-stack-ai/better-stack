import { createDbPlugin } from "@btst/db";

/**
 * Form Builder plugin schema
 * Defines the database tables for forms and form submissions
 */
export const formBuilderSchema = createDbPlugin("form-builder", {
	form: {
		modelName: "form",
		fields: {
			name: {
				type: "string",
				required: true,
			},
			slug: {
				type: "string",
				required: true,
				unique: true,
			},
			description: {
				type: "string",
				required: false,
			},
			// JSON Schema stored as string (includes steps, fieldType, stepGroup, etc.)
			schema: {
				type: "string",
				required: true,
			},
			// Optional custom success message after submission
			successMessage: {
				type: "string",
				required: false,
			},
			// Optional redirect URL after submission
			redirectUrl: {
				type: "string",
				required: false,
			},
			// Form status: active, inactive, archived
			status: {
				type: "string",
				defaultValue: "active",
			},
			// User who created the form
			createdBy: {
				type: "string",
				required: false,
			},
			createdAt: {
				type: "date",
				defaultValue: () => new Date(),
			},
			updatedAt: {
				type: "date",
				defaultValue: () => new Date(),
			},
		},
	},
	formSubmission: {
		modelName: "formSubmission",
		fields: {
			formId: {
				type: "string",
				required: true,
				// Database reference for efficient joins
				references: {
					model: "form",
					field: "id",
					onDelete: "cascade",
				},
			},
			// Submitted data as JSON string
			data: {
				type: "string",
				required: true,
			},
			// Submission timestamp
			submittedAt: {
				type: "date",
				defaultValue: () => new Date(),
			},
			// Optional user ID if authenticated
			submittedBy: {
				type: "string",
				required: false,
			},
			// IP address for rate limiting and spam protection
			ipAddress: {
				type: "string",
				required: false,
			},
			// User agent for analytics
			userAgent: {
				type: "string",
				required: false,
			},
		},
	},
});
