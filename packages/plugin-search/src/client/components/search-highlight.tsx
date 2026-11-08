/** Plain result text and the literal phrase to emphasize. */
export interface SearchHighlightProps {
	text: string;
	query: string;
}

/** Highlights case-insensitive phrase matches while preserving the original text. */
export function SearchHighlight({ text, query }: SearchHighlightProps) {
	const phrase = query.trim();
	if (!phrase) return text;
	const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const parts = text.split(new RegExp(`(${escaped})`, "giu"));
	return parts.map((part, index) =>
		index % 2 ? (
			<mark
				key={index}
				className="rounded-sm bg-yellow-200 font-medium text-foreground dark:bg-yellow-800"
			>
				{part}
			</mark>
		) : (
			part
		),
	);
}
