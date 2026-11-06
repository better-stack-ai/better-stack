/**
 * Stub for @vercel/blob/server — used in tests only.
 * The real module is an optional peer dependency.
 */
export async function handleUpload(_options: unknown): Promise<unknown> {
	throw new Error(
		"handleUpload is not available in the installed @vercel/blob version. BTST requires a version that exports @vercel/blob/server.",
	);
}
