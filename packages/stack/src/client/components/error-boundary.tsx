"use client";
import type { ErrorInfo } from "react";
import {
	ErrorBoundary as ReactErrorBoundary,
	type FallbackProps,
} from "react-error-boundary";

export type { FallbackProps } from "react-error-boundary";

/**
 * Error boundary wrapper component for catching and handling React errors.
 * Wraps react-error-boundary with a simplified API.
 *
 * @param children - Child components to wrap with error boundary
 * @param FallbackComponent - Component to render when an error occurs
 * @param resetKeys - Array of values that will reset the error boundary when changed
 * @param onError - Callback invoked when an error is caught
 */
export function ErrorBoundary({
	children,
	FallbackComponent,
	resetKeys,
	onError,
}: {
	children: React.ReactNode;
	FallbackComponent: React.ComponentType<FallbackProps>;
	resetKeys?: Array<string | number | boolean | null | undefined>;
	onError: (error: Error, info: ErrorInfo) => void;
}) {
	return (
		<ReactErrorBoundary
			FallbackComponent={FallbackComponent}
			onError={onError}
			resetKeys={resetKeys}
		>
			{children}
		</ReactErrorBoundary>
	);
}
