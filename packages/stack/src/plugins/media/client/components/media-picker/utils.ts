export function matchesAccept(mimeType: string, accept?: string[]) {
	if (!accept || accept.length === 0) return true;
	return accept.some((a) => {
		if (a.endsWith("/*")) return mimeType.startsWith(a.slice(0, -1));
		return mimeType === a;
	});
}

export function isImage(mimeType: string) {
	return mimeType.startsWith("image/");
}

export function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
