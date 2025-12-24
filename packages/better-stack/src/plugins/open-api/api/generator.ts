import type { Endpoint } from "better-call";
import type { BetterStackContext } from "../../../types";
import * as z from "zod";

/**
 * OpenAPI path operation object
 */
export interface PathOperation {
	tags?: string[];
	operationId?: string;
	description?: string;
	summary?: string;
	parameters?: OpenAPIParameter[];
	requestBody?: {
		required?: boolean;
		content: {
			"application/json": {
				schema: Record<string, any>;
			};
		};
	};
	responses: Record<string, any>;
}

export interface OpenAPIParameter {
	name: string;
	in: "query" | "path" | "header";
	required?: boolean;
	schema: Record<string, any>;
	description?: string;
}

/**
 * Convert :param to {param} for OpenAPI path format
 */
function toOpenApiPath(path: string): string {
	return path
		.split("/")
		.map((part) => (part.startsWith(":") ? `{${part.slice(1)}}` : part))
		.join("/");
}

/**
 * Get the primitive type from a Zod type
 */
function getTypeFromZodType(
	zodType: z.ZodType<any>,
): "string" | "number" | "boolean" | "array" | "object" | "integer" {
	// const typeName = zodType._zpiSkeleton?.type || zodType.constructor.name;

	if (zodType instanceof z.ZodString) return "string";
	if (zodType instanceof z.ZodNumber) return "number";
	if (zodType instanceof z.ZodBoolean) return "boolean";
	if (zodType instanceof z.ZodArray) return "array";
	if (zodType instanceof z.ZodObject) return "object";

	// Fallback based on type property if available
	const type = (zodType as any).type;
	if (type === "string") return "string";
	if (type === "number") return "number";
	if (type === "boolean") return "boolean";
	if (type === "array") return "array";
	if (type === "object") return "object";

	return "string";
}

/**
 * Process a Zod type into an OpenAPI schema
 */
function processZodType(zodType: z.ZodType<any>): Record<string, any> {
	// Handle optional
	if (zodType instanceof z.ZodOptional) {
		const innerType =
			(zodType as any)._def?.innerType || (zodType as any).unwrap?.();
		if (innerType) {
			const innerSchema = processZodType(innerType);
			return {
				...innerSchema,
				nullable: true,
			};
		}
	}

	// Handle nullable
	if (zodType instanceof z.ZodNullable) {
		const innerType =
			(zodType as any)._def?.innerType || (zodType as any).unwrap?.();
		if (innerType) {
			const innerSchema = processZodType(innerType);
			return {
				...innerSchema,
				nullable: true,
			};
		}
	}

	// Handle object
	if (zodType instanceof z.ZodObject) {
		const shape = (zodType as any).shape || (zodType as any)._def?.shape?.();
		if (shape) {
			const properties: Record<string, any> = {};
			const required: string[] = [];

			for (const [key, value] of Object.entries(shape)) {
				if (value instanceof z.ZodType) {
					properties[key] = processZodType(value);
					if (!(value instanceof z.ZodOptional)) {
						required.push(key);
					}
				}
			}

			return {
				type: "object",
				properties,
				...(required.length > 0 ? { required } : {}),
			};
		}
	}

	// Handle array
	if (zodType instanceof z.ZodArray) {
		const elementType = (zodType as any)._def?.type || (zodType as any).element;
		return {
			type: "array",
			items: elementType ? processZodType(elementType) : { type: "string" },
		};
	}

	// Handle enum
	if (zodType instanceof z.ZodEnum) {
		const values = (zodType as any)._def?.values || (zodType as any).options;
		return {
			type: "string",
			enum: values,
		};
	}

	// Handle literal
	if (zodType instanceof z.ZodLiteral) {
		const value = (zodType as any)._def?.value || (zodType as any).value;
		// Map JavaScript typeof to OpenAPI 3.1 types correctly
		// Note: typeof null === "object" in JS, but OpenAPI 3.1 has "null" type
		let type: string;
		if (value === null) {
			type = "null";
		} else if (value === undefined) {
			// undefined is not a valid JSON/OpenAPI value, treat as nullable
			return { nullable: true };
		} else {
			type = typeof value;
		}
		return {
			type,
			const: value,
		};
	}

	// Handle union
	if (zodType instanceof z.ZodUnion) {
		const options = (zodType as any)._def?.options || (zodType as any).options;
		if (options && Array.isArray(options)) {
			return {
				oneOf: options.map((opt: z.ZodType<any>) => processZodType(opt)),
			};
		}
	}

	// Handle coerce types
	if ((zodType as any)._def?.coerce) {
		const innerType = (zodType as any)._def?.innerType;
		if (innerType) {
			return processZodType(innerType);
		}
	}

	// Default to primitive type
	return {
		type: getTypeFromZodType(zodType),
	};
}

/**
 * Extract query parameters from endpoint options
 */
function getParameters(options: any): OpenAPIParameter[] {
	const parameters: OpenAPIParameter[] = [];

	// Handle query parameters
	if (options.query instanceof z.ZodObject) {
		const shape =
			(options.query as any).shape || (options.query as any)._def?.shape?.();
		if (shape) {
			for (const [key, value] of Object.entries(shape)) {
				if (value instanceof z.ZodType) {
					parameters.push({
						name: key,
						in: "query",
						required: !(value instanceof z.ZodOptional),
						schema: processZodType(value),
					});
				}
			}
		}
	}

	// Handle path parameters from params schema
	if (options.params instanceof z.ZodObject) {
		const shape =
			(options.params as any).shape || (options.params as any)._def?.shape?.();
		if (shape) {
			for (const [key, value] of Object.entries(shape)) {
				if (value instanceof z.ZodType) {
					parameters.push({
						name: key,
						in: "path",
						required: true,
						schema: processZodType(value),
					});
				}
			}
		}
	}

	return parameters;
}

/**
 * Extract request body schema from endpoint options
 */
function getRequestBody(
	options: any,
): PathOperation["requestBody"] | undefined {
	if (!options.body) return undefined;

	if (
		options.body instanceof z.ZodObject ||
		options.body instanceof z.ZodOptional
	) {
		const schema = processZodType(options.body);
		return {
			required: !(options.body instanceof z.ZodOptional),
			content: {
				"application/json": {
					schema,
				},
			},
		};
	}

	return undefined;
}

/**
 * Create a fresh error schema object to avoid circular references in JSON serialization
 */
function createErrorSchema(): Record<string, any> {
	return {
		type: "object",
		properties: {
			message: { type: "string" },
		},
		required: ["message"],
	};
}

/**
 * Generate standard error responses (creates fresh objects to avoid circular refs)
 */
function getErrorResponses(): Record<string, any> {
	return {
		"400": {
			description: "Bad Request",
			content: { "application/json": { schema: createErrorSchema() } },
		},
		"401": {
			description: "Unauthorized",
			content: { "application/json": { schema: createErrorSchema() } },
		},
		"403": {
			description: "Forbidden",
			content: { "application/json": { schema: createErrorSchema() } },
		},
		"404": {
			description: "Not Found",
			content: { "application/json": { schema: createErrorSchema() } },
		},
		"500": {
			description: "Internal Server Error",
			content: { "application/json": { schema: createErrorSchema() } },
		},
	};
}

/**
 * Generate OpenAPI 3.1 schema from Better Stack context
 */
export function generateOpenAPISchema(
	context: BetterStackContext,
	options?: { title?: string; description?: string; version?: string },
): Record<string, any> {
	const paths: Record<string, Record<string, PathOperation>> = {};
	const tags: Array<{ name: string; description: string }> = [];

	// Iterate over all plugins
	for (const [pluginKey, plugin] of Object.entries(context.plugins)) {
		// Skip the open-api plugin itself
		if (pluginKey === "openApi" || plugin.name === "open-api") {
			continue;
		}

		// Get plugin routes
		const pluginRoutes = plugin.routes(context.adapter, context);

		// Create tag for this plugin
		const tagName = pluginKey.charAt(0).toUpperCase() + pluginKey.slice(1);
		tags.push({
			name: tagName,
			description: `${tagName} plugin endpoints`,
		});

		// Process each endpoint
		for (const [routeKey, endpoint] of Object.entries(pluginRoutes)) {
			const ep = endpoint as Endpoint;

			// Access endpoint properties
			const path = (ep as any).path;
			const endpointOptions = (ep as any).options || {};
			const method = (endpointOptions.method || "GET").toLowerCase();

			if (!path) continue;

			const openApiPath = toOpenApiPath(path);

			// Initialize path object if needed
			if (!paths[openApiPath]) {
				paths[openApiPath] = {};
			}

			// Build operation object
			const operation: PathOperation = {
				tags: [tagName],
				operationId: `${pluginKey}_${routeKey}`,
				summary: endpointOptions.metadata?.openapi?.summary,
				description: endpointOptions.metadata?.openapi?.description,
				parameters: getParameters(endpointOptions),
				responses: {
					"200": {
						description: "Successful response",
						content: {
							"application/json": {
								schema: { type: "object" },
							},
						},
					},
					...getErrorResponses(),
				},
			};

			// Add request body for POST/PUT/PATCH
			if (["post", "put", "patch"].includes(method)) {
				const requestBody = getRequestBody(endpointOptions);
				if (requestBody) {
					operation.requestBody = requestBody;
				}
			}

			paths[openApiPath][method] = operation;
		}
	}

	return {
		openapi: "3.1.0",
		info: {
			title: options?.title || "Better Stack API",
			description:
				options?.description ||
				"API Reference for your Better Stack application",
			version: options?.version || "1.0.0",
		},
		servers: [
			{
				url: context.basePath,
				description: "API Server",
			},
		],
		tags,
		paths,
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					description: "Bearer token authentication",
				},
				cookieAuth: {
					type: "apiKey",
					in: "cookie",
					name: "session",
					description: "Session cookie authentication",
				},
			},
		},
	};
}
