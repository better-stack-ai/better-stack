"use client";

import { lazy, useEffect, useState } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { analyticsPermissions } from "../../../permissions";

const Dashboard = lazy(() =>
	import("./dashboard-page.internal").then((module) => ({
		default: module.AnalyticsDashboardPage,
	})),
);

function Loading() {
	return (
		<div className="analytics-dashboard" role="status" aria-live="polite">
			<h1>Analytics</h1>
			<p>Loading traffic…</p>
		</div>
	);
}

function BrowserDashboard() {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	return mounted ? <Dashboard /> : <Loading />;
}

function ErrorState({
	resetErrorBoundary,
}: {
	resetErrorBoundary: () => void;
}) {
	return (
		<div className="analytics-dashboard" role="alert">
			<h1>Analytics unavailable</h1>
			<p>Traffic could not be loaded. Check your access and try again.</p>
			<button type="button" onClick={resetErrorBoundary}>
				Try again
			</button>
		</div>
	);
}

/** Dashboard route with authorization, loading and error boundaries. */
export function AnalyticsDashboardPageComponent() {
	return (
		<ComposedRoute
			path="/analytics"
			permission={analyticsPermissions.dashboard.read({})}
			PageComponent={BrowserDashboard}
			ErrorComponent={ErrorState}
			LoadingComponent={Loading}
			onError={(error) => console.error("Analytics dashboard failed:", error)}
		/>
	);
}
