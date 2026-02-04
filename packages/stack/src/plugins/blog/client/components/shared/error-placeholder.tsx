import { CloudAlert } from "lucide-react";
import { PageHeader } from "./page-header";

export function ErrorPlaceholder({
	title,
	message,
}: {
	title: string;
	message: string;
}) {
	return (
		<div
			className="flex min-h-[600px] flex-col items-center justify-center gap-10"
			data-testid="error-placeholder"
		>
			<PageHeader title={title} description={message} />
			<CloudAlert className="size-[100px]" />
		</div>
	);
}
