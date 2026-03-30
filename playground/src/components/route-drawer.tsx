"use client";

import { useEffect, useState } from "react";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import { RouteList } from "./route-list";

function useIsDesktop() {
	const [isDesktop, setIsDesktop] = useState(false);
	useEffect(() => {
		const mq = window.matchMedia("(min-width: 640px)");
		setIsDesktop(mq.matches);
		const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, []);
	return isDesktop;
}

interface RouteDrawerProps {
	routes: string[];
	onPageRouteClick?: (route: string) => void;
	activePageRoute?: string | null;
	footer?: React.ReactNode;
}

export function RouteDrawer({
	routes,
	onPageRouteClick,
	activePageRoute,
	footer,
}: RouteDrawerProps) {
	const isDesktop = useIsDesktop();

	return (
		<Drawer direction={isDesktop ? "right" : "bottom"}>
			<DrawerTrigger asChild>
				<button
					type="button"
					className="flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold py-3 px-4 transition-colors text-sm"
				>
					<svg
						className="h-4 w-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<path
							d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						<rect x="9" y="3" width="6" height="4" rx="1" />
						<path d="M9 12h6M9 16h4" strokeLinecap="round" />
					</svg>
					Routes
					{routes.length > 0 && (
						<span className="ml-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs px-1.5 py-0.5 font-medium tabular-nums">
							{routes.length}
						</span>
					)}
				</button>
			</DrawerTrigger>

			{isDesktop ? (
				/* Right panel on desktop — no handle bar */
				<DrawerContent className="inset-x-auto inset-y-0 right-0 mt-0! h-full w-80 rounded-t-none rounded-l-[10px] flex-col">
					<DrawerHeader className="flex! flex-row items-center justify-between border-b border-zinc-100 dark:border-zinc-800 py-3">
						<DrawerTitle className="text-sm w-fit">
							Available routes
						</DrawerTitle>
						<DrawerClose asChild>
							<button
								type="button"
								aria-label="Close"
								className="rounded-lg p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
							>
								<svg
									className="h-4 w-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
								>
									<path
										d="M18 6L6 18M6 6l12 12"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							</button>
						</DrawerClose>
					</DrawerHeader>
					<div className="flex-1 overflow-y-auto px-5 py-4">
						<RouteList
							routes={routes}
							onPageRouteClick={onPageRouteClick}
							activePageRoute={activePageRoute}
						/>
						{footer && (
							<div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
								{footer}
							</div>
						)}
					</div>
				</DrawerContent>
			) : (
				/* Bottom sheet on mobile — handle bar rendered by DrawerContent */
				<DrawerContent className="max-h-[85vh]">
					<DrawerHeader className="flex! flex-row items-center justify-between border-b border-zinc-100 dark:border-zinc-800 py-3">
						<DrawerTitle className="text-sm w-fit">
							Available routes
						</DrawerTitle>
						<DrawerClose asChild>
							<button
								type="button"
								aria-label="Close"
								className="rounded-lg p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
							>
								<svg
									className="h-4 w-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
								>
									<path
										d="M18 6L6 18M6 6l12 12"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							</button>
						</DrawerClose>
					</DrawerHeader>
					<div className="flex-1 overflow-y-auto px-5 py-4">
						<RouteList
							routes={routes}
							onPageRouteClick={onPageRouteClick}
							activePageRoute={activePageRoute}
						/>
						{footer && (
							<div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
								{footer}
							</div>
						)}
					</div>
				</DrawerContent>
			)}
		</Drawer>
	);
}
