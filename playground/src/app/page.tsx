import { PlaygroundClient } from "@/components/playground-client";
import { PLUGINS } from "@btst/codegen/lib";

export default function PlaygroundPage() {
	return (
		<div className="min-h-screen flex flex-col">
			{/* Header */}
			<header className="sticky top-0 z-20 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm">
				<div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2">
							<span className="font-bold text-lg tracking-tight">BTST</span>
							<span className="text-zinc-400 dark:text-zinc-500">/</span>
							<span className="text-zinc-600 dark:text-zinc-400 font-medium">
								Playground
							</span>
						</div>
						<span className="hidden sm:inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
							WebContainer
						</span>
					</div>
					<nav className="flex items-center gap-4 text-sm">
						<a
							href="https://better-stack.ai/docs"
							className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
							target="_blank"
							rel="noopener noreferrer"
						>
							Docs
						</a>
						<a
							href="https://github.com/better-stack-ai/better-stack"
							className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
							target="_blank"
							rel="noopener noreferrer"
						>
							GitHub
						</a>
					</nav>
				</div>
			</header>

			{/* Main */}
			<main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-6">
				<PlaygroundClient plugins={PLUGINS} />
			</main>

			{/* Footer */}
			<footer className="border-t border-zinc-200 dark:border-zinc-800 py-4 text-center text-xs text-zinc-400 dark:text-zinc-600">
				Powered by{" "}
				<a
					href="https://better-stack.ai"
					className="underline hover:text-zinc-600 dark:hover:text-zinc-400"
					target="_blank"
					rel="noopener noreferrer"
				>
					BTST
				</a>{" "}
				· StackBlitz WebContainer
			</footer>
		</div>
	);
}
