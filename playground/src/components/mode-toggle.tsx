"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ModeToggle() {
	const { setTheme, resolvedTheme } = useTheme();

	function cycle() {
		setTheme(resolvedTheme === "light" ? "dark" : "light");
	}

	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={cycle}
			className="size-8 rounded-full text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
			aria-label="Toggle theme"
		>
			<SunIcon className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
			<MoonIcon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
		</Button>
	);
}
