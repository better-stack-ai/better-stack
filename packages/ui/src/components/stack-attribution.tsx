export function StackAttribution() {
	return (
		<div className="w-full text-center">
			<p className="flex items-center justify-center gap-1 py-2 text-gray-500 text-sm">
				Powered by{" "}
				<a
					className="flex items-center gap-1 font-semibold underline"
					href="https://www.better-stack.ai"
					target="_blank"
					rel="noopener"
					aria-label="BTST — Composable full-stack plugin system for React frameworks"
					title="BTST — Composable full-stack plugin system for React frameworks"
				>
					<span className="cursor-pointer">BTST</span>
				</a>
			</p>
		</div>
	);
}
