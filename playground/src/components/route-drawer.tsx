"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
	/** Render prop — receives a `navigate(route)` function that closes the drawer + fires a toast */
	footer?: (navigate: (route: string) => void) => React.ReactNode;
}

function CloseIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<path
				d="M18 6L6 18M6 6l12 12"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function RouteDrawer({
	routes,
	onPageRouteClick,
	activePageRoute,
	footer,
}: RouteDrawerProps) {
	const isDesktop = useIsDesktop();
	const [open, setOpen] = useState(false);

	const handleRouteClick = useCallback(
		(route: string) => {
			if (!route.startsWith("/pages/")) return;
			setOpen(false);
			toast.info(`Navigating to ${route}`);
			onPageRouteClick?.(route);
		},
		[onPageRouteClick],
	);

	// Only make routes interactive when a navigation handler is provided (i.e. editor is open)
	const routeClickHandler = onPageRouteClick ? handleRouteClick : undefined;

	return (
		<Drawer
			direction={isDesktop ? "right" : "bottom"}
			open={open}
			onOpenChange={setOpen}
		>
			<DrawerTrigger asChild>
				<Button variant="outline">
					<svg
						data-icon="inline-start"
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
						<Badge variant="secondary" className="ml-0.5 tabular-nums">
							{routes.length}
						</Badge>
					)}
				</Button>
			</DrawerTrigger>

			{isDesktop ? (
				/* Right panel on desktop — no handle bar */
				<DrawerContent className="inset-x-auto inset-y-0 right-0 mt-0! h-full w-80 rounded-t-none rounded-l-[10px] flex-col">
					<DrawerHeader className="flex! flex-row items-center justify-between border-b py-3">
						<DrawerTitle className="text-sm w-fit">
							Available routes
						</DrawerTitle>
						<DrawerClose asChild>
							<Button variant="ghost" size="icon-sm" aria-label="Close">
								<CloseIcon />
							</Button>
						</DrawerClose>
					</DrawerHeader>
					<div className="flex-1 overflow-y-auto px-5 py-4">
						<RouteList
							routes={routes}
							onPageRouteClick={routeClickHandler}
							activePageRoute={activePageRoute}
						/>
						{footer && (
							<div className="mt-4 pt-4 border-t border-border">
								{footer(handleRouteClick)}
							</div>
						)}
					</div>
				</DrawerContent>
			) : (
				/* Bottom sheet on mobile — handle bar rendered by DrawerContent */
				<DrawerContent className="max-h-[85vh]">
					<DrawerHeader className="flex! flex-row items-center justify-between border-b py-3">
						<DrawerTitle className="text-sm w-fit">
							Available routes
						</DrawerTitle>
						<DrawerClose asChild>
							<Button variant="ghost" size="icon-sm" aria-label="Close">
								<CloseIcon />
							</Button>
						</DrawerClose>
					</DrawerHeader>
					<div className="flex-1 overflow-y-auto px-5 py-4">
						<RouteList
							routes={routes}
							onPageRouteClick={routeClickHandler}
							activePageRoute={activePageRoute}
						/>
						{footer && (
							<div className="mt-4 pt-4 border-t border-border">
								{footer(handleRouteClick)}
							</div>
						)}
					</div>
				</DrawerContent>
			)}
		</Drawer>
	);
}
