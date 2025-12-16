"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { MarkdownContent } from "@workspace/ui/components/markdown-content";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import { Wrench, Check, AlertCircle, Loader2 } from "lucide-react";
import type { ToolCallProps, ToolCallState } from "../overrides";

/**
 * Formats a tool name for display (converts camelCase/snake_case to Title Case)
 */
function formatToolName(name: string): string {
	return (
		name
			// Insert space before uppercase letters (camelCase)
			.replace(/([A-Z])/g, " $1")
			// Replace underscores and hyphens with spaces
			.replace(/[_-]/g, " ")
			// Capitalize first letter of each word
			.replace(/\b\w/g, (char) => char.toUpperCase())
			.trim()
	);
}

/**
 * Returns the appropriate status icon based on tool call state
 */
function getStatusIcon(state: ToolCallState, isLoading: boolean) {
	if (isLoading || state === "input-streaming" || state === "input-available") {
		return (
			<Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
		);
	}
	if (state === "output-error") {
		return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
	}
	if (state === "output-available") {
		return <Check className="h-3.5 w-3.5 text-green-500" />;
	}
	return <Wrench className="h-3.5 w-3.5 text-muted-foreground" />;
}

/**
 * Returns a human-readable status label based on tool call state
 */
function getStatusLabel(state: ToolCallState, isLoading: boolean): string {
	if (isLoading || state === "input-streaming") {
		return "Running...";
	}
	if (state === "input-available") {
		return "Executing...";
	}
	if (state === "output-error") {
		return "Error";
	}
	if (state === "output-available") {
		return "Complete";
	}
	return "Pending";
}

interface JsonDisplayProps {
	data: unknown;
	label: string;
}

/**
 * Renders JSON data using MarkdownContent with syntax highlighting
 */
function JsonDisplay({ data, label }: JsonDisplayProps) {
	if (data === undefined || data === null) {
		return null;
	}

	// Format JSON with proper indentation
	let jsonString: string;
	try {
		jsonString = JSON.stringify(data, null, 2);
	} catch {
		jsonString = String(data);
	}

	// Wrap in markdown code fence for syntax highlighting
	const markdown = `\`\`\`json\n${jsonString}\n\`\`\``;

	return (
		<div className="space-y-1">
			<span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
				{label}
			</span>
			<div className="[&_.markdown-code-block]:my-0 [&_.markdown-code-block]:max-h-48 [&_.markdown-code-block_.code-content]:max-h-40 [&_.markdown-code-block_.code-content]:overflow-y-auto">
				<MarkdownContent markdown={markdown} variant="chat" />
			</div>
		</div>
	);
}

/**
 * Default tool call display component.
 * Shows an accordion with tool name, status, inputs, and outputs.
 */
export function ToolCallDisplay({
	toolCallId,
	toolName,
	state,
	input,
	output,
	errorText,
	isLoading,
}: ToolCallProps) {
	const displayName = formatToolName(toolName);
	const statusLabel = getStatusLabel(state, isLoading);
	const statusIcon = getStatusIcon(state, isLoading);

	const isComplete = state === "output-available" || state === "output-error";
	const hasError = state === "output-error";

	return (
		<Accordion type="single" collapsible className="w-full">
			<AccordionItem
				value={toolCallId}
				className={cn(
					"!border rounded-lg overflow-hidden transition-colors",
					hasError && "border-destructive/50",
					!hasError && isComplete && "border-green-500/30",
					!isComplete && "border-border/50",
				)}
			>
				<AccordionTrigger
					className={cn("px-3 py-2 hover:no-underline hover:bg-muted/50")}
				>
					<div className="flex items-center gap-2 w-full">
						<Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
						<span className="text-sm font-medium truncate text-left">
							{displayName}
						</span>
						<span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
							{statusIcon}
							<span className="sr-only">{statusLabel}</span>
						</span>
					</div>
				</AccordionTrigger>

				<AccordionContent className="px-3 pb-3 pt-0">
					<div className="space-y-3 border-t border-border/50 pt-3">
						{/* Loading skeleton when input is streaming */}
						{state === "input-streaming" && !input && (
							<div className="space-y-2">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-16 w-full" />
							</div>
						)}

						{/* Input section */}
						{input !== undefined && <JsonDisplay data={input} label="Input" />}

						{/* Output section */}
						{state === "output-available" && output !== undefined && (
							<JsonDisplay data={output} label="Output" />
						)}

						{/* Error section */}
						{state === "output-error" && errorText && (
							<div className="space-y-1">
								<span className="text-xs font-medium text-destructive uppercase tracking-wide">
									Error
								</span>
								<div className="text-xs text-destructive bg-destructive/10 p-2 rounded-md">
									{errorText}
								</div>
							</div>
						)}

						{/* Loading skeleton for output */}
						{(state === "input-available" || state === "input-streaming") && (
							<div className="space-y-2">
								<Skeleton className="h-4 w-20" />
								<Skeleton className="h-12 w-full" />
							</div>
						)}

						{/* Tool call ID for debugging (collapsed by default) */}
						<div className="text-[10px] text-muted-foreground/50 truncate">
							ID: {toolCallId}
						</div>
					</div>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}
