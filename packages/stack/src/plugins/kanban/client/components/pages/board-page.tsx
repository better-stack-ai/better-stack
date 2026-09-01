"use client";

import { lazy } from "react";
import {
	ComposedRoute,
	PermissionRouteAccess,
} from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { BoardSkeleton } from "../loading/board-skeleton";
import { NotFoundPage } from "./404-page";
import { useSuspenseBoard } from "../../hooks/kanban-hooks";
import { kanbanPermissions } from "../../../permissions";

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
			PageComponent={AuthorizedBoardPage}
			ErrorComponent={DefaultError}
			LoadingComponent={BoardSkeleton}
			NotFoundComponent={NotFoundPage}
			props={{ boardId }}
			onError={(error) => console.error("BoardPage error:", error)}
		/>
	);
}

/** Load the record first, then evaluate the browser gate with returned facts. */
function AuthorizedBoardPage({ boardId }: BoardPageComponentProps) {
	const { data: board, error, isFetching } = useSuspenseBoard(boardId);
	if (error && !isFetching) throw error;
	if (!board) return <NotFoundPage />;

	return (
		<PermissionRouteAccess
			permission={kanbanPermissions.board.read({
				scope: "record",
				boardId: board.id,
				...(board.ownerId ? { ownerId: board.ownerId } : {}),
				...(board.organizationId
					? { organizationId: board.organizationId }
					: {}),
				exists: true,
			})}
			LoadingComponent={BoardSkeleton}
		>
			<BoardPage boardId={boardId} />
		</PermissionRouteAccess>
	);
}
