"use client";

import type { ReactNode } from "react";
import type { FallbackProps } from "@btst/stack/client/components";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";

export function CalendarPage({ children }: { children: ReactNode }) {
	return (
		<div className="container mx-auto min-w-0 max-w-5xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
			{children}
		</div>
	);
}

export function CalendarLoading() {
	return (
		<CalendarPage>
			<p role="status">Loading calendar…</p>
		</CalendarPage>
	);
}

export function CalendarError({ error, resetErrorBoundary }: FallbackProps) {
	return (
		<CalendarPage>
			<div role="alert" className="space-y-4">
				<h1 className="text-2xl font-semibold">Calendar unavailable</h1>
				<p>
					{error instanceof Error
						? error.message
						: "Calendar information could not be loaded."}
				</p>
				<Button
					className="min-h-11"
					variant="outline"
					onClick={resetErrorBoundary}
				>
					Retry loading
				</Button>
			</div>
		</CalendarPage>
	);
}

export function CalendarNotFound({ message }: { message: string }) {
	return (
		<CalendarPage>
			<h1 className="text-2xl font-semibold">Booking page not found</h1>
			<p>{message}</p>
		</CalendarPage>
	);
}

export function Field({
	label,
	id,
	children,
	hint,
}: {
	label: string;
	id: string;
	children: ReactNode;
	hint?: string;
}) {
	return (
		<div className="min-w-0 space-y-2">
			<Label htmlFor={id}>{label}</Label>
			{children}
			{hint && <p className="text-sm text-muted-foreground">{hint}</p>}
		</div>
	);
}

export const calendarSelectClass =
	"border-input bg-background min-h-11 w-full min-w-0 rounded-md border px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

export function formatCalendarTime(value: string, timezone: string) {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: timezone,
	}).format(new Date(value));
}
