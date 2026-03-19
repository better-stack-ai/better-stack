"use client";
import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import { ComposedRoute } from "@btst/stack/client/components";
import type { MediaPluginOverrides } from "../../overrides";
import { Loader2 } from "lucide-react";

const LibraryPage = lazy(() =>
	import("./library-page.internal").then((m) => ({ default: m.LibraryPage })),
);

function LibraryLoading() {
	return (
		<div className="flex h-96 items-center justify-center">
			<Loader2 className="size-8 animate-spin text-muted-foreground" />
		</div>
	);
}

function LibraryError({ error }: { error: Error }) {
	return (
		<div className="flex h-96 items-center justify-center p-8 text-destructive">
			<p className="text-sm">{error.message}</p>
		</div>
	);
}

export function LibraryPageComponent() {
	usePluginOverrides<MediaPluginOverrides>("media");
	return (
		<ComposedRoute
			path="/media"
			PageComponent={LibraryPage}
			ErrorComponent={LibraryError}
			LoadingComponent={LibraryLoading}
			NotFoundComponent={() => null}
			onError={(error) => console.error("[btst/media] Library error:", error)}
		/>
	);
}
