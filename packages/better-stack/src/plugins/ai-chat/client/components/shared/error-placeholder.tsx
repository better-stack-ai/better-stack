import { CloudAlert } from "lucide-react";

export function ErrorPlaceholder({
	title,
	message,
}: {
	title: string;
	message: string;
}) {
	return (
		<div
			className="flex min-h-[400px] flex-col items-center justify-center gap-6 p-8"
			data-testid="error-placeholder"
		>
			<CloudAlert className="size-16 text-muted-foreground" />
			<div className="text-center space-y-2">
				<h2 className="text-xl font-semibold">{title}</h2>
				<p className="text-muted-foreground max-w-md">{message}</p>
			</div>
		</div>
	);
}
