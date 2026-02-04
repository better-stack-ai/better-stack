"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { BoardsListSkeleton } from "../loading/boards-list-skeleton";
import { NotFoundPage } from "./404-page";

const BoardsListPage = lazy(() =>
	import("./boards-list-page.internal").then((m) => ({
		default: m.BoardsListPage,
	})),
);

export function BoardsListPageComponent() {
	return (
		<ComposedRoute
			path="/kanban"
			PageComponent={BoardsListPage}
			ErrorComponent={DefaultError}
			LoadingComponent={BoardsListSkeleton}
			NotFoundComponent={NotFoundPage}
			onError={(error) => console.error("BoardsListPage error:", error)}
		/>
	);
}
