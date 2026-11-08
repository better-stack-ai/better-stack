"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchPluginOverrides } from "../overrides";
import { cn } from "@workspace/ui/lib/utils";
import { useStack } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import {
	Command,
	CommandInput,
	CommandItem,
	CommandList,
} from "@workspace/ui/components/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { SearchPagination, SearchStatus } from "./search-results";
import { SourceFilter } from "./source-filter";
import { useSearchState } from "../hooks";

/** Shared discovery options. Supplying sources fixes the allowed UI scope. */
export interface SearchPresentationProps extends SearchPluginOverrides {
	/** Fixed provider IDs; URL source filters cannot expand this selection. */
	sources?: readonly string[];
	className?: string;
}

/** Controlled discovery dialog with keyboard selection and router navigation. */
export interface SearchDialogProps extends SearchPresentationProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SearchDialog({
	open,
	onOpenChange,
	sources,
	className,
	placeholder = "Search content…",
	emptyMessage,
	title = "Search",
	renderResult,
	renderLoading,
}: SearchDialogProps) {
	const { router } = useStack();
	const { state, setState, result, fixedSources, loading } = useSearchState({
		sources,
		enabled: open,
	});
	const navigate = async (href: string) => {
		if (router?.navigate) await router.navigate(href);
		else window.location.assign(href);
		onOpenChange(false);
	};
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className={cn(
					"max-h-[calc(100dvh-2rem)] overflow-y-auto motion-reduce:animate-none",
					className,
				)}
				data-testid="search-modal"
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						Find content across the available sources.
					</DialogDescription>
				</DialogHeader>
				<Command shouldFilter={false} className="h-auto min-w-0">
					<CommandInput
						aria-label="Search"
						data-testid="search-input"
						placeholder={placeholder}
						value={state.q}
						maxLength={200}
						onValueChange={(q) => setState({ q, page: 1 }, { replace: true })}
					/>
					{!fixedSources && result.data && (
						<div className="p-3">
							<SourceFilter
								sources={result.data.sources}
								value={state.sources}
								onChange={(value) => setState({ sources: value, page: 1 })}
							/>
						</div>
					)}
					<SearchStatus
						query={state.q}
						data={result.data}
						loading={loading}
						error={result.error}
						emptyMessage={emptyMessage}
						onRetry={() => void result.refetch()}
						renderLoading={renderLoading}
					/>
					<CommandList
						aria-label="Search results"
						aria-busy={loading}
						className="max-h-[min(400px,40dvh)]"
					>
						{!result.error &&
							!loading &&
							result.data?.items.map((item) => (
								<CommandItem
									key={item.key}
									value={item.key}
									aria-label={`${item.title}, ${item.sourceLabel}`}
									data-testid="search-result"
									onSelect={() => void navigate(item.href)}
									className="flex min-w-0 flex-col items-start gap-2 border-b px-4 py-3 [overflow-wrap:anywhere]"
								>
									{renderResult ? (
										renderResult(item)
									) : (
										<>
											<span className="text-xs text-muted-foreground">
												{item.sourceLabel}
											</span>
											<span className="font-medium">{item.title}</span>
											{item.snippet && (
												<span className="text-sm text-muted-foreground">
													{item.snippet}
												</span>
											)}
										</>
									)}
								</CommandItem>
							))}
					</CommandList>
				</Command>
				{!result.error && state.q.trim() && result.data && (
					<>
						{result.data.truncated && (
							<p className="text-xs text-muted-foreground">
								Showing a limited result window. Refine your query to find more
								content.
							</p>
						)}
						<SearchPagination
							page={state.page}
							hasMore={result.data.hasMore}
							loading={loading}
							onPageChange={(page) => setState({ page })}
						/>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

/** Trigger for the shared dialog, including the optional Cmd/Ctrl+K shortcut. */
export interface SearchInputProps extends SearchPresentationProps {
	triggerClassName?: string;
	buttonText?: string;
	/** Disable when a page contains several independently scoped triggers. */
	keyboardShortcut?: boolean;
}

export function SearchInput({
	triggerClassName,
	buttonText = "Search",
	keyboardShortcut = true,
	...props
}: SearchInputProps) {
	const [open, setOpen] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const onOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) requestAnimationFrame(() => trigger.current?.focus());
	};
	useEffect(() => {
		if (!keyboardShortcut) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setOpen(!open);
				if (open) requestAnimationFrame(() => trigger.current?.focus());
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [keyboardShortcut, open]);
	return (
		<>
			<Button
				ref={trigger}
				type="button"
				variant="outline"
				className={triggerClassName}
				data-testid="search-button"
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={() => setOpen(true)}
			>
				{buttonText}
				{keyboardShortcut && (
					<kbd className="ml-6 text-xs text-muted-foreground">⌘K</kbd>
				)}
			</Button>
			<SearchDialog {...props} open={open} onOpenChange={onOpenChange} />
		</>
	);
}
