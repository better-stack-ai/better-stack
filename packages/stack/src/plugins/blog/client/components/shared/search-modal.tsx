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
	/**
	 * Query the input is seeded with when the dialog opens (e.g. an
	 * externally persisted `?q=` value), so opening the modal never clears it.
	 */
	initialQuery?: string;
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
	initialQuery = "",
}: SearchModalProps<T>) {
	const t = useTranslate();
	const resolvedPlaceholder =
		placeholder ?? t("blog.search.placeholder", "Type to search...");
	const resolvedEmptyMessage =
		emptyMessage ?? t("blog.search.empty", "No results found.");
	const resolvedButtonText = buttonText ?? t("blog.search.button", "Search");
	const [open, setOpen] = React.useState(false);
	const [query, setQuery] = React.useState(initialQuery);
	const [results, setResults] = React.useState<T[]>([]);

	// Tracks the last query passed to searchFn so externally persisted state
	// (e.g. a `?q=` URL param) is not cleared by the seed value on open.
	const lastSentQueryRef = React.useRef(initialQuery);
	// Latest seed value without retriggering the open handler.
	const initialQueryRef = React.useRef(initialQuery);
	initialQueryRef.current = initialQuery;

	// Seed the input in the same event that opens the dialog, so the first
	// open render (and its effects) already sees the persisted query and never
	// clears it back through searchFn.
	const openRef = React.useRef(open);
	openRef.current = open;
	const handleOpenChange = React.useCallback((nextOpen: boolean) => {
		if (nextOpen && !openRef.current) {
			const seed = initialQueryRef.current;
			setQuery(seed);
			lastSentQueryRef.current = seed;
		}
		setOpen(nextOpen);
	}, []);

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

				handleOpenChange(!openRef.current);
			}
		};

		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, [keyboardShortcut, handleOpenChange]);

	React.useEffect(() => {
		if (!open) {
			setResults([]);
		}
	}, [open]);

	// Notify the parent of query changes. Deliberately NOT keyed on
	// `externalResults`: searchFn may update URL-synced state, and re-invoking
	// it whenever results change identity can restart an in-flight router
	// navigation on every render (infinite loop on React Router/Next.js).
	const hasExternalResults = externalResults !== undefined;
	React.useEffect(() => {
		if (!open) return;

		if (hasExternalResults) {
			// External mode: only notify once the debounce settled on a value the
			// parent hasn't seen, so opening the modal never overwrites the
			// persisted query with the transient empty/seed value.
			if (debouncedQuery !== query) return;
			if (debouncedQuery === lastSentQueryRef.current) return;
			lastSentQueryRef.current = debouncedQuery;
			searchFn(debouncedQuery);
			return;
		}

		setResults(searchFn(debouncedQuery));
	}, [debouncedQuery, query, open, searchFn, hasExternalResults]);

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
				onClick={() => handleOpenChange(true)}
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
				onOpenChange={handleOpenChange}
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
