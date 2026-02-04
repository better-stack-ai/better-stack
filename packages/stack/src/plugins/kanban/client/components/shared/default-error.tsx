"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@workspace/ui/components/button";

interface DefaultErrorProps {
	error?: Error;
	reset?: () => void;
}

export function DefaultError({ error, reset }: DefaultErrorProps) {
	return (
		<div
			className="flex flex-col items-center justify-center py-12 text-center"
			data-testid="error-placeholder"
		>
			<div className="rounded-full bg-destructive/10 p-6 mb-4">
				<AlertCircle className="h-8 w-8 text-destructive" />
			</div>
			<h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
			<p className="text-muted-foreground max-w-md mb-4">
				{error?.message || "An unexpected error occurred. Please try again."}
			</p>
			{reset && (
				<Button onClick={reset} variant="outline">
					<RefreshCw className="mr-2 h-4 w-4" />
					Try Again
				</Button>
			)}
		</div>
	);
}
