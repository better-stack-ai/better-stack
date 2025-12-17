# Zod v4 JSON Schema Demo

This example demonstrates the new JSON Schema features in Zod v4:

- **`z.toJSONSchema()`** - Convert a Zod schema to JSON Schema
- **`z.fromJSONSchema()`** - Convert a JSON Schema to a Zod schema (experimental)

## Getting Started

```bash
# Install dependencies
pnpm install

# Run the demo
pnpm start
```

## Features Demonstrated

### 1. Zod to JSON Schema Conversion

Convert complex Zod schemas with various validators into JSON Schema format:

```typescript
import * as z from "zod";

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.email(),
  age: z.number().int().min(0).max(150).optional(),
  role: z.enum(["admin", "user", "guest"]),
});

const jsonSchema = z.toJSONSchema(UserSchema);
```

### 2. JSON Schema to Zod Conversion

Convert a JSON Schema definition into a Zod schema for validation:

```typescript
const productJsonSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string", minLength: 1 },
    price: { type: "number", minimum: 0 },
  },
  required: ["id", "name", "price"],
};

const ProductSchema = z.fromJSONSchema(productJsonSchema);

// Use for validation
const result = ProductSchema.safeParse({ id: "1", name: "Widget", price: 9.99 });
```

### 3. Round-trip Conversion

Demonstrates converting Zod → JSON Schema → Zod and validating with the reconstructed schema.

## Documentation

For more information, see the official Zod JSON Schema documentation:
https://zod.dev/json-schema

> **Note:** `z.fromJSONSchema()` is experimental and may change in future releases.
