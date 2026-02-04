export function PageHeader({
	title,
	description,
	childrenTop,
	childrenBottom,
}: {
	title: string;
	description?: string;
	childrenTop?: React.ReactNode;
	childrenBottom?: React.ReactNode;
}) {
	return (
		<div
			className="flex max-w-2xl flex-col items-center lg:gap-4 gap-2 text-center wrap-anywhere"
			data-testid="page-header"
		>
			{childrenTop}
			<h1
				className="font-medium font-sans lg:text-6xl text-4xl tracking-tight"
				data-testid="page-title"
			>
				{title}
			</h1>
			{description && (
				<p
					className="text-muted-foreground wrap-anywhere"
					data-testid="page-description"
				>
					{description}
				</p>
			)}
			{childrenBottom}
		</div>
	);
}
