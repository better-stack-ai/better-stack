"use client";

import { lazy, useEffect, useState, type ReactNode } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { featureFlagsPermissions } from "../../permissions";
import { FlagsError, FlagsLoading, FlagsNotFound } from "./shared";

const Flags = lazy(() =>
	import("./pages/flags-page.internal").then((module) => ({
		default: module.FlagsPage,
	})),
);
const Editor = lazy(() =>
	import("./pages/edit-flag-page.internal").then((module) => ({
		default: module.EditFlagPage,
	})),
);
const Log = lazy(() =>
	import("./pages/flag-detail-page.internal").then((module) => ({
		default: module.FlagDetailPage,
	})),
);

function BrowserPage({ children }: { children: ReactNode }) {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	return mounted ? children : <FlagsLoading />;
}

function FlagList() {
	return (
		<BrowserPage>
			<Flags />
		</BrowserPage>
	);
}
function FlagEditor(props: { flagKey?: string }) {
	return (
		<BrowserPage>
			<Editor {...props} />
		</BrowserPage>
	);
}
function FlagLog(props: { flagKey: string }) {
	return (
		<BrowserPage>
			<Log {...props} />
		</BrowserPage>
	);
}

const boundary = {
	ErrorComponent: FlagsError,
	LoadingComponent: FlagsLoading,
	NotFoundComponent: FlagsNotFound,
	onError: (error: Error) => console.error("[btst/feature-flags]", error),
};

/** Protected dynamic flag list with loading and error boundaries. */
export function FlagsPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/feature-flags"
			permission={featureFlagsPermissions.flags.read({})}
			PageComponent={FlagList}
		/>
	);
}
/** Create or edit a flag definition. */
export function EditFlagPageComponent({ flagKey }: { flagKey?: string }) {
	return (
		<ComposedRoute
			{...boundary}
			path={flagKey ? `/feature-flags/${flagKey}` : "/feature-flags/new"}
			{...(flagKey
				? { permission: featureFlagsPermissions.flags.read({ key: flagKey }) }
				: {})}
			PageComponent={FlagEditor}
			props={{ flagKey }}
		/>
	);
}
/** Protected recent evaluations for a flag. */
export function FlagDetailPageComponent({ flagKey }: { flagKey: string }) {
	return (
		<ComposedRoute
			{...boundary}
			path={`/feature-flags/${flagKey}/log`}
			permission={featureFlagsPermissions.evaluations.read({ key: flagKey })}
			PageComponent={FlagLog}
			props={{ flagKey }}
		/>
	);
}
