"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { CMSPluginOverrides } from "../../overrides";
import {
	ComposedRoute,
	PermissionRouteAccess,
} from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { EditorSkeleton } from "../loading";
import { NotFoundPage } from "./404-page";
import { cmsPermissions } from "../../../permissions";
import { useSuspenseContentItem } from "../../hooks";

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
			PageComponent={AuthorizedContentEditorPage}
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

function AuthorizedContentEditorPage({
	typeSlug,
	id,
}: ContentEditorPageComponentProps) {
	if (!id) {
		return (
			<PermissionRouteAccess
				permission={cmsPermissions.record.create({ contentType: typeSlug })}
				legacyPermission={{
					resource: "cms:content",
					action: "create",
					params: { typeSlug },
				}}
				LoadingComponent={EditorSkeleton}
			>
				<ContentEditorPageInternal typeSlug={typeSlug} />
			</PermissionRouteAccess>
		);
	}
	return <AuthorizedExistingContentEditorPage typeSlug={typeSlug} id={id} />;
}

function AuthorizedExistingContentEditorPage({
	typeSlug,
	id,
}: {
	typeSlug: string;
	id: string;
}) {
	const { item } = useSuspenseContentItem(typeSlug, id);
	if (!item) return <ContentEditorPageInternal typeSlug={typeSlug} id={id} />;
	return (
		<PermissionRouteAccess
			permission={cmsPermissions.record.update({
				contentType: item.contentType?.slug ?? typeSlug,
				recordId: item.id,
				...(item.authorId ? { authorId: item.authorId } : {}),
			})}
			legacyPermission={{
				resource: "cms:content",
				action: "update",
				params: { typeSlug, id },
			}}
			LoadingComponent={EditorSkeleton}
		>
			<ContentEditorPageInternal typeSlug={typeSlug} id={id} />
		</PermissionRouteAccess>
	);
}
