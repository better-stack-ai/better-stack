import * as z from "zod";

console.log("=".repeat(60));
console.log("Zod v4 JSON Schema Demo");
console.log("=".repeat(60));

// ============================================================================
// Part 1: Convert Zod Schema to JSON Schema
// ============================================================================

console.log("\n📤 Part 1: Zod Schema → JSON Schema\n");

// Define a simple Zod schema for a User
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.email(),
  age: z.number().int().min(0).max(150).optional(),
  isActive: z.boolean().default(true),
  role: z.enum(["admin", "user", "guest"]),
  tags: z.array(z.string()).default([]),
  createdAt: z.iso.datetime(),
});

// Convert Zod schema to JSON Schema
const userJsonSchema = z.toJSONSchema(UserSchema);

console.log("Zod User Schema converted to JSON Schema:");
console.log(JSON.stringify(userJsonSchema, null, 2));

// ============================================================================
// Part 2: Convert JSON Schema to Zod Schema and Validate
// ============================================================================

console.log("\n" + "=".repeat(60));
console.log("\n📥 Part 2: JSON Schema → Zod Schema (with validation)\n");

// Define a JSON Schema for a Product
const productJsonSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string", minLength: 1 },
    price: { type: "number", minimum: 0 },
    inStock: { type: "boolean" },
    categories: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["id", "name", "price"],
};

console.log("JSON Schema for Product:");
console.log(JSON.stringify(productJsonSchema, null, 2));

// Convert JSON Schema to Zod schema
const ProductSchema = z.fromJSONSchema(productJsonSchema);

console.log("\n✅ Converted to Zod schema successfully!\n");

// Test validation with valid data
const validProduct = {
  id: "prod-123",
  name: "Wireless Mouse",
  price: 29.99,
  inStock: true,
  categories: ["electronics", "accessories"],
};

console.log("Testing with valid data:");
console.log(JSON.stringify(validProduct, null, 2));

const validResult = ProductSchema.safeParse(validProduct);
if (validResult.success) {
  console.log("✅ Validation passed!");
  console.log("Parsed data:", validResult.data);
} else {
  console.log("❌ Validation failed:", validResult.error.issues);
}

// Test validation with invalid data
console.log("\n" + "-".repeat(40));
console.log("\nTesting with invalid data:");

const invalidProduct = {
  id: "prod-456",
  name: "", // Empty name - should fail minLength
  price: -10, // Negative price - should fail minimum
};

console.log(JSON.stringify(invalidProduct, null, 2));

const invalidResult = ProductSchema.safeParse(invalidProduct);
if (invalidResult.success) {
  console.log("✅ Validation passed!");
} else {
  console.log("❌ Validation failed!");
  console.log("Errors:");
  for (const issue of invalidResult.error.issues) {
    console.log(`  - Path: ${issue.path.join(".")}, Message: ${issue.message}`);
  }
}

// ============================================================================
// Part 3: Round-trip demonstration
// ============================================================================

console.log("\n" + "=".repeat(60));
console.log("\n🔄 Part 3: Round-trip (Zod → JSON → Zod)\n");

// Create a simple schema
const SimpleSchema = z.object({
  title: z.string(),
  count: z.number().int(),
  enabled: z.boolean(),
});

// Convert to JSON Schema
const simpleJsonSchema = z.toJSONSchema(SimpleSchema);
console.log("Original Zod schema converted to JSON Schema:");
console.log(JSON.stringify(simpleJsonSchema, null, 2));

// Convert back to Zod schema
const ReconstructedSchema = z.fromJSONSchema(simpleJsonSchema);

// Validate with the reconstructed schema
const testData = { title: "Hello World", count: 42, enabled: true };
console.log("\nValidating with reconstructed schema:");
console.log("Input:", JSON.stringify(testData));

const roundTripResult = ReconstructedSchema.safeParse(testData);
if (roundTripResult.success) {
  console.log("✅ Round-trip validation successful!");
} else {
  console.log("❌ Round-trip validation failed:", roundTripResult.error.issues);
}

console.log("\n" + "=".repeat(60));
console.log("Demo complete!");
console.log("=".repeat(60));
