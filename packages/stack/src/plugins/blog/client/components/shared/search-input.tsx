"use client";

import * as React from "react";
import { usePostSearch } from "../../hooks/blog-hooks";
import { stripHtml, stripMarkdown } from "../../../utils";
import { HighlightText } from "./highlight-text";
import { SearchModal, type SearchResult } from "./search-modal";
import type { BlogPluginOverrides } from "../../overrides";
import { useBasePath, usePluginOverrides } from "@btst/stack/context";

// Simplified blog post search result interface
interface BlogPostSearchResult extends SearchResult {
	slug: string;
	publishedAt?: string | null;
	authorName?: string;
	processedContent: string;
	processedExcerpt?: string;
}

interface SearchInputProps {
	className?: string;
	triggerClassName?: string;
	placeholder?: string;
	buttonText?: string;
	emptyMessage?: string;
}

const renderBlogResult = (
	item: BlogPostSearchResult,
	index: number,
	query: string,
): React.ReactNode => {
	const q = (query || "").toLowerCase();
	const excerptMatches = item.processedExcerpt
		? item.processedExcerpt.toLowerCase().includes(q)
		: false;
	const contentMatches = item.processedContent
		? item.processedContent.toLowerCase().includes(q)
		: false;

	return (
		<button
			data-testid="search-result"
			type="button"
			key={item.id}
			className="flex w-full cursor-pointer flex-col gap-2 rounded-sm border-border border-b px-4 py-3 text-left transition-colors hover:bg-accent"
			onClick={() => item.onClick?.()}
		>
			<div className="flex items-start justify-between gap-2">
				<HighlightText
					text={item.title}
					searchQuery={query}
					className="flex-1 font-medium text-sm leading-5"
				/>
				{item.publishedAt && (
					<span className="whitespace-nowrap text-muted-foreground text-xs">
						{new Date(item.publishedAt).toLocaleDateString()}
					</span>
				)}
			</div>

			{excerptMatches && (
				<HighlightText
					text={item.processedExcerpt || ""}
					searchQuery={query}
					className="text-muted-foreground text-xs leading-4"
					maxLength={120}
				/>
			)}
			{contentMatches && (
				<HighlightText
					text={item.processedContent}
					searchQuery={query}
					className="text-muted-foreground text-xs leading-4"
					maxLength={120}
				/>
			)}
			{!excerptMatches && !contentMatches && (
				<HighlightText
					text={item.processedExcerpt || item.processedContent}
					searchQuery={query}
					className="text-muted-foreground text-xs leading-4"
					maxLength={120}
				/>
			)}
		</button>
	);
};

export function SearchInput({
	className,
	triggerClassName,
	placeholder,
	buttonText,
	emptyMessage,
}: SearchInputProps) {
	const { navigate } = usePluginOverrides<BlogPluginOverrides>("blog");
	const basePath = useBasePath();
	const [currentQuery, setCurrentQuery] = React.useState("");

	const { data: searchResults = [], isLoading } = usePostSearch({
		query: currentQuery,
		enabled: currentQuery.trim().length > 0,
		debounceMs: 300,
		published: true,
	});

	const formattedResults: BlogPostSearchResult[] = React.useMemo(() => {
		return searchResults.map((post) => ({
			id: post.id,
			title: post.title,
			slug: post.slug,
			publishedAt: post.publishedAt,
			authorName: "",
			processedContent: stripMarkdown(stripHtml(post.content || "")),
			processedExcerpt: stripMarkdown(stripHtml(post.excerpt || "")),
			onClick: () => navigate(`${basePath}/blog/${post.slug}`),
		}));
	}, [searchResults, navigate, basePath]);

	// Search function that updates our query state
	const handleSearch = React.useCallback(
		(query: string): BlogPostSearchResult[] => {
			setCurrentQuery(query);
			return []; // Return empty since we use external async results
		},
		[],
	);

	return (
		<SearchModal<BlogPostSearchResult>
			placeholder={placeholder}
			buttonText={buttonText}
			emptyMessage={emptyMessage}
			searchFn={handleSearch}
			renderResult={renderBlogResult}
			results={formattedResults}
			isLoading={isLoading}
			className={className}
			triggerClassName={triggerClassName}
			keyboardShortcut="⌘K"
		/>
	);
}

export default SearchInput;
