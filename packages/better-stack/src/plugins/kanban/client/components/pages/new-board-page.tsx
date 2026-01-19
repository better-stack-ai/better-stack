"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { BoardsListSkeleton } from "../loading/boards-list-skeleton";
import { NotFoundPage } from "./404-page";

const NewBoardPage = lazy(() =>
	import("./new-board-page.internal").then((m) => ({
		default: m.NewBoardPage,
	})),
);

export function NewBoardPageComponent() {
	return (
		<ComposedRoute
			path="/kanban/new"
			PageComponent={NewBoardPage}
			ErrorComponent={DefaultError}
			LoadingComponent={BoardsListSkeleton}
			NotFoundComponent={NotFoundPage}
			onError={(error) => console.error("NewBoardPage error:", error)}
		/>
	);
}
