import { defineBackendPlugin } from "@btst/stack/plugins/api";
import { createEndpoint } from "@btst/stack/plugins/api";
import { openApiSchema } from "../db";
import { generateOpenAPISchema } from "./generator";
import { logo } from "../logo";
import type { StackContext } from "../../../types";

/**
 * Scalar API Reference themes
 */
export type ScalarTheme =
	| "alternate"
	| "default"
	| "moon"
	| "purple"
	| "solarized"
	| "bluePlanet"
	| "saturn"
	| "kepler"
	| "mars"
	| "deepSpace"
	| "laserwave"
	| "none";

/**
 * OpenAPI plugin configuration options
 */
export interface OpenAPIOptions {
	/**
	 * The path to the OpenAPI reference page
	 * This path is relative to the API base path
	 * @default "/reference"
	 */
	path?: string;

	/**
	 * Disable the default HTML reference page
	 * Only the JSON schema endpoint will be available
	 * @default false
	 */
	disableDefaultReference?: boolean;

	/**
	 * Theme for the Scalar API Reference page
	 * @default "default"
	 */
	theme?: ScalarTheme;

	/**
	 * CSP nonce for inline scripts
	 * Required for strict Content Security Policy
	 */
	nonce?: string;

	/**
	 * Custom title for the API documentation
	 * @default "BTST API"
	 */
	title?: string;

	/**
	 * Custom description for the API documentation
	 */
	description?: string;

	/**
	 * API version string
	 * @default "1.0.0"
	 */
	version?: string;
}

/**
 * Escape HTML entities to prevent XSS and ensure proper rendering
 */
function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Escape JSON for safe embedding in HTML script tags.
 * Replaces < with \u003c to prevent </script> from closing the tag prematurely.
 * This is valid JSON and will be parsed correctly.
 */
function escapeJsonForHtml(json: string): string {
	return json.replace(/</g, "\\u003c");
}

/**
 * Generate the HTML page for Scalar API Reference
 */
function getScalarHTML(
	schema: Record<string, any>,
	theme: ScalarTheme = "default",
	nonce?: string,
): string {
	const nonceAttr = nonce ? ` nonce="${escapeHtml(nonce)}"` : "";
	const encodedLogo = encodeURIComponent(logo);

	const title = schema.info?.title || "API Reference";
	const description = schema.info?.description || "API Reference";

	return `<!doctype html>
<html>
  <head>
    <title>${escapeHtml(title)}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script
      id="api-reference"
      type="application/json"${nonceAttr}>
    ${escapeJsonForHtml(JSON.stringify(schema))}
    </script>
    <script${nonceAttr}>
      var configuration = {
        favicon: "data:image/svg+xml;utf8,${encodedLogo}",
        theme: "${theme}",
        metaData: {
          title: ${JSON.stringify(title)},
          description: ${JSON.stringify(description)},
        }
      }

      document.getElementById('api-reference').dataset.configuration =
        JSON.stringify(configuration)
    </script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"${nonceAttr}></script>
  </body>
</html>`;
}

/**
 * OpenAPI plugin for BTST
 *
 * Automatically generates OpenAPI 3.1 documentation for all registered plugins.
 * Provides both a JSON schema endpoint and an interactive Scalar UI reference page.
 *
 * @example
 * ```ts
 * const { handler } = stack({
 *   basePath: "/api/data",
 *   plugins: {
 *     blog: blogBackendPlugin(),
 *     cms: cmsBackendPlugin({ ... }),
 *     openApi: openApiBackendPlugin({ theme: "moon" }),
 *   },
 *   adapter: (db) => createMemoryAdapter(db)({}),
 * });
 *
 * // Access:
 * // - GET /api/data/open-api/schema - JSON schema
 * // - GET /api/data/reference - Interactive Scalar UI
 * ```
 */
export const openApiBackendPlugin = (options?: OpenAPIOptions) => {
	const referencePath = options?.path ?? "/reference";

	// Store context for use in endpoint handlers
	let storedContext: StackContext | null = null;

	return defineBackendPlugin({
		name: "open-api",
		dbPlugin: openApiSchema,

		routes: (_adapter, context) => {
			// Store context for endpoint handlers
			storedContext = context ?? null;

			const generateSchema = createEndpoint(
				"/open-api/schema",
				{
					method: "GET",
				},
				async (ctx) => {
					if (!storedContext) {
						throw ctx.error(500, {
							message: "OpenAPI context not available",
						});
					}

					const schema = generateOpenAPISchema(storedContext, {
						title: options?.title,
						description: options?.description,
						version: options?.version,
					});

					return schema;
				},
			);

			const reference = createEndpoint(
				referencePath,
				{
					method: "GET",
				},
				async (ctx) => {
					if (options?.disableDefaultReference) {
						throw ctx.error(404, {
							message: "Reference page is disabled",
						});
					}

					if (!storedContext) {
						throw ctx.error(500, {
							message: "OpenAPI context not available",
						});
					}

					const schema = generateOpenAPISchema(storedContext, {
						title: options?.title,
						description: options?.description,
						version: options?.version,
					});

					return new Response(
						getScalarHTML(schema, options?.theme, options?.nonce),
						{
							headers: {
								"Content-Type": "text/html; charset=utf-8",
							},
						},
					);
				},
			);

			return {
				generateSchema,
				reference,
			} as const;
		},
	});
};

export type OpenApiRouter = ReturnType<
	ReturnType<typeof openApiBackendPlugin>["routes"]
>;
