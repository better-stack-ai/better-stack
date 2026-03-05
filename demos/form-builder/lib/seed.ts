import type { Adapter } from "@btst/stack/plugins/api";

let seeded = false;

export async function seedFormBuilderData(adapter: Adapter) {
	if (seeded) return;
	seeded = true;

	try {
		const existing = await adapter.findMany({ model: "form", limit: 1 });
		if (existing.length > 0) return;

		const contactFormSchema = JSON.stringify({
			type: "object",
			properties: {
				name: {
					type: "string",
					title: "Your Name",
					"x-field-type": "text",
				},
				email: {
					type: "string",
					format: "email",
					title: "Email Address",
					"x-field-type": "text",
				},
				subject: {
					type: "string",
					title: "Subject",
					"x-field-type": "text",
				},
				message: {
					type: "string",
					title: "Message",
					"x-field-type": "textarea",
				},
				newsletter: {
					type: "boolean",
					title: "Subscribe to newsletter",
					"x-field-type": "switch",
					default: false,
				},
			},
			required: ["name", "email", "message"],
		});

		const feedbackFormSchema = JSON.stringify({
			type: "object",
			properties: {
				rating: {
					type: "string",
					title: "Rating",
					"x-field-type": "select",
					enum: ["1", "2", "3", "4", "5"],
					enumNames: [
						"⭐ Poor",
						"⭐⭐ Fair",
						"⭐⭐⭐ Good",
						"⭐⭐⭐⭐ Very Good",
						"⭐⭐⭐⭐⭐ Excellent",
					],
				},
				category: {
					type: "string",
					title: "Category",
					"x-field-type": "radio",
					enum: ["product", "support", "documentation", "other"],
					enumNames: ["Product", "Support", "Documentation", "Other"],
				},
				comments: {
					type: "string",
					title: "Comments",
					"x-field-type": "textarea",
				},
			},
			required: ["rating", "category"],
		});

		const now = new Date();

		await adapter.create({
			model: "form",
			data: {
				name: "Contact Us",
				slug: "contact-us",
				description: "A simple contact form for getting in touch.",
				schema: contactFormSchema,
				successMessage: "Thanks for reaching out! We'll get back to you soon.",
				status: "active",
				createdAt: now,
				updatedAt: now,
			},
		});

		await adapter.create({
			model: "form",
			data: {
				name: "Feedback Form",
				slug: "feedback",
				description: "Share your feedback about our product and services.",
				schema: feedbackFormSchema,
				successMessage: "Thank you for your feedback!",
				status: "active",
				createdAt: new Date(now.getTime() - 86400000),
				updatedAt: new Date(now.getTime() - 86400000),
			},
		});

		console.log("[demo] Form Builder seed complete — 2 forms created");
	} catch (err) {
		console.error("[demo] Form Builder seed failed:", err);
	}
}
