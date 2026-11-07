/** Suggestions only: case-fold and trim, without provider-specific dot/plus rewriting. */
export function normalizeCrmEmail(value?: string | null): string | null {
	return value?.trim().toLowerCase() || null;
}

/** Compare HTTP(S) hostnames; ignore paths/ports, www. and a final DNS dot. */
export function normalizeCrmDomain(value?: string | null): string | null {
	if (!value?.trim()) return null;
	try {
		const url = new URL(
			value.includes("://") ? value.trim() : `https://${value.trim()}`,
		);
		if (
			!["http:", "https:"].includes(url.protocol) ||
			url.username ||
			url.password
		)
			return null;
		return (
			url.hostname
				.toLowerCase()
				.replace(/^www\./, "")
				.replace(/\.$/, "") || null
		);
	} catch {
		return null;
	}
}
