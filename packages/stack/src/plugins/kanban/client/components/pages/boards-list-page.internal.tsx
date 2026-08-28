"use client";

import { Plus } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { useSuspenseBoards } from "../../hooks/kanban-hooks";
import {
	PermissionAccess,
	usePluginOverrides,
	useStack,
	useTranslate,
} from "@btst/stack/context";
import type { KanbanPluginOverrides } from "../../overrides";
import { EmptyState } from "../shared/empty-state";
import { PageWrapper } from "../shared/page-wrapper";
import { format } from "date-fns";
import { kanbanPermissions } from "../../../permissions";

export function BoardsListPage() {
	const t = useTranslate();
	const { data: boards, error, isFetching } = useSuspenseBoards();

	// Suspense hooks only throw on initial fetch, not refetch failures
	if (error && !isFetching) {
		throw error;
	}
	const { localization } = usePluginOverrides<KanbanPluginOverrides>("kanban");
	const { router } = useStack();
	const Link = router?.Link ?? "a";
	const navigate =
		router?.navigate ||
		((path: string) => {
			window.location.href = path;
		});

	const handleNewBoard = () => {
		navigate("/pages/kanban/new");
	};

	return (
		<PageWrapper data-testid="boards-list-page">
			<div className="w-full flex items-center justify-between mb-8">
				<div>
					<h1 className="text-3xl font-bold" data-testid="page-header">
						{localization?.kanbanBoards ??
							t("kanban.list.kanbanBoards", "Kanban Boards")}
					</h1>
					<p className="text-muted-foreground mt-1">
						{localization?.manageProjects ??
							t("kanban.list.manageProjects", "Manage your projects and tasks")}
					</p>
				</div>
				<PermissionAccess permission={kanbanPermissions.board.create()}>
					<Button onClick={handleNewBoard}>
						<Plus className="mr-2 h-4 w-4" />
						{localization?.newBoard ?? t("kanban.list.newBoard", "New Board")}
					</Button>
				</PermissionAccess>
			</div>

			{boards.length > 0 ? (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{boards.map((board) => (
						<PermissionAccess
							key={board.id}
							permission={kanbanPermissions.board.read({
								scope: "record",
								boardId: board.id,
								...(board.ownerId ? { ownerId: board.ownerId } : {}),
								...(board.organizationId
									? { organizationId: board.organizationId }
									: {}),
								exists: true,
							})}
						>
							<Link href={`/pages/kanban/${board.id}`} className="block group">
								<Card className="h-full transition-shadow hover:shadow-md cursor-pointer">
									<CardHeader>
										<CardTitle className="group-hover:text-primary transition-colors">
											{board.name}
										</CardTitle>
										{board.description && (
											<CardDescription className="line-clamp-2">
												{board.description}
											</CardDescription>
										)}
									</CardHeader>
									<CardContent>
										<div className="flex items-center justify-between text-sm text-muted-foreground">
											<span>
												{localization?.columnsCount
													? `${board.columns?.length || 0} ${localization.columnsCount}`
													: t("kanban.list.columnsCount", "{{count}} columns", {
															count: board.columns?.length || 0,
														})}
											</span>
											<span>
												{format(new Date(board.createdAt), "MMM d, yyyy")}
											</span>
										</div>
									</CardContent>
								</Card>
							</Link>
						</PermissionAccess>
					))}
				</div>
			) : (
				<EmptyState
					title={
						localization?.noBoards ??
						t("kanban.common.noBoards", "No boards yet")
					}
					description={
						localization?.noBoardsDescription ??
						t(
							"kanban.list.noBoardsDescription",
							"Create your first kanban board to start organizing your tasks.",
						)
					}
					action={
						<PermissionAccess permission={kanbanPermissions.board.create()}>
							<Button onClick={handleNewBoard}>
								<Plus className="mr-2 h-4 w-4" />
								{localization?.createBoard ??
									t("kanban.forms.createBoard", "Create Board")}
							</Button>
						</PermissionAccess>
					}
				/>
			)}
		</PageWrapper>
	);
}
