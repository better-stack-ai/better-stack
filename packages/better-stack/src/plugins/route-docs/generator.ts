import type { ClientStackContext, SitemapEntry } from "../../types";
import type { Route } from "@btst/yar";
import * as z from "zod";

/**
 * Represents a documented route parameter
 */
export interface RouteParameter {
	name: string;
	type: string;
	required: boolean;
	description?: string;
	schema?: Record<string, any>;
}

/**
 * Sitemap entry with plugin source
 */
export interface PluginSitemapEntry extends SitemapEntry {
	pluginKey: string;
}

/**
 * Represents a documented route
 */
export interface DocumentedRoute {
	/** Route key from the plugin */
	key: string;
	/** The route path pattern (e.g., "/users/:id") */
	path: string;
	/** Path parameters extracted from the path */
	pathParams: RouteParameter[];
	/** Query parameters from the route's query schema */
	queryParams: RouteParameter[];
	/** Route metadata */
	meta?: {
		title?: string;
		description?: string;
		tags?: string[];
		[key: string]: any;
	};
}

/**
 * Represents a plugin's documented routes
 */
export interface DocumentedPlugin {
	/** Plugin key */
	key: string;
	/** Plugin name */
	name: string;
	/** Routes from this plugin */
	routes: DocumentedRoute[];
	/** Sitemap entries from this plugin */
	sitemapEntries: PluginSitemapEntry[];
}

/**
 * The complete route documentation schema
 */
export interface RouteDocsSchema {
	/** All documented plugins */
	plugins: DocumentedPlugin[];
	/** Generation timestamp */
	generatedAt: string;
	/** All sitemap entries aggregated */
	allSitemapEntries: PluginSitemapEntry[];
}

/**
 * Extract path parameters from a route path pattern
 * e.g., "/users/:id/posts/:postId" => ["id", "postId"]
 */
function extractPathParams(path: string): string[] {
	const params: string[] = [];
	const segments = path.split("/");

	for (const segment of segments) {
		if (segment.startsWith(":")) {
			params.push(segment.slice(1));
		} else if (segment.startsWith("*:")) {
			// Wildcard with name: /*:splat
			params.push(segment.slice(2));
		} else if (segment === "*") {
			// Anonymous wildcard
			params.push("_");
		}
	}

	return params;
}

/**
 * Get the primitive type from a Zod type
 */
function getTypeFromZodType(zodType: z.ZodType<any>): string {
	if (zodType instanceof z.ZodString) return "string";
	if (zodType instanceof z.ZodNumber) return "number";
	if (zodType instanceof z.ZodBoolean) return "boolean";
	if (zodType instanceof z.ZodArray) return "array";
	if (zodType instanceof z.ZodObject) return "object";
	if (zodType instanceof z.ZodEnum) return "enum";
	if (zodType instanceof z.ZodLiteral) return "literal";
	if (zodType instanceof z.ZodUnion) return "union";

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
 * Process a Zod type into a simplified schema
 */
function processZodType(zodType: z.ZodType<any>): Record<string, any> {
	// Handle optional - unwrap and process inner type
	if (zodType instanceof z.ZodOptional) {
		const innerType =
			(zodType as any)._def?.innerType || (zodType as any).unwrap?.();
		if (innerType) {
			return processZodType(innerType);
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

	// Handle default - unwrap and process inner type
	if (zodType instanceof z.ZodDefault) {
		const innerType = (zodType as any)._def?.innerType;
		const defaultValue = (zodType as any)._def?.defaultValue?.();
		if (innerType) {
			const innerSchema = processZodType(innerType);
			if (defaultValue !== undefined) {
				return {
					...innerSchema,
					default: defaultValue,
				};
			}
			return innerSchema;
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
		return {
			type: typeof value,
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
 * Check if an object is a StandardSchemaV1 (Zod) schema
 */
function isStandardSchema(obj: any): boolean {
	return obj && typeof obj === "object" && "~standard" in obj;
}

/**
 * Extract query parameters from a route's query schema
 */
function extractQueryParams(querySchema: any): RouteParameter[] {
	const params: RouteParameter[] = [];

	if (!querySchema) return params;

	// Handle Zod objects directly
	if (querySchema instanceof z.ZodObject) {
		const shape =
			(querySchema as any).shape || (querySchema as any)._def?.shape?.();
		if (shape) {
			for (const [key, value] of Object.entries(shape)) {
				if (value instanceof z.ZodType) {
					params.push({
						name: key,
						type: getTypeFromZodType(value),
						required: !(value instanceof z.ZodOptional),
						schema: processZodType(value),
					});
				}
			}
		}
	}
	// Handle StandardSchemaV1 (which Zod implements)
	else if (isStandardSchema(querySchema)) {
		// Try to access the underlying Zod schema
		const zodSchema = querySchema;
		if (zodSchema instanceof z.ZodObject) {
			return extractQueryParams(zodSchema);
		}
	}

	return params;
}

/**
 * Fetch sitemap data from all plugins
 */
export async function fetchAllSitemapEntries(
	context: ClientStackContext,
): Promise<PluginSitemapEntry[]> {
	const allEntries: PluginSitemapEntry[] = [];

	for (const [pluginKey, plugin] of Object.entries(context.plugins)) {
		// Skip route-docs plugin
		if (pluginKey === "routeDocs" || plugin.name === "route-docs") {
			continue;
		}

		if (plugin.sitemap) {
			try {
				const entries = await plugin.sitemap();
				for (const entry of entries) {
					allEntries.push({
						...entry,
						pluginKey,
					});
				}
			} catch (error) {
				console.warn(`Failed to fetch sitemap for plugin ${pluginKey}:`, error);
			}
		}
	}

	return allEntries;
}

/**
 * Generate route documentation schema from client stack context
 */
export function generateRouteDocsSchema(
	context: ClientStackContext,
	sitemapEntries: PluginSitemapEntry[] = [],
): RouteDocsSchema {
	const documentedPlugins: DocumentedPlugin[] = [];

	// Group sitemap entries by plugin
	const sitemapByPlugin: Record<string, PluginSitemapEntry[]> = {};
	for (const entry of sitemapEntries) {
		if (!sitemapByPlugin[entry.pluginKey]) {
			sitemapByPlugin[entry.pluginKey] = [];
		}
		sitemapByPlugin[entry.pluginKey]!.push(entry);
	}

	// Iterate over all plugins
	for (const [pluginKey, plugin] of Object.entries(context.plugins)) {
		// Skip the route-docs plugin itself
		if (pluginKey === "routeDocs" || plugin.name === "route-docs") {
			continue;
		}

		// Get plugin routes
		const pluginRoutes = plugin.routes(context);
		const documentedRoutes: DocumentedRoute[] = [];

		// Process each route
		for (const [routeKey, route] of Object.entries(pluginRoutes)) {
			const r = route as Route;

			// Access route properties
			const path = r.path;
			const routeOptions = r.options || {};
			const routeMeta = r.meta;

			if (!path) continue;

			// Extract path parameters from the path pattern
			const pathParamNames = extractPathParams(path);
			const pathParams: RouteParameter[] = pathParamNames.map((name) => ({
				name,
				type: "string", // Path params are always strings
				required: true,
			}));

			// Extract query parameters from the query schema
			const queryParams = extractQueryParams(routeOptions.query);

			documentedRoutes.push({
				key: routeKey,
				path,
				pathParams,
				queryParams,
				meta: routeMeta as DocumentedRoute["meta"],
			});
		}

		if (documentedRoutes.length > 0) {
			documentedPlugins.push({
				key: pluginKey,
				name: plugin.name,
				routes: documentedRoutes,
				sitemapEntries: sitemapByPlugin[pluginKey] || [],
			});
		}
	}

	return {
		plugins: documentedPlugins,
		generatedAt: new Date().toISOString(),
		allSitemapEntries: sitemapEntries,
	};
}
