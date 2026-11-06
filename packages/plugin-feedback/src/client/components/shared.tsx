"use client";

import { type ReactNode } from "react";
import { usePluginSiteNavigation } from "@btst/stack/context";
import type { FallbackProps } from "@btst/stack/client/components";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import type { FeedbackStatus } from "../../types";
import { FEEDBACK_PLUGIN_ID } from "../constants";

export const statusLabels: Record<FeedbackStatus, string> = {
	under_review: "Under review",
	planned: "Planned",
	in_progress: "In Progress",
	shipped: "Shipped",
	closed: "Closed",
};

export function FeedbackPage({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	const { Link, resolve } = usePluginSiteNavigation(FEEDBACK_PLUGIN_ID);
	return (
		<div
			className="container mx-auto min-w-0 max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-8"
			data-testid="feedback-page"
		>
			<header className="space-y-2">
				<h1 className="break-words text-3xl font-semibold tracking-tight">
					{title}
				</h1>
			</header>
			<nav
				aria-label="Feedback"
				className="flex flex-wrap gap-6 border-b pb-3 text-sm font-medium"
			>
				{[
					["feedback", "Feature requests"],
					["feedback/roadmap", "Roadmap"],
					["feedback/changelog", "Changelog"],
				].map(([path, label]) => (
					<Link
						key={path}
						href={resolve(path!).href}
						className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
					>
						{label}
					</Link>
				))}
			</nav>
			{children}
		</div>
	);
}

export function Field({
	id,
	label,
	children,
}: {
	id: string;
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="min-w-0 space-y-2">
			<Label htmlFor={id}>{label}</Label>
			{children}
		</div>
	);
}

export function FeedbackStatusLabel({ status }: { status: FeedbackStatus }) {
	return (
		<span className="inline-flex rounded-md border px-2 py-1 text-xs font-medium">
			{statusLabels[status]}
		</span>
	);
}

export function FeedbackLoading() {
	return (
		<div className="p-8" role="status">
			Loading feedback…
		</div>
	);
}

export function FeedbackError({ resetErrorBoundary }: FallbackProps) {
	return (
		<div className="space-y-4 p-8" role="alert">
			<h1 className="text-2xl font-semibold">Feedback unavailable</h1>
			<p>Feedback could not be loaded. Check your access or try again.</p>
			<Button variant="outline" onClick={resetErrorBoundary}>
				Retry loading
			</Button>
		</div>
	);
}

export function FeedbackNotFound({ message }: { message: string }) {
	return (
		<div className="space-y-2 p-8">
			<h1 className="text-2xl font-semibold">Request not found</h1>
			<p>{message}</p>
		</div>
	);
}

export const selectClass =
	"border-input bg-background min-h-11 w-full min-w-0 rounded-md border px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

export function Pagination({
	offset,
	total,
	onChange,
}: {
	offset: number;
	total: number;
	onChange: (offset: number) => void;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 text-sm">
			<p className="text-muted-foreground">
				{total === 0
					? "No results"
					: `${offset + 1}–${Math.min(offset + 25, total)} of ${total}`}
			</p>
			<div className="flex gap-2">
				<Button
					type="button"
					variant="outline"
					disabled={offset === 0}
					onClick={() => onChange(Math.max(0, offset - 25))}
				>
					Previous page
				</Button>
				<Button
					type="button"
					variant="outline"
					disabled={offset + 25 >= total}
					onClick={() => onChange(offset + 25)}
				>
					Next page
				</Button>
			</div>
		</div>
	);
}
