import { NotebookTextIcon } from "lucide-react";
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@workspace/ui/components/empty";

export function EmptyList({ message }: { message: string }) {
	return (
		<>
			<Empty
				className="border border-dashed min-h-[600px] w-full"
				data-testid="empty-state"
			>
				<EmptyHeader>
					<EmptyMedia variant="icon" className="size-20">
						<NotebookTextIcon className="text-muted-foreground size-16" />
					</EmptyMedia>
					<EmptyTitle data-testid="empty-message">{message}</EmptyTitle>
				</EmptyHeader>
			</Empty>
		</>
	);
}
