"use client";
import type { FallbackProps } from "react-error-boundary";
import { Button } from "@workspace/ui/components/button";

export function SchoolLoading() {
	return (
		<div className="school-shell" role="status">
			Loading course content…
		</div>
	);
}
export function SchoolNotFound() {
	return (
		<div className="school-shell">
			<h1>Course content not found</h1>
			<p>Check the address or return to the course catalog.</p>
		</div>
	);
}
export function SchoolError({ error, resetErrorBoundary }: FallbackProps) {
	return (
		<div className="school-shell" role="alert">
			<h1>Unable to load this page</h1>
			<p>
				{error instanceof Error
					? error.message
					: "Check your connection and try again."}
			</p>
			<Button onClick={resetErrorBoundary}>Try again</Button>
		</div>
	);
}
