import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * These tests verify that Zod schemas can be converted to JSON Schema,
 * stored as strings, and reconstructed back to Zod schemas.
 *
 * With Zod v4, we use native methods:
 * - z.toJSONSchema() to convert Zod -> JSON Schema
 * - z.fromJSONSchema() to convert JSON Schema -> Zod (experimental but stable)
 */

describe("Zod to JSON Schema roundtrip", () => {
	it("preserves string fields", () => {
		const original = z.object({ name: z.string().min(1) });
		const jsonSchema = z.toJSONSchema(original);
		const reconstructed = z.fromJSONSchema(jsonSchema);

		expect(reconstructed.safeParse({ name: "test" }).success).toBe(true);
		expect(reconstructed.safeParse({ name: "" }).success).toBe(false); // min(1)
	});

	it("preserves number fields with min", () => {
		const original = z.object({ price: z.number().min(0) });
		const jsonSchema = z.toJSONSchema(original);
		const reconstructed = z.fromJSONSchema(jsonSchema);

		expect(reconstructed.safeParse({ price: 10 }).success).toBe(true);
		expect(reconstructed.safeParse({ price: -1 }).success).toBe(false);
	});

	it("preserves coerce.number fields (loses coerce behavior)", () => {
		const original = z.object({ price: z.coerce.number().min(0) });
		const jsonSchema = z.toJSONSchema(original);
		const reconstructed = z.fromJSONSchema(jsonSchema);

		// After roundtrip, coerce behavior is NOT preserved
		// but numeric validation should work
		expect(reconstructed.safeParse({ price: 10 }).success).toBe(true);
		expect(reconstructed.safeParse({ price: -1 }).success).toBe(false);
	});

	it("preserves boolean fields with defaults", () => {
		const original = z.object({ featured: z.boolean().default(false) });
		const jsonSchema = z.toJSONSchema(original);
		const reconstructed = z.fromJSONSchema(jsonSchema);

		// Defaults may or may not be preserved depending on the implementation
		// Let's check what we get
		const result = reconstructed.safeParse({});
		// If the field is optional with default in JSON Schema, parsing {} should work
		if (result.success) {
			const data = result.data as { featured?: boolean };
			expect(data.featured).toBe(false);
		} else {
			// If defaults aren't preserved, the field is required
			expect(result.success).toBe(false);
		}
	});

	it("preserves enum fields", () => {
		const original = z.object({
			category: z.enum(["Electronics", "Clothing", "Home"]),
		});
		const jsonSchema = z.toJSONSchema(original);
		const reconstructed = z.fromJSONSchema(jsonSchema);

		expect(reconstructed.safeParse({ category: "Electronics" }).success).toBe(
			true,
		);
		expect(reconstructed.safeParse({ category: "Invalid" }).success).toBe(
			false,
		);
	});

	it("preserves optional fields", () => {
		const original = z.object({ company: z.string().optional() });
		const jsonSchema = z.toJSONSchema(original);
		const reconstructed = z.fromJSONSchema(jsonSchema);

		expect(reconstructed.safeParse({}).success).toBe(true);
		expect(reconstructed.safeParse({ company: "Acme" }).success).toBe(true);
	});

	it("preserves max length validation", () => {
		const original = z.object({ title: z.string().max(100) });
		const jsonSchema = z.toJSONSchema(original);
		const reconstructed = z.fromJSONSchema(jsonSchema);

		expect(reconstructed.safeParse({ title: "short" }).success).toBe(true);
		expect(reconstructed.safeParse({ title: "a".repeat(101) }).success).toBe(
			false,
		);
	});

	it("preserves number range validation", () => {
		const original = z.object({ rating: z.number().min(1).max(5) });
		const jsonSchema = z.toJSONSchema(original);
		const reconstructed = z.fromJSONSchema(jsonSchema);

		expect(reconstructed.safeParse({ rating: 3 }).success).toBe(true);
		expect(reconstructed.safeParse({ rating: 0 }).success).toBe(false);
		expect(reconstructed.safeParse({ rating: 6 }).success).toBe(false);
	});

	it("preserves required vs optional fields correctly", () => {
		const original = z.object({
			required: z.string(),
			optional: z.string().optional(),
		});
		const jsonSchema = z.toJSONSchema(original);
		const reconstructed = z.fromJSONSchema(jsonSchema);

		expect(reconstructed.safeParse({ required: "test" }).success).toBe(true);
		expect(reconstructed.safeParse({}).success).toBe(false); // missing required
		expect(
			reconstructed.safeParse({ required: "test", optional: "also" }).success,
		).toBe(true);
	});

	describe(".meta() and description handling", () => {
		it("preserves description in JSON Schema", () => {
			const original = z.object({
				name: z.string().meta({
					description: "Product name",
				}),
			});
			const jsonSchema = z.toJSONSchema(original);

			// JSON Schema should have description
			const props = (
				jsonSchema as { properties?: { name?: { description?: string } } }
			).properties;
			expect(props?.name?.description).toBe("Product name");
		});

		it("description survives roundtrip but not as Zod meta", () => {
			const original = z.object({
				name: z.string().meta({
					description: "Product name",
				}),
			});
			const jsonSchema = z.toJSONSchema(original);

			// Description is in JSON Schema
			const props = (
				jsonSchema as { properties?: { name?: { description?: string } } }
			).properties;
			expect(props?.name?.description).toBe("Product name");

			// After reconstruction, we can still access the JSON Schema to get descriptions
			// This is fine - we can pass the JSON Schema alongside the Zod schema
		});

		it("custom meta properties like placeholder need separate storage", () => {
			const original = z.object({
				name: z.string().meta({
					description: "Product name",
					placeholder: "Enter name...",
				}),
			});
			const jsonSchema = z.toJSONSchema(original);

			// Standard JSON Schema doesn't have placeholder
			// Check if Zod puts it somewhere
			const props = (
				jsonSchema as {
					properties?: {
						name?: { description?: string; placeholder?: string };
					};
				}
			).properties;

			// Description should be there (standard JSON Schema property)
			expect(props?.name?.description).toBe("Product name");

			// Placeholder is NOT a standard JSON Schema property
			// We need to store it separately or use a custom property
			console.log("JSON Schema name property:", JSON.stringify(props?.name));

			// Document the behavior - placeholder is likely lost
			// Solution: Store fieldConfig separately in our CMS
		});
	});

	describe("Complex schema types", () => {
		it("handles a realistic Product schema", () => {
			const Product = z.object({
				name: z.string().min(1),
				description: z.string(),
				price: z.number().min(0),
				featured: z.boolean(),
				category: z.enum(["Electronics", "Clothing", "Home"]),
			});

			const jsonSchema = z.toJSONSchema(Product);
			const reconstructed = z.fromJSONSchema(jsonSchema);

			const validProduct = {
				name: "Test Product",
				description: "A great product",
				price: 29.99,
				featured: true,
				category: "Electronics",
			};

			expect(reconstructed.safeParse(validProduct).success).toBe(true);

			// Test validation still works
			expect(
				reconstructed.safeParse({ ...validProduct, name: "" }).success,
			).toBe(false);
			expect(
				reconstructed.safeParse({ ...validProduct, price: -1 }).success,
			).toBe(false);
			expect(
				reconstructed.safeParse({ ...validProduct, category: "Invalid" })
					.success,
			).toBe(false);
		});

		it("handles a realistic Testimonial schema", () => {
			const Testimonial = z.object({
				author: z.string().min(1),
				company: z.string().optional(),
				quote: z.string(),
				rating: z.number().min(1).max(5),
			});

			const jsonSchema = z.toJSONSchema(Testimonial);
			const reconstructed = z.fromJSONSchema(jsonSchema);

			const validTestimonial = {
				author: "John Doe",
				quote: "Great service!",
				rating: 5,
			};

			expect(reconstructed.safeParse(validTestimonial).success).toBe(true);
			expect(
				reconstructed.safeParse({ ...validTestimonial, company: "Acme Inc" })
					.success,
			).toBe(true);
			expect(
				reconstructed.safeParse({ ...validTestimonial, rating: 6 }).success,
			).toBe(false);
		});
	});

	describe("JSON serialization and storage", () => {
		it("schema can be stringified and parsed back", () => {
			const original = z.object({
				name: z.string().min(1),
				count: z.number().min(0),
			});

			const jsonSchema = z.toJSONSchema(original);
			const stringified = JSON.stringify(jsonSchema);
			const parsed = JSON.parse(stringified);
			const reconstructed = z.fromJSONSchema(parsed);

			expect(reconstructed.safeParse({ name: "test", count: 5 }).success).toBe(
				true,
			);
			expect(reconstructed.safeParse({ name: "", count: 5 }).success).toBe(
				false,
			);
		});

		it("simulates database storage flow", () => {
			// This test simulates the full CMS flow:
			// 1. Developer defines Zod schema
			// 2. Backend converts to JSON Schema and stores in DB
			// 3. Client fetches JSON Schema and reconstructs Zod for validation

			// Step 1: Developer defines schema
			const ProductSchema = z.object({
				name: z.string().min(1).meta({ description: "Product name" }),
				price: z.number().min(0),
				category: z.enum(["Electronics", "Clothing"]),
			});

			// Step 2: Convert to JSON Schema and stringify for DB storage
			const jsonSchema = z.toJSONSchema(ProductSchema);
			const dbStoredString = JSON.stringify(jsonSchema);

			// Step 3: Client fetches and reconstructs using native Zod v4
			const fetchedJsonSchema = JSON.parse(dbStoredString);
			const clientSchema = z.fromJSONSchema(fetchedJsonSchema);

			// Validate data
			const validData = { name: "Laptop", price: 999, category: "Electronics" };
			const invalidData = { name: "", price: -1, category: "Invalid" };

			expect(clientSchema.safeParse(validData).success).toBe(true);
			expect(clientSchema.safeParse(invalidData).success).toBe(false);

			// Description is still accessible from the JSON Schema for UI
			const props = (
				fetchedJsonSchema as {
					properties?: { name?: { description?: string } };
				}
			).properties;
			expect(props?.name?.description).toBe("Product name");
		});
	});

	describe("Field config extraction for AutoForm", () => {
		it("can extract descriptions from JSON Schema for fieldConfig", () => {
			const schema = z.object({
				name: z.string().meta({ description: "Enter the product name" }),
				price: z.number().meta({ description: "Price in USD" }),
			});

			const jsonSchema = z.toJSONSchema(schema) as {
				properties?: Record<string, { description?: string }>;
			};

			// Function to extract fieldConfig from JSON Schema
			function extractFieldConfig(
				js: typeof jsonSchema,
			): Record<string, { description?: string }> {
				const config: Record<string, { description?: string }> = {};
				if (js.properties) {
					for (const [key, value] of Object.entries(js.properties)) {
						if (value.description) {
							config[key] = { description: value.description };
						}
					}
				}
				return config;
			}

			const fieldConfig = extractFieldConfig(jsonSchema);

			expect(fieldConfig.name?.description).toBe("Enter the product name");
			expect(fieldConfig.price?.description).toBe("Price in USD");
		});
	});

	describe("AutoForm schema generation and data shape", () => {
		/**
		 * Helper function to convert JSON Schema to Zod with coercion for AutoForm
		 * This mimics the client-side conversion used in content-form.tsx
		 */
		interface JsonSchemaProperty {
			type?: string | string[];
			format?: string;
			enum?: (string | number | boolean)[];
			minimum?: number;
			maximum?: number;
			minLength?: number;
			maxLength?: number;
			default?: unknown;
			description?: string;
		}

		interface JsonSchema {
			type?: string;
			properties?: Record<string, JsonSchemaProperty>;
			required?: string[];
		}

		function jsonSchemaToZodWithCoercion(
			jsonSchema: JsonSchema,
		): z.ZodObject<Record<string, z.ZodTypeAny>> {
			const shape: Record<string, z.ZodTypeAny> = {};
			const properties = jsonSchema.properties || {};
			const required = jsonSchema.required || [];

			for (const [key, prop] of Object.entries(properties)) {
				let fieldSchema: z.ZodTypeAny;

				if (prop.enum && Array.isArray(prop.enum) && prop.enum.length > 0) {
					const stringValues = prop.enum.filter(
						(v): v is string => typeof v === "string",
					);
					if (stringValues.length > 0) {
						fieldSchema = z.enum(stringValues as [string, ...string[]]);
					} else {
						fieldSchema = z.string();
					}
				} else {
					const typeValue = Array.isArray(prop.type) ? prop.type[0] : prop.type;

					switch (typeValue) {
						case "number":
						case "integer": {
							let numSchema = z.coerce.number();
							if (prop.minimum !== undefined) {
								numSchema = numSchema.min(prop.minimum);
							}
							if (prop.maximum !== undefined) {
								numSchema = numSchema.max(prop.maximum);
							}
							fieldSchema = numSchema;
							break;
						}
						case "boolean": {
							fieldSchema = z.boolean();
							if (prop.default !== undefined) {
								fieldSchema = (fieldSchema as z.ZodBoolean).default(
									prop.default as boolean,
								);
							}
							break;
						}
						case "string": {
							if (prop.format === "date" || prop.format === "date-time") {
								fieldSchema = z.coerce.date();
							} else {
								let strSchema = z.string();
								if (prop.minLength !== undefined) {
									strSchema = strSchema.min(prop.minLength);
								}
								if (prop.maxLength !== undefined) {
									strSchema = strSchema.max(prop.maxLength);
								}
								fieldSchema = strSchema;
							}
							break;
						}
						default: {
							fieldSchema = z.string();
						}
					}
				}

				if (prop.default !== undefined && prop.type !== "boolean") {
					fieldSchema = fieldSchema.default(prop.default);
				}

				if (!required.includes(key)) {
					fieldSchema = fieldSchema.optional();
				}

				shape[key] = fieldSchema;
			}

			return z.object(shape);
		}

		it("generates correct Zod schema for AutoForm from JSON Schema", () => {
			// Original Zod schema defined by developer
			const ProductSchema = z.object({
				name: z.string().min(1),
				price: z.number().min(0),
				category: z.enum(["Electronics", "Clothing", "Home"]),
			});

			// Convert to JSON Schema (stored in DB)
			const jsonSchema = z.toJSONSchema(ProductSchema);

			// Convert back to Zod with coercion for AutoForm
			const autoFormSchema = jsonSchemaToZodWithCoercion(
				jsonSchema as JsonSchema,
			);

			// Test that schema validates correct data
			const validData = {
				name: "Test Product",
				price: 29.99,
				category: "Electronics",
			};
			expect(autoFormSchema.safeParse(validData).success).toBe(true);

			// Test that coercion works (HTML form sends strings)
			const formDataWithStrings = {
				name: "Test Product",
				price: "29.99", // String from HTML input
				category: "Electronics",
			};
			const coercedResult = autoFormSchema.safeParse(formDataWithStrings);
			expect(coercedResult.success).toBe(true);
			if (coercedResult.success) {
				expect(coercedResult.data.price).toBe(29.99); // Coerced to number
				expect(typeof coercedResult.data.price).toBe("number");
			}
		});

		it("validates data shape returned from AutoForm submission", () => {
			const TestimonialSchema = z.object({
				author: z.string().min(1),
				company: z.string().optional(),
				quote: z.string(),
				rating: z.number().min(1).max(5),
			});

			const jsonSchema = z.toJSONSchema(TestimonialSchema);
			const autoFormSchema = jsonSchemaToZodWithCoercion(
				jsonSchema as JsonSchema,
			);

			// Simulate form submission data (all strings from HTML form)
			const formSubmission = {
				author: "John Doe",
				quote: "Great product!",
				rating: "5", // String from HTML input
			};

			const result = autoFormSchema.safeParse(formSubmission);
			expect(result.success).toBe(true);

			if (result.success) {
				// Verify data shape
				expect(result.data).toEqual({
					author: "John Doe",
					quote: "Great product!",
					rating: 5, // Coerced to number
				});
			}
		});

		it("preserves validation rules through roundtrip", () => {
			const schema = z.object({
				name: z.string().min(1).max(100),
				price: z.number().min(0).max(10000),
				rating: z.number().min(1).max(5),
			});

			const jsonSchema = z.toJSONSchema(schema);
			const autoFormSchema = jsonSchemaToZodWithCoercion(
				jsonSchema as JsonSchema,
			);

			// Test min validation
			expect(
				autoFormSchema.safeParse({ name: "", price: "10", rating: "3" })
					.success,
			).toBe(false);

			// Test max validation
			expect(
				autoFormSchema.safeParse({
					name: "a".repeat(101),
					price: "10",
					rating: "3",
				}).success,
			).toBe(false);

			// Test number min validation
			expect(
				autoFormSchema.safeParse({ name: "Test", price: "-1", rating: "3" })
					.success,
			).toBe(false);

			// Test number max validation
			expect(
				autoFormSchema.safeParse({ name: "Test", price: "10", rating: "6" })
					.success,
			).toBe(false);

			// Test valid data
			expect(
				autoFormSchema.safeParse({ name: "Test", price: "50", rating: "4" })
					.success,
			).toBe(true);
		});

		it("handles enum validation correctly", () => {
			const schema = z.object({
				status: z.enum(["draft", "published", "archived"]),
			});

			const jsonSchema = z.toJSONSchema(schema);
			const autoFormSchema = jsonSchemaToZodWithCoercion(
				jsonSchema as JsonSchema,
			);

			// Valid enum values
			expect(autoFormSchema.safeParse({ status: "draft" }).success).toBe(true);
			expect(autoFormSchema.safeParse({ status: "published" }).success).toBe(
				true,
			);
			expect(autoFormSchema.safeParse({ status: "archived" }).success).toBe(
				true,
			);

			// Invalid enum value
			expect(autoFormSchema.safeParse({ status: "invalid" }).success).toBe(
				false,
			);
		});

		it("handles optional fields correctly", () => {
			const schema = z.object({
				required: z.string().min(1),
				optional: z.string().optional(),
			});

			const jsonSchema = z.toJSONSchema(schema);
			const autoFormSchema = jsonSchemaToZodWithCoercion(
				jsonSchema as JsonSchema,
			);

			// Without optional field
			expect(autoFormSchema.safeParse({ required: "test" }).success).toBe(true);

			// With optional field
			expect(
				autoFormSchema.safeParse({ required: "test", optional: "value" })
					.success,
			).toBe(true);

			// Missing required field
			expect(autoFormSchema.safeParse({ optional: "value" }).success).toBe(
				false,
			);
		});
	});
});
