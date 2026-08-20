"use client";

import { ArrowLeft } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import {
	usePluginOverrides,
	useStack,
	useTranslate,
} from "@btst/stack/context";
import type { KanbanPluginOverrides } from "../../overrides";
import { BoardForm } from "../forms/board-form";
import { PageWrapper } from "../shared/page-wrapper";

export function NewBoardPage() {
	const t = useTranslate();
	const { localization } = usePluginOverrides<KanbanPluginOverrides>("kanban");
	const { router } = useStack();
	const navigate =
		router?.navigate ||
		((path: string) => {
			window.location.href = path;
		});
	const Link = router?.Link ?? "a";

	const handleSuccess = (boardId: string) => {
		navigate(`/pages/kanban/${boardId}`);
	};

	return (
		<PageWrapper data-testid="new-board-page">
			<div className="flex items-center gap-4 mb-8">
				<Link
					href="/pages/kanban"
					className="text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="h-5 w-5" />
				</Link>
				<div>
					<h1 className="text-3xl font-bold" data-testid="page-header">
						{localization?.createNewBoard ??
							t("kanban.list.createNewBoard", "Create New Board")}
					</h1>
					<p className="text-muted-foreground mt-1">
						{localization?.createNewBoardDescription ??
							t(
								"kanban.list.createNewBoardDescription",
								"Set up a new kanban board for your project",
							)}
					</p>
				</div>
			</div>

			<Card className="max-w-2xl">
				<CardHeader>
					<CardTitle>
						{localization?.boardDetails ??
							t("kanban.list.boardDetails", "Board Details")}
					</CardTitle>
					<CardDescription>
						{localization?.boardDetailsDescription ??
							t(
								"kanban.list.boardDetailsDescription",
								"Enter the details for your new kanban board.",
							)}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<BoardForm
						onClose={() => navigate("/pages/kanban")}
						onSuccess={handleSuccess}
					/>
				</CardContent>
			</Card>
		</PageWrapper>
	);
}
