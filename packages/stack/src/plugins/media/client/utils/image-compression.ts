/**
 * Canvas-based client-side image compression.
 *
 * Skips SVG and GIF (vector data / animation would be lost on a canvas round-trip).
 * All other image/* types are scaled down to fit within maxWidth × maxHeight
 * (preserving aspect ratio) and re-encoded at the configured quality.
 */

export interface ImageCompressionOptions {
	/**
	 * Maximum width in pixels. Images wider than this are scaled down.
	 * @default 2048
	 */
	maxWidth?: number;

	/**
	 * Maximum height in pixels. Images taller than this are scaled down.
	 * @default 2048
	 */
	maxHeight?: number;

	/**
	 * Encoding quality (0–1). Applies to JPEG and WebP.
	 * @default 0.85
	 */
	quality?: number;

	/**
	 * Output MIME type. Defaults to the source image's MIME type.
	 * Set to `"image/webp"` for better compression at the cost of format change.
	 */
	outputFormat?: string;
}

function loadImage(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error(`Failed to load image: ${file.name}`));
		};
		img.src = url;
	});
}

const SKIP_TYPES = new Set(["image/svg+xml", "image/gif"]);

/**
 * Compresses an image file client-side using the Canvas API.
 *
 * Returns the original file unchanged if:
 * - The file is not an image
 * - The MIME type is SVG or GIF (would lose vector data / animation)
 * - The browser does not support canvas (SSR guard)
 */
export async function compressImage(
	file: File,
	options: ImageCompressionOptions = {},
): Promise<File> {
	if (!file.type.startsWith("image/") || SKIP_TYPES.has(file.type)) {
		return file;
	}

	// SSR guard — canvas is only available in the browser
	if (typeof document === "undefined") return file;

	const {
		maxWidth = 2048,
		maxHeight = 2048,
		quality = 0.85,
		outputFormat,
	} = options;

	const img = await loadImage(file);

	let { width, height } = img;

	const needsResize = width > maxWidth || height > maxHeight;
	const needsFormatChange =
		outputFormat !== undefined && outputFormat !== file.type;

	// Skip canvas entirely if the image is already within the limits and no
	// format conversion is needed — re-encoding a small image can make it larger.
	if (!needsResize && !needsFormatChange) return file;

	// Scale down proportionally if either dimension exceeds the max
	if (needsResize) {
		const ratio = Math.min(maxWidth / width, maxHeight / height);
		width = Math.round(width * ratio);
		height = Math.round(height * ratio);
	}

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;

	const ctx = canvas.getContext("2d");
	if (!ctx) return file;

	ctx.drawImage(img, 0, 0, width, height);

	const mimeType = outputFormat ?? file.type;

	return new Promise<File>((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) {
					reject(new Error("canvas.toBlob returned null"));
					return;
				}

				// Preserve the original filename, updating extension only if
				// the output format changed from the source.
				let name = file.name;
				if (outputFormat && outputFormat !== file.type) {
					const ext = outputFormat.split("/")[1] ?? "jpg";
					name = name.replace(/\.[^.]+$/, `.${ext}`);
				}

				resolve(new File([blob], name, { type: mimeType }));
			},
			mimeType,
			quality,
		);
	});
}
