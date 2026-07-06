"use client";

import { SearchIcon } from "lucide-react";
import * as React from "react";
import { useTranslate } from "@btst/stack/context";
import { useDebounce } from "../../hooks/use-debounce";

import {
	CommandDialog,
	CommandEmpty,
	CommandInput,
	CommandList,
} from "@workspace/ui/components/command";

export interface SearchResult {
	id: string;
	title: string;
	subtitle?: string;
	content?: string;
	onClick?: () => void;
}

export interface SearchModalProps<T = SearchResult> {
	placeholder?: string;
	emptyMessage?: string;
	buttonText?: string;
	keyboardShortcut?: string;
	searchFn: (query: string) => T[];
	renderResult: (item: T, index: number, query: string) => React.ReactNode;
	results?: T[];
	isLoading?: boolean;
	groupTitle?: string;
	className?: string;
	triggerClassName?: string;
}

export function SearchModal<T extends SearchResult>({
	placeholder,
	emptyMessage,
	buttonText,
	keyboardShortcut = "⌘K",
	searchFn,
	renderResult,
	results: externalResults,
	isLoading = false,
	className,
	triggerClassName,
}: SearchModalProps<T>) {
	const t = useTranslate();
	const resolvedPlaceholder =
		placeholder ?? t("blog.search.placeholder", "Type to search...");
	const resolvedEmptyMessage =
		emptyMessage ?? t("blog.search.empty", "No results found.");
	const resolvedButtonText = buttonText ?? t("blog.search.button", "Search");
	const [open, setOpen] = React.useState(false);
	const [query, setQuery] = React.useState("");
	const [results, setResults] = React.useState<T[]>([]);

	// Only debounce if not using external results
	const shouldDebounce = externalResults === undefined;
	const debouncedQuery = useDebounce(query, shouldDebounce ? 300 : 0);

	// Handle keyboard shortcut
	React.useEffect(() => {
		const down = (e: KeyboardEvent) => {
			const cleanShortcut = keyboardShortcut
				.replace("⌘", "")
				.replace("⇧", "")
				.toLowerCase();
			if (e.key === cleanShortcut && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();

				setOpen((open) => !open);
			}
		};

		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, [keyboardShortcut]);

	React.useEffect(() => {
		if (!open) {
			setQuery("");
			setResults([]);
			return;
		}
	}, [open]);

	// Notify the parent of query changes. Deliberately NOT keyed on
	// `externalResults`: searchFn may update URL-synced state, and re-invoking
	// it whenever results change identity can restart an in-flight router
	// navigation on every render (infinite loop on React Router/Next.js).
	const hasExternalResults = externalResults !== undefined;
	React.useEffect(() => {
		if (!open) return;
		const searchResults = searchFn(debouncedQuery);
		if (!hasExternalResults) {
			setResults(searchResults);
		}
	}, [debouncedQuery, open, searchFn, hasExternalResults]);

	// Sync externally-provided (async) results into the list.
	React.useEffect(() => {
		if (!open || externalResults === undefined) return;
		setResults(externalResults);
	}, [open, externalResults]);

	// Base button classes for better readability
	const buttonClasses = [
		"border-input bg-background text-foreground",
		"placeholder:text-muted-foreground",
		"focus-visible:border-ring focus-visible:ring-ring/50",
		"inline-flex h-9 w-fit rounded-md border px-3 py-2 text-sm",
		"shadow-xs transition-[color,box-shadow] outline-none",
		"focus-visible:ring-[3px]",
		triggerClassName,
	]
		.filter(Boolean)
		.join(" ");

	// Determine what to show based on state
	const showEmpty = debouncedQuery && !isLoading && results.length === 0;
	const currentEmptyMessage = isLoading
		? t("blog.search.searching", "Searching...")
		: resolvedEmptyMessage;

	return (
		<>
			<button
				data-testid="search-button"
				type="button"
				className={buttonClasses}
				onClick={() => setOpen(true)}
			>
				<span className="flex grow items-center">
					<SearchIcon
						className="-ms-1 me-3 text-muted-foreground"
						size={16}
						aria-hidden="true"
					/>
					<span className="font-normal text-muted-foreground">
						{resolvedButtonText}
					</span>
				</span>
				{keyboardShortcut && (
					<kbd className="-me-1 ms-12 inline-flex h-5 max-h-full items-center rounded border bg-background px-1 font-[inherit] font-medium text-[0.625rem] text-muted-foreground">
						{keyboardShortcut}
					</kbd>
				)}
			</button>
			<CommandDialog
				data-testid="search-modal"
				open={open}
				onOpenChange={setOpen}
				className={className}
			>
				<CommandInput
					data-testid="search-input"
					placeholder={resolvedPlaceholder}
					value={query}
					onValueChange={setQuery}
				/>
				<CommandList className="max-h-[400px]">
					{showEmpty && <CommandEmpty>{currentEmptyMessage}</CommandEmpty>}

					{results.length > 0 &&
						results.map((item, index) =>
							renderResult(item, index, debouncedQuery),
						)}
				</CommandList>
			</CommandDialog>
		</>
	);
}
