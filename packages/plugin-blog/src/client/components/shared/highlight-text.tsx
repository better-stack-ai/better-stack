interface HighlightTextProps {
	text: string;
	searchQuery: string;
	className?: string;
	maxLength?: number;
}

export function HighlightText({
	text,
	searchQuery,
	className,
	maxLength = 150,
}: HighlightTextProps) {
	if (!searchQuery.trim()) {
		const truncated =
			maxLength && text.length > maxLength
				? `${text.substring(0, maxLength)}...`
				: text;
		return <span className={className}>{truncated}</span>;
	}

	const query = searchQuery.toLowerCase();
	const lowerText = text.toLowerCase();
	const matchIndex = lowerText.indexOf(query);

	if (matchIndex === -1) {
		const truncated =
			maxLength && text.length > maxLength
				? `${text.substring(0, maxLength)}...`
				: text;
		return <span className={className}>{truncated}</span>;
	}

	// Create snippet around the match
	let startIndex = 0;
	let endIndex = text.length;

	if (maxLength && text.length > maxLength) {
		// Center the snippet around the match
		const snippetStart = Math.max(0, matchIndex - Math.floor(maxLength / 2));
		const snippetEnd = Math.min(text.length, snippetStart + maxLength);

		startIndex = snippetStart;
		endIndex = snippetEnd;
	}

	const snippet = text.substring(startIndex, endIndex);
	const adjustedMatchIndex = matchIndex - startIndex;

	if (adjustedMatchIndex < 0 || adjustedMatchIndex >= snippet.length) {
		const truncated = snippet + (endIndex < text.length ? "..." : "");
		return (
			<span className={className}>
				{startIndex > 0 ? `...${truncated}` : truncated}
			</span>
		);
	}

	const beforeMatch = snippet.substring(0, adjustedMatchIndex);
	const match = snippet.substring(
		adjustedMatchIndex,
		adjustedMatchIndex + query.length,
	);
	const afterMatch = snippet.substring(adjustedMatchIndex + query.length);

	const prefix = startIndex > 0 ? "..." : "";
	const suffix = endIndex < text.length ? "..." : "";

	return (
		<span className={className}>
			{prefix}
			{beforeMatch}
			<mark className="rounded-sm bg-yellow-200 font-medium text-foreground dark:bg-yellow-800">
				{match}
			</mark>
			{afterMatch}
			{suffix}
		</span>
	);
}
