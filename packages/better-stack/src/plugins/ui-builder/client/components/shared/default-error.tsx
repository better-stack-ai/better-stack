"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@workspace/ui/components/button";

interface DefaultErrorProps {
	error: Error;
	resetErrorBoundary?: () => void;
}

export function DefaultError({ error, resetErrorBoundary }: DefaultErrorProps) {
	return (
		<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
			<div className="rounded-full bg-destructive/10 p-4 mb-4">
				<AlertCircle className="h-8 w-8 text-destructive" />
			</div>
			<h3 className="text-lg font-medium text-foreground mb-2">
				Something went wrong
			</h3>
			<p className="text-sm text-muted-foreground mb-4 max-w-sm">
				{error.message || "An unexpected error occurred"}
			</p>
			{resetErrorBoundary && (
				<Button variant="outline" onClick={resetErrorBoundary}>
					Try again
				</Button>
			)}
		</div>
	);
}
