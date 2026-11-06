import { createDbPlugin } from "@btst/db";

export const calendarSchema = createDbPlugin("calendar", {
	calendarHost: {
		modelName: "calendarHost",
		fields: {
			hostId: { type: "string", required: true, unique: true },
			lockVersion: { type: "string", required: true },
		},
	},
	calendarEventType: {
		modelName: "calendarEventType",
		fields: {
			hostId: { type: "string", required: true },
			slug: { type: "string", required: true, unique: true },
			name: { type: "string", required: true },
			description: { type: "string", required: true },
			location: { type: "string", required: true },
			duration: { type: "number", required: true },
			capacity: { type: "number", required: true },
			price: { type: "number", required: false },
			currency: { type: "string", required: false },
			timezone: { type: "string", required: true },
			weeklyAvailability: { type: "string", required: true },
			dateOverrides: { type: "string", required: true },
			limits: { type: "string", required: true },
			active: { type: "boolean", required: true },
			createdAt: { type: "date", required: true },
			updatedAt: { type: "date", required: true },
		},
	},
	calendarBooking: {
		modelName: "calendarBooking",
		fields: {
			eventTypeId: { type: "string", required: true },
			hostId: { type: "string", required: true },
			eventName: { type: "string", required: true },
			start: { type: "date", required: true },
			end: { type: "date", required: true },
			timezone: { type: "string", required: true },
			name: { type: "string", required: true },
			email: { type: "string", required: true },
			status: { type: "string", required: true },
			cancelToken: { type: "string", required: true, unique: true },
			createdAt: { type: "date", required: true },
		},
	},
});
