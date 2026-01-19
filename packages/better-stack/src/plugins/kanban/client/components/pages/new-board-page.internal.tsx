"use client";

import { ArrowLeft } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { usePluginOverrides } from "@btst/stack/context";
import type { KanbanPluginOverrides } from "../../overrides";
import { BoardForm } from "../forms/board-form";
import { PageWrapper } from "../shared/page-wrapper";

export function NewBoardPage() {
	const { Link: OverrideLink, navigate: overrideNavigate } =
		usePluginOverrides<KanbanPluginOverrides>("kanban");
	const navigate =
		overrideNavigate ||
		((path: string) => {
			window.location.href = path;
		});
	const Link = OverrideLink || "a";

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
						Create New Board
					</h1>
					<p className="text-muted-foreground mt-1">
						Set up a new kanban board for your project
					</p>
				</div>
			</div>

			<Card className="max-w-2xl">
				<CardHeader>
					<CardTitle>Board Details</CardTitle>
					<CardDescription>
						Enter the details for your new kanban board.
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
