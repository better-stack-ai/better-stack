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
import { usePluginOverrides } from "@btst/stack/context";
import type { KanbanPluginOverrides } from "../../overrides";
import { EmptyState } from "../shared/empty-state";
import { PageWrapper } from "../shared/page-wrapper";
import { format } from "date-fns";

export function BoardsListPage() {
	const { data: boards, error, isFetching } = useSuspenseBoards();

	// Suspense hooks only throw on initial fetch, not refetch failures
	if (error && !isFetching) {
		throw error;
	}
	const { Link: OverrideLink, navigate: overrideNavigate } =
		usePluginOverrides<KanbanPluginOverrides>("kanban");
	const Link = OverrideLink || "a";
	const navigate =
		overrideNavigate ||
		((path: string) => {
			window.location.href = path;
		});

	const handleNewBoard = () => {
		navigate("/pages/kanban/new");
	};

	return (
		<PageWrapper data-testid="boards-list-page">
			<div className="flex items-center justify-between mb-8">
				<div>
					<h1 className="text-3xl font-bold" data-testid="page-header">
						Kanban Boards
					</h1>
					<p className="text-muted-foreground mt-1">
						Manage your projects and tasks
					</p>
				</div>
				<Button onClick={handleNewBoard}>
					<Plus className="mr-2 h-4 w-4" />
					New Board
				</Button>
			</div>

			{boards.length > 0 ? (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{boards.map((board) => (
						<Link
							key={board.id}
							href={`/pages/kanban/${board.id}`}
							className="block group"
						>
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
										<span>{board.columns?.length || 0} columns</span>
										<span>
											{format(new Date(board.createdAt), "MMM d, yyyy")}
										</span>
									</div>
								</CardContent>
							</Card>
						</Link>
					))}
				</div>
			) : (
				<EmptyState
					title="No boards yet"
					description="Create your first kanban board to start organizing your tasks."
					action={
						<Button onClick={handleNewBoard}>
							<Plus className="mr-2 h-4 w-4" />
							Create Board
						</Button>
					}
				/>
			)}
		</PageWrapper>
	);
}
