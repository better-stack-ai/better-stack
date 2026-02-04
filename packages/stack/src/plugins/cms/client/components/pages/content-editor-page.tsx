"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { CMSPluginOverrides } from "../../overrides";
import { ComposedRoute } from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { EditorSkeleton } from "../loading";
import { NotFoundPage } from "./404-page";

const ContentEditorPageInternal = lazy(() =>
	import("./content-editor-page.internal").then((m) => ({
		default: m.ContentEditorPage,
	})),
);

interface ContentEditorPageComponentProps {
	typeSlug: string;
	id?: string;
}

export function ContentEditorPageComponent({
	typeSlug,
	id,
}: ContentEditorPageComponentProps) {
	const { onRouteError } = usePluginOverrides<CMSPluginOverrides>("cms");

	const isNew = !id;
	const path = isNew ? `/cms/${typeSlug}/new` : `/cms/${typeSlug}/${id}`;

	return (
		<ComposedRoute
			path={path}
			PageComponent={ContentEditorPageInternal}
			ErrorComponent={DefaultError}
			LoadingComponent={EditorSkeleton}
			NotFoundComponent={NotFoundPage}
			props={{ typeSlug, id }}
			onError={(error) => {
				if (onRouteError) {
					onRouteError("contentEditor", error, {
						path,
						params: { typeSlug, id: id ?? "" },
						isSSR: typeof window === "undefined",
					});
				}
			}}
		/>
	);
}
