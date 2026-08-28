"use client";

import { lazy } from "react";
import {
	ComposedRoute,
	PermissionRouteAccess,
} from "@btst/stack/client/components";
import { usePluginOverrides } from "@btst/stack/context";
import { PageBuilderSkeleton } from "../loading/page-builder-skeleton";
import { DefaultError } from "../shared/default-error";
import type { UIBuilderPluginOverrides } from "../../overrides";
import { cmsPermissions } from "@btst/stack/plugins/cms/permissions";
import { UI_BUILDER_TYPE_SLUG } from "@btst/stack/plugins/ui-builder";
import { useSuspenseUIBuilderPage } from "../../hooks/ui-builder-hooks";

const PageBuilderPageInternal = lazy(() =>
	import("./page-builder-page.internal").then((m) => ({
		default: m.PageBuilderPage,
	})),
);

export interface PageBuilderPageProps {
	id?: string;
}

export function PageBuilderPage({ id }: PageBuilderPageProps) {
	const { onRouteError } =
		usePluginOverrides<UIBuilderPluginOverrides>("ui-builder");
	const path = id ? `/ui-builder/${id}/edit` : "/ui-builder/new";

	return (
		<ComposedRoute
			path={path}
			PageComponent={AuthorizedPageBuilderPage}
			ErrorComponent={DefaultError}
			LoadingComponent={PageBuilderSkeleton}
			NotFoundComponent={() => null}
			props={{ id }}
			onError={(error) => {
				onRouteError?.("pageBuilder", error, {
					path,
					params: id ? { id } : {},
					isSSR: typeof window === "undefined",
				});
			}}
		/>
	);
}

function AuthorizedPageBuilderPage({ id }: PageBuilderPageProps) {
	if (!id) {
		return (
			<PermissionRouteAccess
				permission={cmsPermissions.record.create({
					contentType: UI_BUILDER_TYPE_SLUG,
				})}
				LoadingComponent={PageBuilderSkeleton}
			>
				<PageBuilderPageInternal />
			</PermissionRouteAccess>
		);
	}
	return <AuthorizedExistingPageBuilderPage id={id} />;
}

function AuthorizedExistingPageBuilderPage({ id }: { id: string }) {
	const { page } = useSuspenseUIBuilderPage(id);
	if (!page) return <PageBuilderPageInternal id={id} />;
	return (
		<PermissionRouteAccess
			permission={cmsPermissions.record.update({
				contentType: UI_BUILDER_TYPE_SLUG,
				recordId: page.id,
				...(page.authorId ? { authorId: page.authorId } : {}),
			})}
			LoadingComponent={PageBuilderSkeleton}
		>
			<PageBuilderPageInternal id={id} />
		</PermissionRouteAccess>
	);
}
