export const nestedSchema = {
	type: "object" as const,
	properties: {
		address: {
			type: "object",
			label: "Address",
			required: ["city"],
			default: { country: "CA", city: "Toronto" },
			properties: {
				country: {
					type: "string",
					label: "Country",
					enum: ["CA", "US"],
					default: "CA",
				},
				city: {
					type: "string",
					label: "City",
					minLength: 2,
					description: "Keep this validation",
					showIf: {
						field: "country",
						operator: "equals" as const,
						value: "CA",
					},
					customMetadata: { source: "manual" },
				},
			},
		},
		members: {
			type: "array",
			label: "Members",
			minItems: 1,
			default: [{ name: "Ada", active: true }],
			items: {
				type: "object",
				required: ["name"],
				description: "Member template",
				properties: {
					name: { type: "string", label: "Name", minLength: 2 },
					active: { type: "boolean", label: "Active", default: true },
					notes: {
						type: "string",
						label: "Notes",
						showIf: { field: "active", operator: "isTruthy" as const },
					},
				},
			},
		},
	},
};
export const nestedPatch = {
	type: "object",
	properties: {
		address: {
			type: "object",
			properties: {
				city: { type: "string", label: "Home city" },
				postcode: { type: "string", label: "Postcode" },
			},
		},
		members: {
			type: "array",
			items: {
				type: "object",
				properties: {
					name: { type: "string", label: "Member name" },
					phone: { type: "string", label: "Phone" },
				},
			},
		},
	},
};
export const nestedAddPatch = {
	type: "object",
	properties: {
		address: {
			type: "object",
			properties: { postcode: { type: "string", label: "Postcode" } },
		},
		members: {
			type: "array",
			items: {
				type: "object",
				properties: { phone: { type: "string", label: "Phone" } },
			},
		},
	},
};
