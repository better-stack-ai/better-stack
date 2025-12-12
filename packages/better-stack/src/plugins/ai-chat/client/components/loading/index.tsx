import { ChatPageSkeleton } from "./chat-page-skeleton";

export function ChatLoading() {
	return (
		<div data-testid="chat-skeleton">
			<ChatPageSkeleton />
		</div>
	);
}

export { ChatPageSkeleton };
