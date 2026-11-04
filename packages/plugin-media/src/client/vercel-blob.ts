import type { MediaBlobUploader } from "./overrides";

/** Vercel Blob transport, imported only by applications selecting that provider. */
export const vercelBlobUpload: MediaBlobUploader = async (
	pathname,
	file,
	options,
) => {
	const { put } = await import("@vercel/blob/client");
	return put(pathname, file, options);
};
