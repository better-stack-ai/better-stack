"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { BoardSkeleton } from "../loading/board-skeleton";
import { NotFoundPage } from "./404-page";

const BoardPage = lazy(() =>
	import("./board-page.internal").then((m) => ({
		default: m.BoardPage,
	})),
);

interface BoardPageComponentProps {
	boardId: string;
}

export function BoardPageComponent({ boardId }: BoardPageComponentProps) {
	return (
		<ComposedRoute
			path={`/kanban/${boardId}`}
			PageComponent={BoardPage}
			ErrorComponent={DefaultError}
			LoadingComponent={BoardSkeleton}
			NotFoundComponent={NotFoundPage}
			props={{ boardId }}
			onError={(error) => console.error("BoardPage error:", error)}
		/>
	);
}
