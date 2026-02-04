/**
 * Normalizes path segments from framework route params into a consistent path string.
 *
 * Handles different framework param formats:
 * - Next.js: `pathParams.all` (string[])
 * - React Router: `params["*"]` (string)
 * - TanStack Router: `params._splat` (string)
 *
 * @param path - Path segments as string, string array, or undefined
 * @returns Normalized path string starting with "/" (or "/" for empty/undefined)
 *
 * @example
 * ```ts
 * // Next.js
 * normalizePath(pathParams?.all) // ["blog", "post"] => "/blog/post"
 *
 * // React Router / TanStack Router
 * normalizePath(params["*"]) // "blog/post" => "/blog/post"
 * normalizePath(undefined) // => "/"
 * ```
 */
export function normalizePath(
	path?: string | Array<string> | undefined,
): string {
	if (!path) {
		return "/";
	}

	if (Array.isArray(path)) {
		// Handle Next.js format: pathParams.all (string[])
		const segments = path.filter(Boolean);
		return segments.length > 0 ? `/${segments.join("/")}` : "/";
	}

	// Handle React Router / TanStack Router format: params["*"] or params._splat (string)
	const segments = path.split("/").filter(Boolean);
	return segments.length > 0 ? `/${segments.join("/")}` : "/";
}
